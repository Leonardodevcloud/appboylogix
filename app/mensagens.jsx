import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, StatusBar, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../src/api';
import { T } from '../src/tema';
import Icone from '../src/componentes/Icone';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  navy900: T.profundo, azulP: T.primario, azulV: T.vivo, azulC: T.claro,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#fff', linha: '#dde9f5', erro: '#D0584F',
};

export default function Mensagens() {
  const insetBaixo = useSafeAreaInsets().bottom;   // botões do Android no rodapé: o conteúdo fica acima deles
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
        <TouchableOpacity onPress={() => router.back()}><Icone nome="voltar" tam={24} cor={'#fff'} traco={2.4} /></TouchableOpacity>
        <Text style={st.htit}>Mensagens</Text>
      </View>
      {!convs ? (
        <View style={st.center}><ActivityIndicator color={C.azulV} size="large" /></View>
      ) : (
        <ScrollView style={st.body} contentContainerStyle={{ padding: 14, paddingBottom: 14 + insetBaixo }}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRef(true); await carregar(); setRef(false); }} tintColor={C.azulV} />}>
          {convs.filter(c => c.tipo === 'suporte' || !c.tipo).length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: '#eaf3fc', alignItems: 'center', justifyContent: 'center' }}><Icone nome="chat" tam={30} cor={C.azulP} traco={1.8} /></View>
              <Text style={{ color: C.tinta2, fontWeight: '700', marginTop: 10 }}>Nenhuma conversa</Text>
              <Text style={{ color: C.tinta3, fontSize: 12.5, marginTop: 4, textAlign: 'center' }}>Abra o chat pela corrida (botão "Mensagens").</Text>
            </View>
          )}
          {convs.filter(c => c.tipo === 'suporte' || !c.tipo).map(c => (   /* só conversas com a central (24/10/2026) */
            <TouchableOpacity key={c.id} style={st.item} activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/chat', params: { entregaId: c.entrega_id, protocolo: c.protocolo || '' } })}>
              <View style={st.ico}><Icone nome="fone" tam={20} cor={C.azulP} /></View>
              <View style={{ flex: 1 }}>
                <View style={st.itemTop}>
                  <Text style={st.itemNome}>Suporte · central</Text>
                  {!!c.nao_lidas && <View style={st.badge}><Text style={st.badgeTxt}>{c.nao_lidas}</Text></View>}
                </View>
                <Text style={st.itemSub} numberOfLines={1}>Corrida {c.protocolo || ''} · {c.ultima_previa || 'sem mensagens'}</Text>
              </View>
              <Icone nome="seta" tam={18} cor={C.tinta3} />
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
