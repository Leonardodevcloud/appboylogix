import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, StatusBar, Vibration, Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', navy800: '#0a3a66',
  azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  ok: '#1f9d6b', okV: '#27b67f', erro: '#dc2626', amber: '#f59e0b',
  branco: '#ffffff', tinta3: '#9fb8d0',
};

function reais(cent) {
  if (cent == null) return '—';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}

export default function Oferta() {
  const params = useLocalSearchParams();
  const [oferta, setOferta] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const travaRef = useRef(false); // trava síncrona contra duplo-toque
  const [segundos, setSegundos] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const timerRef = useRef(null);

  // Carrega a oferta: usa params se vierem (do WS), senão busca a ativa.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        let o;
        if (params.oferta_id) {
          // Veio do push WS — busca o detalhe completo.
          const r = await api.ofertaAtiva();
          o = r.oferta;
        } else {
          const r = await api.ofertaAtiva();
          o = r.oferta;
        }
        if (cancelado) return;
        if (!o) { router.back(); return; }
        setOferta(o);
        const restante = Math.max(0, Math.floor((new Date(o.expira_em).getTime() - Date.now()) / 1000));
        setSegundos(restante);
        setCarregando(false);
        Vibration.vibrate([0, 400, 200, 400]);
      } catch (e) {
        if (!cancelado) { router.back(); }
      }
    })();
    return () => { cancelado = true; };
  }, []);

  // Timer regressivo.
  useEffect(() => {
    if (carregando) return;
    timerRef.current = setInterval(() => {
      setSegundos(s => {
        if (s <= 1) { clearInterval(timerRef.current); expirou(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [carregando]);

  // Pulso visual no botão aceitar.
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.04, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  function expirou() {
    Alert.alert('Oferta expirada', 'Essa corrida não está mais disponível.', [{ text: 'OK', onPress: () => router.replace('/home') }]);
  }

  async function aceitar() {
    if (travaRef.current) return;
    travaRef.current = true;
    setProcessando(true);
    clearInterval(timerRef.current);
    try {
      await api.aceitarOferta(oferta.oferta_id);
      Vibration.vibrate(200);
      router.replace('/home');
    } catch (e) {
      Alert.alert('Ops', e.message || 'Não foi possível aceitar', [{ text: 'OK', onPress: () => router.replace('/home') }]);
    }
  }

  async function recusar() {
    if (travaRef.current) return;
    travaRef.current = true;
    setProcessando(true);
    clearInterval(timerRef.current);
    try { await api.recusarOferta(oferta.oferta_id); } catch {}
    router.replace('/home');
  }

  if (carregando) {
    return <View style={st.full}><StatusBar barStyle="light-content" /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }

  const totalDestinos = oferta.qtd_pontos || 1;
  const urgente = segundos <= 15;

  return (
    <View style={st.full}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />

      {/* Topo: timer + chamada */}
      <View style={st.topo}>
        <Text style={st.chamada}>NOVA CORRIDA</Text>
        <View style={[st.timerBox, urgente && { backgroundColor: 'rgba(220,38,38,0.2)', borderColor: C.erro }]}>
          <Text style={[st.timerNum, urgente && { color: '#fda4a4' }]}>{segundos}s</Text>
          <Text style={st.timerLbl}>para aceitar</Text>
        </View>
      </View>

      {/* Valor em destaque */}
      <View style={st.valorBox}>
        <Text style={st.valorLbl}>Você recebe</Text>
        <Text style={st.valorNum}>{reais(oferta.valor_motoboy_cent)}</Text>
        {oferta.distancia_km != null && (
          <View style={st.distChip}><Text style={st.distTxt}>📍 {Number(oferta.distancia_km).toFixed(1)} km de você</Text></View>
        )}
      </View>

      {/* Rota: coleta → destino */}
      <View style={st.rota}>
        <View style={st.pontoLinha}>
          <View style={st.bolinhaColeta} />
          <View style={{ flex: 1 }}>
            <Text style={st.pontoLbl}>COLETA</Text>
            <Text style={st.pontoEnd} numberOfLines={2}>{oferta.coleta_nome || oferta.coleta_endereco || 'Ponto de coleta'}</Text>
            {!!oferta.coleta_nome && <Text style={st.pontoSub} numberOfLines={1}>{oferta.coleta_endereco}</Text>}
          </View>
        </View>
        <View style={st.tracoVertical} />
        <View style={st.pontoLinha}>
          <View style={st.bolinhaDestino} />
          <View style={{ flex: 1 }}>
            <Text style={st.pontoLbl}>{totalDestinos > 1 ? `${totalDestinos} DESTINOS` : 'DESTINO'}</Text>
            <Text style={st.pontoEnd} numberOfLines={2}>{oferta.primeiro_destino || 'Destino da entrega'}</Text>
            {totalDestinos > 1 && <Text style={st.pontoSub}>+ {totalDestinos - 1} parada{totalDestinos - 1 > 1 ? 's' : ''}</Text>}
          </View>
        </View>
      </View>

      <Text style={st.protocolo}>#{oferta.protocolo}</Text>

      {/* Ações */}
      <View style={st.acoes}>
        <TouchableOpacity style={st.btnRecusar} onPress={recusar} disabled={processando} activeOpacity={0.8}>
          <Text style={st.btnRecusarTxt}>Recusar</Text>
        </TouchableOpacity>
        <Animated.View style={{ flex: 2, transform: [{ scale: pulse }] }}>
          <TouchableOpacity style={st.btnAceitar} onPress={aceitar} disabled={processando} activeOpacity={0.85}>
            {processando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnAceitarTxt}>Aceitar corrida</Text>}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  full: { flex: 1, backgroundColor: C.navy900, paddingTop: 60, paddingHorizontal: 22, paddingBottom: 36, justifyContent: 'space-between' },
  topo: { alignItems: 'center' },
  chamada: { color: C.azulC, fontSize: 14, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },
  timerBox: { borderWidth: 2, borderColor: C.azulV, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 26, alignItems: 'center', backgroundColor: 'rgba(55,138,221,0.12)' },
  timerNum: { color: C.branco, fontSize: 30, fontWeight: '800' },
  timerLbl: { color: C.tinta3, fontSize: 11, fontWeight: '600', marginTop: -2 },

  valorBox: { alignItems: 'center' },
  valorLbl: { color: C.tinta3, fontSize: 13, fontWeight: '600' },
  valorNum: { color: C.okV, fontSize: 52, fontWeight: '900', marginTop: 2 },
  distChip: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.08)', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20 },
  distTxt: { color: C.azulC, fontSize: 13, fontWeight: '700' },

  rota: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 18 },
  pontoLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bolinhaColeta: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.azulV, marginTop: 3 },
  bolinhaDestino: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.okV, marginTop: 3 },
  tracoVertical: { width: 2, height: 22, backgroundColor: 'rgba(255,255,255,0.2)', marginLeft: 6, marginVertical: 4 },
  pontoLbl: { color: C.tinta3, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  pontoEnd: { color: C.branco, fontSize: 15, fontWeight: '700', marginTop: 2 },
  pontoSub: { color: C.azulC, fontSize: 12, marginTop: 2 },

  protocolo: { color: C.tinta3, fontSize: 12, textAlign: 'center', fontWeight: '600' },

  acoes: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  btnRecusar: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnRecusarTxt: { color: '#cdd9e8', fontSize: 15, fontWeight: '700' },
  btnAceitar: { backgroundColor: C.okV, borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnAceitarTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
