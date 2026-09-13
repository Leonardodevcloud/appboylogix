import { useState, useEffect, useRef } from 'react';
import { abrirSocket } from '../src/realtime/socket';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { api, getToken } from '../src/api';
import { alertaCorrida, pararAlerta } from '../src/utils/alerta';
import CartaoCorrida from '../src/componentes/CartaoCorrida';
import { T } from '../src/tema';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', linha: '#dde9f5',
  ok: '#1f9d6b', okV: '#27b67f',
};

function abrirMapa(lat, lng, endereco) {
  const q = (lat && lng) ? `${lat},${lng}` : encodeURIComponent(endereco || '');
  if (!q) return;
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {});
}

export default function Ofertas() {
  const [ofertas, setOfertas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const wsRef = useRef(null);
  const qtdAnterior = useRef(0);

  async function carregar(primeira = false) {
    try {
      const r = await api.ofertas();
      const lista = r.ofertas || [];
      if (!primeira && lista.length > qtdAnterior.current) alertaCorrida();
      if (primeira && lista.length) alertaCorrida();
      qtdAnterior.current = lista.length;
      setOfertas(lista);
      if (!lista.length && !primeira) router.replace('/home');
    } catch (e) { /* mantém */ }
    setCarregando(false);
  }

  useEffect(() => {
    carregar(true);
    const poll = setInterval(() => carregar(), 8000);
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const ws = abrirSocket(token);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const { evento, dados } = JSON.parse(ev.data);
            if (evento === 'oferta.nova') { carregar(); }
            else if (evento === 'oferta.encerrada') {
              setOfertas(prev => {
                const nova = prev.filter(o => o.oferta_id !== dados?.ofertaId);
                qtdAnterior.current = nova.length;
                if (!nova.length) router.replace('/home');
                return nova;
              });
            }
          } catch {}
        };
      } catch {}
    })();
    return () => { clearInterval(poll); pararAlerta(); try { wsRef.current?.close(); } catch {} };
  }, []);


  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={T.profundo} /><ActivityIndicator color={T.vivo} size="large" /></View>;
  }
  // A mais perto sobe e ganha destaque (mockup v1, tela 2). Sem distância, mantém a ordem do servidor.
  const ordenadas = [...ofertas].sort((a, b) => (Number(a.distancia_km) || 1e9) - (Number(b.distancia_km) || 1e9));
  const maisPerto = ordenadas.length > 1 && Number.isFinite(Number(ordenadas[0].distancia_km)) ? ordenadas[0].oferta_id : null;
  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => { pararAlerta(); router.replace('/home'); }} style={{ minWidth: 64 }}>
          <Text style={st.voltar}>‹ Início</Text>
        </TouchableOpacity>
        <Text style={st.headerTit}>Corridas disponíveis</Text>
        <View style={{ minWidth: 64, alignItems: 'flex-end' }}><Text style={st.contadorTxt}>{ofertas.length}</Text></View>
      </View>
      <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {!ofertas.length && (
          <View style={st.vazio}>
            <Text style={st.vazioTit}>Nenhuma corrida agora</Text>
            <Text style={st.vazioSub}>Fique online que avisamos assim que aparecer uma perto de você.</Text>
          </View>
        )}
        {ordenadas.map(o => (
          <CartaoCorrida key={o.oferta_id} oferta={o} destaque={o.oferta_id === maisPerto}
            onVer={() => { pararAlerta(); router.push({ pathname: '/oferta-detalhe', params: { oferta_id: o.oferta_id } }); }}
            onMapa={() => abrirMapa(o.coleta_lat, o.coleta_lng, o.coleta_endereco)} />
        ))}
        {!!ofertas.length && <Text style={st.rodapeLimite}>As corridas ficam aqui até alguém aceitar. Pegue as que consegue cumprir no prazo.</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.papel },
  splash: { flex: 1, backgroundColor: T.profundo, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: T.profundo, paddingTop: 54, paddingBottom: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voltar: { color: T.claro, fontSize: 14, fontWeight: '700' },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  contadorTxt: { color: '#fff', fontSize: 13, fontWeight: '800', backgroundColor: T.primario, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  body: { flex: 1 },
  vazio: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 30 },
  vazioTit: { fontSize: 18, fontWeight: '800', color: T.tinta },
  vazioSub: { fontSize: 14, color: T.tinta2, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  rodapeLimite: { textAlign: 'center', fontSize: 12.5, color: T.tinta3, fontWeight: '600', paddingHorizontal: 10, paddingTop: 6 },
});
