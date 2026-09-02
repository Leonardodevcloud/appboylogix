import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

// URL do backend (duplicada de propósito para NÃO importar de ../api e evitar
// dependência circular: api → gpsTask → api).
const API_URL = 'https://logix-production-61ae.up.railway.app/api/v1';

export const GPS_TASK = 'logix-gps-background';

// Chave onde guardamos a entrega ativa que está sendo rastreada.
const KEY_ENTREGA = 'lx_gps_entrega_ativa';

export async function setEntregaAtiva(id) {
  if (id) await SecureStore.setItemAsync(KEY_ENTREGA, String(id));
  else await SecureStore.deleteItemAsync(KEY_ENTREGA);
}
export async function getEntregaAtiva() {
  return SecureStore.getItemAsync(KEY_ENTREGA);
}

// Envia uma posição ao backend. Função pura (sem hooks) — usável na task.
async function enviarPosicao(lat, lng) {
  const token = await SecureStore.getItemAsync('lx_motoboy_token');
  if (!token) return; // sem sessão, não envia
  const entregaId = await getEntregaAtiva();
  try {
    await fetch(API_URL + '/motoboys/app/posicao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ lat, lng, entrega_id: entregaId || undefined }),
    });
    // Marca o último envio — a tela "Rastreamento sempre ativo" usa isso pra saber se está funcionando.
    try { await SecureStore.setItemAsync('lx_ultima_posicao_em', new Date().toISOString()); } catch (e3) {}
  } catch (e) {
    // Em background, falhas de rede são silenciosas — tenta de novo no próximo ciclo.
    console.log('[GPS bg] falha ao enviar:', e?.message);
  }
}

// Registra a task UMA vez no carregamento do módulo (fora de qualquer componente).
// Protegido com try/catch: no Expo Go o TaskManager nativo pode não estar disponível.
try {
  TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
    if (error) { console.log('[GPS bg] erro na task:', error.message); return; }
    const locs = data?.locations;
    if (!locs || !locs.length) return;
    // Usa a posição mais recente do lote.
    const { latitude, longitude } = locs[locs.length - 1].coords;
    await enviarPosicao(latitude, longitude);
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
}

export async function backgroundAtivo() {
  try { return await Location.hasStartedLocationUpdatesAsync(GPS_TASK); } catch { return false; }
}
