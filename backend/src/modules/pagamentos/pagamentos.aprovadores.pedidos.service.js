// Troca de aprovador SEM a senha de nenhum aprovador (ADR-036).
//
// Caso real: o único aprovador saiu da empresa, ou perdeu a senha e o e-mail. Sem esta
// saída a central ficaria sem pagar. Com ela sem freio, viraria o atalho da fraude. Então:
//
//   · confirma quem pede com a SENHA DE LOGIN dele (registra quem foi);
//   · só vale depois de 72 h — e durante as 72 h NENHUM pagamento sai (pausa);
//   · aprovadores recebem um link "cancelar este pedido"; a equipe com permissão de
//     pagar recebe o aviso e pode cancelar pelo painel;
//   · um pedido aberto por vez.
//
// Uma fraude por aqui fica três dias exposta na caixa de entrada de todo mundo que pode
// impedi-la.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, pool } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const log = require('../../shared/logger');
const { registrarAuditoria } = require('../../shared/auditLogger');
const aprov = require('./pagamentos.aprovadores.service');
const { evento, mascarar, nomeUsuario, dataHora, avisar } = require('./pagamentos.aprovadores.avisos');
const emailService = () => require('../email').service;

const HORAS_CARENCIA = 72;
const hashLink = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function paraTela(p) {
  if (!p) return null;
  return {
    id: p.id, nome: p.nome, email: mascarar(p.email), motivo: p.motivo, status: p.status,
    remover_nome: p.remover_nome || null, pedido_por: p.pedido_por_nome || null,
    libera_em: p.libera_em, criado_em: p.criado_em,
  };
}

async function aberto(empresaId) {
  const { rows: [p] } = await query(`
    SELECT p.*, a.nome AS remover_nome, u.nome AS pedido_por_nome
      FROM pagamento_aprovador_pedidos p
      LEFT JOIN pagamento_aprovadores a ON a.id = p.remover_id
      LEFT JOIN usuarios u ON u.id = p.pedido_por
     WHERE p.empresa_id = $1 AND p.status = 'aguardando'`, [empresaId]);
  return p || null;
}

// Pausa = pedido aberto. Antes de olhar, conclui o que já venceu (o cron faz o mesmo de
// tempos em tempos; aqui evita esperar a próxima passada).
async function pausaAtiva(empresaId) {
  await concluirVencidos({ empresaId });
  const p = await aberto(empresaId);
  return p ? { ate: p.libera_em, pedido: paraTela(p) } : null;
}

async function garantirSemPausa(empresaId) {
  const p = await pausaAtiva(empresaId);
  if (p) {
    throw AppError.conflito(`Pagamentos pausados até ${dataHora(p.ate)}: há uma troca de aprovador sem senha em andamento. Qualquer aprovador pode cancelar o pedido.`);
  }
}

async function pedir({ empresaId, nome, email, removerId, motivo, senhaLogin, usuarioId }) {
  // Central que nunca teve aprovador cadastra direto; a que já teve (mesmo sem nenhum ativo
  // agora) só troca por aqui.
  if (!(await aprov.ativos(empresaId)).length && !(await aprov.jaTeveAprovador(empresaId))) {
    throw AppError.validacao('A central ainda não tem aprovador: cadastre o primeiro direto, sem pedido.');
  }
  if (await aberto(empresaId)) throw AppError.conflito('Já existe um pedido de troca aguardando. Cancele-o antes de fazer outro.');

  const texto = String(motivo || '').trim();
  if (texto.length < 10) throw AppError.validacao('Explique o motivo (ele vai no aviso para todos os aprovadores)');

  const { rows: [u] } = await query(`SELECT senha_hash FROM usuarios WHERE id = $1`, [usuarioId]);
  if (!u || !u.senha_hash || !(await bcrypt.compare(String(senhaLogin || ''), u.senha_hash))) {
    throw AppError.validacao('Senha de login incorreta');
  }

  const p = aprov.validarPessoa({ nome, email });
  let remover = null;
  if (removerId) remover = await aprov.obter(empresaId, removerId);
  await aprov.conferirVaga(empresaId, p.email, remover ? 1 : 0);
  await aprov.exigirEnvio(empresaId);

  const token = crypto.randomBytes(32).toString('base64url');
  let pedido;
  try {
    ({ rows: [pedido] } = await query(`
      INSERT INTO pagamento_aprovador_pedidos (empresa_id, nome, email, remover_id, motivo, cancelar_hash, pedido_por, libera_em)
      VALUES ($1,$2,$3,$4,$5,$6,$7, now() + ($8 || ' hours')::interval) RETURNING *`,
    [empresaId, p.nome, p.email, remover ? remover.id : null, texto.slice(0, 300), hashLink(token), usuarioId, String(HORAS_CARENCIA)]));
  } catch (e) {
    if (e.code === '23505') throw AppError.conflito('Já existe um pedido de troca aguardando.');
    throw e;
  }

  const quem = await nomeUsuario(usuarioId);
  await evento(empresaId, 'aprovador_pedido_sem_senha', { aprovador: p.nome, remover: remover ? remover.nome : null, quem, libera_em: pedido.libera_em, motivo: texto });
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_aprovador_pedido',
    entidade: { tipo: 'pagamento_aprovador_pedido', id: pedido.id },
    depois: { nome: p.nome, email: p.email, remover: remover && remover.id, libera_em: pedido.libera_em } });

  const base = await emailService().baseDaEmpresa(empresaId);
  const linhas = [['Pedido por', quem || '—'], ['Novo aprovador', `${p.nome} (${mascarar(p.email)})`]];
  if (remover) linhas.push(['Sai', remover.nome]);
  linhas.push(['Motivo', texto], ['Pagamentos pausados até', dataHora(pedido.libera_em)]);
  await avisar(empresaId, {
    titulo: 'Pedido de troca de aprovador sem senha',
    texto: `Foi pedida uma troca de aprovador SEM a senha de nenhum aprovador. Se ninguém cancelar, ela vale em ${HORAS_CARENCIA} horas, e até lá nenhum pagamento sai.`,
    linhas, link: base ? `${base}/aprovador?c=${token}` : null, rotuloLink: 'Não reconheço: cancelar pedido', linkSoParaAprovadores: true,
  });
  return paraTela({ ...pedido, remover_nome: remover && remover.nome, pedido_por_nome: quem });
}

async function encerrar({ pedido, quem, canceladoPor }) {
  const { rowCount } = await query(`
    UPDATE pagamento_aprovador_pedidos SET status = 'cancelado', cancelado_em = now(), cancelado_por = $2,
           cancelar_hash = NULL, atualizado_em = now()
     WHERE id = $1 AND status = 'aguardando'`, [pedido.id, canceladoPor]);
  if (!rowCount) throw AppError.validacao('Este pedido já foi encerrado');
  await evento(pedido.empresa_id, 'aprovador_pedido_cancelado', { aprovador: pedido.nome, quem });
  await registrarAuditoria({ empresaId: pedido.empresa_id, usuarioId: canceladoPor.startsWith('usuario:') ? canceladoPor.slice(8) : null,
    categoria: 'financeiro', acao: 'pagamento_aprovador_pedido_cancelar',
    entidade: { tipo: 'pagamento_aprovador_pedido', id: pedido.id }, depois: { cancelado_por: canceladoPor } });
  await avisar(pedido.empresa_id, {
    titulo: 'Pedido de troca de aprovador cancelado',
    texto: `O pedido para incluir ${pedido.nome} como aprovador foi cancelado. Os pagamentos voltaram ao normal.`,
    linhas: [['Cancelado por', quem || '—'], ['Quando', dataHora(new Date())]],
  });
}

async function cancelar({ empresaId, id, usuarioId }) {
  const { rows: [p] } = await query(
    `SELECT * FROM pagamento_aprovador_pedidos WHERE id = $1 AND empresa_id = $2`, [id, empresaId]);
  if (!p) throw AppError.naoEncontrado('Pedido não encontrado');
  await encerrar({ pedido: p, quem: await nomeUsuario(usuarioId), canceladoPor: `usuario:${usuarioId}` });
  return { ok: true };
}

// ── Link "não reconheço" do e-mail ───────────────────────────────────────────
async function porLink(token) {
  if (!token || String(token).length < 20) throw AppError.validacao('Link inválido.');
  const { rows: [p] } = await query(`
    SELECT p.*, coalesce(b.nome_exibicao, e.nome_fantasia) AS empresa_nome, u.nome AS pedido_por_nome, a.nome AS remover_nome
      FROM pagamento_aprovador_pedidos p
      JOIN empresas e ON e.id = p.empresa_id
      LEFT JOIN empresa_branding b ON b.empresa_id = p.empresa_id
      LEFT JOIN usuarios u ON u.id = p.pedido_por
      LEFT JOIN pagamento_aprovadores a ON a.id = p.remover_id
     WHERE p.cancelar_hash = $1`, [hashLink(token)]);
  if (!p || p.status !== 'aguardando') throw AppError.validacao('Este pedido já foi encerrado: não há nada a cancelar.');
  return p;
}

async function conferirPorLink({ token }) {
  const p = await porLink(token);
  return { ...paraTela(p), empresa: p.empresa_nome };
}

async function cancelarPorLink({ token }) {
  const p = await porLink(token);
  await encerrar({ pedido: p, quem: 'aprovador, pelo link do e-mail', canceladoPor: 'aprovador:link' });
  return { ok: true, empresa: p.empresa_nome };
}

// ── Vencidos: aplica a troca ─────────────────────────────────────────────────
// Transação curta só para o banco; o convite (e-mail) sai depois — falha de envio não
// desfaz a troca, e o convite pode ser reenviado pela tela.
async function concluirVencidos({ empresaId = null } = {}) {
  const { rows } = await query(`
    SELECT * FROM pagamento_aprovador_pedidos
     WHERE status = 'aguardando' AND libera_em <= now() ${empresaId ? 'AND empresa_id = $1' : ''}`, empresaId ? [empresaId] : []);
  let concluidos = 0;
  for (const p of rows) {
    const cx = await pool.connect();
    try {
      await cx.query('BEGIN');
      const { rowCount } = await cx.query(`UPDATE pagamento_aprovador_pedidos SET status = 'concluido', concluido_em = now(),
                                           cancelar_hash = NULL, atualizado_em = now() WHERE id = $1 AND status = 'aguardando'`, [p.id]);
      if (!rowCount) { await cx.query('ROLLBACK'); continue; }
      if (p.remover_id) {
        await cx.query(`UPDATE pagamento_aprovadores SET status = 'removido', removido_em = now(), link_hash = NULL, atualizado_em = now()
                         WHERE id = $1 AND empresa_id = $2`, [p.remover_id, p.empresa_id]);
      }
      await cx.query('COMMIT');
    } catch (e) {
      await cx.query('ROLLBACK').catch(() => {});
      log.error({ pedidoId: p.id, erro: e.message }, 'aprovadores: falha ao concluir pedido');
      continue;
    } finally { cx.release(); }

    concluidos += 1;
    let convidou = false;
    try {
      const { rows: [jaExiste] } = await query(`SELECT id FROM pagamento_aprovadores WHERE empresa_id = $1 AND lower(email) = $2 AND status <> 'removido'`,
        [p.empresa_id, p.email]);
      if (!jaExiste) { await aprov.criarConvidado({ empresaId: p.empresa_id, nome: p.nome, email: p.email, convidadoPor: p.pedido_por }); convidou = true; }
    } catch (e) { log.warn({ pedidoId: p.id, erro: e.message }, 'aprovadores: convite do pedido não saiu'); }
    await evento(p.empresa_id, 'aprovador_pedido_concluido', { aprovador: p.nome, convite_enviado: convidou });
    await avisar(p.empresa_id, {
      titulo: 'Troca de aprovador concluída',
      texto: `Passaram as ${HORAS_CARENCIA} horas sem cancelamento. ${p.nome} recebeu o convite para criar a senha de aprovação, e os pagamentos voltam a sair assim que houver um aprovador ativo.`,
      linhas: [['Quando', dataHora(new Date())]],
    });
  }
  return { concluidos };
}

// ── Histórico (aba Histórico) ────────────────────────────────────────────────
// Lido da trilha de eventos, que é append-only. Só o que interessa a quem confere a
// segurança: aprovadores, conta, limites e lotes aprovados.
async function historico({ empresaId, limite = 100 }) {
  const { rows } = await query(`
    SELECT tipo, detalhe, criado_em FROM pagamento_eventos
     WHERE empresa_id = $1 AND (tipo LIKE 'aprovador_%' OR tipo IN ('conta_salva','lote_aprovado','token_enviado','token_errado'))
     ORDER BY criado_em DESC LIMIT $2`, [empresaId, Math.min(200, limite)]);
  return rows;
}

module.exports = { HORAS_CARENCIA, aberto, pausaAtiva, garantirSemPausa, pedir, cancelar, conferirPorLink, cancelarPorLink, concluirVencidos, historico, paraTela };
