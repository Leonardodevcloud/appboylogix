import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { API_URL, getToken } from '../api';

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
  const token = await getToken();
  if (!token) return; // sem sessão, não envia
  const entregaId = await getEntregaAtiva();
  try {
    await fetch(API_URL + '/motoboys/app/posicao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ lat, lng, entrega_id: entregaId || undefined }),
    });
  } catch (e) {
    // Em background, falhas de rede são silenciosas — tenta de novo no próximo ciclo.
    console.log('[GPS bg] falha ao enviar:', e?.message);
  }
}

// Registra a task UMA vez no carregamento do módulo (fora de qualquer componente).
TaskManager.defineTask(GPS_TASK, async ({ data, error }) => {
  if (error) { console.log('[GPS bg] erro na task:', error.message); return; }
  const locs = data?.locations;
  if (!locs || !locs.length) return;
  // Usa a posição mais recente do lote.
  const { latitude, longitude } = locs[locs.length - 1].coords;
  await enviarPosicao(latitude, longitude);
});
