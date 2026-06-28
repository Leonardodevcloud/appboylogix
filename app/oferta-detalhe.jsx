import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar, Linking, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', linha: '#dde9f5',
  ok: '#1f9d6b', okV: '#27b67f',
};

// Carrega react-native-maps com segurança (não existe no Expo Go).
let MapView = null, Marker = null, Polyline = null, UrlTile = null, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Marker = maps.Marker; Polyline = maps.Polyline; UrlTile = maps.UrlTile;
  mapaDisponivel = !!MapView;
} catch (e) { mapaDisponivel = false; }

function reais(cent) {
  if (cent == null) return '—';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}

export default function OfertaDetalhe() {
  const params = useLocalSearchParams();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.detalheOferta(params.oferta_id);
        setDados(r);
      } catch (e) {
        Alert.alert('Ops', e.message || 'Não foi possível carregar', [{ text: 'OK', onPress: () => router.back() }]);
      }
      setCarregando(false);
    })();
  }, []);

  function abrirMapaExterno(lat, lng, label) {
    const q = lat && lng ? `${lat},${lng}` : encodeURIComponent(label || '');
    Alert.alert('Abrir navegação', 'Escolha o app de mapas', [
      { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`) },
      { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?ll=${q}&navigate=yes`) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function aceitar() {
    if (aceitando) return;
    setAceitando(true);
    try {
      await api.aceitarOferta(params.oferta_id);
      router.replace('/home');
    } catch (e) {
      setAceitando(false);
      Alert.alert('Ops', e.message || 'Não foi possível aceitar essa corrida', [{ text: 'OK', onPress: () => router.replace('/ofertas') }]);
    }
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }
  if (!dados) return null;

  const { oferta, pontos } = dados;
  const rotaOrs = (dados.rota || []).map(([lat, lng]) => ({ latitude: Number(lat), longitude: Number(lng) }));
  const coleta = { lat: Number(oferta.coleta_lat), lng: Number(oferta.coleta_lng) };
  const temColetaGeo = !!oferta.coleta_lat && !!oferta.coleta_lng;
  const pontosGeo = (pontos || []).filter(p => p.lat && p.lng).map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));

  // Região do mapa: centraliza entre coleta e pontos.
  let regiao = null;
  if (temColetaGeo) {
    const todos = [coleta, ...pontosGeo];
    const lats = todos.map(p => p.lat), lngs = todos.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    regiao = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6),
    };
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 64 }}>
          <Text style={st.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={st.headerTit}>Detalhes da corrida</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Mapa */}
        {mapaDisponivel && regiao ? (
          <MapView style={st.mapa} initialRegion={regiao} mapType="none">
            {/* Tiles do OpenStreetMap (sem API key do Google) */}
            <UrlTile urlTemplate="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png" maximumZ={20} flipY={false} />
            {temColetaGeo && <Marker coordinate={{ latitude: coleta.lat, longitude: coleta.lng }} title="Coleta" pinColor={C.azulV} />}
            {pontosGeo.map((p, i) => (
              <Marker key={i} coordinate={{ latitude: p.lat, longitude: p.lng }} title={`Entrega ${i + 1}`} pinColor={C.okV} />
            ))}
            {/* Rota real pelas ruas (ORS). Se não veio, desenha linha reta como fallback. */}
            {rotaOrs.length > 1 ? (
              <Polyline coordinates={rotaOrs} strokeColor={C.azulP} strokeWidth={4} />
            ) : (temColetaGeo && pontosGeo.length > 0 && (
              <Polyline coordinates={[{ latitude: coleta.lat, longitude: coleta.lng }, ...pontosGeo.map(p => ({ latitude: p.lat, longitude: p.lng }))]} strokeColor={C.azulP} strokeWidth={3} lineDashPattern={[6, 6]} />
            ))}
          </MapView>
        ) : (
          <View style={st.mapaFallback}>
            <Text style={st.mapaFallbackEmoji}>🗺️</Text>
            <Text style={st.mapaFallbackTxt}>Mapa disponível na versão instalada do app</Text>
            {temColetaGeo && (
              <TouchableOpacity style={st.mapaBtn} onPress={() => abrirMapaExterno(coleta.lat, coleta.lng, oferta.coleta_endereco)}>
                <Text style={st.mapaBtnTxt}>Abrir rota no Google Maps / Waze</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={st.conteudo}>
          {/* Resumo */}
          <View style={st.resumo}>
            <View>
              <Text style={st.osLabel}>SERVIÇO</Text>
              <Text style={st.osNum}>{oferta.protocolo}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.valorLabel}>Você recebe</Text>
              <Text style={st.valor}>{reais(oferta.valor_motoboy_cent)}</Text>
            </View>
          </View>

          <View style={st.chips}>
            {!!oferta.cliente_nome && <View style={st.chip}><Text style={st.chipTxt}>🏢 {oferta.cliente_nome}</Text></View>}
            {Number.isFinite(Number(oferta.distancia_km)) && <View style={st.chip}><Text style={st.chipTxt}>📍 {Number(oferta.distancia_km).toFixed(1)} km até coleta</Text></View>}
            {Number.isFinite(Number(oferta.rota_km)) && Number(oferta.rota_km) > 0 && <View style={st.chip}><Text style={st.chipTxt}>🛣 {Number(oferta.rota_km).toFixed(1)} km de rota</Text></View>}
            {oferta.tempo_estimado_min != null && <View style={st.chip}><Text style={st.chipTxt}>⏱ ~{oferta.tempo_estimado_min} min</Text></View>}
          </View>

          {/* Coleta */}
          <Text style={st.secaoTit}>Coleta</Text>
          <View style={st.bloco}>
            <View style={st.blocoTopo}>
              <View style={[st.dot, { backgroundColor: C.azulV }]} />
              <Text style={st.blocoNome}>{oferta.coleta_nome || 'Ponto de coleta'}</Text>
            </View>
            <Text style={st.blocoEnd}>{oferta.coleta_endereco || '—'}</Text>
            {temColetaGeo && (
              <TouchableOpacity style={st.navBtn} onPress={() => abrirMapaExterno(coleta.lat, coleta.lng, oferta.coleta_endereco)}>
                <Text style={st.navBtnTxt}>🧭 Navegar até a coleta</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Entregas */}
          <Text style={st.secaoTit}>Entrega{pontos.length > 1 ? `s (${pontos.length})` : ''}</Text>
          {pontos.map((p, i) => (
            <View key={i} style={st.bloco}>
              <View style={st.blocoTopo}>
                <View style={[st.dot, { backgroundColor: C.okV }]} />
                <Text style={st.blocoNome}>{pontos.length > 1 ? `${i + 1}. ` : ''}{p.nome_fantasia || p.nome || 'Destino'}</Text>
              </View>
              <Text style={st.blocoEnd}>{p.endereco || '—'}</Text>
              {!!p.complemento && <Text style={st.blocoLinha}>📌 Complemento: {p.complemento}</Text>}
              {!!p.numero_nf && <Text style={st.blocoLinha}>🧾 Nota fiscal: {p.numero_nf}</Text>}
              {!!p.telefone && <Text style={st.blocoLinha}>📞 {p.telefone}</Text>}
              {!!p.observacoes && <Text style={st.blocoObs}>💬 {p.observacoes}</Text>}
              {p.lat && p.lng && (
                <TouchableOpacity style={st.navBtn} onPress={() => abrirMapaExterno(Number(p.lat), Number(p.lng), p.endereco)}>
                  <Text style={st.navBtnTxt}>🧭 Navegar até aqui</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Botão fixo de aceitar */}
      <View style={st.rodapeFixo}>
        <TouchableOpacity style={st.btnAceitar} onPress={aceitar} disabled={aceitando} activeOpacity={0.85}>
          {aceitando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnAceitarTxt}>Aceitar corrida · {reais(oferta.valor_motoboy_cent)}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 54, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voltar: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  headerTit: { color: '#fff', fontSize: 16, fontWeight: '800' },

  body: { flex: 1 },
  mapa: { width: '100%', height: 220 },
  mapaFallback: { width: '100%', height: 150, backgroundColor: '#dce8f5', alignItems: 'center', justifyContent: 'center', padding: 16 },
  mapaFallbackEmoji: { fontSize: 30, marginBottom: 6 },
  mapaFallbackTxt: { fontSize: 12.5, color: C.tinta2, textAlign: 'center', marginBottom: 10 },
  mapaBtn: { backgroundColor: C.azulP, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 },
  mapaBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  conteudo: { padding: 16 },
  resumo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: C.sup, borderRadius: 14, borderWidth: 1, borderColor: C.linha, padding: 15, marginBottom: 10 },
  osLabel: { fontSize: 10, fontWeight: '800', color: C.tinta3, letterSpacing: 1 },
  osNum: { fontSize: 22, fontWeight: '900', color: C.navy900, marginTop: 1 },
  valorLabel: { fontSize: 10, color: C.tinta3, fontWeight: '600' },
  valor: { color: C.okV, fontSize: 24, fontWeight: '900' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  chip: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  chipTxt: { fontSize: 12, color: C.tinta2, fontWeight: '600' },

  secaoTit: { fontSize: 13, fontWeight: '800', color: C.tinta2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 6 },
  bloco: { backgroundColor: C.sup, borderRadius: 12, borderWidth: 1, borderColor: C.linha, padding: 14, marginBottom: 10 },
  blocoTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  blocoNome: { fontSize: 15, fontWeight: '800', color: C.tinta, flex: 1 },
  blocoEnd: { fontSize: 13.5, color: C.tinta2, lineHeight: 19, marginBottom: 2 },
  blocoLinha: { fontSize: 13, color: C.tinta2, marginTop: 5 },
  blocoObs: { fontSize: 13, color: C.tinta2, marginTop: 5, fontStyle: 'italic', backgroundColor: '#f6f9fc', padding: 8, borderRadius: 8 },
  navBtn: { marginTop: 10, backgroundColor: '#eef4fb', borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  navBtnTxt: { color: C.azulP, fontSize: 13, fontWeight: '700' },

  rodapeFixo: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: C.fundo, borderTopWidth: 1, borderTopColor: C.linha },
  btnAceitar: { backgroundColor: C.okV, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnAceitarTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
