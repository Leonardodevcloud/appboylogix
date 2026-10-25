import { router } from 'expo-router';
import { telaAtual } from '../state/telaAtual';

// Abas de baixo (Início, Histórico, Ganhos, Perfil) — app/(abas)/_layout.jsx. Elas ficam
// vivas na memória: ir para uma aba NÃO pode empilhar uma tela nova (era o que fazia o app
// recarregar tudo — inclusive o mapa da Início — a cada toque).
//
//   · de DENTRO das abas (ex.: o "voltar" de Ganhos): `navigate` — o expo-router manda
//     JUMP/NAVIGATE para o navegador de abas, que troca de aba. (`dismissTo` daqui não fazia
//     nada: o POP_TO ia para as abas, que não tratam essa ação — bug de 24/10/2026.)
//   · de uma tela EMPILHADA por cima (corrida, concluir, ofertas…): `dismissTo` — fecha o que
//     está por cima até as abas e abre a aba pedida, sem criar outra cópia delas.
export const ROTAS_ABAS = new Set(['/home', '/historico', '/ganhos', '/perfil']);

const caminhoDe = (href) => (typeof href === 'string' ? href.split('?')[0] : href && href.pathname);

export function ehAba(href) { return ROTAS_ABAS.has(caminhoDe(href)); }

// Navega para qualquer rota: aba → troca/volta para as abas existentes; outra tela → empilha.
export function irPara(href) {
  if (!ehAba(href)) return router.push(href);
  if (ROTAS_ABAS.has(caminhoDe(telaAtual()))) return router.navigate(href);
  return router.dismissTo(href);
}

export const irParaInicio = () => irPara('/home');
