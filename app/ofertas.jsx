import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar, Vibration,
} from 'react-native';
import { router } from 'expo-router';
import { api, API_URL, getToken } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', linha: '#dde9f5',
  ok: '#1f9d6b', okV: '#27b67f', erro: '#dc2626',
  amberBg: '#fef3c7', amberTx: '#854f0b', erroBg: '#fcebeb', erroTx: '#a32d2d',
};

function reais(cent) {
  if (cent == null) return '—';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}
function mmss(seg) {
  if (seg < 0) seg = 0;
  const m = Math.floor(seg / 60), s = seg % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Ofertas() {
  const [ofertas, setOfertas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(Date.now());
  const travaRef = useRef(false);
  const wsRef = useRef(null);

  async function carregar(primeira = false) {
    try {
      const r = await api.ofertas();
      const lista = r.ofertas || [];
      setOfertas(lista);
      if (primeira && lista.length) Vibration.vibrate([0, 300, 150, 300]);
      // Se não há mais ofertas, volta pra home.
      if (!lista.length && !primeira) { router.replace('/home'); }
    } catch (e) { /* mantém o que tinha */ }
    setCarregando(false);
  }

  useEffect(() => {
    carregar(true);
    // Tick do timer (1s).
    const tick = setInterval(() => setAgora(Date.now()), 1000);
    // Recarrega a lista periodicamente (caso entre oferta nova ou expire).
    const poll = setInterval(() => carregar(), 8000);

    // WebSocket: oferta nova entra, oferta encerrada sai.
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const wsUrl = API_URL.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws?token=' + token;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const { evento, dados } = JSON.parse(ev.data);
            if (evento === 'oferta.nova') { carregar(); Vibration.vibrate(200); }
            else if (evento === 'oferta.encerrada') { setOfertas(prev => prev.filter(o => o.oferta_id !== dados?.ofertaId)); }
          } catch {}
        };
      } catch {}
    })();

    return () => { clearInterval(tick); clearInterval(poll); try { wsRef.current?.close(); } catch {} };
  }, []);

  async function aceitar(oferta) {
    if (travaRef.current) return;
    travaRef.current = true;
    try {
      await api.aceitarOferta(oferta.oferta_id);
      Vibration.vibrate(200);
      router.replace('/home');
    } catch (e) {
      travaRef.current = false;
      Alert.alert('Ops', e.message || 'Não foi possível aceitar essa corrida');
      carregar(); // atualiza a lista (a corrida pode ter saído)
    }
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.replace('/home')} style={{ width: 60 }}>
          <Text style={st.voltar}>‹ Início</Text>
        </TouchableOpacity>
        <Text style={st.headerTit}>Corridas disponíveis</Text>
        <View style={st.contador}><Text style={st.contadorTxt}>{ofertas.length}</Text></View>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {!ofertas.length && (
          <View style={st.vazio}>
            <Text style={st.vazioEmoji}>🛵</Text>
            <Text style={st.vazioTit}>Nenhuma corrida agora</Text>
            <Text style={st.vazioSub}>Fique online que avisamos assim que aparecer.</Text>
          </View>
        )}

        {ofertas.map(o => {
          const seg = Math.max(0, Math.floor((new Date(o.expira_em).getTime() - agora) / 1000));
          const urgente = seg <= 20;
          const totalDest = o.qtd_pontos || 1;
          return (
            <View key={o.oferta_id} style={st.card}>
              <View style={st.cardTopo}>
                <Text style={st.valor}>{reais(o.valor_motoboy_cent)}</Text>
                <View style={[st.timer, urgente ? { backgroundColor: C.erroBg } : { backgroundColor: C.amberBg }]}>
                  <Text style={[st.timerTxt, { color: urgente ? C.erroTx : C.amberTx }]}>⏱ {mmss(seg)}</Text>
                </View>
              </View>

              <View style={st.ponto}>
                <View style={[st.bolinha, { backgroundColor: C.azulV }]} />
                <Text style={st.pontoTxt} numberOfLines={1}>{o.coleta_nome || o.coleta_endereco || 'Coleta'}</Text>
              </View>
              <View style={st.ponto}>
                <View style={[st.bolinha, { backgroundColor: C.okV }]} />
                <Text style={st.pontoTxt} numberOfLines={1}>
                  {o.primeiro_destino || 'Destino'}{totalDest > 1 ? ` · +${totalDest - 1} parada${totalDest - 1 > 1 ? 's' : ''}` : ''}
                </Text>
              </View>

              <View style={st.cardRodape}>
                <Text style={st.dist}>📍 {o.distancia_km != null ? Number(o.distancia_km).toFixed(1) + ' km' : '—'} · #{o.protocolo}</Text>
                <TouchableOpacity style={st.btnAceitar} onPress={() => aceitar(o)} activeOpacity={0.85}>
                  <Text style={st.btnAceitarTxt}>Aceitar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {!!ofertas.length && <Text style={st.rodapeLimite}>Aceite as que conseguir cumprir. O limite por corrida depende da sua disponibilidade.</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 54, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  voltar: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  headerTit: { color: '#fff', fontSize: 16, fontWeight: '800' },
  contador: { width: 60, alignItems: 'flex-end' },
  contadorTxt: { color: '#fff', fontSize: 15, fontWeight: '800', backgroundColor: C.azulP, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20, overflow: 'hidden' },

  body: { flex: 1 },
  vazio: { alignItems: 'center', paddingTop: 70 },
  vazioEmoji: { fontSize: 44, marginBottom: 10 },
  vazioTit: { fontSize: 17, fontWeight: '800', color: C.tinta },
  vazioSub: { fontSize: 13.5, color: C.tinta2, marginTop: 6, textAlign: 'center' },

  card: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, padding: 15, marginBottom: 12 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  valor: { color: C.okV, fontSize: 26, fontWeight: '900' },
  timer: { paddingVertical: 4, paddingHorizontal: 11, borderRadius: 20 },
  timerTxt: { fontSize: 13, fontWeight: '800' },

  ponto: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  bolinha: { width: 10, height: 10, borderRadius: 5 },
  pontoTxt: { fontSize: 13.5, color: C.tinta2, flex: 1 },

  cardRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  dist: { fontSize: 12, color: C.tinta3 },
  btnAceitar: { backgroundColor: C.okV, paddingVertical: 9, paddingHorizontal: 26, borderRadius: 11 },
  btnAceitarTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },

  rodapeLimite: { fontSize: 11.5, color: C.tinta3, textAlign: 'center', marginTop: 8, lineHeight: 16 },
});
