import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar, Linking, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';
import DeslizarParaConfirmar from '../src/componentes/DeslizarParaConfirmar';
import { T, reais, hora, km, curto } from '../src/tema';

// Carrega react-native-maps com segurança (não existe no Expo Go).
let MapView = null, Marker = null, Polyline = null, UrlTile = null, PROVIDER_DEFAULT = undefined, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Marker = maps.Marker; Polyline = maps.Polyline; UrlTile = maps.UrlTile; PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
  mapaDisponivel = !!MapView;
} catch (e) { mapaDisponivel = false; }


export default function OfertaDetalhe() {
  const params = useLocalSearchParams();
  // A notificação abria `?id=` e a tela lia `oferta_id` → GET /app/ofertas/undefined → "Formato de
  // valor inválido" (Onda 11b). Aceita os dois nomes.
  const ofertaId = params.oferta_id || params.id;
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aceitando, setAceitando] = useState(false);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [aceita, setAceita] = useState(false);
  const [mostrarMapa, setMostrarMapa] = useState(false);

  async function recusar() {
    Alert.alert('Recusar esta corrida?', 'Ela some da sua lista; outros motoboys continuam vendo.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Recusar', style: 'destructive', onPress: async () => { try { await api.recusarOferta(ofertaId); } catch {} router.replace('/ofertas'); } },
    ]);
  }

  useEffect(() => {
    (async () => {
      try {
        if (!ofertaId) throw new Error('Corrida não identificada');
        const r = await api.detalheOferta(ofertaId);
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
      const r = await api.aceitarOferta(ofertaId);
      setAceita(true);
      // Vai direto pra tela da corrida pra já começar a rota — sem passar pela
      // home e ter que reabrir a corrida na mão.
      if (r && r.entregaId) router.replace({ pathname: '/corrida', params: { entrega_id: r.entregaId } });
      else router.replace('/home');
    } catch (e) {
      setAceitando(false);
      const conexao = /sem conex|network|tempo|timeout/i.test(e?.message || '') || e?.status >= 500;
      if (conexao) {
        Alert.alert('Conexão instável', 'Não deu pra confirmar agora. Toque em "Aceitar" de novo — é seguro (se já tiver aceitado, a corrida aparece nas suas corridas).');
      } else {
        Alert.alert('Ops', e.message || 'Não foi possível aceitar essa corrida', [{ text: 'OK', onPress: () => router.replace('/ofertas') }]);
      }
    }
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={T.profundo} /><ActivityIndicator color={T.vivo} size="large" /></View>;
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
      latitudeDelta: Math.max(0.015, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.015, (maxLng - minLng) * 1.4),
    };
  }

  const totalDest = pontos.length || Number(oferta.qtd_pontos) || 1;
  const ateColeta = km(oferta.distancia_km), rotaKm = Number(oferta.rota_km) > 0 ? km(oferta.rota_km) : null;
  const temValor = Number(oferta.valor_motoboy_cent) > 0;

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />

      {/* Topo escuro: o que decide em 3 segundos */}
      <View style={st.topo}>
        <View style={st.topoLinha}>
          <TouchableOpacity onPress={() => router.back()} style={{ minWidth: 64 }}><Text style={st.voltar}>‹ Voltar</Text></TouchableOpacity>
          <Text style={st.rotulo}>Nova corrida para você</Text>
          <View style={{ minWidth: 64 }} />
        </View>
        {temValor ? (
          <>
            <Text style={st.grana}>{reais(oferta.valor_motoboy_cent)}</Text>
            <Text style={st.granaSub}>você recebe</Text>
          </>
        ) : <Text style={[st.grana, { fontSize: 30 }]}>Serviço {oferta.protocolo}</Text>}
        <Text style={st.quem} numberOfLines={1}>{oferta.cliente_nome || oferta.coleta_nome || 'Cliente'}{oferta.cliente_razao && oferta.cliente_razao !== oferta.cliente_nome ? ` · ${oferta.cliente_razao}` : ''}</Text>
        <Text style={st.quemSub}>serviço {oferta.protocolo}{oferta.pedido ? ` · pedido ${oferta.pedido}` : ''}{oferta.prazo_em ? ` · entregar até ${hora(oferta.prazo_em)}` : ''}{oferta.tempo_estimado_min != null ? ` · ~${oferta.tempo_estimado_min} min` : ''}</Text>
        <View style={st.fatos}>
          {!!ateColeta && <View style={st.fato}><Text style={st.fatoB}>{ateColeta}</Text><Text style={st.fatoL}>até a coleta</Text></View>}
          {!!rotaKm && <View style={st.fato}><Text style={st.fatoB}>{rotaKm}</Text><Text style={st.fatoL}>de rota</Text></View>}
          <View style={st.fato}><Text style={st.fatoB}>{totalDest}</Text><Text style={st.fatoL}>{totalDest === 1 ? 'entrega' : 'entregas'}</Text></View>
        </View>
      </View>

      {/* Folha clara: rota, mapa (sob demanda) e a decisão */}
      <View style={st.folha}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
          {mostrarMapa && mapaDisponivel && regiao && (
            <MapView style={st.mapa} provider={PROVIDER_DEFAULT} initialRegion={regiao} mapType="standard" onMapReady={() => setMapaPronto(true)} rotateEnabled={false} pitchEnabled={false}>
              {mapaPronto && <UrlTile urlTemplate="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png" maximumZ={20} tileSize={512} flipY={false} zIndex={-1} shouldReplaceMapContent={true} />}
              {rotaOrs.length > 1 && <Polyline coordinates={rotaOrs} strokeColor={T.primario} strokeWidth={5} zIndex={3} />}
              {rotaOrs.length <= 1 && temColetaGeo && pontosGeo.length > 0 && (
                <Polyline coordinates={[{ latitude: coleta.lat, longitude: coleta.lng }, ...pontosGeo.map(p => ({ latitude: p.lat, longitude: p.lng }))]} strokeColor={T.primario} strokeWidth={4} lineDashPattern={[8, 6]} zIndex={3} />
              )}
              {temColetaGeo && <Marker coordinate={{ latitude: coleta.lat, longitude: coleta.lng }} title="Coleta" pinColor={T.vivo} />}
              {pontosGeo.map((p, i) => <Marker key={i} coordinate={{ latitude: p.lat, longitude: p.lng }} title={`Entrega ${i + 1}`} pinColor={T.ganho} />)}
            </MapView>
          )}

          <View style={st.rota}>
            <View style={st.p}>
              <View style={[st.bola, { backgroundColor: T.vivo }]} />
              <View style={{ flex: 1 }}><Text style={st.pLbl}>Coleta</Text><Text style={st.pTxt}>{curto(oferta.coleta_endereco) || '—'}</Text></View>
            </View>
            {pontos.map((p, i) => (
              <View key={i} style={st.p}>
                <View style={[st.bola, { backgroundColor: i === pontos.length - 1 ? T.ganho : T.claro }]} />
                <View style={{ flex: 1 }}>
                  <Text style={st.pLbl}>{pontos.length > 1 ? `Entrega ${i + 1}` : 'Entrega'}{p.numero_nf ? ` · NF ${p.numero_nf}` : ''}</Text>
                  <Text style={st.pTxt}>{curto(p.endereco) || '—'}{p.complemento ? ` (${p.complemento})` : ''}</Text>
                  {(!!(p.nome_fantasia || p.nome) || (!!p.telefone && !/@/.test(String(p.telefone)))) && (
                    <Text style={st.pObs}>{(p.nome_fantasia || p.nome) ? `Destinatário: ${p.nome_fantasia || p.nome}` : 'Destinatário'}{!!p.telefone && !/@/.test(String(p.telefone)) && <Text style={st.tel} onPress={() => Linking.openURL('tel:' + String(p.telefone).replace(/\D/g, '')).catch(() => {})}>{'  '}{p.telefone}</Text>}</Text>
                  )}
                  {!!p.observacoes && <Text style={st.pObs}>{p.observacoes}</Text>}
                </View>
              </View>
            ))}
          </View>

          <View style={st.links}>
            {temColetaGeo && (
              <TouchableOpacity style={st.link} onPress={() => (mapaDisponivel && regiao) ? setMostrarMapa(v => !v) : abrirMapaExterno(coleta.lat, coleta.lng, oferta.coleta_endereco)} activeOpacity={0.8}>
                <Text style={st.linkTxt}>{mostrarMapa ? 'Esconder mapa' : 'Ver no mapa'}</Text>
              </TouchableOpacity>
            )}
            {temColetaGeo && (
              <TouchableOpacity style={st.link} onPress={() => abrirMapaExterno(coleta.lat, coleta.lng, oferta.coleta_endereco)} activeOpacity={0.8}>
                <Text style={st.linkTxt}>Navegar até a coleta</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>

        <View style={st.decisao}>
          <DeslizarParaConfirmar rotulo={temValor ? `Deslize para aceitar · ${reais(oferta.valor_motoboy_cent)}` : 'Deslize para aceitar'} rotuloOk="Corrida aceita ✓" ocupado={aceitando} feito={aceita} onConfirmar={aceitar} />
          <TouchableOpacity onPress={recusar} disabled={aceitando || aceita} style={st.recusa} activeOpacity={0.7}>
            <Text style={st.recusaTxt}>Não posso agora · <Text style={{ color: T.alerta }}>recusar</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.profundo },
  splash: { flex: 1, backgroundColor: T.profundo, justifyContent: 'center', alignItems: 'center' },
  topo: { paddingTop: 50, paddingHorizontal: 24, paddingBottom: 18 },
  topoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  voltar: { color: T.claro, fontSize: 14, fontWeight: '700' },
  rotulo: { color: T.claro, fontSize: 13, fontWeight: '700' },
  grana: { color: '#fff', fontSize: 52, fontWeight: '800', letterSpacing: -1.5, lineHeight: 56 },
  granaSub: { color: T.claro, fontSize: 14, fontWeight: '700', marginTop: 2 },
  quem: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 10 },
  quemSub: { color: T.claro, fontSize: 13, fontWeight: '600', marginTop: 2 },
  fatos: { flexDirection: 'row', gap: 10, marginTop: 16 },
  fato: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  fatoB: { color: '#fff', fontSize: 18, fontWeight: '800' },
  fatoL: { color: T.claro, fontSize: 12, fontWeight: '600' },
  folha: { flex: 1, backgroundColor: T.sup, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginHorizontal: 8, paddingTop: 18, paddingHorizontal: 18 },
  mapa: { height: 190, borderRadius: 16, marginBottom: 14, overflow: 'hidden' },
  rota: { paddingLeft: 2 },
  p: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 12 },
  bola: { width: 10, height: 10, borderRadius: 5, marginTop: 8 },
  pLbl: { fontSize: 12, fontWeight: '700', color: T.tinta2 },
  tel: { color: T.primario, fontWeight: '800' },
  pTxt: { fontSize: 14.5, color: T.tinta, lineHeight: 20 },
  pObs: { fontSize: 13, color: T.tinta2, marginTop: 2, fontStyle: 'italic' },
  links: { flexDirection: 'row', gap: 10, marginTop: 4 },
  link: { flex: 1, backgroundColor: T.suave, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  linkTxt: { color: T.primario, fontWeight: '800', fontSize: 14 },
  decisao: { paddingTop: 10, paddingBottom: 26 },
  recusa: { alignItems: 'center', paddingTop: 14 },
  recusaTxt: { fontSize: 14, color: T.tinta2, fontWeight: '700' },
});
