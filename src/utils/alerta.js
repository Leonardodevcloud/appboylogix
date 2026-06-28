import { Vibration, Platform } from 'react-native';

// Toca o som de alerta de corrida + vibra. Usa expo-audio (SDK 54+).
// É tolerante a falhas: se o áudio não carregar (ex.: permissão, ambiente),
// ainda assim vibra. Nunca lança erro para não quebrar a tela.
let _player = null;

export async function alertaCorrida() {
  // Vibração: padrão chamativo (toca mesmo se o som falhar).
  try { Vibration.vibrate([0, 400, 200, 400, 200, 600]); } catch {}

  try {
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
    // Garante que toca mesmo no modo silencioso (iOS) e em segundo plano leve.
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
      });
    } catch {}
    // Reaproveita um player ou cria um novo.
    if (!_player) {
      _player = createAudioPlayer(require('../../assets/sons/alerta-corrida.mp3'));
    }
    _player.seekTo(0);
    _player.play();
  } catch (e) {
    // expo-audio indisponível (ex.: ainda não instalado / Expo Go sem o módulo):
    // a vibração acima já cobre o alerta. Silencia o erro.
    console.log('[alerta] som indisponível, usando só vibração:', e?.message);
  }
}

export function pararAlerta() {
  try { _player?.pause(); } catch {}
  try { Vibration.cancel(); } catch {}
}
