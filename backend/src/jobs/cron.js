const cron = require('node-cron');
const log = require('../shared/logger');
const { comLockExclusivo } = require('../shared/locks');
const posicoes = require('../modules/posicoes');
const saude = require('../modules/saude');
const filas = require('../modules/filas');
const { query } = require('../shared/db');
const radar = require('../modules/radar');
const { emitirParaEmpresa } = require('../realtime/ws');

// Retenção curta de rastreamento = menos volume de banco = menos custo.
const RETENCAO_DIAS = Number(process.env.RASTREAMENTO_RETENCAO_DIAS) || 30;
// Auditoria (S5a): particionada por mês. Retenção = DROP da partição (instantâneo).
// 0 = nunca. Categorias de baixo valor forense (padrão: 'http') saem antes (DELETE só
// fora do quente, com a flag de purga do trigger de imutabilidade).
const AUDITORIA_RETENCAO_DIAS = Number(process.env.AUDITORIA_RETENCAO_DIAS ?? 730);
const AUDITORIA_RETENCAO_CURTA_DIAS = Number(process.env.AUDITORIA_RETENCAO_CURTA_DIAS ?? 90);
const AUDITORIA_CATEGORIAS_CURTAS = String(process.env.AUDITORIA_CATEGORIAS_CURTAS || 'http').split(',').map((c) => c.trim()).filter(Boolean);
const auditoriaFila = require('../shared/auditoriaFila');

// Agenda os jobs de manutenção. `origem` só identifica nos logs (api | worker).
function iniciarCron(origem = 'worker') {
  // Faturamento (S12): fecha a competência anterior no dia 1 às 00:10 (Bahia = 03:10 UTC);
  // diariamente aplica cancelamentos vencidos e marca faturas vencidas.
  cron.schedule('10 3 1 * *', () => comLockExclusivo('cron:faturamento-fechar', async () => {
    try { const r = await require('../modules/faturamento').service.fecharCompetencia(); log.info({ origem, ...r }, 'cron: fechamento do faturamento'); }
    catch (e) { log.error({ origem, err: e }, 'cron: fechamento do faturamento falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron faturamento-fechar: lock falhou')));
  cron.schedule('30 3 * * *', () => comLockExclusivo('cron:faturamento-diario', async () => {
    try { const fat = require('../modules/faturamento').service; log.info({ origem, cancelamentos: await fat.aplicarCancelamentos(), vencidas: await fat.marcarVencidas() }, 'cron: faturamento diário'); }
    catch (e) { log.error({ origem, err: e }, 'cron: faturamento diário falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron faturamento-diario: lock falhou')));

  // Limpeza diária às 03:00: rastreamento antigo + refresh tokens vencidos/revogados.
  // Ofertas órfãs (entrega já saiu da fila mas a oferta ficou 'ofertada'): fecha a cada 5 min.
  // Antecipação 'processando' há mais de 5 min: confere o item no banco. O retorno do
  // Pix chega por evento in-process, que se perde num restart — a varredura fecha a
  // brecha sem pagar de novo (ADR-033).
  cron.schedule('*/3 * * * *', () => comLockExclusivo('cron:antecipacoes', async () => {
    try {
      const r = await require('../modules/antecipacoes').service.reconciliar({ minutos: 5 });
      if (r.ajustadas) log.info({ origem, ...r }, 'cron: antecipações reconciliadas');
    } catch (e) { log.error({ origem, err: e }, 'cron: reconciliação de antecipações falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron antecipacoes: lock falhou')));

  // Exclusão de conta do entregador: apaga os dados de quem confirmou há 15 dias e não
  // tem mais nada a receber; vence o pedido que não foi confirmado em 48 h.
  cron.schedule('20 4 * * *', () => comLockExclusivo('cron:exclusoes', async () => {
    try {
      const r = await require('../modules/motoboys').concluirExclusoes();
      if (r.verificadas) log.info({ origem, ...r }, 'cron: exclusões de conta');
    } catch (e) { log.error({ origem, err: e }, 'cron: exclusões de conta falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron exclusoes: lock falhou')));

  // Troca de aprovador sem senha (ADR-036): passadas as 72 h sem cancelamento, aplica a
  // troca e manda o convite. A tela também conclui ao abrir; isto cobre quem não abre.
  cron.schedule('*/10 * * * *', () => comLockExclusivo('cron:aprovadores', async () => {
    try {
      const r = await require('../modules/pagamentos').service.concluirPedidosAprovador();
      if (r.concluidos) log.info({ origem, ...r }, 'cron: trocas de aprovador concluídas');
    } catch (e) { log.error({ origem, err: e }, 'cron: trocas de aprovador falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron aprovadores: lock falhou')));

  cron.schedule('*/5 * * * *', () => comLockExclusivo('cron:ofertas-orfas', async () => {
    try { const n = await filas.encerrarOfertasOrfas(); if (n) log.info({ origem, fechadas: n }, 'cron: ofertas órfãs encerradas'); }
    catch (e) { log.error({ origem, err: e }, 'cron: ofertas órfãs falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron ofertas-orfas: lock falhou')));

  // Todo job roda dentro de um advisory lock do Postgres: se a API tiver N réplicas
  // com cron embutido, ou API + worker ao mesmo tempo, só UM processo executa.
  cron.schedule('0 3 * * *', () => comLockExclusivo('cron:limpeza', async () => {
    try {
      // Histórico GPS: partições diárias — cria as próximas e DROPA as vencidas (instantâneo).
      // Se por algum motivo a tabela ainda não for particionada, cai no DELETE antigo.
      const part = await posicoes.manterParticoes({ diasFrente: 7, retencaoDias: RETENCAO_DIAS });
      let removidos = null;
      if (!part.particionada) {
        const r1 = await query(`DELETE FROM rastreamento WHERE capturado_em < now() - make_interval(days => $1)`, [RETENCAO_DIAS]);
        removidos = r1.rowCount;
      }
      // Refresh revogados ficam 30 dias (S1: detecção de reuso + forense); vencidos saem na hora.
      const r2 = await query(`DELETE FROM sessoes_refresh WHERE expira_em < now() - interval '30 days' OR (revogado = TRUE AND criado_em < now() - interval '30 days')`);
      const sa = await saude.limparAntigas().catch(() => null);
      const audPart = await auditoriaFila.manterParticoes({ mesesFrente: 3, retencaoDias: AUDITORIA_RETENCAO_DIAS }).catch((e) => { log.error({ err: e }, 'cron: partições da auditoria falharam'); return null; });
      const aud = await auditoriaFila.purgarCategoriasCurtas({ categorias: AUDITORIA_CATEGORIAS_CURTAS, dias: AUDITORIA_RETENCAO_CURTA_DIAS }).catch((e) => { log.error({ err: e }, 'cron: retenção curta da auditoria falhou'); return null; });
      log.info({ origem, particoes: part, rastreamento_removidos: removidos, refresh_removidos: r2.rowCount, saude_removidas: sa, auditoria_particoes: audPart, auditoria_curta_removidos: aud }, 'cron limpeza diária');
    } catch (e) {
      log.error({ origem, err: e }, 'cron: erro na limpeza diária');
    }
  }).catch((e) => log.error({ err: e }, 'cron limpeza: lock falhou')));
  // Keep-warm (opt-in): só faz sentido em bancos com auto-suspend (Neon/Supabase free).
  // No Postgres do Railway o banco nunca dorme — DB_KEEP_WARM fica desligado.
  if (process.env.DB_KEEP_WARM === 'true') {
    cron.schedule('*/2 * * * *', async () => {
      try { await query('SELECT 1'); }
      catch (e) { log.error({ origem, err: e }, 'cron: keep-warm falhou'); }
    });
  }

  // Radar operacional: a cada 1 min, detecta motoboys parados / sem sinal em corridas
  // em rota. Só roda para empresas com config ativa (o service filtra isso).
  cron.schedule('*/1 * * * *', () => comLockExclusivo('cron:radar', async () => {
    try { await radar.varrerAlertas(emitirParaEmpresa); }
    catch (e) { log.error({ origem, err: e }, 'cron: radar falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron radar: lock falhou')));

  // Webhooks de integração: reconciliação de estado a cada 20s. Compara as colunas
  // da entrega com o que já foi notificado e dispara os momentos que faltaram
  // (0/0.5/0.75/1/2/3) para o sistema do cliente — sem tocar no motor de entrega.
  const integracoes = require('../modules/integracoes');
  // O lock do Postgres substitui a flag em memória: vale entre processos.
  cron.schedule('*/20 * * * * *', () => comLockExclusivo('cron:webhooks', async () => {
    try { await integracoes.reconciliarWebhooks(); }
    catch (e) { log.error({ origem, err: e }, 'cron: webhook integração falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron webhooks: lock falhou')));

  // Fechamento automático do financeiro: a cada 10 min verifica empresas cujo
  // horário semanal chegou e fecha o período (o service filtra o que é devido).
  const financeiro = require('../modules/financeiro');
  cron.schedule('*/10 * * * *', () => comLockExclusivo('cron:fechamento', async () => {
    try { await financeiro.service.rodarFechamentosAutomaticos(); }
    catch (e) { log.error({ origem, err: e }, 'cron: fechamento automático falhou'); }
  }).catch((e) => log.error({ err: e }, 'cron fechamento: lock falhou')));

  log.info({ origem, retencao_dias: RETENCAO_DIAS }, 'cron agendado');
}

module.exports = { iniciarCron };
