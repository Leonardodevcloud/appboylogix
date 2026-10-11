// Aprovação de lote (ADR-036): o código vai por e-mail para UM aprovador, e só a senha
// dele fecha a aprovação. Dois jeitos de aprovar, os dois com a mesma trava:
//
//   · na tela de pagamento: código + senha digitados por quem aprova;
//   · pelo botão "Revisar e aprovar" do e-mail: a página /aprovador da central mostra o
//     lote e pede só a senha — no aparelho do PRÓPRIO aprovador, sem digitar a senha na
//     tela de outra pessoa.
//
// Os dois apontam para o mesmo token: o primeiro uso encerra o outro.
//
// Separado de pagamentos.lotes.service (montar e enviar) para cada arquivo ter um
// assunto. Daqui só sai lote aprovado; o envio ao banco continua lá (enviarPendentes).
const crypto = require('crypto');
const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { registrarAuditoria } = require('../../shared/auditLogger');
const contaService = require('./pagamentos.conta.service');
const lotes = require('./pagamentos.lotes.service');
const aprov = require('./pagamentos.aprovadores.service');
const pedidos = require('./pagamentos.aprovadores.pedidos.service');
const { mascarar } = require('./pagamentos.aprovadores.avisos');
const emailService = require('../email').service;

const MINUTOS_TOKEN = 10;
const MAX_TENTATIVAS = 5;
const moeda = (c) => 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const { obterLote, evento } = lotes;

const hash = (codigo, loteId) => crypto.createHash('sha256').update(`${loteId}:${codigo}`).digest('hex');
const hashLink = (t) => crypto.createHash('sha256').update(`link:${t}`).digest('hex');
// Chave Pix no e-mail: o suficiente para reconhecer, não para copiar.
const chaveCurta = (c) => { const s = String(c || ''); return s.length > 8 ? `${s.slice(0, 3)}…${s.slice(-4)}` : s; };

// Para quem vai o dinheiro, no e-mail e na página: ninguém aprova no escuro. Até 5 nomes.
function destinos(lote) {
  return (lote.itens || []).slice(0, 5).map((i) => [i.nome, `${moeda(i.valor_cent)} · ${chaveCurta(i.pix_chave)}`]);
}

// ── Pedir o código ───────────────────────────────────────────────────────────
// Com um aprovador só, ele é o destino automático; com vários, quem está na tela escolhe
// para quem mandar — e a resposta diz isso em vez de mandar para todos.
async function pedirToken({ empresaId, loteId, usuarioId, aprovadorId = null }) {
  await contaService.contaOperacional(empresaId);
  await pedidos.garantirSemPausa(empresaId);
  const lote = await obterLote({ empresaId, loteId });
  if (lote.status !== 'aguardando_aprovacao') throw AppError.validacao('Este lote não está aguardando aprovação');

  const lista = await aprov.ativos(empresaId);
  if (!lista.length) throw AppError.validacao('Nenhum aprovador ativo. Cadastre em Financeiro › Configurações de pagamento.');
  let a = null;
  if (aprovadorId) {
    a = lista.find((x) => x.id === aprovadorId);
    if (!a) throw AppError.validacao('Aprovador não encontrado ou ainda sem senha de aprovação');
  } else if (lista.length === 1) {
    [a] = lista;
  } else {
    return { escolher: true, aprovadores: lista.map(aprov.paraTela), minutos: MINUTOS_TOKEN };
  }

  const codigo = String(crypto.randomInt(100000, 999999));
  const link = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + MINUTOS_TOKEN * 60_000);
  // Um token vivo por lote: pedir outro invalida o anterior (código e link).
  await query(`DELETE FROM pagamento_tokens WHERE lote_id = $1 AND usado_em IS NULL`, [loteId]);
  await query(`INSERT INTO pagamento_tokens (lote_id, empresa_id, codigo_hash, link_hash, total_cent, enviado_para, expira_em, aprovador_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
  [loteId, empresaId, hash(codigo, loteId), hashLink(link), lote.total_cent, a.email, expira, a.id]);

  const { rows: [u] } = await query(`SELECT nome FROM usuarios WHERE id = $1`, [usuarioId]);
  const base = await emailService.baseDaEmpresa(empresaId);
  await emailService.enviar({
    empresaId, para: a.email, modelo: 'token_pagamento',
    dados: { codigo, valor: moeda(lote.total_cent), quantidade: lote.quantidade, solicitante: (u && u.nome) || 'a equipe', minutos: MINUTOS_TOKEN,
      tipo: lote.origem === 'avulso' ? 'Pagamento avulso / antecipação' : 'Repasse de fechamento', referencia: lote.referencia || null,
      destinos: destinos(lote), link: base ? `${base}/aprovador?a=${link}` : null },
  });

  await evento({ empresaId, loteId, tipo: 'token_enviado', detalhe: { para: mascarar(a.email), aprovador: a.nome, referencia: lote.referencia, quem: (u && u.nome) || null } });
  return { enviado_para: mascarar(a.email), aprovador: { id: a.id, nome: a.nome }, expira_em: expira, minutos: MINUTOS_TOKEN };
}

// ── Conferir o código ────────────────────────────────────────────────────────
// A tentativa é RESERVADA antes da comparação (incremento atômico com teto): rajada de
// códigos em paralelo não passa das 5 tentativas. Código certo não consome o token — só a
// senha do aprovador consome (código certo com senha errada não queima o código).
async function conferirToken({ empresaId, loteId, codigo }) {
  const { rows: [t] } = await query(
    `SELECT * FROM pagamento_tokens WHERE lote_id = $1 AND empresa_id = $2 AND usado_em IS NULL ORDER BY criado_em DESC LIMIT 1`,
    [loteId, empresaId]);
  if (!t) throw AppError.validacao('Nenhum código ativo para este lote. Peça um novo.');
  if (!t.aprovador_id) throw AppError.validacao('Este código é anterior aos aprovadores. Peça um novo.');
  if (new Date(t.expira_em) < new Date()) throw AppError.validacao('Código expirado. Peça um novo.');

  const { rows: [reserva] } = await query(
    `UPDATE pagamento_tokens SET tentativas = tentativas + 1 WHERE id = $1 AND tentativas < $2 RETURNING tentativas`, [t.id, MAX_TENTATIVAS]);
  if (!reserva) throw AppError.validacao('Código bloqueado por excesso de tentativas. Peça um novo.');

  const lote = await obterLote({ empresaId, loteId });
  await conferirTotal(t, lote);
  const bate = crypto.timingSafeEqual(Buffer.from(hash(String(codigo), loteId)), Buffer.from(t.codigo_hash));
  if (!bate) {
    await evento({ empresaId, loteId, tipo: 'token_errado', detalhe: { tentativa: reserva.tentativas, referencia: lote.referencia } });
    throw AppError.validacao(`Código incorreto. Restam ${MAX_TENTATIVAS - reserva.tentativas} tentativa(s).`);
  }
  // Acerto devolve a tentativa reservada: quem errou a senha depois não perde o código.
  await query(`UPDATE pagamento_tokens SET tentativas = tentativas - 1 WHERE id = $1 AND tentativas > 0`, [t.id]);
  return { token: t, lote };
}

// O total congelado é parte da aprovação: mudou o lote, o código não vale mais.
async function conferirTotal(t, lote) {
  if (Number(t.total_cent) !== Number(lote.total_cent)) {
    await query(`DELETE FROM pagamento_tokens WHERE id = $1`, [t.id]);
    throw AppError.validacao('O lote mudou depois que o código foi gerado. Peça um novo código.');
  }
}

// ── Fechar a aprovação (os dois caminhos terminam aqui) ─────────────────────
async function concluir({ empresaId, conta, token, lote, aprovador, usuarioId, via }) {
  const { rowCount: usado } = await query(`UPDATE pagamento_tokens SET usado_em = now() WHERE id = $1 AND usado_em IS NULL`, [token.id]);
  if (!usado) throw AppError.conflito('Este código já foi usado');

  const { rowCount } = await query(
    `UPDATE pagamento_lotes SET status = 'enviando', aprovado_por = $3, aprovador_id = $4, aprovado_em = now(), enviado_em = now()
      WHERE id = $1 AND empresa_id = $2 AND status = 'aguardando_aprovacao'`, [lote.id, empresaId, usuarioId, aprovador.id]);
  // Trava contra clique duplo e contra duas abas: só a primeira transição vence.
  if (!rowCount) throw AppError.conflito('Este lote já está sendo enviado');
  let quem = null;
  if (usuarioId) ({ rows: [{ nome: quem } = {}] } = await query(`SELECT nome FROM usuarios WHERE id = $1`, [usuarioId]));
  await evento({ empresaId, loteId: lote.id, tipo: 'lote_aprovado', detalhe: {
    referencia: lote.referencia, total_cent: Number(lote.total_cent), quantidade: lote.quantidade,
    aprovador: aprovador.nome, quem: quem || aprovador.nome, via } });

  const r = await lotes.enviarPendentes({ conta, empresaId, loteId: lote.id });
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_lote_enviar',
    entidade: { tipo: 'pagamento_lote', id: lote.id }, depois: { enviados: r.ok, total_itens: r.total, status: r.status, aprovador_id: aprovador.id, via } });
  return obterLote({ empresaId, loteId: lote.id });
}

// Na tela de pagamento: código + senha.
async function aprovarEEnviar({ empresaId, loteId, codigo, senha, usuarioId }) {
  const conta = await contaService.contaOperacional(empresaId);
  await pedidos.garantirSemPausa(empresaId);
  const { token, lote } = await conferirToken({ empresaId, loteId, codigo });
  // A senha é do aprovador que RECEBEU o código: um código não serve com a senha de outro.
  const aprovador = await aprov.conferirSenha({ empresaId, aprovadorId: token.aprovador_id, senha, motivo: `aprovar o lote ${lote.referencia}` });
  return concluir({ empresaId, conta, token, lote, aprovador, usuarioId, via: 'painel' });
}

// ── Pelo link do e-mail (página pública /aprovador?a=) ───────────────────────
async function tokenDoLink(link) {
  if (!link || String(link).length < 20) throw AppError.validacao('Link inválido.');
  const { rows: [t] } = await query(`
    SELECT t.*, coalesce(b.nome_exibicao, e.nome_fantasia) AS empresa_nome
      FROM pagamento_tokens t
      JOIN empresas e ON e.id = t.empresa_id
      LEFT JOIN empresa_branding b ON b.empresa_id = t.empresa_id
     WHERE t.link_hash = $1`, [hashLink(link)]);
  if (!t || t.usado_em) throw AppError.validacao('Este pagamento já foi aprovado ou o link foi substituído por um código novo.');
  if (new Date(t.expira_em) < new Date()) throw AppError.validacao('O link venceu. Peça um novo código na tela de pagamento.');
  return t;
}

async function conferirLinkLote({ link }) {
  const t = await tokenDoLink(link);
  const lote = await obterLote({ empresaId: t.empresa_id, loteId: t.lote_id });
  const a = await aprov.obter(t.empresa_id, t.aprovador_id);
  const { rows: [u] } = await query(`SELECT nome FROM usuarios WHERE id = $1`, [lote.criado_por]);
  return {
    empresa: t.empresa_nome, aprovador: a.nome, referencia: lote.referencia, total: moeda(lote.total_cent),
    quantidade: lote.quantidade, pedido_por: (u && u.nome) || null, expira_em: t.expira_em,
    tipo: lote.origem === 'avulso' ? 'Pagamento avulso / antecipação' : 'Repasse de fechamento',
    destinos: destinos(lote), mais: Math.max(0, (lote.itens || []).length - 5),
  };
}

async function aprovarPorLink({ link, senha }) {
  const t = await tokenDoLink(link);
  const empresaId = t.empresa_id;
  const conta = await contaService.contaOperacional(empresaId);
  await pedidos.garantirSemPausa(empresaId);
  const lote = await obterLote({ empresaId, loteId: t.lote_id });
  await conferirTotal(t, lote);
  const aprovador = await aprov.conferirSenha({ empresaId, aprovadorId: t.aprovador_id, senha, motivo: `aprovar o lote ${lote.referencia} pelo link do e-mail` });
  const r = await concluir({ empresaId, conta, token: t, lote, aprovador, usuarioId: null, via: 'link do e-mail' });
  return { ok: true, empresa: t.empresa_nome, referencia: r.referencia, status: r.status, total: moeda(r.total_cent) };
}

module.exports = { pedirToken, aprovarEEnviar, conferirLinkLote, aprovarPorLink, MINUTOS_TOKEN };
