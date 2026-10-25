import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { irParaInicio } from '../src/navegacao/abas';
import * as Location from 'expo-location';
import { api } from '../src/api';
import { T } from '../src/tema';
import Icone from '../src/componentes/Icone';
import { abrirNavegacao } from '../src/state/navegacao';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PROPS_MAPA_LIMPO } from '../src/utils/estiloMapa';

let MapView = null, Polygon = null, Marker = null, PROVIDER_DEFAULT = undefined, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Polygon = maps.Polygon; Marker = maps.Marker; PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
  mapaDisponivel = !!MapView;
} catch { mapaDisponivel = false; }

// "Onde tem corrida" (mockup aprovado em 12/10/2026): as Regiões da central coloridas pelo
// movimento da última hora e a lista das mais movimentadas com a distância até ele.
// Backend: GET /regioes/app/movimento (só contagem; atualiza a cada 2 min).
const FAIXA = {
  alto: { cor: '#c9352b', fundo: '#fbe8e6', rotulo: 'Muito movimento' },
  medio: { cor: '#c98a1a', fundo: '#fbf2df', rotulo: 'Médio' },
  baixo: { cor: '#378ADD', fundo: '#e4eef9', rotulo: 'Pouco' },
};

function distKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, rad = (x) => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const kmTxt = (d) => (d == null ? null : d < 1 ? `a ${Math.round(d * 1000)} m de você` : `a ${d.toFixed(1).replace('.', ',')} km de você`);
const horaDe = (iso) => { try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

function regiaoDoMapa(regioes, eu) {
  const pts = regioes.flatMap((r) => r.poligono || []).map(([lat, lng]) => ({ lat, lng }));
  if (eu) pts.push(eu);
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.3), longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.3) };
}

export default function Movimento() {
  const insetBaixo = useSafeAreaInsets().bottom;   // botões do Android no rodapé: o conteúdo fica acima deles
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);
  const [eu, setEu] = useState(null);

  const carregar = useCallback(async () => {
    try { setDados(await api.get('/regioes/app/movimento')); setErro(false); } catch { setErro(true); }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 2 * 60 * 1000);
    Location.getLastKnownPositionAsync().then((p) => { if (p?.coords) setEu({ lat: p.coords.latitude, lng: p.coords.longitude }); }).catch(() => {});
    return () => clearInterval(t);
  }, [carregar]);

  const regioes = dados?.regioes || [];
  const comMovimento = regioes.filter((r) => r.quantidade > 0).slice(0, 5);
  const regiao = regiaoDoMapa(regioes, eu);

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : irParaInicio())} style={st.btnVoltar} accessibilityLabel="Voltar">
          <Icone nome="voltar" tam={24} cor="#fff" traco={2.4} />
        </TouchableOpacity>
        <Text style={st.headerTit}>Onde tem corrida</Text>
        <View style={{ width: 38 }} />
      </View>

      {!dados && !erro ? (
        <View style={st.center}><ActivityIndicator color={T.primario} size="large" /></View>
      ) : erro && !dados ? (
        <View style={st.center}>
          <View style={st.vazioIco}><Icone nome="semSinal" tam={28} cor={T.primario} traco={1.8} /></View>
          <Text style={st.vazioTit}>Não consegui carregar agora</Text>
          <TouchableOpacity style={st.btn} onPress={carregar}><Text style={st.btnTxt}>Tentar de novo</Text></TouchableOpacity>
        </View>
      ) : !regioes.length ? (
        <View style={st.center}>
          <View style={st.vazioIco}><Icone nome="mapa" tam={28} cor={T.primario} traco={1.8} /></View>
          <Text style={st.vazioTit}>A central ainda não cadastrou regiões</Text>
        </View>
      ) : (
        <>
          <View style={st.mapaWrap}>
            {mapaDisponivel && regiao ? (
              <MapView {...PROPS_MAPA_LIMPO} style={StyleSheet.absoluteFill} provider={PROVIDER_DEFAULT} initialRegion={regiao} rotateEnabled={false} pitchEnabled={false} showsUserLocation>
                {regioes.map((r) => {
                  const f = FAIXA[r.faixa] || FAIXA.baixo;
                  return (
                    <Polygon key={r.id} coordinates={(r.poligono || []).map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
                      strokeColor={f.cor} fillColor={f.cor + (r.faixa === 'baixo' ? '33' : '66')} strokeWidth={1.5} />
                  );
                })}
                {regioes.filter((r) => r.quantidade > 0).map((r) => (
                  <Marker key={'n' + r.id} coordinate={{ latitude: r.centro.lat, longitude: r.centro.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <View style={[st.selo, { borderColor: (FAIXA[r.faixa] || FAIXA.baixo).cor }]}><Text style={st.seloTxt}>{r.nome} · {r.quantidade}</Text></View>
                  </Marker>
                ))}
              </MapView>
            ) : <View style={[StyleSheet.absoluteFill, st.semMapa]}><Icone nome="mapa" tam={40} cor={T.tinta3} traco={1.6} /></View>}
            <View style={st.legenda}>
              {['alto', 'medio', 'baixo'].map((k) => (
                <View key={k} style={st.legLinha}><View style={[st.legCor, { backgroundColor: FAIXA[k].cor }]} /><Text style={st.legTxt}>{FAIXA[k].rotulo}</Text></View>
              ))}
              <Text style={st.legHora}>Última hora · {horaDe(dados.atualizado_em)}</Text>
            </View>
          </View>

          <ScrollView style={st.lista} contentContainerStyle={{ padding: 16, paddingBottom: 30 + insetBaixo }}>
            <Text style={st.listaTit}>Mais movimentadas agora</Text>
            {!comMovimento.length && <Text style={st.listaVazia}>Nenhuma corrida criada na última hora. Fique online: o alerta chega assim que aparecer.</Text>}
            {comMovimento.map((r, i) => {
              const f = FAIXA[r.faixa] || FAIXA.baixo;
              const d = kmTxt(distKm(eu, r.centro));
              return (
                <TouchableOpacity key={r.id} style={st.reg} activeOpacity={0.8} onPress={() => abrirNavegacao({ lat: r.centro.lat, lng: r.centro.lng, label: r.nome })}
                  accessibilityLabel={`${r.nome}, ${r.quantidade} corridas na última hora. Toque para ir até lá.`}>
                  <View style={[st.regNum, { backgroundColor: f.fundo }]}><Text style={[st.regNumTxt, { color: f.cor }]}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.regNome}>{r.nome}</Text>
                    {!!d && <Text style={st.regSub}>{d}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.regQtd}>{r.quantidade}</Text>
                    <Text style={st.regSub}>corridas/h</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={st.nota}>Toque numa região para abrir a rota até ela.</Text>
          </ScrollView>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.papel },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { backgroundColor: T.profundo, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  mapaWrap: { height: 330, backgroundColor: '#e6edf3' },
  semMapa: { alignItems: 'center', justifyContent: 'center' },
  legenda: { position: 'absolute', left: 12, top: 12, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  legLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 1.5 },
  legCor: { width: 14, height: 9, borderRadius: 2 },
  legTxt: { fontSize: 10.5, fontWeight: '700', color: T.tinta },
  legHora: { fontSize: 10, color: T.tinta3, fontWeight: '600', marginTop: 3 },
  selo: { backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 },
  seloTxt: { fontSize: 10, fontWeight: '800', color: T.tinta },
  lista: { flex: 1, backgroundColor: T.sup, borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -16 },
  listaTit: { fontSize: 13, fontWeight: '800', color: T.tinta, marginBottom: 4 },
  listaVazia: { fontSize: 12.5, color: T.tinta2, lineHeight: 18, marginTop: 6 },
  reg: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.linha },
  regNum: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  regNumTxt: { fontSize: 13, fontWeight: '900' },
  regNome: { fontSize: 14, fontWeight: '800', color: T.tinta },
  regSub: { fontSize: 11, color: T.tinta3, fontWeight: '600', marginTop: 1 },
  regQtd: { fontSize: 16, fontWeight: '900', color: T.tinta },
  nota: { fontSize: 11.5, color: T.tinta3, textAlign: 'center', marginTop: 12 },
  vazioIco: { width: 56, height: 56, borderRadius: 16, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  vazioTit: { fontSize: 14, fontWeight: '700', color: T.tinta2, textAlign: 'center' },
  btn: { marginTop: 14, backgroundColor: T.primario, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  btnTxt: { color: '#fff', fontWeight: '800' },
});
