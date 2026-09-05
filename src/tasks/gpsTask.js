import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

// URL do backend (duplicada de propósito para NÃO importar de ../api e evitar
// dependência circular: api → gpsTask → api).
const API_URL = 'https://logix-production-61ae.up.railway.app/api/v1';

export const GPS_TASK = 'logix-gps-background';

// Chave onde guardamos a entrega ativa que está sendo rastreada.
const KEY_ENTREGA = 'lx_gps_entrega_ativa';
// Buffer persistente de pontos ainda não enviados (sobrevive ao SO matar o processo).
// Formato compacto [[tMs, lat, lng], ...] com 5 decimais (~1 m) — cabe no limite do
// SecureStore (2 KB no Android) mesmo com o buffer cheio.
const KEY_BUFFER = 'lx_gps_buffer_v1';
const KEY_ULTIMO_ENVIO = 'lx_gps_ultimo_envio_ms';

// ── Política de LOTE ─────────────────────────────────────────────────────────
// O servidor aceita até 20 pontos por request em /motoboys/app/posicoes. Em vez de
// 1 request por ponto, acumulamos e enviamos quando:
//   - juntou N pontos, ou
//   - o mais antigo já espera há mais de MAX_ESPERA_MS.
// Em ENTREGA (mapa/rastreio do cliente acompanhando): 2 pontos ou 30 s — o cliente
// vê a posição com no máximo ~30 s de atraso e o servidor recebe metade dos requests.
// FORA de entrega (só "online"): 4 pontos ou 2 min — o painel só precisa saber que
// o motoboy está por perto.
const LOTE = {
  entrega: { n: 2, maxEsperaMs: 30_000 },
  ocioso:  { n: 4, maxEsperaMs: 90_000 },   // a Home alerta com 3 min sem envio — 90 s dá folga
};
const BUFFER_MAX = 40;          // pontos guardados offline (≈ 20 min em entrega). Além disso, descarta os mais antigos.
const ENVIO_MAX = 20;           // limite do servidor por request
const IDADE_MAX_MS = 24 * 3600_000; // o servidor ignora ponto com mais de 24 h

export async function setEntregaAtiva(id) {
  if (id) await SecureStore.setItemAsync(KEY_ENTREGA, String(id));
  else await SecureStore.deleteItemAsync(KEY_ENTREGA);
}
export async function getEntregaAtiva() {
  return SecureStore.getItemAsync(KEY_ENTREGA);
}

// Buffer em memória espelhado no SecureStore. Lê do disco só quando a memória
// está vazia (processo recém-criado); escreve a cada mudança (é barato: < 2 KB).
let _buffer = null;
async function lerBuffer() {
  if (_buffer) return _buffer;
  try {
    const raw = await SecureStore.getItemAsync(KEY_BUFFER);
    const arr = raw ? JSON.parse(raw) : [];
    _buffer = Array.isArray(arr) ? arr : [];
  } catch { _buffer = []; }
  return _buffer;
}
async function salvarBuffer(buf) {
  _buffer = buf;
  try {
    if (!buf.length) await SecureStore.deleteItemAsync(KEY_BUFFER);
    else await SecureStore.setItemAsync(KEY_BUFFER, JSON.stringify(buf));
  } catch (e) { /* sem persistência, segue só em memória */ }
}

function r5(n) { return Math.round(Number(n) * 1e5) / 1e5; }

// Adiciona pontos ao buffer (aceita o array `locations` que o Android entrega).
async function acumular(locations) {
  const buf = await lerBuffer();
  const agora = Date.now();
  for (const l of locations) {
    const c = l && l.coords;
    if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') continue;
    const t = (typeof l.timestamp === 'number' && l.timestamp > 0) ? l.timestamp : agora;
    if (agora - t > IDADE_MAX_MS) continue;
    buf.push([t, r5(c.latitude), r5(c.longitude), c.accuracy != null ? Math.round(c.accuracy) : null]);
  }
  // Ordena por tempo e corta os mais antigos se estourar.
  buf.sort((a, b) => a[0] - b[0]);
  while (buf.length > BUFFER_MAX) buf.shift();
  await salvarBuffer(buf);
  return buf;
}

// Decide se é hora de enviar.
function deveEnviar(buf, emEntrega) {
  if (!buf.length) return false;
  const pol = emEntrega ? LOTE.entrega : LOTE.ocioso;
  if (buf.length >= pol.n) return true;
  return (Date.now() - buf[0][0]) >= pol.maxEsperaMs;
}

// Envia o buffer em lotes de até 20. Em sucesso, remove do buffer; em falha de
// rede, mantém (vai no próximo ciclo). Função pura (sem hooks) — usável na task.
async function enviarBuffer() {
  const token = await SecureStore.getItemAsync('lx_motoboy_token');
  if (!token) return { enviados: 0, motivo: 'sem_token' };
  const entregaId = await getEntregaAtiva();
  let buf = await lerBuffer();
  let enviados = 0;
  while (buf.length) {
    const lote = buf.slice(0, ENVIO_MAX);
    const pontos = lote.map(([t, lat, lng, acc]) => ({
      lat, lng,
      capturado_em: new Date(t).toISOString(),
      entrega_id: entregaId || undefined,
      precisao_m: acc != null ? acc : undefined,
    }));
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12_000);
      const r = await fetch(API_URL + '/motoboys/app/posicoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ pontos }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (r.status === 401) { console.log('[GPS bg] sessão inválida — mantendo buffer'); break; }
      if (r.status === 429) { console.log('[GPS bg] rate limit — tenta no próximo ciclo'); break; }
      if (!r.ok && r.status !== 422) throw new Error('HTTP ' + r.status);
      // 422 = lote inválido (não vai melhorar repetindo): descarta este lote.
      buf = buf.slice(lote.length);
      await salvarBuffer(buf);
      enviados += lote.length;
      const agora = new Date().toISOString();
      try { await SecureStore.setItemAsync('lx_ultima_posicao_em', agora); } catch {}
      try { await SecureStore.setItemAsync(KEY_ULTIMO_ENVIO, String(Date.now())); } catch {}
    } catch (e) {
      // Em background, falhas de rede são silenciosas — o buffer fica e tenta no próximo ciclo.
      console.log('[GPS bg] falha ao enviar lote:', e?.message);
      break;
    }
  }
  return { enviados, pendentes: buf.length };
}

// Ponto único vindo do FOREGROUND (fallback do useGPS): entra no mesmo buffer e
// segue a mesma política — nada de request por ponto.
export async function registrarPontoForeground(latitude, longitude, accuracy, emEntrega) {
  const buf = await acumular([{ coords: { latitude, longitude, accuracy }, timestamp: Date.now() }]);
  if (deveEnviar(buf, emEntrega)) return enviarBuffer();
  return { enviados: 0, pendentes: buf.length };
}

// Força o envio do que estiver pendente (ao concluir corrida, ao ficar offline, ao
// abrir o app depois de tempo sem rede).
export async function descarregarBuffer() { return enviarBuffer(); }

// Quantos pontos estão esperando envio (a tela "Rastreamento sempre ativo" mostra).
export async function pendentesNoBuffer() { return (await lerBuffer()).length; }

// Registra a task UMA vez no carregamento do módulo (fora de qualquer componente).
// Protegido com try/catch: no Expo Go o TaskManager nativo pode não estar disponível.
try {
  TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
    if (error) { console.log('[GPS bg] erro na task:', error.message); return; }
    const locs = data?.locations;
    if (!locs || !locs.length) return;
    // Aproveita TODOS os pontos do lote do Android (antes só o último ia).
    const buf = await acumular(locs);
    const emEntrega = !!(await getEntregaAtiva());
    if (deveEnviar(buf, emEntrega)) await enviarBuffer();
  });
} catch (e) {
  console.log('[GPS bg] task não registrada (ambiente sem suporte):', e?.message);
}

// (Re)inicia o rastreamento em segundo plano. Chamado ao ficar online, ao abrir
// o app e no botão "reativar". É SEMPRE chamado (não confia no hasStarted, que
// fica "true" mesmo depois de o SO matar o serviço — era o que impedia revivê-lo).
//   emEntrega=true  -> precisão High (trajetória da corrida).
//   emEntrega=false -> Balanced (rede/wifi/célula): sobrevive melhor com a tela
//                      apagada e o celular parado, mantendo o motoboy "online".
export async function garantirUpdatesBackground(emEntrega = false) {
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    await Location.startLocationUpdatesAsync(GPS_TASK, {
      accuracy: emEntrega ? Location.Accuracy.High : Location.Accuracy.Balanced,
      timeInterval: emEntrega ? 15000 : 30000,
      distanceInterval: 0,
      // Deixa o Android agrupar leituras e acordar a task com menos frequência
      // (economia de bateria). Como acumulamos, nada se perde.
      deferredUpdatesInterval: emEntrega ? 15000 : 30000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Logix — você está online',
        notificationBody: 'Compartilhando sua localização para receber corridas.',
        notificationColor: '#185FA5',
        killServiceOnDestroy: false, // mantém o serviço vivo ao fechar/remover o app
      },
    });
    return true;
  } catch (e) {
    console.log('[GPS bg] falha ao iniciar updates:', e?.message);
    return false;
  }
}

export async function pararUpdatesBackground() {
  try {
    const rodando = await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false);
    if (rodando) await Location.stopLocationUpdatesAsync(GPS_TASK);
  } catch {}
  // Ao parar, tenta entregar o que ficou pendente (não bloqueia se não houver rede).
  try { await enviarBuffer(); } catch {}
}

export async function backgroundAtivo() {
  try { return await Location.hasStartedLocationUpdatesAsync(GPS_TASK); } catch { return false; }
}
