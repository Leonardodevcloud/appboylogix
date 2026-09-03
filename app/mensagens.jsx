import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, StatusBar, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#fff', linha: '#dde9f5', erro: '#D0584F',
};

export default function Mensagens() {
  const [convs, setConvs] = useState(null);
  const [refresh, setRef] = useState(false);

  const carregar = useCallback(async () => {
    try { const r = await api.chatConversas(); setConvs((r.conversas || []).filter(c => c.status !== 'encerrada')); }
    catch (e) { if (e?.status === 401) { await api.logout(); router.replace('/'); } else setConvs([]); }
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={st.bk}>←</Text></TouchableOpacity>
        <Text style={st.htit}>Mensagens</Text>
      </View>
      {!convs ? (
        <View style={st.center}><ActivityIndicator color={C.azulV} size="large" /></View>
      ) : (
        <ScrollView style={st.body} contentContainerStyle={{ padding: 14 }}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRef(true); await carregar(); setRef(false); }} tintColor={C.azulV} />}>
          {convs.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 40 }}>💬</Text>
              <Text style={{ color: C.tinta2, fontWeight: '700', marginTop: 10 }}>Nenhuma conversa</Text>
              <Text style={{ color: C.tinta3, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>Abra o chat pela corrida (botão "Mensagens").</Text>
            </View>
          )}
          {convs.map(c => (
            <TouchableOpacity key={c.id} style={st.item} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/chat', params: { entregaId: c.entrega_id, tipo: c.tipo, protocolo: c.protocolo || '' } })}>
              <View style={st.ico}><Text style={{ fontSize: 18 }}>{c.tipo === 'suporte' ? '🎧' : '🏢'}</Text></View>
              <View style={{ flex: 1 }}>
                <View style={st.itemTop}>
                  <Text style={st.itemNome}>{c.tipo === 'suporte' ? 'Suporte' : (c.loja_nome || 'Loja')}</Text>
                  {!!c.nao_lidas && <View style={st.badge}><Text style={st.badgeTxt}>{c.nao_lidas}</Text></View>}
                </View>
                <Text style={st.itemSub} numberOfLines={1}>Corrida {c.protocolo || ''} · {c.ultima_previa || 'sem mensagens'}</Text>
              </View>
              <Text style={st.seta}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bk: { fontSize: 22, color: '#fff', width: 26 },
  htit: { fontSize: 17, fontWeight: '800', color: '#fff' },
  body: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 13, marginBottom: 10 },
  ico: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#eaf3fc', alignItems: 'center', justifyContent: 'center' },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNome: { fontSize: 14, fontWeight: '800', color: C.tinta },
  itemSub: { fontSize: 11.5, color: C.tinta3, marginTop: 2 },
  badge: { backgroundColor: C.erro, borderRadius: 99, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  seta: { fontSize: 20, color: C.tinta3 },
});
