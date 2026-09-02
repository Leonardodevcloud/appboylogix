import { Vibration } from 'react-native';
import { garantirPrefs } from '../state/prefsAlerta';

// Alerta de corrida: som + vibração. Respeita as preferências do motoboy
// (som on/off, vibração on/off — INDEPENDENTES — e qual som toca). É tolerante a
// falhas: se o áudio não carregar, ainda vibra. Nunca lança erro.

// Requires ESTÁTICOS (o Metro só empacota o que é require literal).
const SONS = {
  subida:  require('../../assets/sons/lx_subida.wav'),
  sirene:  require('../../assets/sons/lx_sirene.wav'),
  triplo:  require('../../assets/sons/lx_triplo.wav'),
  marimba: require('../../assets/sons/lx_marimba.wav'),
  toque:   require('../../assets/sons/lx_toque.wav'),
};
const VIBRA = [0, 400, 200, 400, 200, 600]; // padrão chamativo

let _player = null;
let _somCarregado = null;

function _player_do(nome) {
  const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
  try { setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'mixWithOthers' }); } catch {}
  if (_player && _somCarregado === nome) return _player;
  try { _player?.remove?.(); } catch {}
  _player = createAudioPlayer(SONS[nome] || SONS.subida);
  _somCarregado = nome;
  return _player;
}

// Toca o alerta respeitando as preferências.
// forcarNome: toca ESSE som ignorando a pref e SEM vibrar (usado no "ouvir" do seletor).
export async function alertaCorrida(forcarNome) {
  let prefs = { som: true, vibracao: true, somNome: 'subida' };
  try { prefs = await garantirPrefs(); } catch {}

  const querVibra = forcarNome ? false : prefs.vibracao;
  const querSom   = forcarNome ? true  : prefs.som;

  if (querVibra) { try { Vibration.vibrate(VIBRA); } catch {} }
  if (!querSom) return;

  try {
    const nome = forcarNome || prefs.somNome || 'subida';
    const p = _player_do(nome);
    p.seekTo(0);
    p.play();
  } catch (e) {
    console.log('[alerta] som indisponível, usando só vibração:', e?.message);
  }
}

// Só a vibração (sem som).
export function vibrarAlerta() { try { Vibration.vibrate(VIBRA); } catch {} }

export function pararAlerta() {
  try { _player?.pause?.(); } catch {}
  try { Vibration.cancel(); } catch {}
}
