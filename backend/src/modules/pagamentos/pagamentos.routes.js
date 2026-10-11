// Rotas de pagamento aos entregadores.
//
// Pilha (ADR-016): verificarToken → resolverTenant → exigirCentral →
// exigirFuncionalidade('financeiro.pagamento_automatico') → exigirPermissao('financeiro.pagar').
//
// A permissão é PRÓPRIA, separada de lançar e fechar: quem lança extras não paga, e
// quem fecha período não precisa poder mandar Pix. Loja e entregador não entram aqui
// em hipótese nenhuma — é dinheiro saindo da conta da central.
const express = require('express');
const { verificarToken, verificarAdmin } = require('../../middleware/auth');
const { limiteAprovadorWeb } = require('../../middleware/rateLimit');
const { resolverTenant, exigirCentral } = require('../../middleware/tenant');
const { exigirPermissao, exigirFuncionalidade } = require('../../middleware/permissoes');
const { validar } = require('../../middleware/validar');
const { z } = require('zod');
const log = require('../../shared/logger');
const service = require('./pagamentos.service');

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD');
const autorizacao = z.object({ aprovador_id: z.string().uuid(), senha: z.string().min(1).max(128) });
const tokenLink = z.object({ token: z.string().min(20).max(200) });
const schemas = {
  conta: z.object({
    ambiente: z.enum(['hml', 'prod']),
    // As credenciais são validadas pelo ADAPTADOR (cada banco declara seus campos),
    // não por um schema fixo aqui — senão banco novo exigiria mexer nesta rota.
    // O Zod só garante o formato: objeto raso de strings, com teto de tamanho.
    credenciais: z.record(z.string().max(2_000_000)).optional(),
    teto_item_cent: z.number().int().positive(),
    teto_lote_cent: z.number().int().positive(),
    teto_dia_cent: z.number().int().positive(),
    aprovacao: z.enum(['sempre', 'acima_teto']),
    ativo: z.boolean(),
    // Senha de um aprovador, quando a mudança afrouxa a trava (ADR-036).
    autorizacao: autorizacao.optional().nullable(),
  }),
  lote: z.object({
    de: data.optional(), ate: data.optional(),
    // Caminho vindo da tela de Fechamentos: a seleção já foi feita lá.
    fechamento_ids: z.array(z.string().uuid()).optional(),
    minimo_cent: z.number().int().min(0).optional(),
    motoboy_ids: z.array(z.string().uuid()).optional(),
  }),
  aprovar: z.object({ codigo: z.string().min(4).max(10), senha: z.string().min(1).max(128) }),
  pedirToken: z.object({ aprovador_id: z.string().uuid().optional().nullable() }),
  aprovadorNovo: z.object({
    nome: z.string().min(3).max(120), email: z.string().email().max(160),
    autorizacao: autorizacao.optional().nullable(),
  }),
  comAutorizacao: z.object({ autorizacao: autorizacao.optional().nullable() }),
  pedidoSemSenha: z.object({
    nome: z.string().min(3).max(120), email: z.string().email().max(160),
    remover_id: z.string().uuid().optional().nullable(),
    motivo: z.string().min(10).max(300),
    senha_login: z.string().min(1).max(128),
  }),
  tokenLink,
  definirSenha: tokenLink.extend({ senha: z.string().min(1).max(128) }),
  webhook: z.object({ id: z.string().max(80).optional(), estado: z.string().max(40).optional(), valor: z.unknown().optional() }).passthrough(),
  webhookUrl: z.object({ url: z.string().url().max(300) }),
  provedor: z.object({ provedor: z.string().max(30).nullable() }),
  brcode: z.object({
    chave: z.string().min(3).max(200),
    valor_cent: z.number().int().min(0).optional(),
    txid: z.string().max(25).optional().nullable(),
  }),
  avulso: z.object({
    motoboy_id: z.string().uuid(),
    chave: z.string().max(200).optional().nullable(),
    qrcode: z.string().max(4000).optional().nullable(),
    valor_cent: z.number().int().positive(),
    descricao: z.string().max(120).optional().nullable(),
    categoria_id: z.string().uuid().optional().nullable(),
    codigo: z.string().min(4).max(10).optional().nullable(),
  }),
  vazio: z.object({}).passthrough(),
};

function initPagamentosRoutes() {
  const router = express.Router();

  // ── Webhook do banco (público: quem chama é o Sicoob, sem token nosso) ──
  // O Sicoob não assina a notificação — ela traz só { id, estado, valor }. Por isso o
  // corpo NÃO é fonte de verdade: usamos apenas o `id` para saber qual pagamento olhar
  // e consultamos o estado pela API autenticada. Um POST forjado não confirma nada:
  // no máximo provoca uma consulta a um pagamento que já é nosso.
  router.post('/webhook', validar(schemas.webhook), async (req, res) => {
    const e2e = req.body && req.body.id;
    try {
      if (e2e) await service.aplicarWebhook({ e2e: String(e2e) });
    } catch (e) {
      // Erro nosso não pode fazer o banco reenviar em laço: registramos e aceitamos.
      log.error({ e2e, erro: e.message }, 'pagamentos: falha ao aplicar webhook');
    }
    res.json({ ok: true });
  });

  // ── Página pública do aprovador (ADR-036) ──
  // Quem chama é a página /aprovador da central (servidor da Vercel). A proteção é o
  // token de 256 bits do e-mail (hash no banco, uso único, com validade) — o mesmo
  // desenho de /conta/excluir, com limite POR LINK (o IP é o da Vercel, um para todos).
  router.post('/aprovador/convite/conferir', limiteAprovadorWeb, validar(schemas.tokenLink), async (req, res, next) => {
    try { res.json(await service.conferirLinkAprovador({ token: req.body.token })); } catch (e) { next(e); }
  });
  router.post('/aprovador/convite/aceitar', limiteAprovadorWeb, validar(schemas.definirSenha), async (req, res, next) => {
    try { res.json(await service.definirSenhaAprovador({ token: req.body.token, senha: req.body.senha, ip: req.ip })); } catch (e) { next(e); }
  });
  // Aprovar pelo botão do e-mail do código: o lote e a senha, no aparelho do aprovador.
  router.post('/aprovador/lote/conferir', limiteAprovadorWeb, validar(schemas.tokenLink), async (req, res, next) => {
    try { res.json(await service.conferirLinkLote({ link: req.body.token })); } catch (e) { next(e); }
  });
  router.post('/aprovador/lote/aprovar', limiteAprovadorWeb, validar(schemas.definirSenha), async (req, res, next) => {
    try { res.json(await service.aprovarPorLink({ link: req.body.token, senha: req.body.senha })); } catch (e) { next(e); }
  });
  router.post('/aprovador/pedido/conferir', limiteAprovadorWeb, validar(schemas.tokenLink), async (req, res, next) => {
    try { res.json(await service.conferirPedidoPorLink({ token: req.body.token })); } catch (e) { next(e); }
  });
  router.post('/aprovador/pedido/cancelar', limiteAprovadorWeb, validar(schemas.tokenLink), async (req, res, next) => {
    try { res.json(await service.cancelarPedidoPorLink({ token: req.body.token })); } catch (e) { next(e); }
  });

  router.use(verificarToken, resolverTenant, exigirCentral,
    exigirFuncionalidade('financeiro.pagamento_automatico'));

  const pagar = exigirPermissao('financeiro.pagar');

  // ── Liberação do banco: AÇÃO DO MASTER ──
  // Quem habilita um banco para um cliente é a Logix — depende de contrato, certificado
  // e homologação. A central só preenche as credenciais dela dentro do que foi liberado.
  // Por isso `verificarAdmin` (perfil master) e não a permissão de pagar.
  router.get('/provedores', verificarAdmin, async (req, res, next) => {
    try { res.json({ linhas: service.provedoresDisponiveis() }); } catch (e) { next(e); }
  });
  router.put('/provedor', verificarAdmin, validar(schemas.provedor), async (req, res, next) => {
    try {
      res.json(await service.liberarProvedor({
        empresaId: req.empresaId, provedor: req.body.provedor || null, usuarioId: req.usuario.id,
      }));
    } catch (e) { next(e); }
  });

  // ── Conta bancária ──
  router.get('/conta', pagar, async (req, res, next) => {
    try { res.json(await service.obterConta(req.empresaId)); } catch (e) { next(e); }
  });
  router.put('/conta', pagar, validar(schemas.conta), async (req, res, next) => {
    try { res.json(await service.salvarConta({ empresaId: req.empresaId, dados: req.body, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });
  router.post('/conta/testar', pagar, validar(schemas.vazio), async (req, res, next) => {
    try { res.json(await service.testarConta(req.empresaId)); } catch (e) { next(e); }
  });
  router.post('/conta/webhook', pagar, validar(schemas.webhookUrl), async (req, res, next) => {
    try { res.json(await service.configurarWebhook({ empresaId: req.empresaId, url: req.body.url })); } catch (e) { next(e); }
  });
  // Código Pix copia e cola para pagar POR FORA (sem API do banco). Não fala com banco
  // nenhum: é o padrão do Bacen montado aqui.
  router.post('/brcode', pagar, validar(schemas.brcode), async (req, res, next) => {
    try {
      res.json(await service.brcode({
        empresaId: req.empresaId, chave: req.body.chave,
        valorCent: req.body.valor_cent || 0, txid: req.body.txid,
      }));
    } catch (e) { next(e); }
  });
  router.get('/saldo', pagar, async (req, res, next) => {
    try { res.json(await service.saldo(req.empresaId)); } catch (e) { next(e); }
  });
  router.get('/extrato', pagar, async (req, res, next) => {
    try { res.json(await service.extrato({ empresaId: req.empresaId, de: req.query.de, ate: req.query.ate })); } catch (e) { next(e); }
  });

  // ── Aprovadores (ADR-036) ──
  router.get('/aprovadores', pagar, async (req, res, next) => {
    try {
      // Nesta ordem: a pausa conclui a troca vencida, e a lista já sai com ela aplicada.
      const pausa = await service.pausaAtiva(req.empresaId);
      res.json({ ...(await service.listarAprovadores(req.empresaId)), pausa });
    } catch (e) { next(e); }
  });
  router.post('/aprovadores', pagar, validar(schemas.aprovadorNovo), async (req, res, next) => {
    try {
      res.json(await service.convidarAprovador({ empresaId: req.empresaId, nome: req.body.nome, email: req.body.email,
        autorizacao: req.body.autorizacao, usuarioId: req.usuario.id }));
    } catch (e) { next(e); }
  });
  router.post('/aprovadores/pedido', pagar, validar(schemas.pedidoSemSenha), async (req, res, next) => {
    try {
      res.json(await service.pedirTrocaSemSenha({ empresaId: req.empresaId, nome: req.body.nome, email: req.body.email,
        removerId: req.body.remover_id || null, motivo: req.body.motivo, senhaLogin: req.body.senha_login, usuarioId: req.usuario.id }));
    } catch (e) { next(e); }
  });
  router.post('/aprovadores/pedido/:id/cancelar', pagar, validar(schemas.vazio), async (req, res, next) => {
    try { res.json(await service.cancelarPedidoAprovador({ empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });
  router.post('/aprovadores/:id/reenviar', pagar, validar(schemas.vazio), async (req, res, next) => {
    try { res.json(await service.reenviarConvite({ empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });
  router.post('/aprovadores/:id/nova-senha', pagar, validar(schemas.vazio), async (req, res, next) => {
    try { res.json(await service.pedirNovaSenhaAprovador({ empresaId: req.empresaId, id: req.params.id, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });
  router.post('/aprovadores/:id/remover', pagar, validar(schemas.comAutorizacao), async (req, res, next) => {
    try {
      res.json(await service.removerAprovador({ empresaId: req.empresaId, id: req.params.id,
        autorizacao: req.body.autorizacao, usuarioId: req.usuario.id }));
    } catch (e) { next(e); }
  });
  router.get('/historico', pagar, async (req, res, next) => {
    try { res.json({ linhas: await service.historico({ empresaId: req.empresaId }) }); } catch (e) { next(e); }
  });

  // ── Avulso (fora do fechamento) ──
  // O entregador é obrigatório: a regra do negócio é nunca pagar acima do saldo dele,
  // e sem entregador não há saldo para conferir nem para abater.
  router.get('/entregadores', pagar, async (req, res, next) => {
    try {
      res.json({ linhas: await service.entregadoresComSaldo({ empresaId: req.empresaId, busca: req.query.busca }) });
    } catch (e) { next(e); }
  });
  router.post('/avulso/conferir', pagar, validar(schemas.avulso), async (req, res, next) => {
    try {
      res.json(await service.conferirAvulso({
        empresaId: req.empresaId, motoboyId: req.body.motoboy_id,
        chave: req.body.chave, valorCent: req.body.valor_cent,
      }));
    } catch (e) { next(e); }
  });
  router.post('/avulso', pagar, validar(schemas.avulso), async (req, res, next) => {
    try {
      res.json(await service.pagarAvulso({
        empresaId: req.empresaId, motoboyId: req.body.motoboy_id, chave: req.body.chave,
        qrcode: req.body.qrcode, valorCent: req.body.valor_cent,
        descricao: req.body.descricao, usuarioId: req.usuario.id,
      }));
    } catch (e) { next(e); }
  });

  // ── Lotes ──
  router.post('/previa-fechamentos', pagar, validar(schemas.lote), async (req, res, next) => {
    try {
      res.json({ linhas: await service.previaDeFechamentos({ empresaId: req.empresaId, fechamentoIds: req.body.fechamento_ids || [] }) });
    } catch (e) { next(e); }
  });
  router.get('/previa', pagar, async (req, res, next) => {
    try {
      res.json(await service.previa({
        empresaId: req.empresaId, de: req.query.de, ate: req.query.ate,
        minimoCent: Number(req.query.minimo_cent || 0),
      }));
    } catch (e) { next(e); }
  });
  router.get('/lotes', pagar, async (req, res, next) => {
    try { res.json({ linhas: await service.listarLotes({ empresaId: req.empresaId }) }); } catch (e) { next(e); }
  });
  router.get('/lotes/:id', pagar, async (req, res, next) => {
    try { res.json(await service.obterLote({ empresaId: req.empresaId, loteId: req.params.id })); } catch (e) { next(e); }
  });
  router.post('/lotes', pagar, validar(schemas.lote), async (req, res, next) => {
    try {
      res.json(await service.criarLote({
        empresaId: req.empresaId, de: req.body.de, ate: req.body.ate,
        minimoCent: req.body.minimo_cent || 0, motoboyIds: req.body.motoboy_ids || null,
        fechamentoIds: req.body.fechamento_ids || null, usuarioId: req.usuario.id,
      }));
    } catch (e) { next(e); }
  });
  router.post('/lotes/:id/token', pagar, validar(schemas.pedirToken), async (req, res, next) => {
    try {
      res.json(await service.pedirToken({ empresaId: req.empresaId, loteId: req.params.id, usuarioId: req.usuario.id,
        aprovadorId: req.body.aprovador_id || null }));
    } catch (e) { next(e); }
  });
  router.post('/lotes/:id/aprovar', pagar, validar(schemas.aprovar), async (req, res, next) => {
    try {
      res.json(await service.aprovarEEnviar({
        empresaId: req.empresaId, loteId: req.params.id, codigo: req.body.codigo, senha: req.body.senha, usuarioId: req.usuario.id,
      }));
    } catch (e) { next(e); }
  });
  router.post('/lotes/:id/reenviar', pagar, validar(schemas.vazio), async (req, res, next) => {
    try { res.json(await service.reenviarErros({ empresaId: req.empresaId, loteId: req.params.id, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });
  router.post('/lotes/:id/cancelar', pagar, validar(schemas.vazio), async (req, res, next) => {
    try { res.json(await service.cancelarLote({ empresaId: req.empresaId, loteId: req.params.id, usuarioId: req.usuario.id })); } catch (e) { next(e); }
  });

  return router;
}

module.exports = { initPagamentosRoutes };
