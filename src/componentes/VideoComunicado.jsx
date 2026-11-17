// Vídeo do comunicado tocando dentro do app (expo-video).
//
// O expo-video é módulo NATIVO: só existe nas versões do app geradas depois de 17/11/2026.
// Esta atualização também chega (por OTA) a quem ainda tem a versão antiga instalada, então
// nada aqui pode ser carregado sem antes conferir se o módulo existe no aparelho:
// `tocadorDeVideo()` devolve null no app antigo e o Comunicado.jsx cai no "abrir no tocador
// do celular". NÃO troque por `import ... from 'expo-video'` no topo: quebraria o app antigo.
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { T } from '../tema';

let lib;   // undefined = ainda não conferido · null = aparelho sem o módulo
export function tocadorDeVideo() {
  if (lib !== undefined) return lib;
  try { lib = requireOptionalNativeModule('ExpoVideo') ? require('expo-video') : null; } catch { lib = null; }
  return lib;
}

const mmss = (s) => { const n = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

// semPular: a central pediu "ok só depois do fim". Sem os controles do sistema (que deixam
// arrastar até o final): só tocar/pausar e a barra de progresso. Sem isso, controles normais.
export default function VideoComunicado({ url, semPular, aoFim }) {
  const { useVideoPlayer, VideoView } = tocadorDeVideo();
  const player = useVideoPlayer(url, (p) => { p.timeUpdateEventInterval = 0.5; p.loop = false; });
  const [tocando, setTocando] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [acabou, setAcabou] = useState(false);
  const avisou = useRef(false);

  useEffect(() => {
    const fim = () => { setAcabou(true); setTocando(false); if (!avisou.current) { avisou.current = true; aoFim && aoFim(); } };
    const subs = [
      player.addListener('playToEnd', fim),
      player.addListener('playingChange', (e) => setTocando(!!(e && e.isPlaying))),
      player.addListener('timeUpdate', (e) => {
        const t = Number(e && e.currentTime) || 0;
        setPos(t);
        const d = Number(player.duration) || 0;
        if (d > 0) setDur(d);
      }),
    ];
    return () => { for (const s of subs) { try { s.remove(); } catch {} } };
  }, [player]);

  function alternar() {
    try {
      if (tocando) return player.pause();
      if (acabou) { setAcabou(false); setPos(0); player.replay(); return; }
      player.play();
    } catch {}
  }
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  return (
    <View style={s.caixa}>
      <VideoView player={player} style={s.video} contentFit="contain" surfaceType="textureView" nativeControls={!semPular}
        fullscreenOptions={{ enable: !semPular }} allowsPictureInPicture={false} />
      {semPular && (
        <>
          <TouchableOpacity style={s.toque} activeOpacity={1} onPress={alternar} accessibilityRole="button" accessibilityLabel={tocando ? 'Pausar o vídeo' : 'Assistir ao vídeo'}>
            {!tocando && (
              <View style={s.play}>{dur === 0 && pos === 0 && !acabou ? <View style={s.tri} /> : acabou ? <Text style={s.denovo}>Ver de novo</Text> : <View style={s.tri} />}</View>
            )}
            {tocando && dur === 0 && <ActivityIndicator color="#fff" />}
          </TouchableOpacity>
          <View style={s.rodape}>
            <View style={s.trilha}><View style={[s.trilhaOn, { width: pct + '%' }]} /></View>
            <Text style={s.tempo}>{mmss(pos)}{dur > 0 ? ` de ${mmss(dur)}` : ''}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', height: 200, backgroundColor: '#000' },
  toque: { position: 'absolute', left: 0, right: 0, top: 0, height: 200, alignItems: 'center', justifyContent: 'center' },
  play: { minWidth: 56, height: 56, borderRadius: 28, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  tri: { width: 0, height: 0, marginLeft: 4, borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 15, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff' },
  denovo: { color: '#fff', fontSize: 13, fontWeight: '800' },
  rodape: { paddingHorizontal: 12, paddingVertical: 9, backgroundColor: T.profundo },
  trilha: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  trilhaOn: { height: 5, borderRadius: 3, backgroundColor: '#fff' },
  tempo: { fontSize: 11.5, color: T.claro, marginTop: 5 },
});
