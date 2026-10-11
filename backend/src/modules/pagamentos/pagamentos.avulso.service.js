// Pagamento avulso: fora do fechamento, mas nunca fora do saldo.
//
// Regra dura do negócio (Tutts, 15/09/2026): **não se paga ao entregador mais do que
// ele tem em saldo aberto**. Adiantamento sobre corrida que ainda não aconteceu não
// existe. Por isso o entregador é OBRIGATÓRIO aqui — a chave Pix ou o copia-e-cola são
// só o destino do dinheiro, não a identidade de quem recebe. Sem entregador não há
// saldo para conferir nem para abater.
//
// E todo avulso confirmado grava um ABATIMENTO em financeiro_lancamentos, na mesma
// transação. Sem isso o valor sairia da conta da central e continuaria no saldo do app:
// o entregador receberia o adiantamento hoje e o mesmo valor de novo no fechamento.
const { query, pool } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { adaptador } = require('./pagamentos.bancos');
const contaService = require('./pagamentos.conta.service');
const lotesService = require('./pagamentos.lotes.service');
const aprovacaoService = require('./pagamentos.aprovacao.service');
const aprov = require('./pagamentos.aprovadores.service');
const pedidos = require('./pagamentos.aprovadores.pedidos.service');

// Antes de criar o lote: pausa (troca de aprovador sem senha) barra tudo, e lote que vai
// precisar de código não nasce sem ninguém para aprová-lo (ADR-036).
async function conferirAprovacao(empresaId, exigeCodigo) {
  await pedidos.garantirSemPausa(empresaId);
  if (exigeCodigo && !(await aprov.ativos(empresaId)).length) {
    throw AppError.validacao('Nenhum aprovador ativo para receber o código. Cadastre em Financeiro › Configurações de pagamento.');
  }
}

const moeda = (c) => 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

// Saldo EM ABERTO: corridas entregues ainda não fechadas, mais créditos, menos
// abatimentos — o mesmo cálculo que o fechamento usa, sem recorte de período.
// É o número que o entregador vê no app.
async function saldoAberto(empresaId, motoboyId, cx = null) {
  const exec = cx ? cx.query.bind(cx) : query;
  const { rows: [c] } = await exec(
    `SELECT COALESCE(SUM(valor_motoboy_cent), 0)::bigint AS total
       FROM entregas
      WHERE empresa_id = $1 AND motoboy_id = $2 AND status = 'entregue' AND fechamento_id IS NULL`,
    [empresaId, motoboyId]);
  const { rows: [l] } = await exec(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'credito' THEN valor_cent END), 0)::bigint AS cred,
            COALESCE(SUM(CASE WHEN tipo = 'abatimento' THEN valor_cent END), 0)::bigint AS abat
       FROM financeiro_lancamentos
      WHERE empresa_id = $1 AND motoboy_id = $2 AND fechamento_id IS NULL`,
    [empresaId, motoboyId]);
  return Number(c.total) + Number(l.cred) - Number(l.abat);
}

// Lista para o campo de busca: nome, código e saldo de cada um. O saldo aparece ANTES
// de digitar o valor, porque é ele que limita o pagamento.
async function entregadoresComSaldo({ empresaId, busca = '', limite = 20 }) {
  const termo = String(busca || '').trim();
  const params = [empresaId];
  let filtro = '';
  if (termo) {
    params.push('%' + termo + '%');
    // Busca por nome OU código — o operador conhece o entregador pelos dois.
    filtro = ` AND (m.nome_completo ILIKE $2 OR m.codigo::text ILIKE $2)`;
  }
  params.push(Math.min(50, limite));
  const { rows } = await query(`
    SELECT m.id, m.codigo, m.nome_completo AS nome, m.pix_tipo, m.pix_chave,
           COALESCE((SELECT SUM(e.valor_motoboy_cent) FROM entregas e
                      WHERE e.empresa_id = m.empresa_id AND e.motoboy_id = m.id
                        AND e.status = 'entregue' AND e.fechamento_id IS NULL), 0)::bigint AS corridas_cent,
           COALESCE((SELECT SUM(CASE WHEN l.tipo = 'credito' THEN l.valor_cent ELSE -l.valor_cent END)
                       FROM financeiro_lancamentos l
                      WHERE l.empresa_id = m.empresa_id AND l.motoboy_id = m.id AND l.fechamento_id IS NULL), 0)::bigint AS ajustes_cent
      FROM motoboys m
     WHERE m.empresa_id = $1 AND m.status = 'ativo'${filtro}
     ORDER BY m.nome_completo
     LIMIT $${params.length}`, params);

  return rows.map((r) => ({
    id: r.id, codigo: r.codigo, nome: r.nome,
    pix_tipo: r.pix_tipo, pix_chave: r.pix_chave,
    saldo_cent: Number(r.corridas_cent) + Number(r.ajustes_cent),
  }));
}

function validarValor({ valorCent, saldo, conta }) {
  if (!Number.isInteger(valorCent) || valorCent <= 0) throw AppError.validacao('Informe um valor válido');
  // A trava do negócio: nunca acima do saldo. Vem ANTES dos tetos do sistema porque é
  // a regra mais forte — teto é política da central, saldo é dinheiro que existe.
  if (valorCent > saldo) {
    throw AppError.validacao(`O entregador tem ${moeda(saldo)} em saldo aberto. Não é possível pagar ${moeda(valorCent)}.`);
  }
  if (valorCent > Number(conta.teto_item_cent)) {
    throw AppError.validacao(`Acima do teto por entregador (${moeda(conta.teto_item_cent)})`);
  }
}

async function tetoDiarioRestante(empresaId, conta) {
  const { rows: [d] } = await query(`
    SELECT COALESCE(sum(valor_cent), 0)::bigint AS total FROM pagamento_itens
     WHERE empresa_id = $1 AND status IN ('enviado', 'confirmado') AND atualizado_em >= date_trunc('day', now())`,
  [empresaId]);
  return Number(conta.teto_dia_cent) - Number(d.total);
}

// Passo 1 — conferir. Consulta a chave no banco e devolve o nome do FAVORECIDO como o
// banco o conhece. Nada é pago aqui. É o passo que separa "digitei a chave certa" de
// "estou mandando dinheiro para a pessoa certa".
async function conferir({ empresaId, motoboyId, chave, valorCent }) {
  const conta = await contaService.contaOperacional(empresaId);
  const banco = adaptador(conta.provedor);

  const { rows: [m] } = await query(
    `SELECT id, codigo, nome_completo, pix_chave FROM motoboys WHERE id = $1 AND empresa_id = $2`, [motoboyId, empresaId]);
  if (!m) throw AppError.naoEncontrado('Entregador não encontrado');

  const saldo = await saldoAberto(empresaId, motoboyId);
  validarValor({ valorCent, saldo, conta });
  const restanteDia = await tetoDiarioRestante(empresaId, conta);
  if (valorCent > restanteDia) throw AppError.validacao(`Restam ${moeda(Math.max(restanteDia, 0))} no teto de hoje`);

  const destino = String(chave || m.pix_chave || '').trim();
  if (!destino) throw AppError.validacao('Informe a chave Pix de destino — este entregador não tem chave cadastrada');

  const { favorecido } = await banco.iniciarPix(conta, { chave: destino });
  return {
    entregador: { id: m.id, codigo: m.codigo, nome: m.nome_completo },
    saldo_cent: saldo, valor_cent: valorCent, chave: destino,
    favorecido: favorecido || null,
    saldo_apos_cent: saldo - valorCent,
    teto_dia_restante_cent: restanteDia,
    // Diz à tela se este valor vai exigir código, com a regra que a conta já tem.
    exige_codigo: conta.aprovacao === 'sempre' || valorCent > Number(conta.teto_lote_cent),
  };
}

// Passo 2 — pagar. Cria o lote de um item só e decide o caminho:
//
//   · a conta exige código para este valor → o lote fica AGUARDANDO APROVAÇÃO e o
//     código vai ao aprovador; quem envia é o fluxo normal de aprovação de lote.
//   · não exige → envia na hora.
//
// Reaproveitar o lote (mesmo de um item só) não é preguiça: é o que faz aprovação,
// idempotência, acompanhamento, estorno e auditoria valerem igual para os dois casos.
// `abatimentoCent` existe para a antecipação: paga-se o líquido (valor − taxa) mas o
// saldo do profissional cai pelo valor cheio. Sem ele, os dois são o mesmo número.
// `jaAbatido`: a origem (antecipação, ADR-034) já tirou o valor do saldo no pedido —
// o item grava abatimento_cent = 0 e o desfecho não lança outro abatimento. A trava
// de saldo continua sendo da origem, que reavalia antes de chamar aqui.
async function pagar({ empresaId, motoboyId, chave, qrcode, valorCent, abatimentoCent, jaAbatido = false, descricao, usuarioId }) {
  const abate = jaAbatido ? 0 : Number(abatimentoCent || valorCent);
  const conta = await contaService.contaOperacional(empresaId);
  const banco = adaptador(conta.provedor);

  // Adaptação ao banco: copia-e-cola só existe onde o adaptador declara a capacidade.
  if (qrcode && !(banco.capacidades || {}).pix_qrcode) {
    throw AppError.validacao(`${banco.nome} não aceita pagamento por copia e cola. Use a chave Pix.`);
  }
  if (!qrcode && !(banco.capacidades || {}).pix_chave) {
    throw AppError.validacao(`${banco.nome} não aceita pagamento por chave Pix.`);
  }

  const restanteDia = await tetoDiarioRestante(empresaId, conta);
  if (valorCent > restanteDia) throw AppError.validacao(`Restam ${moeda(Math.max(restanteDia, 0))} no teto de hoje`);

  const exigeCodigo = conta.aprovacao === 'sempre' || valorCent > Number(conta.teto_lote_cent);
  await conferirAprovacao(empresaId, exigeCodigo);
  const cx = await pool.connect();
  let item; let lote;
  try {
    await cx.query('BEGIN');
    // FOR UPDATE no entregador serializa avulsos concorrentes: dois pedidos de R$ 100
    // sobre um saldo de R$ 150 não passam os dois.
    await cx.query(`SELECT id FROM motoboys WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [motoboyId, empresaId]);
    // A trava é sobre o que SAI DO SALDO, não sobre o que é pago: o valor cheio. Já
    // abatido na origem, sobra conferir o teto por item sobre o que é pago.
    if (abate > 0) validarValor({ valorCent: abate, saldo: await saldoAberto(empresaId, motoboyId, cx), conta });
    else validarValor({ valorCent, saldo: Infinity, conta });

    const { rows: [m] } = await cx.query(`SELECT pix_chave FROM motoboys WHERE id = $1`, [motoboyId]);
    const destino = qrcode ? null : String(chave || (m && m.pix_chave) || '').trim();
    if (!qrcode && !destino) throw AppError.validacao('Informe a chave Pix de destino');

    const referencia = `AV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
    const { rows: [l] } = await cx.query(`
      INSERT INTO pagamento_lotes (empresa_id, referencia, origem, status, total_cent, quantidade, criado_por, aprovado_por, aprovado_em, enviado_em)
      VALUES ($1,$2,'avulso',$3,$4,1,$5,$6,$7,$8) RETURNING *`,
    [empresaId, referencia, exigeCodigo ? 'aguardando_aprovacao' : 'enviando', valorCent, usuarioId,
      exigeCodigo ? null : usuarioId, exigeCodigo ? null : new Date(), exigeCodigo ? null : new Date()]);
    lote = l;

    const idem = require('crypto').createHash('sha256')
      .update(`${lote.id}:${motoboyId}:${valorCent}`).digest('hex').slice(0, 40);
    const { rows: [i] } = await cx.query(`
      INSERT INTO pagamento_itens (lote_id, empresa_id, motoboy_id, valor_cent, abatimento_cent, pix_chave, idempotencia)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [lote.id, empresaId, motoboyId, valorCent, abate === valorCent ? null : abate,
      destino || ('qrcode:' + String(qrcode).slice(0, 60)), idem]);
    item = i;
    await cx.query('COMMIT');
  } catch (e) { await cx.query('ROLLBACK').catch(() => {}); cx.release(); throw e; }
  cx.release();

  if (exigeCodigo) {
    // Nada é enviado: o valor fica reservado no lote e o código vai ao responsável.
    const envio = await aprovacaoService.pedirToken({ empresaId, loteId: lote.id, usuarioId });
    return { lote_id: lote.id, item_id: item.id, status: 'aguardando_aprovacao', aprovacao: envio };
  }

  // Fora da transação: a chamada ao banco não pode segurar lock de linha.
  let resultado;
  try {
    if (qrcode) {
      resultado = await banco.pagarQrCode(conta, { qrcode, valorCent, descricao: descricao || 'Pagamento avulso' });
      if (resultado.e2e) await query(`UPDATE pagamento_itens SET provedor_id = $2 WHERE id = $1`, [item.id, resultado.e2e]);
    } else {
      const { e2e } = await banco.iniciarPix(conta, { chave: item.pix_chave });
      await query(`UPDATE pagamento_itens SET provedor_id = $2, status = 'enviado', atualizado_em = now() WHERE id = $1`, [item.id, e2e]);
      resultado = await banco.confirmarPix(conta, { e2e, valorCent, descricao: descricao || 'Pagamento avulso' });
    }
  } catch (e) {
    await query(`UPDATE pagamento_itens SET status = 'erro', erro = $2, tentativas = tentativas + 1, atualizado_em = now() WHERE id = $1`, [item.id, e.message]);
    await query(`UPDATE pagamento_lotes SET status = 'concluido_com_erro' WHERE id = $1`, [lote.id]);
    lotesService.avisarDesfecho({ empresaId, item, loteId: lote.id, status: 'erro' });
    e.itemId = item.id;
    throw e;
  }

  // O desfecho (status, abatimento, estorno, auditoria) é o mesmo do lote — um lugar só.
  await lotesService.aplicarDesfecho({ empresaId, item: { ...item, provedor_id: resultado.e2e || item.provedor_id }, loteId: lote.id, resultado });
  await query(`UPDATE pagamento_lotes SET status = $2 WHERE id = $1`,
    [lote.id, resultado.status === 'erro' ? 'concluido_com_erro' : 'concluido']);
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_avulso',
    entidade: { tipo: 'pagamento_item', id: item.id },
    depois: { motoboy_id: motoboyId, valor_cent: valorCent, status: resultado.status, referencia: lote.referencia, via: qrcode ? 'copia_e_cola' : 'chave' } });

  return { lote_id: lote.id, item_id: item.id, status: resultado.status, saldo_cent: await saldoAberto(empresaId, motoboyId) };
}

// Vários avulsos num lote só — é o "pagar selecionados" da fila de antecipações.
//
// Por que um lote e não N avulsos: com a conta exigindo código, N avulsos mandariam N
// e-mails de código ao aprovador. Aqui vai UM código pelo total, e aprovação,
// idempotência, abatimento e estorno seguem o caminho de sempre (ADR-027/033).
//
// Quem não passa na conferência (saldo, teto, chave) fica FORA do lote com o motivo —
// não trava os outros (mesma regra 1 do lote de fechamento).
async function pagarVarios({ empresaId, itens, usuarioId }) {
  if (!Array.isArray(itens) || !itens.length) throw AppError.validacao('Nenhum pagamento selecionado');
  const conta = await contaService.contaOperacional(empresaId);
  const banco = adaptador(conta.provedor);
  if (!(banco.capacidades || {}).pix_chave) throw AppError.validacao(`${banco.nome} não aceita pagamento por chave Pix.`);
  // O total só é conhecido depois da conferência; o "precisa de aprovador" usa o pior
  // caso (todos dentro) — se nem assim dispensa código, exige aprovador já aqui.
  const totalMaximo = itens.reduce((s, i) => s + Number(i.valorCent || 0), 0);
  await conferirAprovacao(empresaId, conta.aprovacao === 'sempre' || totalMaximo > Number(conta.teto_lote_cent));

  const cx = await pool.connect();
  const dentro = []; const fora = [];
  let lote; let exigeCodigo = false;
  try {
    await cx.query('BEGIN');
    for (const it of itens) {
      // Mesma trava do avulso, item a item, com o profissional travado na transação.
      await cx.query(`SELECT id FROM motoboys WHERE id = $1 AND empresa_id = $2 FOR UPDATE`, [it.motoboyId, empresaId]);
      const abate = it.jaAbatido ? 0 : Number(it.abatimentoCent || it.valorCent);
      try {
        if (abate > 0) validarValor({ valorCent: abate, saldo: await saldoAberto(empresaId, it.motoboyId, cx), conta });
        else validarValor({ valorCent: Number(it.valorCent), saldo: Infinity, conta });
        if (!String(it.chave || '').trim()) throw AppError.validacao('Sem chave Pix');
        dentro.push({ ...it, abate });
      } catch (e) { fora.push({ ref: it.ref, motoboyId: it.motoboyId, motivo: e.message }); }
    }
    if (!dentro.length) { await cx.query('ROLLBACK'); return { lote_id: null, status: 'nada', itens: [], fora }; }

    const total = dentro.reduce((s, i) => s + Number(i.valorCent), 0);
    const restanteDia = await tetoDiarioRestante(empresaId, conta);
    if (total > restanteDia) throw AppError.validacao(`O total (${moeda(total)}) passa do que resta no teto de hoje (${moeda(Math.max(restanteDia, 0))})`);
    exigeCodigo = conta.aprovacao === 'sempre' || total > Number(conta.teto_lote_cent);

    const referencia = `AV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
    const { rows: [l] } = await cx.query(`
      INSERT INTO pagamento_lotes (empresa_id, referencia, origem, status, total_cent, quantidade, criado_por, aprovado_por, aprovado_em, enviado_em)
      VALUES ($1,$2,'avulso',$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
    [empresaId, referencia, exigeCodigo ? 'aguardando_aprovacao' : 'enviando', total, dentro.length, usuarioId,
      exigeCodigo ? null : usuarioId, exigeCodigo ? null : new Date()]);
    lote = l;
    for (const i of dentro) {
      const idem = require('crypto').createHash('sha256').update(`${lote.id}:${i.motoboyId}:${i.valorCent}`).digest('hex').slice(0, 40);
      const { rows: [novo] } = await cx.query(`
        INSERT INTO pagamento_itens (lote_id, empresa_id, motoboy_id, valor_cent, abatimento_cent, pix_chave, idempotencia)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [lote.id, empresaId, i.motoboyId, i.valorCent, i.abate === Number(i.valorCent) ? null : i.abate, String(i.chave).trim(), idem]);
      i.itemId = novo.id;
    }
    await cx.query('COMMIT');
  } catch (e) { await cx.query('ROLLBACK').catch(() => {}); cx.release(); throw e; }
  cx.release();

  let aprovacao = null;
  if (exigeCodigo) aprovacao = await aprovacaoService.pedirToken({ empresaId, loteId: lote.id, usuarioId });
  else await lotesService.enviarPendentes({ conta, empresaId, loteId: lote.id });

  const { rows: estados } = await query(`SELECT id, status, erro FROM pagamento_itens WHERE lote_id = $1`, [lote.id]);
  const porId = new Map(estados.map((r) => [r.id, r]));
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_avulso_varios',
    entidade: { tipo: 'pagamento_lote', id: lote.id },
    depois: { referencia: lote.referencia, quantidade: dentro.length, total_cent: Number(lote.total_cent), fora: fora.length, exige_codigo: exigeCodigo } });

  return {
    lote_id: lote.id, referencia: lote.referencia, status: exigeCodigo ? 'aguardando_aprovacao' : 'enviado', aprovacao, fora,
    itens: dentro.map((i) => ({ ref: i.ref, motoboyId: i.motoboyId, item_id: i.itemId,
      status: exigeCodigo ? 'aguardando_aprovacao' : porId.get(i.itemId).status, erro: porId.get(i.itemId).erro })),
  };
}

module.exports = { saldoAberto, entregadoresComSaldo, conferir, pagar, pagarVarios };
