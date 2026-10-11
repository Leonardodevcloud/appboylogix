// Peças comuns aos aprovadores (ADR-036): trilha de eventos, máscara de e-mail e os
// avisos de segurança por e-mail.
//
// Toda mudança que mexe na trava dos pagamentos avisa QUEM APROVA e QUEM PODE PAGAR. É o
// que torna uma tentativa de fraude visível: ela chega na caixa de entrada de várias
// pessoas, não só de quem a fez.
const { query } = require('../../shared/db');
const log = require('../../shared/logger');
const emailService = () => require('../email').service;

// Trilha append-only (a mesma dos lotes). Nunca leva senha nem link.
async function evento(empresaId, tipo, detalhe = {}) {
  await query(`INSERT INTO pagamento_eventos (empresa_id, tipo, detalhe) VALUES ($1,$2,$3::jsonb)`,
    [empresaId, tipo, JSON.stringify(detalhe)]);
}

// c***s@motty.com.br — quem não é o aprovador reconhece o endereço sem lê-lo inteiro.
function mascarar(email) {
  const [u, d] = String(email || '').split('@');
  if (!d) return '';
  const ini = u.slice(0, 1);
  const fim = u.length > 2 ? u.slice(-1) : '';
  return `${ini}***${fim}@${d}`;
}

async function nomeUsuario(usuarioId) {
  if (!usuarioId) return null;
  const { rows: [u] } = await query(`SELECT nome FROM usuarios WHERE id = $1`, [usuarioId]);
  return (u && u.nome) || null;
}

function dataHora(d) {
  const x = new Date(d);
  return `${x.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' })} às ${x.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' })}`;
}

// Quem recebe aviso: aprovadores ativos + usuários ativos da empresa com permissão de
// pagar (pelo papel ou direta). Sem repetição de endereço.
async function destinatarios(empresaId, { aprovadores = true, equipe = true } = {}) {
  const lista = [];
  if (aprovadores) {
    const { rows } = await query(
      `SELECT nome, email FROM pagamento_aprovadores WHERE empresa_id = $1 AND status = 'ativo'`, [empresaId]);
    lista.push(...rows.map((r) => ({ ...r, aprovador: true })));
  }
  if (equipe) {
    const { rows } = await query(`
      SELECT u.nome, u.email FROM usuarios u
       WHERE u.empresa_id = $1 AND u.ativo = TRUE AND u.email IS NOT NULL
         AND (EXISTS (SELECT 1 FROM papel_permissoes pp WHERE pp.papel_id = u.papel_id AND pp.permissao = 'financeiro.pagar')
           OR EXISTS (SELECT 1 FROM usuario_permissoes up WHERE up.usuario_id = u.id AND up.permissao = 'financeiro.pagar'))`,
    [empresaId]);
    lista.push(...rows.map((r) => ({ ...r, aprovador: false })));
  }
  const vistos = new Set();
  return lista.filter((d) => {
    const k = String(d.email).toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

// Manda o aviso a cada destinatário. Falha de envio NÃO desfaz a mudança (ela já está
// gravada e na trilha); fica no log e no histórico de envios da central.
async function avisar(empresaId, { titulo, texto, linhas = [], link = null, rotuloLink = null, so = null, extras = [], equipe = true, aprovadores = true, linkSoParaAprovadores = false }) {
  try {
    if (!(await emailService().podeEnviar(empresaId))) return 0;
    const lista = so || [...(await destinatarios(empresaId, { equipe, aprovadores })), ...extras];
    let n = 0;
    for (const d of lista) {
      const comLink = link && (!linkSoParaAprovadores || d.aprovador);
      try {
        await emailService().enviar({ empresaId, para: d.email, modelo: 'aprovador_aviso',
          dados: { nome: d.nome, titulo, texto, linhas, link: comLink ? link : null, rotuloLink } });
        n += 1;
      } catch (e) { log.warn({ empresaId, erro: e.message }, 'aprovadores: aviso não enviado'); }
    }
    return n;
  } catch (e) {
    log.warn({ empresaId, erro: e.message }, 'aprovadores: falha ao montar avisos');
    return 0;
  }
}

module.exports = { evento, mascarar, nomeUsuario, dataHora, destinatarios, avisar };
