import { router } from 'expo-router';

// Abas de baixo (Início, Histórico, Ganhos, Perfil) — app/(abas)/_layout.jsx. Elas ficam
// vivas na memória: ir para uma aba NÃO pode empilhar uma tela nova (era o que fazia o app
// recarregar tudo — inclusive o mapa da Início — a cada toque). `dismissTo` volta para as
// abas que já existem (fechando o que estiver por cima) e troca para a aba pedida.
export const ROTAS_ABAS = new Set(['/home', '/historico', '/ganhos', '/perfil']);

const caminhoDe = (href) => (typeof href === 'string' ? href.split('?')[0] : href && href.pathname);

export function ehAba(href) { return ROTAS_ABAS.has(caminhoDe(href)); }

// Navega para qualquer rota: aba → volta para as abas existentes; outra tela → empilha.
export function irPara(href) {
  if (ehAba(href)) return router.dismissTo(href);
  return router.push(href);
}

export const irParaInicio = () => router.dismissTo('/home');
