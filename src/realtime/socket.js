// Um único jeito de abrir o WebSocket do app (Onda 10).
//
// Desde 12/09/2026 o backend NÃO aceita mais o token na URL (`/ws?token=…` fecha com
// código 4003 — o token ia parar em log de proxy). A autenticação é a PRIMEIRA mensagem:
//   { "tipo": "auth", "token": "<jwt>" }
// e o servidor responde `ws.autenticado`. Sem essa mensagem em 5 s, ele fecha (4001).
//
// Toda tela que precisa de tempo real usa `abrirSocket(token)` e continua definindo
// `ws.onmessage` como antes — o envio do auth fica aqui, um lugar só.
import { API_URL } from '../api';

export function urlSocket() {
  return API_URL.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws';
}

export function abrirSocket(token) {
  const ws = new WebSocket(urlSocket());
  // addEventListener em vez de onopen: a tela pode definir o próprio ws.onopen depois.
  ws.addEventListener('open', () => {
    try { ws.send(JSON.stringify({ tipo: 'auth', token })); } catch {}
  });
  return ws;
}

// Códigos de fechamento que significam "não adianta reconectar com este token".
export const FECHAMENTO_SESSAO = new Set([4001, 4003, 1008]);
