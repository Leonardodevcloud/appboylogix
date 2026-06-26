import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, StatusBar, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', roxo: '#7C3AED',
};

export default function Aceitar() {
  const { entregaId } = useLocalSearchParams();
  const [entrega, setEntrega] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aceitando, setAceitando] = useState(false);

  useEffect(() => {
    api.get('/motoboys/app/fila').then(fila => {
      const e = fila.find(x => x.id === entregaId);
      setEntrega(e || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [entregaId]);

  async function aceitar() {
    setAceitando(true);
    try {
      await api.patch(`/motoboys/app/entregas/${entregaId}/status`, { status: 'aguardando_coleta' });
      Alert.alert('Corrida aceita!', 'Vá até o ponto de coleta.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) { Alert.alert('Erro', e.message); }
    setAceitando(false);
  }

  function abrirMaps(end) {
    const q = encodeURIComponent(end);
    Alert.alert('Abrir em', 'Escolha o app de navegação', [
      { text: 'Google Maps', onPress: () => Linking.openURL(`https://maps.google.com/?q=${q}`) },
      { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?q=${q}&navigate=yes`) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  if (loading) return (
    <View style={s.center}><ActivityIndicator color={C.azulP} size="large" /></View>
  );

  if (!entrega) return (
    <View style={s.center}>
      <Text style={{ color: C.tinta2 }}>Entrega não encontrada</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
        <Text style={{ color: C.azulP, fontWeight: '700' }}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );

  const pontos = entrega.pontos || [];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backIco}>←</Text>
        </TouchableOpacity>
        <Text style={s.titulo}>Detalhes da corrida</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Mapa placeholder */}
        <View style={s.mapaBox}>
          <View style={s.mapaInner}>
            <Text style={s.mapaPlaceholder}>🗺</Text>
            <Text style={s.mapaLabel}>Rota: {entrega.coleta_endereco?.split(',')[0]} → {pontos.length} destino{pontos.length > 1 ? 's' : ''}</Text>
          </View>
        </View>

        <View style={{ padding: 16 }}>
          {/* Coleta */}
          <View style={s.protoCard}>
            <View style={s.cardHeader}>
              <View style={[s.pin, { backgroundColor: C.navy900 }]}><Text style={s.pinTxt}>C</Text></View>
              <Text style={s.cardTitle}>Coleta</Text>
            </View>
            <Text style={s.cardMain}>{entrega.coleta_endereco}</Text>
            <TouchableOpacity onPress={() => abrirMaps(entrega.coleta_endereco)} style={s.linkMaps}>
              <Text style={s.linkMapsTxt}>📍 Abrir navegação</Text>
            </TouchableOpacity>
          </View>

          {/* Destinos */}
          <View style={s.protoCard}>
            <View style={s.cardHeader}>
              <View style={[s.pin, { backgroundColor: C.azulV }]}><Text style={s.pinTxt}>⬡</Text></View>
              <Text style={s.cardTitle}>Entregas · {pontos.length} parada{pontos.length > 1 ? 's' : ''}</Text>
            </View>
            {pontos.map((p, i) => (
              <TouchableOpacity key={p.id} style={s.destinoItem} onPress={() => abrirMaps(p.endereco)}>
                <Text style={s.destinoNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.destinoNome}>{p.nome_fantasia || `Destino ${i + 1}`}</Text>
                  <Text style={s.destinoEnd} numberOfLines={1}>{p.endereco}</Text>
                  {p.numero_nf && <Text style={s.destinoNF}>NF: {p.numero_nf}</Text>}
                </View>
                <Text style={{ color: C.azulP, fontSize: 16 }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Métricas */}
          <View style={s.metasRow}>
            {entrega.distancia_km && (
              <View style={s.metaBox}>
                <Text style={s.metaB}>{Number(entrega.distancia_km).toFixed(1)} km</Text>
                <Text style={s.metaL}>Distância</Text>
              </View>
            )}
            <View style={s.metaBox}>
              <Text style={s.metaB}>{pontos.length}</Text>
              <Text style={s.metaL}>Paradas</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Botão fixo */}
      <View style={s.rodape}>
        <TouchableOpacity
          style={[s.btnAceitar, aceitando && { opacity: 0.6 }]}
          onPress={aceitar} disabled={aceitando} activeOpacity={0.85}
        >
          {aceitando
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnAceitarTxt}>Iniciar rota ⬡</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.fundo },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.fundo },
  header:       { backgroundColor: C.fundo, paddingTop: 52, paddingBottom: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.linha },
  backBtn:      { width: 34, height: 34, borderRadius: 10, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, justifyContent: 'center', alignItems: 'center' },
  backIco:      { fontSize: 18, color: C.azulP, fontWeight: '700' },
  titulo:       { fontSize: 15, fontWeight: '800', color: C.tinta },
  scroll:       { flex: 1 },
  mapaBox:      { height: 200, margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, justifyContent: 'center', alignItems: 'center' },
  mapaInner:    { alignItems: 'center', gap: 8 },
  mapaPlaceholder: { fontSize: 36 },
  mapaLabel:    { fontSize: 12, color: C.tinta2, fontWeight: '600', textAlign: 'center', paddingHorizontal: 20 },
  protoCard:    { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 14, marginBottom: 11 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle:    { fontSize: 12, fontWeight: '800', color: C.tinta },
  cardMain:     { fontSize: 13, color: C.tinta, fontWeight: '500' },
  pin:          { width: 18, height: 18, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  pinTxt:       { color: '#fff', fontSize: 8, fontWeight: '800' },
  linkMaps:     { marginTop: 8 },
  linkMapsTxt:  { fontSize: 12, color: C.azulP, fontWeight: '700' },
  destinoItem:  { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.linha },
  destinoNum:   { fontSize: 12, fontWeight: '800', color: C.azulP, width: 16 },
  destinoNome:  { fontSize: 12.5, fontWeight: '700', color: C.tinta },
  destinoEnd:   { fontSize: 11, color: C.tinta3, marginTop: 1 },
  destinoNF:    { fontSize: 11, color: C.ok, fontWeight: '600', marginTop: 2 },
  metasRow:     { flexDirection: 'row', gap: 10 },
  metaBox:      { flex: 1, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 12, padding: 12, alignItems: 'center' },
  metaB:        { fontSize: 17, fontWeight: '800', color: C.tinta },
  metaL:        { fontSize: 10, color: C.tinta2, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  rodape:       { padding: 16, paddingBottom: 32, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha },
  btnAceitar:   { backgroundColor: C.azulP, borderRadius: 13, padding: 14, alignItems: 'center' },
  btnAceitarTxt:{ color: '#fff', fontSize: 15, fontWeight: '800' },
});
