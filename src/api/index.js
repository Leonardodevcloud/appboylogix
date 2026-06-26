import * as SecureStore from 'expo-secure-store';

export const API_URL = 'https://logix-production-61ae.up.railway.app/api/v1';

// Exportado para a task de background (que não pode usar o objeto `api` com hooks).
export async function getToken() {
  return SecureStore.getItemAsync('lx_motoboy_token');
}

async function req(method, path, body) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const r = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(data.mensagem || data.erro || 'Erro ' + r.status);
  return data;
}

export const api = {
  post:  (path, body) => req('POST', path, body),
  get:   (path)       => req('GET', path),
  patch: (path, body) => req('PATCH', path, body),

  async login(telefone, pin) {
    const data = await this.post('/motoboys/auth/login', { telefone, pin });
    await SecureStore.setItemAsync('lx_motoboy_token', data.token);
    await SecureStore.setItemAsync('lx_motoboy', JSON.stringify(data.motoboy));
    return data;
  },

  async logout() {
    try { await this.post('/motoboys/auth/logout', {}); } catch {}
    // Para o rastreamento de fundo e limpa a entrega ativa.
    try {
      const Location = require('expo-location');
      const { GPS_TASK, setEntregaAtiva } = require('../tasks/gpsTask');
      const rodando = await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false);
      if (rodando) await Location.stopLocationUpdatesAsync(GPS_TASK);
      await setEntregaAtiva(null);
    } catch {}
    await SecureStore.deleteItemAsync('lx_motoboy_token');
    await SecureStore.deleteItemAsync('lx_motoboy');
  },

  async getMotoboy() {
    const s = await SecureStore.getItemAsync('lx_motoboy');
    return s ? JSON.parse(s) : null;
  },

  async isLogado() {
    const t = await getToken();
    return !!t;
  },
};
