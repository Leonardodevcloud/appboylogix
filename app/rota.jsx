import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, Linking, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';

let MapView = null, Marker = null, Polyline = null, UrlTile = null, PROVIDER_DEFAULT = undefined, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Marker = maps.Marker; Polyline = maps.Polyline; UrlTile = maps.UrlTile; PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
  mapaDisponivel = !!MapView;
} catch (e) { mapaDisponivel = false; }

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#fff', linha: '#dde9f5', ok: '#27b67f',
};

export default function Rota() {
  const [dados, setDados] = useState(null);
  const [paradas, setParadas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mapaPronto, setMapaPronto] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/motoboys/app/minha-rota');
        setDados(r);
        setParadas(r.paradas || []);
      } catch (e) { /* mantém */ }
      setCarregando(false);
    })();
  }, []);

  function mover(idx, dir) {
    const novo = [...paradas];
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= novo.length) return;
    [novo[idx], novo[alvo]] = [novo[alvo], novo[idx]];
    setParadas(novo);
  }

  // Monta a URL do Google Maps com todas as paradas (coleta + entregas na ordem).
  function seguirRota() {
    if (!paradas.length) { Alert.alert('Sem rota', 'Você não tem corridas ativas com endereço.'); return; }
    const pts = [];
    if (dados?.coleta?.lat) pts.push(`${dados.coleta.lat},${dados.coleta.lng}`);
    paradas.forEach(p => pts.push(`${p.lat},${p.lng}`));
    const destino = pts[pts.length - 1];
    const waypoints = pts.slice(0, -1).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`;
    if (waypoints) url += `&waypoints=${encodeURIComponent(waypoints)}`;
    Linking.openURL(url);
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }

  const temColeta = dados?.coleta?.lat != null;
  const totalParadas = paradas.length;
  const corridasUnicas = new Set(paradas.map(p => p.entrega_id)).size;

  // Região do mapa.
  let regiao = null;
  if (temColeta || paradas.length) {
    const todos = [];
    if (temColeta) todos.push({ lat: dados.coleta.lat, lng: dados.coleta.lng });
    paradas.forEach(p => todos.push({ lat: p.lat, lng: p.lng }));
    if (todos.length) {
      const lats = todos.map(p => p.lat), lngs = todos.map(p => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      regiao = {
        latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.5),
        longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.5),
      };
    }
  }

  const linhaRota = [];
  if (temColeta) linhaRota.push({ latitude: dados.coleta.lat, longitude: dados.coleta.lng });
  paradas.forEach(p => linhaRota.push({ latitude: p.lat, longitude: p.lng }));

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.replace('/home')} style={st.btnVoltar}>
          <Text style={st.btnVoltarTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTit}>Minha rota</Text>
        <View style={{ width: 38 }} />
      </View>

      {paradas.length === 0 ? (
        <View style={st.vazio}>
          <Text style={st.vazioIco}>🗺️</Text>
          <Text style={st.vazioTxt}>Você não tem corridas ativas no momento</Text>
          <TouchableOpacity style={st.vazioBtn} onPress={() => router.replace('/home')}>
            <Text style={st.vazioBtnTxt}>Voltar ao início</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 30 }}>
          {/* Resumo */}
          <View style={st.resumo}>
            <View style={st.resumoItem}><Text style={st.resumoVal}>{corridasUnicas}</Text><Text style={st.resumoLbl}>corrida{corridasUnicas !== 1 ? 's' : ''}</Text></View>
            <View style={st.resumoItem}><Text style={st.resumoVal}>{totalParadas}</Text><Text style={st.resumoLbl}>parada{totalParadas !== 1 ? 's' : ''}</Text></View>
            {Number.isFinite(Number(dados.distancia_km)) && Number(dados.distancia_km) > 0 && (
              <View style={st.resumoItem}><Text style={st.resumoVal}>{Number(dados.distancia_km).toFixed(1)}</Text><Text style={st.resumoLbl}>km</Text></View>
            )}
            {Number(dados.duracao_min) > 0 && (
              <View style={st.resumoItem}><Text style={st.resumoVal}>{dados.duracao_min}</Text><Text style={st.resumoLbl}>min</Text></View>
            )}
          </View>

          {/* Mapa */}
          {mapaDisponivel && regiao && (
            <View style={st.mapaWrap}>
              <MapView style={st.mapa} provider={PROVIDER_DEFAULT} initialRegion={regiao} mapType="standard"
                onMapReady={() => setMapaPronto(true)} rotateEnabled={false} pitchEnabled={false}>
                {mapaPronto && <UrlTile urlTemplate="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png" maximumZ={20} tileSize={512} flipY={false} zIndex={-1} shouldReplaceMapContent={true} />}
                {linhaRota.length > 1 && <Polyline coordinates={linhaRota} strokeColor={C.azulP} strokeWidth={4} zIndex={3} />}
                {temColeta && <Marker coordinate={{ latitude: dados.coleta.lat, longitude: dados.coleta.lng }} title="Coleta" pinColor={C.navy900} />}
                {paradas.map((p, i) => <Marker key={p.ponto_id} coordinate={{ latitude: p.lat, longitude: p.lng }} title={`${i + 1} · ${p.protocolo}`} pinColor={i === paradas.length - 1 ? C.ok : C.azulP} />)}
              </MapView>
            </View>
          )}

          {/* Sequência */}
          <View style={st.seq}>
            <Text style={st.seqTit}>SEQUÊNCIA SUGERIDA</Text>

            {temColeta && (
              <View style={st.parada}>
                <View style={[st.badge, { backgroundColor: C.navy900 }]}><Text style={st.badgeTxt}>C</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.paradaTit}>Coleta{dados.coleta.cliente_nome ? ` · ${dados.coleta.cliente_nome}` : ''}</Text>
                  <Text style={st.paradaEnd} numberOfLines={1}>{dados.coleta.endereco}</Text>
                </View>
              </View>
            )}

            {paradas.map((p, i) => (
              <View key={p.ponto_id} style={st.parada}>
                <View style={[st.badge, { backgroundColor: i === paradas.length - 1 ? C.ok : C.azulP }]}><Text style={st.badgeTxt}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.paradaTit}>Entrega · {p.protocolo}</Text>
                  <Text style={st.paradaEnd} numberOfLines={1}>{p.endereco}</Text>
                </View>
                <View style={st.reorder}>
                  <TouchableOpacity onPress={() => mover(i, -1)} disabled={i === 0} style={[st.setaBtn, i === 0 && st.setaOff]}><Text style={st.seta}>▲</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => mover(i, 1)} disabled={i === paradas.length - 1} style={[st.setaBtn, i === paradas.length - 1 && st.setaOff]}><Text style={st.seta}>▼</Text></TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={st.btnSeguir} onPress={seguirRota} activeOpacity={0.85}>
              <Text style={st.btnSeguirTxt}>Seguir rota no Google Maps</Text>
            </TouchableOpacity>
            <Text style={st.dica}>Abre o Google Maps com todas as paradas na ordem acima. Use as setas para reordenar.</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  btnVoltarTxt: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: -2 },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },

  body: { flex: 1 },
  resumo: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: C.navy900, paddingVertical: 14, paddingHorizontal: 16 },
  resumoItem: { alignItems: 'center' },
  resumoVal: { color: '#fff', fontSize: 19, fontWeight: '900' },
  resumoLbl: { color: '#9fb8d0', fontSize: 10, marginTop: 1 },

  mapaWrap: { height: 220, backgroundColor: '#cfe0ee' },
  mapa: { flex: 1 },

  seq: { padding: 16 },
  seqTit: { fontSize: 10, fontWeight: '800', color: C.tinta3, letterSpacing: 0.5, marginBottom: 12 },
  parada: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 12, padding: 12, marginBottom: 8 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  paradaTit: { fontSize: 13, fontWeight: '700', color: C.tinta },
  paradaEnd: { fontSize: 11.5, color: C.tinta3, marginTop: 1 },
  reorder: { flexDirection: 'column', gap: 2 },
  setaBtn: { width: 26, height: 20, alignItems: 'center', justifyContent: 'center' },
  setaOff: { opacity: 0.25 },
  seta: { fontSize: 11, color: C.azulP },

  btnSeguir: { backgroundColor: C.azulP, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnSeguirTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dica: { fontSize: 11, color: C.tinta3, textAlign: 'center', marginTop: 8, lineHeight: 16 },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  vazioIco: { fontSize: 42, marginBottom: 14 },
  vazioTxt: { fontSize: 14, color: C.tinta2, textAlign: 'center', marginBottom: 18 },
  vazioBtn: { backgroundColor: C.azulP, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  vazioBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
