import * as SecureStore from 'expo-secure-store';

// Preferências de alerta do motoboy: liga/desliga som, liga/desliga vibração
// (independentes) e qual som toca. Cache em memória + SecureStore. O alerta.js
// lê daqui; a tela de Notificações grava aqui.

const KEYS = { som: 'lx_pref_som', vibracao: 'lx_pref_vibracao', somNome: 'lx_pref_som_nome' };
const PADRAO = { som: true, vibracao: true, somNome: 'subida' };

// Sons disponíveis no seletor (ordem de exibição). 'subida' é o padrão.
export const SONS = [
  { nome: 'subida', rotulo: 'Subida', padrao: true },
  { nome: 'sirene', rotulo: 'Sirene' },
  { nome: 'triplo', rotulo: 'Triplo' },
  { nome: 'marimba', rotulo: 'Marimba' },
  { nome: 'toque', rotulo: 'Toque' },
];

let _cache = { ...PADRAO };
let _carregado = false;
const _subs = new Set();

function _notificar() { _subs.forEach(f => { try { f(_cache); } catch {} }); }

export async function carregarPrefs() {
  try {
    const [s, v, n] = await Promise.all([
      SecureStore.getItemAsync(KEYS.som),
      SecureStore.getItemAsync(KEYS.vibracao),
      SecureStore.getItemAsync(KEYS.somNome),
    ]);
    _cache = {
      som: s == null ? PADRAO.som : s === '1',
      vibracao: v == null ? PADRAO.vibracao : v === '1',
      somNome: n || PADRAO.somNome,
    };
  } catch {}
  _carregado = true;
  _notificar();
  return _cache;
}

export function getPrefs() { return _cache; }
export async function garantirPrefs() { if (!_carregado) await carregarPrefs(); return _cache; }

export async function setPref(k, v) {
  _cache = { ..._cache, [k]: v };
  _notificar();
  try { await SecureStore.setItemAsync(KEYS[k], k === 'somNome' ? String(v) : (v ? '1' : '0')); } catch {}
}

export function assinarPrefs(fn) { _subs.add(fn); try { fn(_cache); } catch {} return () => _subs.delete(fn); }
