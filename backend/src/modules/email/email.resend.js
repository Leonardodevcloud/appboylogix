// Adaptador do provedor de e-mail (Resend). Só ele conhece a API de fora; o resto do
// módulo fala por estas funções. Trocar de provedor = escrever outro arquivo como este.
//
// A chave é da PLATAFORMA (RESEND_API_KEY), não do cliente: uma conta só, com vários
// domínios verificados dentro — um por empresa. Por isso não há credencial de cliente
// guardada em lugar nenhum.
const AppError = require('../../shared/AppError');
const log = require('../../shared/logger');

const BASE = 'https://api.resend.com';
const REGIOES = ['us-east-1', 'eu-west-1', 'sa-east-1'];

function chave() {
  const k = process.env.RESEND_API_KEY;
  // Falha explícita e cedo: sem chave o módulo não finge que funciona.
  if (!k) throw AppError.validacao('E-mail não configurado na plataforma: defina RESEND_API_KEY');
  return k;
}

function configurado() { return !!process.env.RESEND_API_KEY; }

async function chamar(metodo, caminho, corpo) {
  let resp;
  try {
    resp = await fetch(BASE + caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${chave()}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    log.error({ caminho, erro: e.message }, 'email: provedor inacessível');
    throw new AppError('Provedor de e-mail indisponível. Tente novamente em instantes.', 503, 'PROVEDOR_INDISPONIVEL');
  }
  const dados = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = (dados && (dados.message || dados.error)) || `provedor respondeu ${resp.status}`;
    log.warn({ caminho, status: resp.status, msg }, 'email: provedor recusou');
    throw AppError.validacao(String(msg));
  }
  return dados || {};
}

// Os registros vêm com nomes diferentes conforme o provedor; normalizamos para a tela.
function normalizarRegistros(lista) {
  return (lista || []).map((r) => ({
    tipo: r.type || r.record || '',
    nome: r.name || '',
    valor: r.value || '',
    prioridade: r.priority != null ? String(r.priority) : null,
    ttl: r.ttl || 'Auto',
    status: r.status || 'pending',
  }));
}

async function criarDominio({ dominio, regiao }) {
  const r = await chamar('POST', '/domains', { name: dominio, region: REGIOES.includes(regiao) ? regiao : 'sa-east-1' });
  return { id: r.id, status: r.status || 'pending', registros: normalizarRegistros(r.records) };
}

async function obterDominio(id) {
  const r = await chamar('GET', `/domains/${id}`);
  return { id: r.id, status: r.status || 'pending', registros: normalizarRegistros(r.records) };
}

// REINICIA a verificação no provedor: o domínio volta para 'pending' e o resultado chega
// pelo webhook domain.updated. Só faz sentido depois de uma falha — chamar com a
// verificação em andamento só a atrasa (foi o que segurou o domínio da Motty em 11/10).
async function verificarDominio(id) {
  await chamar('POST', `/domains/${id}/verify`);
  return obterDominio(id);
}

async function removerDominio(id) {
  await chamar('DELETE', `/domains/${id}`);
}

async function enviar({ de, para, assunto, html, texto, responderPara }) {
  const r = await chamar('POST', '/emails', {
    from: de,
    to: Array.isArray(para) ? para : [para],
    subject: assunto,
    html,
    text: texto || undefined,
    reply_to: responderPara || undefined,
  });
  return { id: r.id };
}

module.exports = { configurado, criarDominio, obterDominio, verificarDominio, removerDominio, enviar, normalizarRegistros, REGIOES };
