// Lote de pagamento: montar, aprovar com código e enviar ao banco.
//
// Três regras que guiam o arquivo inteiro:
//
// 1. Entregador com pendência (sem chave Pix, acima do teto) SAI do lote, não trava o
//    lote. Segurar 37 pagamentos por causa de 2 cadastros incompletos é pior.
// 2. O lote congela na aprovação. O token carrega o total; mexeu no lote, o token morre.
// 3. Cada item tem chave de idempotência única (UNIQUE no banco). Reenviar é seguro
//    porque o banco de dados — não o código — impede o segundo pagamento.
const crypto = require('crypto');
const { query, pool } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const log = require('../../shared/logger');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { adaptador } = require('./pagamentos.bancos');
const contaService = require('./pagamentos.conta.service');
const pedidos = require('./pagamentos.aprovadores.pedidos.service');
const eventos = require('../../shared/eventos');

const moeda = (c) => 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

async function evento({ empresaId, loteId = null, itemId = null, tipo, detalhe = {} }) {
  await query(`INSERT INTO pagamento_eventos (empresa_id, lote_id, item_id, tipo, detalhe) VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [empresaId, loteId, itemId, tipo, JSON.stringify(detalhe)]);
}

// O desfecho de um item interessa a quem originou o pagamento (a antecipação, hoje).
// Vai por evento de domínio: pagamentos não conhece quem pediu (regra 5 do AGENTS), e
// quem ouve consulta o item pela fachada — o evento só diz "olha este item".
function avisarDesfecho({ empresaId, item, loteId, status }) {
  eventos.emitir('pagamento.item_resolvido', {
    empresaId, itemId: item.id, loteId, motoboyId: item.motoboy_id, status,
  });
}

// ── Prévia: quem entra, quem fica de fora e por quê ──────────────────────────
async function previa({ empresaId, de, ate, minimoCent = 0 }) {
  const conta = await contaService.obterBruta(empresaId);
  const tetoItem = conta ? Number(conta.teto_item_cent) : Infinity;

  const { rows } = await query(`
    SELECT f.id AS fechamento_id, f.motoboy_id, f.saldo_liquido_cent, f.qtd_corridas,
           m.nome_completo, m.codigo, m.pix_tipo, m.pix_chave
      FROM financeiro_fechamentos f
      JOIN motoboys m ON m.id = f.motoboy_id
     WHERE f.empresa_id = $1 AND f.status = 'aberto'
       AND f.periodo_de >= $2 AND f.periodo_ate <= $3
       AND f.saldo_liquido_cent >= $4
     ORDER BY f.saldo_liquido_cent DESC`, [empresaId, de, ate, minimoCent]);

  const itens = rows.map((r) => {
    const valor = Number(r.saldo_liquido_cent);
    let motivo = null;
    if (!r.pix_chave) motivo = 'sem chave Pix cadastrada';
    else if (valor > tetoItem) motivo = `acima do teto por entregador (${moeda(tetoItem)})`;
    else if (valor <= 0) motivo = 'saldo zerado ou negativo';
    return {
      fechamento_id: r.fechamento_id, motoboy_id: r.motoboy_id, nome: r.nome_completo, codigo: r.codigo,
      qtd_corridas: r.qtd_corridas, valor_cent: valor,
      pix_tipo: r.pix_tipo, pix_chave: r.pix_chave, elegivel: !motivo, motivo,
    };
  });

  const elegiveis = itens.filter((i) => i.elegivel);
  return {
    itens,
    total_cent: elegiveis.reduce((s, i) => s + i.valor_cent, 0),
    quantidade: elegiveis.length,
    fora: itens.length - elegiveis.length,
  };
}

// ── Criar o lote ─────────────────────────────────────────────────────────────
// Monta o lote a partir de fechamentos que JÁ existem — é o caminho vindo da tela de
// Fechamentos, onde a seleção já foi feita. Evita repetir a escolha em duas telas.
async function previaDeFechamentos({ empresaId, fechamentoIds }) {
  const conta = await contaService.obterBruta(empresaId);
  const tetoItem = conta ? Number(conta.teto_item_cent) : Infinity;
  const { rows } = await query(`
    SELECT f.id AS fechamento_id, f.motoboy_id, f.saldo_liquido_cent, f.qtd_corridas,
           m.nome_completo, m.codigo, m.pix_tipo, m.pix_chave
      FROM financeiro_fechamentos f
      JOIN motoboys m ON m.id = f.motoboy_id
     WHERE f.empresa_id = $1 AND f.status = 'aberto' AND f.id = ANY($2::uuid[])
     ORDER BY f.saldo_liquido_cent DESC`, [empresaId, fechamentoIds]);

  return rows.map((r) => {
    const valor = Number(r.saldo_liquido_cent);
    let motivo = null;
    // Fechamento sem chave Pix não bloqueia o lote: fica de fora e CONTINUA EM ABERTO,
    // para ser pago por fora ou depois que o cadastro for corrigido.
    if (!r.pix_chave) motivo = 'sem chave Pix cadastrada';
    else if (valor > tetoItem) motivo = 'acima do teto por entregador';
    else if (valor <= 0) motivo = 'saldo zerado ou negativo';
    return {
      fechamento_id: r.fechamento_id, motoboy_id: r.motoboy_id, nome: r.nome_completo, codigo: r.codigo,
      qtd_corridas: r.qtd_corridas, valor_cent: valor, pix_tipo: r.pix_tipo, pix_chave: r.pix_chave,
      elegivel: !motivo, motivo,
    };
  });
}

async function criar({ empresaId, de, ate, minimoCent = 0, motoboyIds = null, fechamentoIds = null, usuarioId }) {
  const conta = await contaService.contaOperacional(empresaId);

  let escolhidos;
  if (Array.isArray(fechamentoIds) && fechamentoIds.length) {
    escolhidos = (await previaDeFechamentos({ empresaId, fechamentoIds })).filter((i) => i.elegivel);
  } else {
    const p = await previa({ empresaId, de, ate, minimoCent });
    escolhidos = p.itens.filter((i) => i.elegivel);
    if (Array.isArray(motoboyIds) && motoboyIds.length) {
      const set = new Set(motoboyIds);
      escolhidos = escolhidos.filter((i) => set.has(i.motoboy_id));
    }
  }
  if (!escolhidos.length) throw AppError.validacao('Nenhum entregador elegível no período selecionado');

  const total = escolhidos.reduce((s, i) => s + i.valor_cent, 0);
  if (total > Number(conta.teto_lote_cent)) {
    throw AppError.validacao(`O lote soma ${moeda(total)} e ultrapassa o teto por lote (${moeda(conta.teto_lote_cent)})`);
  }
  const { rows: [dia] } = await query(`
    SELECT COALESCE(sum(i.valor_cent), 0)::bigint AS total
      FROM pagamento_itens i JOIN pagamento_lotes l ON l.id = i.lote_id
     WHERE i.empresa_id = $1 AND i.status IN ('enviado','confirmado')
       AND l.enviado_em >= date_trunc('day', now())`, [empresaId]);
  if (Number(dia.total) + total > Number(conta.teto_dia_cent)) {
    throw AppError.validacao(`Com este lote o dia passaria de ${moeda(conta.teto_dia_cent)} — teto diário da conta`);
  }

  const referencia = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomInt(100, 999)}`;
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    const { rows: [lote] } = await cx.query(`
      INSERT INTO pagamento_lotes (empresa_id, referencia, origem, status, total_cent, quantidade, periodo_de, periodo_ate, criado_por)
      VALUES ($1,$2,'fechamento','aguardando_aprovacao',$3,$4,$5,$6,$7) RETURNING *`,
    [empresaId, referencia, total, escolhidos.length, de, ate, usuarioId]);

    for (const i of escolhidos) {
      // A idempotência amarra lote + entregador + valor: reenviar o mesmo item é
      // a mesma operação; valor diferente é operação diferente, de propósito.
      const idem = crypto.createHash('sha256')
        .update(`${lote.id}:${i.motoboy_id}:${i.valor_cent}`).digest('hex').slice(0, 40);
      await cx.query(`
        INSERT INTO pagamento_itens (lote_id, empresa_id, motoboy_id, fechamento_id, valor_cent, pix_tipo, pix_chave, idempotencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [lote.id, empresaId, i.motoboy_id, i.fechamento_id, i.valor_cent, i.pix_tipo, i.pix_chave, idem]);
    }
    await cx.query('COMMIT');
    await evento({ empresaId, loteId: lote.id, tipo: 'lote_criado', detalhe: { total_cent: total, quantidade: escolhidos.length } });
    await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_lote_criar',
      entidade: { tipo: 'pagamento_lote', id: lote.id }, depois: { referencia, total_cent: total, quantidade: escolhidos.length } });
    return obterLote({ empresaId, loteId: lote.id });
  } catch (e) { await cx.query('ROLLBACK').catch(() => {}); throw e; } finally { cx.release(); }
}

async function obterLote({ empresaId, loteId }) {
  const { rows: [l] } = await query(`SELECT * FROM pagamento_lotes WHERE id = $1 AND empresa_id = $2`, [loteId, empresaId]);
  if (!l) throw AppError.naoEncontrado('Lote não encontrado');
  const { rows: itens } = await query(`
    SELECT i.*, m.nome_completo, m.codigo FROM pagamento_itens i
      JOIN motoboys m ON m.id = i.motoboy_id
     WHERE i.lote_id = $1 ORDER BY i.valor_cent DESC`, [loteId]);
  return {
    ...l, total_cent: Number(l.total_cent),
    itens: itens.map((i) => ({
      id: i.id, motoboy_id: i.motoboy_id, nome: i.nome_completo, codigo: i.codigo,
      valor_cent: Number(i.valor_cent), pix_chave: i.pix_chave, status: i.status,
      provedor_id: i.provedor_id, erro: i.erro, tentativas: i.tentativas, atualizado_em: i.atualizado_em,
    })),
  };
}

async function listarLotes({ empresaId, limite = 20 }) {
  const { rows } = await query(`
    SELECT id, referencia, origem, status, total_cent, quantidade, criado_em, enviado_em
      FROM pagamento_lotes WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT $2`, [empresaId, Math.min(100, limite)]);
  return rows.map((r) => ({ ...r, total_cent: Number(r.total_cent) }));
}

// ── Envio ────────────────────────────────────────────────────────────────────
// Duas etapas, com o endToEndId gravado ENTRE elas. É o que torna o reenvio seguro:
// item que já tem e2e nunca é reiniciado — a gente consulta o que aconteceu com ele.
// Sem isso, uma queda entre iniciar e confirmar viraria pagamento duplicado.
async function enviarItem({ conta, banco, item, empresaId, loteId }) {
  try {
    if (item.provedor_id) {
      const r = await banco.consultarPix(conta, item.provedor_id);
      await aplicarResultado({ item, resultado: r, empresaId, loteId });
      return r.status !== 'erro';
    }

    const { e2e, favorecido } = await banco.iniciarPix(conta, { chave: item.pix_chave });
    // Grava ANTES de confirmar: se o processo morrer aqui, o item tem identidade e a
    // próxima passagem consulta em vez de iniciar outro pagamento.
    await query(`UPDATE pagamento_itens SET provedor_id = $2, status = 'enviado', atualizado_em = now() WHERE id = $1`,
      [item.id, e2e]);
    await evento({ empresaId, loteId, itemId: item.id, tipo: 'pix_iniciado',
      detalhe: { e2e, favorecido: favorecido && favorecido.nome } });

    const r = await banco.confirmarPix(conta, {
      e2e, valorCent: Number(item.valor_cent), descricao: 'Repasse de entregas',
    });
    await aplicarResultado({ item, resultado: r, empresaId, loteId });
    return r.status !== 'erro';
  } catch (e) {
    await query(`UPDATE pagamento_itens SET status = 'erro', erro = $2, tentativas = tentativas + 1, atualizado_em = now() WHERE id = $1`,
      [item.id, e.message]);
    await evento({ empresaId, loteId, itemId: item.id, tipo: 'pix_erro', detalhe: { erro: e.message } });
    log.warn({ itemId: item.id, erro: e.message }, 'pagamentos: item falhou');
    avisarDesfecho({ empresaId, item, loteId, status: 'erro' });
    return false;
  }
}

// Um lugar só grava o desfecho do item — venha ele do envio, da consulta ou do webhook.
async function aplicarResultado({ item, resultado, empresaId, loteId }) {
  await query(`UPDATE pagamento_itens SET status = $2, erro = $3, tentativas = tentativas + 1, atualizado_em = now() WHERE id = $1`,
    [item.id, resultado.status, resultado.erro || null]);

  // Pagamento confirmado fecha o período do entregador: senão o mesmo saldo entraria
  // no lote seguinte e ele receberia duas vezes.
  if (resultado.status === 'confirmado' && item.fechamento_id) {
    await query(`UPDATE financeiro_fechamentos SET status = 'pago', pago_em = now(), forma_pagamento = 'pix'
                  WHERE id = $1 AND status = 'aberto'`, [item.fechamento_id]);
  }

  // Avulso não tem fechamento para marcar: o que tira o valor do saldo do app é um
  // ABATIMENTO. Fica aqui, no desfecho compartilhado, para valer venha o resultado do
  // envio, de uma consulta ou do webhook — e o NOT EXISTS garante um lançamento só,
  // mesmo que o desfecho seja aplicado duas vezes (ADR-027).
  // abatimento_cent = 0: a origem já abateu (antecipação, ADR-034) — nada a lançar aqui.
  if (resultado.status === 'confirmado' && !item.fechamento_id && !(item.abatimento_cent != null && Number(item.abatimento_cent) === 0)) {
    const { rows: [l] } = await query(`SELECT origem, referencia FROM pagamento_lotes WHERE id = $1`, [loteId]);
    if (l && l.origem === 'avulso') {
      await query(`
        INSERT INTO financeiro_lancamentos (empresa_id, motoboy_id, tipo, valor_cent, descricao, competencia, origem_id, origem_tipo)
        SELECT $1, $2, 'abatimento', $3, $4, (now() AT TIME ZONE 'America/Bahia')::date, $5, 'pagamento'
         WHERE NOT EXISTS (SELECT 1 FROM financeiro_lancamentos WHERE origem_id = $5)`,
      [empresaId, item.motoboy_id, Number(item.abatimento_cent || item.valor_cent), 'Pagamento avulso · ' + l.referencia, item.id]);
    }
  }

  // Devolvido: o dinheiro voltou, o saldo tem que voltar junto. Sem isto o entregador
  // ficaria sem saldo por um pagamento que não houve.
  if (resultado.status === 'devolvido') {
    const { rowCount } = await query(
      `DELETE FROM financeiro_lancamentos WHERE origem_id = $1 AND tipo = 'abatimento' AND fechamento_id IS NULL`, [item.id]);
    if (rowCount) {
      log.warn({ itemId: item.id }, 'pagamentos: abatimento estornado (pix devolvido)');
      await evento({ empresaId, loteId, itemId: item.id, tipo: 'abatimento_estornado', detalhe: {} });
    }
  }
  await evento({ empresaId, loteId, itemId: item.id, tipo: 'pix_' + resultado.status,
    detalhe: { provedor_id: item.provedor_id, valor_cent: Number(item.valor_cent), erro: resultado.erro || null } });
  avisarDesfecho({ empresaId, item, loteId, status: resultado.status });
}

// O banco publica limite de 1 requisição por segundo, e cada item consome duas
// chamadas. Enviar em rajada derruba o lote no meio com HTTP 429.
const esperar = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

async function enviarTodos({ conta, banco, itens, empresaId, loteId }) {
  let ok = 0;
  for (const [i, item] of itens.entries()) {
    if (i > 0) await esperar(banco.intervaloMs || 0);
    if (await enviarItem({ conta, banco, item, empresaId, loteId })) ok += 1;
  }
  return ok;
}

// Envia o que o lote ainda não pagou e fecha o status dele. Um lugar só para o lote
// aprovado por código e para o lote de vários avulsos que não precisou de código.
async function enviarPendentes({ conta, empresaId, loteId }) {
  const banco = adaptador(conta.provedor);
  const { rows: itens } = await query(
    `SELECT * FROM pagamento_itens WHERE lote_id = $1 AND status IN ('pendente','erro') ORDER BY valor_cent DESC`, [loteId]);
  const ok = await enviarTodos({ conta, banco, itens, empresaId, loteId });
  const status = ok === itens.length ? 'concluido' : 'concluido_com_erro';
  await query(`UPDATE pagamento_lotes SET status = $2 WHERE id = $1`, [loteId, status]);
  return { ok, total: itens.length, status };
}

// Reenvio só dos que falharam. Mesma chave de idempotência: o banco reconhece a
// operação e não paga de novo o que já saiu.
async function reenviarErros({ empresaId, loteId, usuarioId }) {
  const conta = await contaService.contaOperacional(empresaId);
  // Pausa (troca de aprovador sem senha, ADR-036) vale para tudo que manda dinheiro.
  await pedidos.garantirSemPausa(empresaId);
  // O lote tem que ser desta empresa (404 se não for) e já ter passado pela aprovação:
  // reenvio é só do que falhou num lote aprovado.
  const lote = await obterLote({ empresaId, loteId });
  if (!['concluido_com_erro', 'concluido', 'enviando'].includes(lote.status)) throw AppError.validacao('Só dá para reenviar itens de um lote já aprovado');
  const banco = adaptador(conta.provedor);
  const { rows: itens } = await query(`SELECT * FROM pagamento_itens WHERE lote_id = $1 AND empresa_id = $2 AND status = 'erro'`, [loteId, empresaId]);
  if (!itens.length) throw AppError.validacao('Nenhum item com erro neste lote');

  const ok = await enviarTodos({ conta, banco, itens, empresaId, loteId });

  const { rows: [resta] } = await query(`SELECT count(*)::int AS n FROM pagamento_itens WHERE lote_id = $1 AND empresa_id = $2 AND status = 'erro'`, [loteId, empresaId]);
  await query(`UPDATE pagamento_lotes SET status = $3 WHERE id = $1 AND empresa_id = $2`, [loteId, empresaId, resta.n ? 'concluido_com_erro' : 'concluido']);
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_reenviar',
    entidade: { tipo: 'pagamento_lote', id: loteId }, depois: { reenviados: itens.length, ok } });
  return obterLote({ empresaId, loteId });
}

async function cancelar({ empresaId, loteId, usuarioId }) {
  const { rowCount } = await query(
    `UPDATE pagamento_lotes SET status = 'cancelado' WHERE id = $1 AND empresa_id = $2 AND status IN ('rascunho','aguardando_aprovacao')`,
    [loteId, empresaId]);
  if (!rowCount) throw AppError.validacao('Só dá para cancelar um lote que ainda não foi enviado');
  await query(`DELETE FROM pagamento_tokens WHERE lote_id = $1`, [loteId]);
  await query(`UPDATE pagamento_itens SET status = 'cancelado', atualizado_em = now() WHERE lote_id = $1 AND status = 'pendente'`, [loteId]);
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_lote_cancelar',
    entidade: { tipo: 'pagamento_lote', id: loteId } });
  // Quem originou itens deste lote (a antecipação) precisa saber que nada vai sair.
  eventos.emitir('pagamento.lote_cancelado', { empresaId, loteId });
  return obterLote({ empresaId, loteId });
}

module.exports = { previa, previaDeFechamentos, criar, obterLote, listarLotes, reenviarErros, cancelar, evento,
  // usados pelo avulso: o desfecho de um pagamento é o mesmo, venha de lote ou não
  aplicarDesfecho: aplicarResultado, avisarDesfecho, enviarPendentes };
