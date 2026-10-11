// Regras do e-mail por empresa: domínio de envio, remetente e o envio em si.
//
// Duas travas que valem para todo mundo, inclusive para outros módulos que chamarem
// `enviar()`: a empresa precisa de domínio VERIFICADO e de remetente definido. Sem
// isso o envio não acontece e o motivo é explícito — nada de e-mail "sumido".
const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const log = require('../../shared/logger');
const { registrarAuditoria } = require('../../shared/auditLogger');
const provedor = require('./email.resend');
const modelos = require('./email.modelos');

const RE_DOMINIO = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

async function linha(empresaId) {
  const { rows: [r] } = await query(`SELECT * FROM email_dominios WHERE empresa_id = $1`, [empresaId]);
  return r || null;
}

// Endereço público do painel da empresa — é por ele que saem os links dos e-mails
// (redefinir senha, confirmar exclusão) e a logo. Mesma regra do link de rastreio:
//   1) domínio próprio (empresa_branding.dominio)  → https://painel.cliente.com.br
//   2) subdomínio (empresa_branding.subdominio)     → https://slug.<DOMINIO_BASE>
//   3) nada configurado → PAINEL_URL_PADRAO (se houver) ou vazio.
// NUNCA o Host/Origin da requisição: quem pede "esqueci minha senha" escolheria para
// onde vai o link com o token (envenenamento de host).
async function baseDaEmpresa(empresaId) {
  const { rows: [b] } = await query(`SELECT dominio, subdominio FROM empresa_branding WHERE empresa_id = $1`, [empresaId]);
  if (b && b.dominio) return 'https://' + String(b.dominio).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (b && b.subdominio) return `https://${String(b.subdominio).trim()}.${process.env.DOMINIO_BASE || 'logix.com.br'}`;
  return (process.env.PAINEL_URL_PADRAO || '').replace(/\/$/, '');
}

// URL pública e permanente da logo dos e-mails. Pelo domínio do cliente (rewrite
// /email/logo/* da Vercel → API), para nem o endereço da imagem citar a plataforma.
// `?v=` muda quando a logo muda: o cache do Gmail não segura a antiga.
function urlLogo(base, empresaId, atualizadoEm) {
  const v = atualizadoEm ? new Date(atualizadoEm).getTime().toString(36) : '1';
  if (base) return `${base}/email/logo/${empresaId}.png?v=${v}`;
  const api = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  return api ? `${api}/api/v1/email/logo/${empresaId}.png?v=${v}` : null;
}

// Marca da empresa, para pintar o e-mail. Sem branding, cai em neutro — nunca no Logix.
async function marcaDe(empresaId) {
  const { rows: [b] } = await query(
    `SELECT b.nome_exibicao, b.cor_primaria, b.cor_destaque, b.cor_clara, e.nome_fantasia, e.cidade, e.estado,
            d.responder_para, (d.logo IS NOT NULL) AS tem_logo, d.logo_atualizado_em
       FROM empresas e
       LEFT JOIN empresa_branding b ON b.empresa_id = e.id
       LEFT JOIN email_dominios d ON d.empresa_id = e.id
      WHERE e.id = $1`, [empresaId]);
  const base = await baseDaEmpresa(empresaId);
  return {
    nome: (b && (b.nome_exibicao || b.nome_fantasia)) || 'Central de entregas',
    logo: b && b.tem_logo ? urlLogo(base, empresaId, b.logo_atualizado_em) : null,
    cor: (b && b.cor_primaria) || null,
    destaque: (b && b.cor_destaque) || null,
    clara: (b && b.cor_clara) || null,
    cidade: b && b.cidade ? `${b.cidade}${b.estado ? '/' + b.estado : ''}` : null,
    resposta: (b && b.responder_para) || null,
    base,
  };
}

function paraTela(r) {
  if (!r) return { status: 'nao_configurado', dominio: null, registros: [], remetente_nome: null, remetente_email: null, responder_para: null, regiao: 'sa-east-1', tem_logo: false };
  return {
    status: r.status, dominio: r.dominio, regiao: r.regiao,
    registros: r.registros || [],
    remetente_nome: r.remetente_nome, remetente_email: r.remetente_email, responder_para: r.responder_para,
    verificado_em: r.verificado_em, checado_em: r.checado_em,
    tem_logo: !!r.logo_mime, logo_atualizado_em: r.logo_atualizado_em || null,
  };
}

async function obterConfig(empresaId) {
  const tela = paraTela(await linha(empresaId));
  // A tela mostra a logo pela mesma URL pública que o e-mail usa — o que o master vê é
  // exatamente o que o destinatário vê.
  const base = await baseDaEmpresa(empresaId);
  return { ...tela, provedor_configurado: provedor.configurado(), painel: base || null,
    logo_url: tela.tem_logo ? urlLogo(base, empresaId, tela.logo_atualizado_em) : null };
}

// ── Logo dos e-mails ─────────────────────────────────────────────────────────
// Chega como data URI (PNG/JPG/WEBP, ≤ 300 KB) e fica no banco. É pública por desenho:
// é a mesma marca que vai no cabeçalho de qualquer e-mail da central.
const MIMES_LOGO = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO = 300 * 1024;
async function salvarLogo({ empresaId, dataUri, usuarioId }) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUri || ''));
  if (!m || !MIMES_LOGO.includes(m[1])) throw AppError.validacao('Envie a logo em PNG, JPG ou WEBP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_LOGO) throw AppError.validacao('A logo passa de 300 KB. Reduza o tamanho (uns 400 px de largura bastam).');
  const r = await linha(empresaId);
  if (!r) throw AppError.validacao('Configure o domínio de e-mail antes da logo');
  await query(`UPDATE email_dominios SET logo = $2, logo_mime = $3, logo_atualizado_em = now(), atualizado_em = now() WHERE empresa_id = $1`,
    [empresaId, buf, m[1]]);
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'branding', acao: 'email_logo_salvar',
    entidade: { tipo: 'email_dominio', id: empresaId }, depois: { mime: m[1], bytes: buf.length } });
  return obterConfig(empresaId);
}

async function removerLogo({ empresaId, usuarioId }) {
  await query(`UPDATE email_dominios SET logo = NULL, logo_mime = NULL, logo_atualizado_em = now(), atualizado_em = now() WHERE empresa_id = $1`, [empresaId]);
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'branding', acao: 'email_logo_remover',
    entidade: { tipo: 'email_dominio', id: empresaId } });
  return obterConfig(empresaId);
}

// Leitura pública da imagem (rota sem token). Devolve só bytes + tipo; nenhum outro
// dado da empresa sai por aqui.
async function logoPublica(empresaId) {
  const { rows: [r] } = await query(`SELECT logo, logo_mime, logo_atualizado_em FROM email_dominios WHERE empresa_id = $1 AND logo IS NOT NULL`, [empresaId]);
  return r ? { bytes: r.logo, mime: r.logo_mime, atualizadoEm: r.logo_atualizado_em } : null;
}

// Cria o domínio no provedor e guarda os registros que o cliente precisa publicar.
async function definirDominio({ empresaId, dominio, regiao, usuarioId }) {
  const nome = String(dominio || '').trim().toLowerCase();
  if (!RE_DOMINIO.test(nome)) throw AppError.validacao('Domínio inválido. Use algo como avisos.suaempresa.com.br');

  const atual = await linha(empresaId);
  if (atual && atual.provedor_id) throw AppError.conflito('Já existe um domínio configurado. Remova o atual antes de trocar.');

  const criado = await provedor.criarDominio({ dominio: nome, regiao });
  await query(`
    INSERT INTO email_dominios (empresa_id, dominio, provedor_id, regiao, status, registros, checado_em, atualizado_em)
    VALUES ($1,$2,$3,$4,'pendente',$5::jsonb, now(), now())
    ON CONFLICT (empresa_id) DO UPDATE SET dominio = EXCLUDED.dominio, provedor_id = EXCLUDED.provedor_id,
      regiao = EXCLUDED.regiao, status = 'pendente', registros = EXCLUDED.registros, checado_em = now(), atualizado_em = now()`,
  [empresaId, nome, criado.id, regiao || 'sa-east-1', JSON.stringify(criado.registros)]);

  await registrarAuditoria({ empresaId, usuarioId, categoria: 'branding', acao: 'email_dominio_criar',
    entidade: { tipo: 'email_dominio', id: empresaId }, depois: { dominio: nome, regiao } });
  return obterConfig(empresaId);
}

function traduzirStatus(s) {
  if (s === 'verified') return 'verificado';
  if (s === 'failed' || s === 'temporary_failure') return 'falhou';
  // Parte dos registros já conferida (ex.: DKIM sim, SPF ainda não). Ainda não envia.
  if (s === 'partially_verified' || s === 'partially_failed') return 'parcial';
  return 'pendente';
}

// "Atualizar status": LÊ o que o provedor sabe e grava, registro por registro. Só pede
// nova verificação quando a anterior FALHOU — reiniciar uma verificação em andamento
// devolve o domínio para "pendente" e atrasa o resultado.
async function verificar({ empresaId, usuarioId }) {
  const r = await linha(empresaId);
  if (!r || !r.provedor_id) throw AppError.validacao('Configure o domínio antes de verificar');
  let info = await provedor.obterDominio(r.provedor_id);
  if (info.status === 'failed' || info.status === 'temporary_failure' || info.status === 'not_started') {
    info = await provedor.verificarDominio(r.provedor_id);
  }
  const status = traduzirStatus(info.status);
  await query(`
    UPDATE email_dominios SET status = $2, registros = $3::jsonb, checado_em = now(), atualizado_em = now(),
           verificado_em = CASE WHEN $2 = 'verificado' THEN COALESCE(verificado_em, now()) ELSE NULL END
     WHERE empresa_id = $1`, [empresaId, status, JSON.stringify(info.registros)]);
  if (status === 'verificado') {
    await registrarAuditoria({ empresaId, usuarioId, categoria: 'branding', acao: 'email_dominio_verificado',
      entidade: { tipo: 'email_dominio', id: empresaId }, depois: { dominio: r.dominio } });
  }
  return obterConfig(empresaId);
}

async function removerDominio({ empresaId, usuarioId }) {
  const r = await linha(empresaId);
  if (!r || !r.provedor_id) throw AppError.naoEncontrado('Nenhum domínio configurado');
  await provedor.removerDominio(r.provedor_id).catch((e) => log.warn({ erro: e.message }, 'email: falha ao remover no provedor'));
  await query(`DELETE FROM email_dominios WHERE empresa_id = $1`, [empresaId]);
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'branding', acao: 'email_dominio_remover',
    entidade: { tipo: 'email_dominio', id: empresaId }, antes: { dominio: r.dominio } });
  return obterConfig(empresaId);
}

// O endereço precisa pertencer ao domínio configurado — senão o provedor recusa na hora
// do envio, e o erro apareceria tarde demais.
async function salvarRemetente({ empresaId, nome, email, responderPara, usuarioId }) {
  const r = await linha(empresaId);
  if (!r || !r.dominio) throw AppError.validacao('Configure o domínio antes do remetente');
  if (!String(nome || '').trim()) throw AppError.validacao('Informe o nome que aparece na caixa de entrada');
  if (!RE_EMAIL.test(String(email || ''))) throw AppError.validacao('Endereço de envio inválido');
  if (String(email).split('@')[1].toLowerCase() !== r.dominio) {
    throw AppError.validacao(`O endereço precisa terminar em @${r.dominio}`);
  }
  if (responderPara && !RE_EMAIL.test(responderPara)) throw AppError.validacao('Endereço de resposta inválido');

  await query(`UPDATE email_dominios SET remetente_nome = $2, remetente_email = $3, responder_para = $4, atualizado_em = now()
                WHERE empresa_id = $1`, [empresaId, String(nome).trim(), String(email).toLowerCase(), responderPara || null]);
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'branding', acao: 'email_remetente_salvar',
    entidade: { tipo: 'email_dominio', id: empresaId }, depois: { nome, email } });
  return obterConfig(empresaId);
}

function ocultarCodigo(texto, codigo) {
  const espacado = codigo.split('').join(' ');
  return texto.split(espacado).join('••••••').split(codigo).join('••••••');
}

// API interna: qualquer módulo manda e-mail por aqui (token de pagamento, senha…).
async function enviar({ empresaId, para, modelo, dados = {} }) {
  const r = await linha(empresaId);
  if (!r || r.status !== 'verificado') throw AppError.validacao('O domínio de e-mail desta empresa ainda não está verificado');
  if (!r.remetente_email) throw AppError.validacao('Remetente não configurado para esta empresa');

  const marca = await marcaDe(empresaId);
  const { assunto, html, texto } = modelos.montar(modelo, { painel: marca.base ? marca.base.replace(/^https:\/\//, '') : null, ...dados, marca });
  const de = `${r.remetente_nome || marca.nome} <${r.remetente_email}>`;

  // O log de envios NUNCA guarda código: o assunto de alguns modelos leva o código (para
  // aparecer na notificação do celular), e quem lê o log não pode usá-lo (ADR-036).
  const assuntoLog = dados.codigo ? ocultarCodigo(assunto, String(dados.codigo)) : assunto;
  const { rows: [reg] } = await query(
    `INSERT INTO email_envios (empresa_id, para, assunto, modelo, status) VALUES ($1,$2,$3,$4,'enviado') RETURNING id`,
    [empresaId, para, assuntoLog, modelo]);
  try {
    const { id } = await provedor.enviar({ de, para, assunto, html, texto, responderPara: r.responder_para });
    await query(`UPDATE email_envios SET provedor_id = $2, atualizado_em = now() WHERE id = $1`, [reg.id, id]);
    return { id: reg.id, provedor_id: id };
  } catch (e) {
    await query(`UPDATE email_envios SET status = 'erro', erro = $2, atualizado_em = now() WHERE id = $1`, [reg.id, e.message]);
    throw e;
  }
}

async function enviarTeste({ empresaId, para }) {
  if (!RE_EMAIL.test(String(para || ''))) throw AppError.validacao('Informe um e-mail de destino válido');
  const r = await linha(empresaId);
  return enviar({ empresaId, para, modelo: 'teste', dados: { remetente: r && r.remetente_email } });
}

async function listarEnvios({ empresaId, limite = 20 }) {
  const { rows } = await query(
    `SELECT para, assunto, modelo, status, erro, criado_em FROM email_envios
      WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT $2`, [empresaId, Math.min(100, limite)]);
  return rows;
}

// Webhook do provedor: status de domínio e de entrega chegam por aqui.
async function aplicarEvento(evento) {
  const tipo = evento && evento.type;
  const d = (evento && evento.data) || {};
  if (tipo === 'domain.updated' && d.id) {
    const status = traduzirStatus(d.status);
    // O evento traz o status de cada registro: grava junto, senão a tabela da tela fica
    // dizendo "faltando" com o domínio já verificado.
    const registros = Array.isArray(d.records) && d.records.length ? JSON.stringify(provedor.normalizarRegistros(d.records)) : null;
    await query(`UPDATE email_dominios SET status = $2, registros = COALESCE($3::jsonb, registros), checado_em = now(), atualizado_em = now(),
                 verificado_em = CASE WHEN $2 = 'verificado' THEN COALESCE(verificado_em, now()) ELSE NULL END
                 WHERE provedor_id = $1`, [d.id, status, registros]);
    return { aplicado: 'dominio', status };
  }
  if (String(tipo || '').startsWith('email.') && d.email_id) {
    const mapa = { 'email.delivered': 'entregue', 'email.bounced': 'falhou', 'email.complained': 'falhou' };
    const status = mapa[tipo];
    if (status) {
      await query(`UPDATE email_envios SET status = $2, atualizado_em = now() WHERE provedor_id = $1`, [d.email_id, status]);
      return { aplicado: 'envio', status };
    }
  }
  return { aplicado: null };
}

// Pode enviar? Usado por quem precisa decidir ANTES (ex.: "esqueci minha senha" só
// promete e-mail quando há como mandar).
async function podeEnviar(empresaId) {
  const r = await linha(empresaId);
  return !!(r && r.status === 'verificado' && r.remetente_email && provedor.configurado());
}

module.exports = {
  obterConfig, definirDominio, verificar, removerDominio, salvarRemetente,
  salvarLogo, removerLogo, logoPublica,
  enviar, enviarTeste, listarEnvios, aplicarEvento, podeEnviar, baseDaEmpresa, REGIOES: provedor.REGIOES,
  _util: { ocultarCodigo },
};
