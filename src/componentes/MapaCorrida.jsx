import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { api } from '../api';
import { T } from '../tema';
import { agruparPorLocal, rotuloGrupo } from '../utils/agrupar';
import { PROPS_MAPA_LIMPO } from '../utils/estiloMapa';

// Mapa com o traçado da corrida no cartão de "Corridas disponíveis" (ADR-053, mockup
// aprovado em 18/10/2026): coleta, entregas e a linha da rota pelas ruas. A geometria vem
// do mesmo endereço da tela "Nova corrida" (GET /motoboys/app/ofertas/:id → rota) e só é
// buscada quando `ativo` (o cartão que está na tela). Sem rota, liga os pontos em linha
// reta. No Android usa o modo "lite" do Google (imagem estática do mapa: leve numa lista).
// Tocar abre a corrida.
let MapView = null, Marker = null, Polyline = null, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Marker = maps.Marker; Polyline = maps.Polyline;
  mapaDisponivel = !!MapView;
} catch { mapaDisponivel = false; }

const _cacheRotas = new Map();   // ofertaId → [[lat,lng]...]

export default function MapaCorrida({ oferta, ativo = true, altura = 150, onPress }) {
  const [rota, setRota] = useState(() => _cacheRotas.get(oferta.oferta_id) || null);

  useEffect(() => {
    if (!ativo || rota || !oferta.oferta_id) return;
    let vivo = true;
    api.detalheOferta(oferta.oferta_id)
      .then((r) => { const c = Array.isArray(r?.rota) ? r.rota : []; _cacheRotas.set(oferta.oferta_id, c); if (vivo) setRota(c); })
      .catch(() => { if (vivo) setRota([]); });
    return () => { vivo = false; };
  }, [ativo, oferta.oferta_id]);

  const coleta = oferta.coleta_lat != null && oferta.coleta_lng != null ? { lat: Number(oferta.coleta_lat), lng: Number(oferta.coleta_lng) } : null;
  const pontos = (oferta.pontos || []).filter((p) => p.lat != null && p.lng != null).map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }));
  const todos = [coleta, ...pontos].filter(Boolean);
  if (!mapaDisponivel || todos.length < 1) return null;

  const lats = todos.map((p) => p.lat), lngs = todos.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const regiao = {
    latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.012, (maxLat - minLat) * 1.6), longitudeDelta: Math.max(0.012, (maxLng - minLng) * 1.6),
  };
  const linha = rota && rota.length > 1
    ? rota.map(([lat, lng]) => ({ latitude: Number(lat), longitude: Number(lng) }))
    : todos.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const grupos = agruparPorLocal(pontos).filter((g) => g.lat != null);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={[st.caixa, { height: altura }]}
      accessibilityRole="button" accessibilityLabel="Ver a corrida no mapa">
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <MapView {...PROPS_MAPA_LIMPO} style={StyleSheet.absoluteFill} initialRegion={regiao} liteMode scrollEnabled={false} zoomEnabled={false}
          rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false} moveOnMarkerPress={false}>
          {linha.length > 1 && <Polyline coordinates={linha} strokeColor={T.profundo} strokeWidth={4} />}
          {coleta && (
            <Marker coordinate={{ latitude: coleta.lat, longitude: coleta.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={[st.pino, { backgroundColor: '#e8562a' }]}><Text style={st.pinoTxt}>C</Text></View>
            </Marker>
          )}
          {grupos.map((g, i) => (
            <Marker key={i} coordinate={{ latitude: g.lat, longitude: g.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={[st.pino, { backgroundColor: T.ganho }]}><Text style={st.pinoTxt}>{pontos.length > 1 ? rotuloGrupo(g) : ''}</Text></View>
            </Marker>
          ))}
        </MapView>
      </View>
      <View style={st.tag}><Text style={st.tagTxt}>Toque para ver a corrida</Text></View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  caixa: { marginTop: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: '#e6ecf1', borderWidth: 1, borderColor: T.linha },
  pino: { minWidth: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  pinoTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  tag: { position: 'absolute', right: 8, bottom: 8, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  tagTxt: { fontSize: 10.5, fontWeight: '800', color: T.profundo },
});
