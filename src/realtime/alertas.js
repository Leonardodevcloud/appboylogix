// Alertas em tempo real à prova de MIUI.
//
// Em vez de depender do canal de notificação do Android (que muitos aparelhos
// silenciam), mantemos UMA conexão WebSocket viva enquanto o motoboy está
// logado. Quando chega/muda uma corrida, tocamos o ALERTA INTERNO (expo-audio
// + Vibration) — o mesmo que já funciona na tela de ofertas, independente do
// canal do sistema.
//
// Funciona com a tela apagada e o app no bolso PORQUE o app fica vivo: quando
// o motoboy está online, roda um serviço de localização em primeiro plano que
// mantém o processo ativo (e o WebSocket conectado).

import { getToken } from '../api';
import { abrirSocket, FECHAMENTO_SESSAO } from './socket';
import { alertaCorrida } from '../utils/alerta';
import { mostrarBanner } from '../state/banner';

// Mapeia o evento da central para o banner in-app (ícone/cor/texto/rota).
function bannerDoEvento(evento) {
  switch (evento) {
    case 'oferta.nova':       return { tipo: 'oferta',    titulo: 'Nova corrida disponível!', sub: 'Toque para ver e aceitar', rota: '/ofertas' };
    case 'entrega.atribuida': return { tipo: 'atribuida', titulo: 'Corrida atribuída a você', sub: 'Toque para abrir', rota: '/home' };
    case 'entrega.editada':   return { tipo: 'editada',   titulo: 'Corrida atualizada', sub: 'A central alterou uma corrida', rota: '/home' };
    case 'entrega.removida':  return { tipo: 'removida',  titulo: 'Corrida removida', sub: 'A central removeu uma corrida', rota: '/home' };
    case 'ponto.liberado':    return { tipo: 'ponto',     titulo: 'Ponto liberado', sub: 'Você já pode marcar a entrega', rota: '/home' };
    default: return null;
  }
}

let ws = null;
let ativo = false;
let reconectarTimer = null;
let pingTimer = null;
let ultimoAlerta = 0;

// Eventos (vindos da central) que merecem alerta sonoro/vibração.
const EVENTOS_ALERTA = new Set([
  'oferta.nova',        // nova corrida ofertada
  'entrega.atribuida',  // corrida atribuída diretamente
  'entrega.removida',   // corrida removida/transferida
  'entrega.editada',    // corrida alterada pela central
  'ponto.liberado',     // central liberou a marcação de um ponto
]);

function dispararAlerta() {
  // Throttle: evita tocar 2x se outra tela também reagir ao mesmo evento.
  const agora = Date.now();
  if (agora - ultimoAlerta < 2500) return;
  ultimoAlerta = agora;
  try { alertaCorrida(); } catch {}
}

async function abrir() {
  if (!ativo) return;
  let token = null;
  try { token = await getToken(); } catch {}
  if (!token) { agendarReconexao(); return; }

  try {
    ws = abrirSocket(token);

    ws.onopen = () => {
      // Keepalive: mantém a conexão viva em redes que derrubam socket ocioso.
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { try { if (ws && ws.readyState === 1) ws.send('ping'); } catch {} }, 25000);
    };

    ws.onmessage = (ev) => {
      try {
        const { evento } = JSON.parse(ev.data);
        if (EVENTOS_ALERTA.has(evento)) {
          dispararAlerta();
          const b = bannerDoEvento(evento);
          if (b) mostrarBanner(b);
        }
      } catch {}
    };

    ws.onclose = (ev) => {
      clearInterval(pingTimer);
      // Sessão recusada (token velho, revogado ou fora do formato): reconectar a cada 4 s só
      // martela o servidor. Espera 60 s — o login novo troca o token e o canal volta sozinho.
      agendarReconexao(FECHAMENTO_SESSAO.has(ev && ev.code) ? 60000 : 4000);
    };
    ws.onerror = () => { try { ws && ws.close(); } catch {} };
  } catch {
    agendarReconexao();
  }
}

function agendarReconexao(ms = 4000) {
  if (!ativo) return;
  clearTimeout(reconectarTimer);
  reconectarTimer = setTimeout(abrir, ms);
}

// Inicia o canal de alertas (idempotente). Chamar após login / na home.
export function iniciarAlertasTempoReal() {
  if (ativo) return;
  ativo = true;
  abrir();
}

// Encerra o canal (logout).
export function pararAlertasTempoReal() {
  ativo = false;
  clearTimeout(reconectarTimer);
  clearInterval(pingTimer);
  try { ws && ws.close(); } catch {}
  ws = null;
}
