import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';
import FiltroPeriodo from '../src/componentes/FiltroPeriodo';

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
  try { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' }) + ' · ' + new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
const brData = (s) => { if (!s) return ''; const [a, m, d] = s.split('-'); return `${d}/${m}`; };
const rotuloPeriodo = (f) => f.tipo === 'hoje' ? 'hoje' : f.tipo === 'semana' ? 'últimos 7 dias' : f.tipo === 'mes' ? 'este mês' : `${brData(f.de)} – ${brData(f.ate)}`;

export default function Ganhos() {
  const [eu, setEu] = useState(null);
  const [filtro, setFiltro] = useState({ tipo: 'mes' });
  const [hist, setHist] = useState({ corridas: [], total_cent: 0, quantidade: 0 });
  const [extras, setExtras] = useState({ extras: [], total_credito_cent: 0, saldo_cent: 0 });
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async (f) => {
    try {
      const qs = f.tipo === 'custom' ? `de=${f.de}&ate=${f.ate}` : `periodo=${f.tipo}`;
      const [e, h] = await Promise.all([
        api.get('/motoboys/app/eu'),
        api.get(`/motoboys/app/historico?${qs}`),
      ]);
      setEu(e);
      setHist(h || { corridas: [], total_cent: 0, quantidade: 0 });
    } catch (er) { /* mantém */ }
    try { setExtras(await api.extras()); } catch {}
    setCarregando(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { setCarregando(true); carregar(filtro); }, [filtro]);

  const media = hist.quantidade > 0 ? Math.round(hist.total_cent / hist.quantidade) : 0;

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
        <Text style={st.headerTit}>Meus ganhos</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={st.filtroBox}>
        <FiltroPeriodo valor={filtro} aoSelecionar={(f) => setFiltro(f)} />
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(filtro); }} />}>

        <Text style={st.periodoTit}>Mostrando: <Text style={{ color: C.azulP, fontWeight: '800' }}>{rotuloPeriodo(filtro)}</Text></Text>

        {/* Resumo do período */}
        <View style={st.cards}>
          <View style={[st.cardGanho, { backgroundColor: C.navy900, flex: 1.3 }]}>
            <Text style={st.cardGanhoLabel}>Recebido no período</Text>
            <Text style={st.cardGanhoVal}>{reais(hist.total_cent)}</Text>
            <Text style={st.cardGanhoSub}>{hist.quantidade} corrida{hist.quantidade !== 1 ? 's' : ''}</Text>
          </View>
          <View style={[st.cardGanho, st.cardClaro]}>
            <Text style={[st.cardGanhoLabel, { color: C.tinta3 }]}>Média/corrida</Text>
            <Text style={[st.cardGanhoVal, { color: C.tinta }]}>{reais(media)}</Text>
          </View>
        </View>
        <View style={st.cards2}>
          <View style={[st.cardMini, st.cardClaro]}><Text style={st.miniLbl}>Hoje</Text><Text style={st.miniVal}>{reais(eu?.ganhos_hoje_cent)}</Text></View>
          <View style={[st.cardMini, st.cardClaro]}><Text style={st.miniLbl}>Este mês</Text><Text style={st.miniVal}>{reais(eu?.ganhos_mes_cent)}</Text></View>
        </View>

        {/* Bônus e extras (a receber no próximo repasse) */}
        {extras.extras && extras.extras.length > 0 && (
          <>
            <Text style={st.secao}>Bônus e extras · a receber</Text>
            <View style={st.extrasBox}>
              {extras.extras.map(x => (
                <View key={x.id} style={st.extraLinha}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.extraDesc}>{x.descricao || (x.tipo === 'credito' ? 'Crédito' : 'Desconto')}</Text>
                    <Text style={st.linhaData}>{hora(x.criado_em)}</Text>
                  </View>
                  <Text style={[st.extraValor, { color: x.tipo === 'credito' ? C.ok : '#D0584F' }]}>
                    {x.tipo === 'credito' ? '+' : '−'} {reais(x.valor_cent)}
                  </Text>
                </View>
              ))}
              <View style={st.extraTotal}>
                <Text style={st.extraTotalRot}>Total a receber</Text>
                <Text style={st.extraTotalVal}>{reais(extras.saldo_cent)}</Text>
              </View>
            </View>
            <Text style={st.extraNota}>Entra junto no seu próximo repasse.</Text>
          </>
        )}

        {/* Corridas do período */}
        <Text style={st.secao}>Corridas do período</Text>
        {hist.corridas.length === 0 ? (
          <View style={st.vazio}>
            <Text style={st.vazioIco}>💰</Text>
            <Text style={st.vazioTxt}>Nenhuma corrida paga neste período</Text>
          </View>
        ) : (
          hist.corridas.map(c => (
            <View key={c.id} style={st.linha}>
              <View style={{ flex: 1 }}>
                <Text style={st.linhaProto}>{c.protocolo}{c.cliente_nome ? ` · ${c.cliente_nome}` : ''}</Text>
                <Text style={st.linhaData}>{hora(c.concluida_em)}{Number.isFinite(Number(c.distancia_km)) && Number(c.distancia_km) > 0 ? ` · ${Number(c.distancia_km).toFixed(1)} km` : ''}</Text>
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
  filtroBox: { paddingHorizontal: 16, paddingTop: 12 },
  periodoTit: { fontSize: 12, fontWeight: '700', color: C.tinta2, marginBottom: 10 },
  cards2: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  cardClaro: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha },
  cardMini: { flex: 1, borderRadius: 14, padding: 12 },
  miniLbl: { fontSize: 10.5, fontWeight: '700', color: C.tinta3, textTransform: 'uppercase' },
  miniVal: { fontSize: 17, fontWeight: '800', color: C.tinta, marginTop: 2 },
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
  extrasBox: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, paddingHorizontal: 14, marginBottom: 6 },
  extraLinha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.linha },
  extraDesc: { fontSize: 13, fontWeight: '700', color: C.tinta },
  extraValor: { fontSize: 14.5, fontWeight: '800' },
  extraTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  extraTotalRot: { fontSize: 13, fontWeight: '800', color: C.tinta },
  extraTotalVal: { fontSize: 15, fontWeight: '800', color: C.azulP },
  extraNota: { fontSize: 11, color: C.tinta3, marginBottom: 16, marginLeft: 2 },

  vazio: { alignItems: 'center', paddingVertical: 50 },
  vazioIco: { fontSize: 36, marginBottom: 10 },
  vazioTxt: { fontSize: 13.5, color: C.tinta3, textAlign: 'center' },
});
