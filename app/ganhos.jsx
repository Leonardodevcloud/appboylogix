import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', navy800: '#0a3a66', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#fff', linha: '#dde9f5', ok: '#1f9d6b', okV: '#27b67f',
};

function reais(cent) {
  if (cent == null) return 'R$ 0,00';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}
function hora(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' · ' + new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

export default function Ganhos() {
  const [eu, setEu] = useState(null);
  const [hist, setHist] = useState({ corridas: [], total_cent: 0, quantidade: 0 });
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [e, h] = await Promise.all([
        api.get('/motoboys/app/eu'),
        api.get('/motoboys/app/historico?periodo=mes'),
      ]);
      setEu(e);
      setHist(h || { corridas: [], total_cent: 0, quantidade: 0 });
    } catch (er) { /* mantém */ }
    setCarregando(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { carregar(); }, []);

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.replace('/home')} style={st.btnVoltar}>
          <Text style={st.btnVoltarTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTit}>Ganhos</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} />}>

        {/* Cartões de ganhos */}
        <View style={st.cards}>
          <View style={[st.cardGanho, { backgroundColor: C.navy900 }]}>
            <Text style={st.cardGanhoLabel}>Hoje</Text>
            <Text style={st.cardGanhoVal}>{reais(eu?.ganhos_hoje_cent)}</Text>
            <Text style={st.cardGanhoSub}>{eu?.entregues_hoje || 0} corrida{(eu?.entregues_hoje || 0) !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[st.cardGanho, { backgroundColor: C.azulP }]}>
            <Text style={st.cardGanhoLabel}>Este mês</Text>
            <Text style={st.cardGanhoVal}>{reais(eu?.ganhos_mes_cent)}</Text>
            <Text style={st.cardGanhoSub}>{hist.quantidade} corrida{hist.quantidade !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        {/* Lista de corridas pagas do mês */}
        <Text style={st.secao}>Corridas pagas · este mês</Text>
        {hist.corridas.length === 0 ? (
          <View style={st.vazio}>
            <Text style={st.vazioIco}>💰</Text>
            <Text style={st.vazioTxt}>Nenhuma corrida paga ainda este mês</Text>
          </View>
        ) : (
          hist.corridas.map(c => (
            <View key={c.id} style={st.linha}>
              <View style={{ flex: 1 }}>
                <Text style={st.linhaProto}>{c.protocolo}{c.cliente_nome ? ` · ${c.cliente_nome}` : ''}</Text>
                <Text style={st.linhaData}>{hora(c.concluida_em)}</Text>
              </View>
              <Text style={st.linhaValor}>{reais(c.valor_motoboy_cent)}</Text>
            </View>
          ))
        )}
      </ScrollView>
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
  cards: { flexDirection: 'row', gap: 12, marginBottom: 22 },
  cardGanho: { flex: 1, borderRadius: 16, padding: 16 },
  cardGanhoLabel: { color: '#9fb8d0', fontSize: 12, fontWeight: '700' },
  cardGanhoVal: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 6 },
  cardGanhoSub: { color: '#9fb8d0', fontSize: 11, marginTop: 3 },

  secao: { fontSize: 12, fontWeight: '800', color: C.tinta2, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  linha: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 12, padding: 14, marginBottom: 8 },
  linhaProto: { fontSize: 13.5, fontWeight: '700', color: C.tinta },
  linhaData: { fontSize: 11.5, color: C.tinta3, marginTop: 2 },
  linhaValor: { fontSize: 15, fontWeight: '800', color: C.ok },

  vazio: { alignItems: 'center', paddingVertical: 50 },
  vazioIco: { fontSize: 36, marginBottom: 10 },
  vazioTxt: { fontSize: 13.5, color: C.tinta3, textAlign: 'center' },
});
