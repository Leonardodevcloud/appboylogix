import * as SecureStore from 'expo-secure-store';

export const API_URL = 'https://logix-production-61ae.up.railway.app/api/v1';

// Identificador da empresa (white-label). Cada build aponta para sua empresa.
export const EMPRESA_SLUG = 'ig';

// Exportado para a task de background (que não pode usar o objeto `api` com hooks).
export async function getToken() {
  return SecureStore.getItemAsync('lx_motoboy_token');
}

async function req(method, path, body, _tentativa = 0) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  // Timeout de 20s: a primeira conexao (DNS + TLS "a frio") no Android/Expo Go
  // costuma demorar mais; um teto curto demais aborta requisicoes validas.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let r;
  try {
    r = await fetch(API_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    // Falha de REDE (conexao fria, abort, queda momentanea): tenta de novo
    // automaticamente ate 2 vezes, com uma pequena espera. Isso elimina o
    // padrao "falha na 1a vez, funciona ao atualizar".
    const ehRede = e.name === 'AbortError' || /network request failed/i.test(e.message || '');
    if (ehRede && _tentativa < 2) {
      await new Promise(res => setTimeout(res, 600 * (_tentativa + 1)));
      return req(method, path, body, _tentativa + 1);
    }
    throw new Error('Sem conexão. Verifique sua internet e tente novamente.');
  } finally {
    clearTimeout(timer);
  }
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

  // Login por e-mail/senha (cadastro pelo app).
  async loginEmail(email, senha) {
    const data = await this.post('/motoboys/auth/login-email', { slug: EMPRESA_SLUG, email, senha });
    await SecureStore.setItemAsync('lx_motoboy_token', data.token);
    await SecureStore.setItemAsync('lx_motoboy', JSON.stringify(data.motoboy));
    return data;
  },

  // Contexto de cadastro (modalidades + campos obrigatórios) — público.
  async contextoCadastro() {
    return this.get('/motoboys/cadastro/contexto/' + EMPRESA_SLUG);
  },
  // CEP (autopreenchimento) — público.
  async cepCadastro(cep) {
    return this.get('/motoboys/cadastro/cep/' + String(cep).replace(/\D/g, ''));
  },
  // Envia o pré-cadastro — público.
  async enviarCadastro(dados) {
    return this.post('/motoboys/cadastro/' + EMPRESA_SLUG, dados);
  },
  // Estado do meu cadastro (bloqueio/reenvio) — autenticado.
  async meuCadastro() {
    return this.get('/motoboys/app/meu-cadastro');
  },

  // ── Ofertas ──
  async ofertaAtiva() { return this.get('/motoboys/app/oferta-ativa'); },
  async ofertas() { return this.get('/motoboys/app/ofertas'); },
  async detalheOferta(ofertaId) { return this.get(`/motoboys/app/ofertas/${ofertaId}`); },
  async aceitarOferta(ofertaId) { return this.post(`/motoboys/app/ofertas/${ofertaId}/aceitar`, {}); },
  async recusarOferta(ofertaId) { return this.post(`/motoboys/app/ofertas/${ofertaId}/recusar`, {}); },
  // Reenvio após solicitação — autenticado.
  async reenviarCadastro(dados) {
    return this.post('/motoboys/app/reenviar-cadastro', dados);
  },

  async logout() {
    try { await this.post('/motoboys/auth/logout', {}); } catch {}
    // Para o rastreamento de fundo e limpa a entrega ativa.
    try {
      const Location = require('expo-location');
      const { GPS_TASK } = require('../tasks/gpsTask');
      const rodando = await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false);
      if (rodando) await Location.stopLocationUpdatesAsync(GPS_TASK);
      await SecureStore.deleteItemAsync('lx_gps_entrega_ativa');
    } catch {}
    await SecureStore.deleteItemAsync('lx_motoboy_token');
    await SecureStore.deleteItemAsync('lx_motoboy');
  },

  async getMotoboy() {
    const s = await SecureStore.getItemAsync('lx_motoboy');
    return s ? JSON.parse(s) : null;
  },

  async isLogado() {
    // Blindado: se o SecureStore travar ou demorar, assume não-logado (mostra login)
    // em vez de prender o app no splash.
    try {
      const t = await Promise.race([
        getToken(),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      return !!t;
    } catch {
      return false;
    }
  },
};
