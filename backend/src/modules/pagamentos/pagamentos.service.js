// Fachada do módulo de pagamentos (regra 29 do AGENTS).
const conta = require('./pagamentos.conta.service');
const lotes = require('./pagamentos.lotes.service');
const avulso = require('./pagamentos.avulso.service');
const itens = require('./pagamentos.itens.service');
const aprovacao = require('./pagamentos.aprovacao.service');
const aprovadores = require('./pagamentos.aprovadores.service');
const pedidos = require('./pagamentos.aprovadores.pedidos.service');

module.exports = {
  obterConta: conta.obter, salvarConta: conta.salvar, testarConta: conta.testar,
  saldo: conta.saldo, extrato: conta.extrato, brcode: conta.brcode,
  liberarProvedor: conta.liberarProvedor, provedoresDisponiveis: conta.provedoresDisponiveis,
  previa: lotes.previa, previaDeFechamentos: lotes.previaDeFechamentos, criarLote: lotes.criar, obterLote: lotes.obterLote, listarLotes: lotes.listarLotes,
  pedirToken: aprovacao.pedirToken, aprovarEEnviar: aprovacao.aprovarEEnviar,
  conferirLinkLote: aprovacao.conferirLinkLote, aprovarPorLink: aprovacao.aprovarPorLink,
  // Aprovadores (ADR-036)
  listarAprovadores: aprovadores.listar, convidarAprovador: aprovadores.convidar, reenviarConvite: aprovadores.reenviarConvite,
  pedirNovaSenhaAprovador: aprovadores.pedirNovaSenha, removerAprovador: aprovadores.remover,
  conferirLinkAprovador: aprovadores.conferirLink, definirSenhaAprovador: aprovadores.definirSenha,
  pedirTrocaSemSenha: pedidos.pedir, cancelarPedidoAprovador: pedidos.cancelar, pausaAtiva: pedidos.pausaAtiva,
  conferirPedidoPorLink: pedidos.conferirPorLink, cancelarPedidoPorLink: pedidos.cancelarPorLink,
  concluirPedidosAprovador: pedidos.concluirVencidos, historico: pedidos.historico,
  reenviarErros: lotes.reenviarErros, cancelarLote: lotes.cancelar,
  aplicarWebhook: itens.aplicarWebhook, configurarWebhook: itens.configurarWebhook, obterItem: itens.obterItem, procurarItemAvulso: itens.procurarItemAvulso,
  entregadoresComSaldo: avulso.entregadoresComSaldo, saldoAberto: avulso.saldoAberto, conferirAvulso: avulso.conferir,
  pagarAvulso: avulso.pagar, pagarAvulsoVarios: avulso.pagarVarios,
};
