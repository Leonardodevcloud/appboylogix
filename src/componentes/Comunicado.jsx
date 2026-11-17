// O conteúdo de um comunicado da central (mockup aprovado em 16/11/2026): mídia, título, texto,
// botão de link e as ações. Usado pelo modal que abre sozinho e pelo histórico.
//
// Vídeo: toca dentro do app nas versões que têm o tocador (VideoComunicado.jsx). No app antigo,
// abre no tocador do celular e abrir já libera o "Li e entendi".
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, ActivityIndicator } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { T } from '../tema';
import Icone from './Icone';
import VideoComunicado, { tocadorDeVideo } from './VideoComunicado';

const mmss = (s) => { const n = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

function Audio({ url, aoFim }) {
  const player = useAudioPlayer(url ? { uri: url } : null);
  const st = useAudioPlayerStatus(player);
  const avisou = useRef(false);
  const dur = Number(st?.duration) || 0, pos = Number(st?.currentTime) || 0;
  const acabou = !!st?.didJustFinish || (dur > 0 && pos >= dur - 0.4);
  useEffect(() => { if (acabou && !avisou.current) { avisou.current = true; aoFim && aoFim(); } }, [acabou]);
  function alternar() {
    try {
      if (st?.playing) return player.pause();
      // No fim, o tocador fica parado na última posição: volta ao começo para ouvir de novo.
      if (dur > 0 && pos >= dur - 0.4) player.seekTo(0);
      player.play();
    } catch {}
  }
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
  return (
    <View style={s.audio}>
      <TouchableOpacity style={s.play} activeOpacity={0.8} onPress={alternar} accessibilityRole="button" accessibilityLabel={st?.playing ? 'Pausar o áudio' : 'Ouvir o áudio'}>
        {st?.isBuffering && !st?.playing && pos === 0 && dur === 0
          ? <ActivityIndicator color="#fff" size="small" />
          : st?.playing ? <View style={s.pausa}><View style={s.pausaB} /><View style={s.pausaB} /></View> : <View style={s.tri} />}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={s.trilha}><View style={[s.trilhaOn, { width: pct + '%' }]} /></View>
        <Text style={s.tempo}>{mmss(pos)}{dur > 0 ? ` de ${mmss(dur)}` : ''}</Text>
      </View>
    </View>
  );
}

function Midia({ c, aoFim }) {
  if (c.midia_tipo === 'imagem' && c.midia_url) return <Image source={{ uri: c.midia_url }} style={s.imagem} resizeMode="cover" accessibilityIgnoresInvertColors />;
  if (c.midia_tipo === 'audio' && c.midia_url) return <Audio url={c.midia_url} aoFim={aoFim} />;
  // App com o tocador embutido (versões novas): toca aqui dentro e o fim é medido de verdade.
  if (c.midia_tipo === 'video' && c.midia_url && tocadorDeVideo()) return <VideoComunicado url={c.midia_url} semPular={!!c.ok_apos_midia} aoFim={aoFim} />;
  // App antigo, sem o tocador: abre no tocador do celular, e abrir já conta como assistido.
  if (c.midia_tipo === 'video' && c.midia_url) {
    return (
      <TouchableOpacity style={s.video} activeOpacity={0.85} accessibilityRole="button"
        onPress={async () => { try { await Linking.openURL(c.midia_url); aoFim && aoFim(); } catch {} }}>
        <View style={s.videoPlay}><View style={s.tri} /></View>
        <Text style={s.videoTt}>Assistir ao vídeo</Text>
        <Text style={s.videoSub}>Abre no tocador do celular</Text>
      </TouchableOpacity>
    );
  }
  if (c.midia_tipo === 'card') {
    const k = c.card || {};
    return (
      <View style={s.card}>
        {!!k.rotulo && <Text style={s.cardRot}>{String(k.rotulo).toUpperCase()}</Text>}
        <Text style={s.cardDest}>{k.destaque}</Text>
      </View>
    );
  }
  return null;
}

// Props:
//   c          o comunicado (formato de /comunicados/app/pendentes)
//   posicao    "1 de 2", quando há mais de um na fila
//   aoOk       async: confirma no servidor (lança o erro para aparecer aqui)
//   aoDepois   "Ver depois" (só existe quando o aviso não é obrigatório)
//   aoFimDaMidia  chegou ao fim do áudio / abriu o vídeo
//   soLeitura  aviso já respondido, reaberto pelo histórico: só o conteúdo e "Fechar"
export default function Comunicado({ c, posicao, aoOk, aoDepois, aoFimDaMidia, soLeitura, aoFechar }) {
  const ehMidiaComFim = c.midia_tipo === 'video' || c.midia_tipo === 'audio';
  const [fim, setFim] = useState(!!c.midia_fim_em);
  const [enviando, setEnv] = useState(false);
  const [erro, setErro] = useState('');
  const travado = !!c.ok_apos_midia && ehMidiaComFim && !fim;

  async function fimDaMidia() {
    if (soLeitura) return;
    try { if (aoFimDaMidia) await aoFimDaMidia(); setFim(true); } catch { setFim(true); }
  }
  async function ok() {
    if (enviando || travado) return;
    setEnv(true); setErro('');
    try { await aoOk(); } catch (e) { setErro(e?.message || 'Não foi possível confirmar. Tente de novo.'); setEnv(false); }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={s.topo}>
        <Text style={s.selo}>COMUNICADO DA CENTRAL</Text>
        {!!posicao && <Text style={s.pos}>{posicao}</Text>}
      </View>
      <Midia c={c} aoFim={fimDaMidia} />
      <Text style={s.titulo}>{c.titulo}</Text>
      {!!c.texto && <Text style={s.texto}>{c.texto}</Text>}
      {!!c.link_url && !!c.link_rotulo && (
        <TouchableOpacity style={s.link} activeOpacity={0.7} onPress={() => Linking.openURL(c.link_url).catch(() => {})} accessibilityRole="link">
          <Text style={s.linkTxt}>{c.link_rotulo}</Text>
          <Icone nome="seta" tam={16} cor={T.primario} />
        </TouchableOpacity>
      )}
      {!!erro && <Text style={s.erro}>{erro}</Text>}
      {soLeitura ? (
        <TouchableOpacity style={s.btn2} activeOpacity={0.8} onPress={aoFechar}><Text style={s.btn2Txt}>Fechar</Text></TouchableOpacity>
      ) : (
        <>
          <TouchableOpacity style={[s.btn, (travado || enviando) && s.btnOff]} activeOpacity={0.85} onPress={ok} disabled={travado || enviando} accessibilityRole="button">
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{c.exige_ok ? 'Li e entendi' : 'Ok, entendi'}</Text>}
          </TouchableOpacity>
          {travado && <Text style={s.dica}>{c.midia_tipo === 'audio' ? 'Ouça o áudio até o fim para confirmar.' : tocadorDeVideo() ? 'Assista ao vídeo até o fim para confirmar.' : 'Assista ao vídeo para confirmar.'}</Text>}
          {!c.exige_ok && !!aoDepois && (
            <TouchableOpacity style={s.btn2} activeOpacity={0.8} onPress={aoDepois}><Text style={s.btn2Txt}>Ver depois</Text></TouchableOpacity>
          )}
          {!!c.exige_ok && <Text style={s.dica}>Este aviso é obrigatório: confirme para continuar.</Text>}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  selo: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: T.primario },
  pos: { fontSize: 12, color: T.tinta2 },
  titulo: { fontSize: 18, fontWeight: '800', color: T.tinta, lineHeight: 23 },
  texto: { fontSize: 14, color: T.tinta, lineHeight: 21 },
  imagem: { width: '100%', height: 190, borderRadius: 14, backgroundColor: T.suave },
  card: { minHeight: 150, borderRadius: 14, backgroundColor: T.profundo, padding: 18, justifyContent: 'flex-end', gap: 6 },
  cardRot: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: T.claro },
  cardDest: { fontSize: 23, fontWeight: '800', color: '#fff', lineHeight: 28 },
  audio: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: T.linha, backgroundColor: T.suave, borderRadius: 14, padding: 12 },
  play: { width: 46, height: 46, borderRadius: 23, backgroundColor: T.primario, alignItems: 'center', justifyContent: 'center' },
  tri: { width: 0, height: 0, marginLeft: 4, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 13, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff' },
  pausa: { flexDirection: 'row', gap: 5 },
  pausaB: { width: 5, height: 16, borderRadius: 2, backgroundColor: '#fff' },
  trilha: { height: 6, borderRadius: 3, backgroundColor: T.linha, overflow: 'hidden' },
  trilhaOn: { height: 6, borderRadius: 3, backgroundColor: T.primario },
  tempo: { fontSize: 11.5, color: T.tinta2, marginTop: 5 },
  video: { height: 150, borderRadius: 14, backgroundColor: T.profundo, alignItems: 'center', justifyContent: 'center', gap: 6 },
  videoPlay: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  videoTt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  videoSub: { color: T.claro, fontSize: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 6 },
  linkTxt: { color: T.primario, fontSize: 14, fontWeight: '700' },
  erro: { color: T.alerta, fontSize: 12.5, fontWeight: '600' },
  btn: { backgroundColor: T.primario, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnOff: { opacity: 0.45 },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btn2: { borderWidth: 1, borderColor: T.linha, borderRadius: 14, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: T.sup },
  btn2Txt: { color: T.tinta, fontSize: 14, fontWeight: '700' },
  dica: { fontSize: 12, color: T.tinta2, textAlign: 'center' },
});
