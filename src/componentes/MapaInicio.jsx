import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Location from 'expo-location';
import { T } from '../tema';
import Icone from './Icone';
import { agruparPorLocal, rotuloGrupo } from '../utils/agrupar';

// Mapa em tela cheia da Início (ADR-053, mockup aprovado em 18/10/2026).
//
//   <MapaInicio ref={r} calor={...} ativas={...} naFila={...} camadas={{ demanda, lojas, minhas }} />
//   r.current.centralizar()                    ← botão de mira
//
// Camadas:
//   demanda  calor das coletas recentes (GET /regioes/app/calor → celulas), como "nuvem"
//            com gradiente amarelo → laranja → vermelho (pedido de 18/10/2026). No Android, o
//            Heatmap nativo do Google Maps; no iOS (provedor da Apple, sem Heatmap), anéis
//            concêntricos cada vez mais transparentes, que dão o mesmo efeito de nuvem.
//   lojas    pino de loja (nome ao tocar)
//   minhas   os pontos que ele ainda tem que fazer: a coleta das corridas não coletadas
//            (laranja, "C") e as entregas pendentes (verde, numeradas na ordem da rota).
//            Pontos no mesmo lugar viram um pino só. Sem linha de rota (pedido de 18/10/2026:
//            o traçado confundia; o que importa são os pontos).
// A posição dele é o ponto azul nativo (showsUserLocation).
let MapView = null, Marker = null, Circle = null, Heatmap = null, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Marker = maps.Marker; Circle = maps.Circle; Heatmap = maps.Heatmap;
  mapaDisponivel = !!MapView;
} catch { mapaDisponivel = false; }

// Salvador como ponto de partida só se não houver posição nenhuma (nem a última conhecida).
const REGIAO_PADRAO = { latitude: -12.9777, longitude: -38.5016, latitudeDelta: 0.09, longitudeDelta: 0.09 };

function corDoPeso(p) {
  if (p >= 0.6) return [201, 53, 43];      // vermelho
  if (p >= 0.3) return [232, 106, 42];     // laranja
  return [242, 178, 51];                   // amarelo
}
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
const USA_HEATMAP = Platform.OS === 'android';
// Anéis do fallback (iOS): do maior para o menor; empilhados, a cor engrossa no centro.
const ANEIS = [1.6, 1.3, 1.05, 0.85, 0.65, 0.45, 0.28];
// Número do pino = posição na rota otimizada (GET /minha-rota), não a ordem do aceite.
// Sem a rota ainda (ou ponto sem coordenada lá), cai na ordem da lista.
function rotuloRota(g) {
  const ns = g.itens.map((i) => i.parada.n).filter(Boolean).sort((a, b) => a - b);
  if (ns.length !== g.itens.length) return rotuloGrupo(g);
  return ns.length <= 3 ? ns.join('·') : `${ns[0]}…${ns[ns.length - 1]}`;
}

const MapaInicio = forwardRef(function MapaInicio({ calor, ativas = [], naFila, ordemPontos = {}, camadas, online, rodape = 0 }, ref) {
  const mapa = useRef(null);
  const [regiao, setRegiao] = useState(null);
  const eu = useRef(null);
  // Android: marcador com desenho próprio e tracksViewChanges={false} desde o início às vezes
  // sai em branco (o pino não aparece). Desenha "ao vivo" por 2 s a cada mudança e depois
  // congela (leve para o mapa).
  const [desenhando, setDesenhando] = useState(true);
  const enquadrou = useRef(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const p = await Location.getLastKnownPositionAsync();
        if (p?.coords && vivo) {
          eu.current = { latitude: p.coords.latitude, longitude: p.coords.longitude };
          setRegiao({ ...eu.current, latitudeDelta: 0.05, longitudeDelta: 0.05 });
          return;
        }
      } catch {}
      if (vivo) setRegiao(REGIAO_PADRAO);
    })();
    return () => { vivo = false; };
  }, []);

  useImperativeHandle(ref, () => ({
    async centralizar() {
      try {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        eu.current = { latitude: p.coords.latitude, longitude: p.coords.longitude };
      } catch {}
      if (eu.current && mapa.current) mapa.current.animateToRegion({ ...eu.current, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 450);
    },
  }), []);

  const celulas = useMemo(() => (calor?.celulas || []).slice(0, 80), [calor]);
  const pontosCalor = useMemo(() => celulas.map((c) => ({ latitude: c.lat, longitude: c.lng, weight: Math.max(1, c.qtd) })), [celulas]);
  const lojas = calor?.lojas || [];

  // Pontos a fazer: coletas das corridas ainda não coletadas e entregas pendentes.
  const { coletas, entregas } = useMemo(() => {
    const feito = (p) => p.status === 'entregue' || p.status === 'concluido' || !!p.finalizado_em || !!naFila?.has(String(p.id));
    const cols = [], ents = [];
    ativas.forEach((e) => {
      if (e.status !== 'em_rota' && e.coleta_lat != null && e.coleta_lng != null) {
        cols.push({ lat: Number(e.coleta_lat), lng: Number(e.coleta_lng), protocolo: e.protocolo, endereco: e.coleta_endereco, nome: e.cliente_nome || e.coleta_nome });
      }
      (e.pontos || []).filter((p) => !feito(p) && p.lat != null && p.lng != null)
        .forEach((p) => ents.push({ lat: Number(p.lat), lng: Number(p.lng), protocolo: e.protocolo, endereco: p.endereco, n: ordemPontos[String(p.id)] || null }));
    });
    return { coletas: agruparPorLocal(cols).filter((g) => g.lat != null), entregas: agruparPorLocal(ents).filter((g) => g.lat != null) };
  }, [ativas, naFila, ordemPontos]);
  const assinatura = `${coletas.length}:${entregas.length}:${lojas.length}:${camadas.minhas}:${camadas.lojas}:${online}`;

  useEffect(() => {
    setDesenhando(true);
    const t = setTimeout(() => setDesenhando(false), 2000);
    return () => clearTimeout(t);
  }, [assinatura]);

  // Primeira vez que há pontos: enquadra ele + os pontos (depois o motoboy mexe à vontade).
  useEffect(() => {
    if (enquadrou.current || !mapa.current || !online) return;
    const pts = [...coletas, ...entregas].map((g) => ({ latitude: g.lat, longitude: g.lng }));
    if (!pts.length) return;
    if (eu.current) pts.push(eu.current);
    enquadrou.current = true;
    setTimeout(() => {
      try { mapa.current?.fitToCoordinates(pts, { edgePadding: { top: 260, right: 60, bottom: rodape + 60, left: 60 }, animated: true }); } catch {}
    }, 600);
  }, [coletas, entregas, online, regiao]);

  if (!mapaDisponivel) {
    return <View style={[StyleSheet.absoluteFill, st.semMapa]}><Icone nome="mapa" tam={40} cor={T.tinta3} traco={1.6} /></View>;
  }
  if (!regiao) return <View style={[StyleSheet.absoluteFill, { backgroundColor: '#e6ecf1' }]} />;

  return (
    <MapView
      ref={mapa}
      style={StyleSheet.absoluteFill}
      initialRegion={regiao}
      showsUserLocation
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: rodape, left: 0 }}
    >
      {camadas.demanda && USA_HEATMAP && pontosCalor.length > 0 && (
        <Heatmap points={pontosCalor} radius={50} opacity={0.75}
          gradient={{ colors: ['#ffd64f', '#ff9a3c', '#e8562a', '#c9352b'], startPoints: [0.08, 0.35, 0.65, 0.95], colorMapSize: 256 }} />
      )}
      {camadas.demanda && !USA_HEATMAP && celulas.slice(0, 40).map((c, i) => {
        const cor = corDoPeso(c.peso);
        const r = 300 + 500 * c.peso;
        return ANEIS.map((k, j) => (
          <Circle key={`h${i}-${j}`} center={{ latitude: c.lat, longitude: c.lng }} radius={r * k} fillColor={rgba(cor, (0.05 + 0.05 * c.peso))}
            strokeWidth={0} strokeColor="transparent" zIndex={1 + j} />
        ));
      })}

      {camadas.lojas && lojas.map((l) => (
        <Marker key={'l' + l.id} coordinate={{ latitude: l.lat, longitude: l.lng }} title={l.nome} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={desenhando} zIndex={5}>
          <View style={st.loja}><Icone nome="loja" tam={13} cor={T.primario} traco={2.2} /></View>
        </Marker>
      ))}

      {online && camadas.minhas && coletas.map((g, gi) => {
        const varios = g.itens.length > 1;
        return (
          <Marker key={'c' + gi + g.lat} coordinate={{ latitude: g.lat, longitude: g.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={desenhando} zIndex={9}
            title={varios ? `Coletar ${g.itens.length} corridas aqui` : `Coletar · ${g.itens[0].parada.nome || g.itens[0].parada.protocolo}`}
            description={varios ? g.itens.map((i) => i.parada.protocolo).join(', ') : g.itens[0].parada.endereco}>
            <View style={[st.pino, varios && st.pinoLargo, { backgroundColor: '#e8562a' }]}><Text style={st.pinoTxt}>{varios ? `C·${g.itens.length}` : 'C'}</Text></View>
          </Marker>
        );
      })}
      {online && camadas.minhas && entregas.map((g, gi) => {
        const varios = g.itens.length > 1;
        return (
          <Marker key={'e' + gi + g.lat} coordinate={{ latitude: g.lat, longitude: g.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={desenhando} zIndex={8}
            title={varios ? `${g.itens.length} entregas aqui` : `${g.itens[0].parada.n ? g.itens[0].parada.n + 'ª parada · ' : ''}Entregar · ${g.itens[0].parada.protocolo}`}
            description={varios ? g.itens.map((i) => i.parada.protocolo).join(', ') : g.itens[0].parada.endereco}>
            <View style={[st.pino, varios && st.pinoLargo, { backgroundColor: T.ganho }]}><Text style={st.pinoTxt}>{rotuloRota(g)}</Text></View>
          </Marker>
        );
      })}
    </MapView>
  );
});

export default MapaInicio;

const st = StyleSheet.create({
  semMapa: { backgroundColor: '#e6ecf1', alignItems: 'center', justifyContent: 'center' },
  loja: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: T.primario, alignItems: 'center', justifyContent: 'center' },
  pino: { minWidth: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pinoLargo: { paddingHorizontal: 8 },
  pinoTxt: { color: '#fff', fontSize: 11.5, fontWeight: '900' },
});
