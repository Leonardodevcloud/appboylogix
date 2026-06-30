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

import { getToken, API_URL } from '../api';
import { alertaCorrida } from '../utils/alerta';

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
    const wsUrl = API_URL.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws?token=' + token;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Keepalive: mantém a conexão viva em redes que derrubam socket ocioso.
      clearInterval(pingTimer);
      pingTimer = setInterval(() => { try { if (ws && ws.readyState === 1) ws.send('ping'); } catch {} }, 25000);
    };

    ws.onmessage = (ev) => {
      try {
        const { evento } = JSON.parse(ev.data);
        if (EVENTOS_ALERTA.has(evento)) dispararAlerta();
      } catch {}
    };

    ws.onclose = () => { clearInterval(pingTimer); agendarReconexao(); };
    ws.onerror = () => { try { ws && ws.close(); } catch {} };
  } catch {
    agendarReconexao();
  }
}

function agendarReconexao() {
  if (!ativo) return;
  clearTimeout(reconectarTimer);
  reconectarTimer = setTimeout(abrir, 4000);
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
