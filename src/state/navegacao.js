import { Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Waze ou Google Maps (12/10/2026). Na primeira rota o app pergunta com qual aplicativo
// abrir; marcando "Lembrar", não pergunta mais. Troca-se em Perfil › Navegação.
// A escolha fica no celular (SecureStore) — não depende do servidor.
//
//   abrirNavegacao({ lat, lng, label, paradas, primeira })   ← toda tela que abre rota chama isto
//
// Waze não instalado: abre direto no Google Maps, sem perguntar. Com várias paradas, o
// Google Maps recebe a rota inteira; o Waze (que não aceita paradas pela URL) vai para o
// próximo destino.

const CHAVE = 'lx_pref_navegacao';      // 'waze' | 'google' | ausente = perguntar
export const APPS = {
  waze: { nome: 'Waze', sub: 'Avisos de trânsito e radar' },
  google: { nome: 'Google Maps', sub: 'Rota com todas as paradas' },
};

let _pref = null;
let _carregado = false;
const _subsPref = new Set();
let _host = null;                         // função do <SheetNavegacao/> montado no _layout

function _notificar() { _subsPref.forEach((f) => { try { f(_pref); } catch {} }); }

export async function carregarNavegacao() {
  try { const v = await SecureStore.getItemAsync(CHAVE); _pref = APPS[v] ? v : null; } catch {}
  _carregado = true;
  _notificar();
  return _pref;
}
export function getNavegacao() { return _pref; }
export async function setNavegacao(app) {
  _pref = APPS[app] ? app : null;
  _notificar();
  try { if (_pref) await SecureStore.setItemAsync(CHAVE, _pref); else await SecureStore.deleteItemAsync(CHAVE); } catch {}
}
export function assinarNavegacao(fn) { _subsPref.add(fn); try { fn(_pref); } catch {} return () => _subsPref.delete(fn); }

// O host (folha de escolha) se registra aqui.
export function registrarHostNavegacao(fn) { _host = fn; return () => { if (_host === fn) _host = null; }; }

export async function wazeInstalado() {
  try { return await Linking.canOpenURL('waze://'); } catch { return false; }
}

const coord = (p) => (p && p.lat != null && p.lng != null && p.lat !== '' && p.lng !== '' ? `${p.lat},${p.lng}` : null);

export function urlNavegacao(app, alvo) {
  const destino = coord(alvo) || encodeURIComponent(alvo?.label || '');
  if (app === 'waze') {
    // Rota com paradas: o Waze vai para a PRIMEIRA (`primeira`), não para o fim da rota.
    const alvoWaze = coord(alvo?.primeira) || coord(alvo);
    return alvoWaze
      ? `https://waze.com/ul?ll=${alvoWaze}&navigate=yes`
      : `https://waze.com/ul?q=${destino}&navigate=yes`;
  }
  const paradas = (alvo?.paradas || []).map(coord).filter(Boolean);
  const via = paradas.length ? `&waypoints=${encodeURIComponent(paradas.join('|'))}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}${via}&travelmode=driving`;
}

async function abrirCom(app, alvo) {
  try { await Linking.openURL(urlNavegacao(app, alvo)); }
  catch { if (app === 'waze') { try { await Linking.openURL(urlNavegacao('google', alvo)); } catch {} } }
}

// Abre a rota para `alvo` ({ lat, lng, label, paradas? }) no app escolhido.
export async function abrirNavegacao(alvo) {
  if (!alvo || (!coord(alvo) && !alvo.label)) return;
  if (!_carregado) await carregarNavegacao();
  const temWaze = await wazeInstalado();
  if (!temWaze) return abrirCom('google', alvo);
  if (_pref) return abrirCom(_pref, alvo);
  if (_host) return _host({ modo: 'abrir', alvo });
  return abrirCom('google', alvo);
}

// Perfil › Navegação: abre a folha só para escolher (sem rota).
export function escolherNavegacao() {
  if (_host) _host({ modo: 'escolher' });
}

// Chamado pela folha.
export async function confirmarEscolha({ app, lembrar, alvo }) {
  if (lembrar) await setNavegacao(app);
  if (alvo) await abrirCom(app, alvo);
}
