import { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as Location from 'expo-location';
import { T } from '../tema';
import Icone from './Icone';
import { agruparPorLocal, rotuloGrupo } from '../utils/agrupar';
import { zonasDeDemanda, zonasPerto, RAIO_VER_DEMANDA_KM } from '../utils/zonasDemanda';
import { PROPS_MAPA_LIMPO } from '../utils/estiloMapa';

// Mapa em tela cheia da Início (ADR-053, mockup aprovado em 18/10/2026).
//
//   <MapaInicio ref={r} calor={...} ativas={...} naFila={...} camadas={{ demanda, lojas, minhas }} />
//   r.current.centralizar()                    ← botão de mira
//
// Camadas:
//   demanda  coletas recentes (GET /regioes/app/calor → celulas) em RAIOS de 1 a 3 km em
//            volta de cada região (pedido de 24/10/2026; antes era a "nuvem" do Heatmap, que
//            é medida em pixels e virava um pontinho no zoom). O círculo é em metros: cresce
//            com o zoom e mostra a região inteira. Cor e tamanho pelo volume; as regiões mais
//            cheias ganham a etiqueta "Alta demanda · 3 km". Ver src/utils/zonasDemanda.js.
//   lojas    pino de loja (nome ao tocar)
//   minhas   os pontos que ele ainda tem que fazer: a coleta das corridas não coletadas
//            (laranja, "C") e as entregas pendentes (verde, numeradas na ordem da rota).
//            Pontos no mesmo lugar viram um pino só. Sem linha de rota (pedido de 18/10/2026:
//            o traçado confundia; o que importa são os pontos).
// A posição dele é o ponto azul nativo (showsUserLocation).
let MapView = null, Marker = null, Circle = null, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Marker = maps.Marker; Circle = maps.Circle;
  mapaDisponivel = !!MapView;
} catch { mapaDisponivel = false; }

// Salvador como ponto de partida só se não houver posição nenhuma (nem a última conhecida).
const REGIAO_PADRAO = { latitude: -12.9777, longitude: -38.5016, latitudeDelta: 0.09, longitudeDelta: 0.09 };

const COR_NIVEL = { alta: [201, 53, 43], media: [232, 86, 42], baixa: [230, 150, 40] };   // vermelho, laranja, âmbar
const ROTULO_NIVEL = { alta: 'Alta demanda', media: 'Demanda média', baixa: 'Pouca demanda' };
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;
// Anéis de cada raio, do maior para o menor: o centro fica mais forte.
const ANEIS = [[1, 0.09], [0.62, 0.11], [0.3, 0.16]];
const ETIQUETAS = 3;   // só as regiões mais cheias ganham etiqueta (o resto é só o círculo)
const kmRaio = (m) => `${(m / 1000).toFixed(m % 1000 ? 1 : 0).replace('.', ',')} km`;
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

  // "Demanda" ligada (24/10/2026): afasta o mapa para mostrar as regiões com movimento até
  // RAIO_VER_DEMANDA_KM dele, com ele no quadro — dá para ver uma demanda a 10 km e ir para lá.
  const zonasRef = useRef([]);
  zonasRef.current = zonas;
  useImperativeHandle(ref, () => ({
    verDemanda() {
      if (!mapa.current) return;
      const base = eu.current || (regiao && { latitude: regiao.latitude, longitude: regiao.longitude });
      if (!base) return;
      const perto = zonasPerto(zonasRef.current, { lat: base.latitude, lng: base.longitude }, RAIO_VER_DEMANDA_KM);
      if (!perto.length) {
        mapa.current.animateToRegion({ ...base, latitudeDelta: 0.22, longitudeDelta: 0.22 }, 500);   // ~12 km de lado
        return;
      }
      // Cada zona entra inteira (centro ± raio), e ele também.
      const pts = [base];
      perto.forEach((z) => {
        const dLat = z.raio / 111320, dLng = z.raio / (111320 * Math.cos((z.lat * Math.PI) / 180));
        pts.push({ latitude: z.lat + dLat, longitude: z.lng + dLng }, { latitude: z.lat - dLat, longitude: z.lng - dLng });
      });
      try { mapa.current.fitToCoordinates(pts, { edgePadding: { top: 230, right: 40, bottom: rodape + 40, left: 40 }, animated: true }); } catch {}
    },
    voltarParaMim() {
      const base = eu.current;
      if (base && mapa.current) mapa.current.animateToRegion({ ...base, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 450);
    },
    async centralizar() {
      try {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        eu.current = { latitude: p.coords.latitude, longitude: p.coords.longitude };
      } catch {}
      if (eu.current && mapa.current) mapa.current.animateToRegion({ ...eu.current, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 450);
    },
  }), []);

  const zonas = useMemo(() => zonasDeDemanda((calor?.celulas || []).slice(0, 120)), [calor]);
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
  const assinatura = `${coletas.length}:${entregas.length}:${lojas.length}:${zonas.length}:${camadas.minhas}:${camadas.lojas}:${camadas.demanda}:${online}`;

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
    <MapView {...PROPS_MAPA_LIMPO}
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
      {camadas.demanda && zonas.map((z, i) => {
        const cor = COR_NIVEL[z.nivel];
        return ANEIS.map(([k, a], j) => (
          <Circle key={`z${i}-${j}`} center={{ latitude: z.lat, longitude: z.lng }} radius={z.raio * k}
            fillColor={rgba(cor, a)} strokeWidth={j === 0 ? 2 : 0} strokeColor={j === 0 ? rgba(cor, 0.55) : 'transparent'} zIndex={1 + j} />
        ));
      })}
      {camadas.demanda && zonas.filter((z) => z.nivel !== 'baixa').slice(0, ETIQUETAS).map((z, i) => (
        <Marker key={`ze${i}`} coordinate={{ latitude: z.lat, longitude: z.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={desenhando} zIndex={4}
          title={`${ROTULO_NIVEL[z.nivel]} · raio de ${kmRaio(z.raio)}`} description={`${z.qtd} coleta${z.qtd !== 1 ? 's' : ''} recentes nesta região`}>
          <View style={st.zonaEtq}><Text style={[st.zonaEtqTxt, { color: rgba(COR_NIVEL[z.nivel], 1) }]}>{ROTULO_NIVEL[z.nivel]} · {kmRaio(z.raio)}</Text></View>
        </Marker>
      ))}

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
  zonaEtq: { backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  zonaEtqTxt: { fontSize: 11, fontWeight: '900' },
  loja: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: T.primario, alignItems: 'center', justifyContent: 'center' },
  pino: { minWidth: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pinoLargo: { paddingHorizontal: 8 },
  pinoTxt: { color: '#fff', fontSize: 11.5, fontWeight: '900' },
});
