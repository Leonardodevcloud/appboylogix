import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#fff', linha: '#dde9f5', ok: '#1f9d6b', okV: '#27b67f',
};

const PERIODOS = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'semana', rotulo: '7 dias' },
  { id: 'mes', rotulo: 'Este mês' },
];

function reais(cent) {
  if (cent == null) return 'R$ 0,00';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}
function dataHora(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' · ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function Historico() {
  const [periodo, setPeriodo] = useState('mes');
  const [dados, setDados] = useState({ corridas: [], total_cent: 0, quantidade: 0 });
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async (p) => {
    try {
      const r = await api.get(`/motoboys/app/historico?periodo=${p || periodo}`);
      setDados(r || { corridas: [], total_cent: 0, quantidade: 0 });
    } catch (e) { /* mantém */ }
    setCarregando(false);
    setRefreshing(false);
  }, [periodo]);

  useEffect(() => { setCarregando(true); carregar(periodo); }, [periodo]);

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.replace('/home')} style={st.btnVoltar}>
          <Text style={st.btnVoltarTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={st.headerTit}>Histórico</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Seletor de período */}
      <View style={st.periodos}>
        {PERIODOS.map(p => (
          <TouchableOpacity key={p.id} onPress={() => setPeriodo(p.id)}
            style={[st.periodoBtn, periodo === p.id && st.periodoBtnAtivo]}>
            <Text style={[st.periodoTxt, periodo === p.id && st.periodoTxtAtivo]}>{p.rotulo}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {carregando ? (
        <View style={st.center}><ActivityIndicator color={C.azulP} size="large" /></View>
      ) : (
        <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(periodo); }} />}>
          {/* Resumo */}
          <View style={st.resumo}>
            <View>
              <Text style={st.resumoLabel}>Corridas concluídas</Text>
              <Text style={st.resumoVal}>{dados.quantidade}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.resumoLabel}>Total recebido</Text>
              <Text style={[st.resumoVal, { color: C.ok }]}>{reais(dados.total_cent)}</Text>
            </View>
          </View>

          {dados.corridas.length === 0 ? (
            <View style={st.vazio}>
              <Text style={st.vazioIco}>📦</Text>
              <Text style={st.vazioTxt}>Nenhuma corrida concluída neste período</Text>
            </View>
          ) : (
            dados.corridas.map(c => (
              <View key={c.id} style={st.card}>
                <View style={st.cardTopo}>
                  <Text style={st.cardProto}>{c.protocolo}</Text>
                  <Text style={st.cardValor}>{reais(c.valor_motoboy_cent)}</Text>
                </View>
                {!!c.cliente_nome && <Text style={st.cardCliente}>{c.cliente_nome}</Text>}
                <Text style={st.cardEnd} numberOfLines={1}>→ {c.ultimo_destino || c.coleta_endereco}</Text>
                <View style={st.cardRodape}>
                  <Text style={st.cardMeta}>{dataHora(c.concluida_em)}</Text>
                  <Text style={st.cardMeta}>
                    {c.qtd_pontos > 1 ? `${c.qtd_pontos} pontos` : '1 ponto'}
                    {Number.isFinite(Number(c.distancia_km)) && Number(c.distancia_km) > 0 ? ` · ${Number(c.distancia_km).toFixed(1)} km` : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  btnVoltarTxt: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: -2 },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },

  periodos: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 4 },
  periodoBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, alignItems: 'center' },
  periodoBtnAtivo: { backgroundColor: C.azulP, borderColor: C.azulP },
  periodoTxt: { fontSize: 13, fontWeight: '700', color: C.tinta2 },
  periodoTxtAtivo: { color: '#fff' },

  body: { flex: 1 },
  resumo: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 16, marginBottom: 14 },
  resumoLabel: { fontSize: 11, color: C.tinta3, marginBottom: 3 },
  resumoVal: { fontSize: 22, fontWeight: '900', color: C.tinta },

  card: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardProto: { fontSize: 14, fontWeight: '800', color: C.tinta },
  cardValor: { fontSize: 15, fontWeight: '800', color: C.ok },
  cardCliente: { fontSize: 12.5, color: C.tinta2, marginTop: 3, fontWeight: '600' },
  cardEnd: { fontSize: 12.5, color: C.tinta2, marginTop: 2 },
  cardRodape: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.fundo },
  cardMeta: { fontSize: 11.5, color: C.tinta3 },

  vazio: { alignItems: 'center', paddingVertical: 50 },
  vazioIco: { fontSize: 36, marginBottom: 10 },
  vazioTxt: { fontSize: 13.5, color: C.tinta3, textAlign: 'center' },
});
