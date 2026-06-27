import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Switch, ActivityIndicator, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', navy800: '#0a3a66',
  azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', erro: '#dc2626', erroBg: '#fef2f2',
};

function reais(cent) { return 'R$ ' + (Number(cent || 0) / 100).toFixed(2).replace('.', ','); }
function dataBR(iso) { if (!iso) return '—'; const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtTel(t) {
  if (!t) return '—';
  const n = String(t).replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t;
}
function fmtCpf(c) {
  if (!c) return '—';
  const n = String(c).replace(/\D/g, '');
  if (n.length !== 11) return c;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

function Avatar({ nome, size = 76 }) {
  const ini = (nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const cores = [C.azulV, C.azulP, '#534AB7', '#0F6E56', '#854F0B'];
  const bg = cores[ini.charCodeAt(0) % cores.length];
  return (
    <View style={[st.av, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[st.avTxt, { fontSize: size * 0.36 }]}>{ini}</Text>
    </View>
  );
}

export default function Perfil() {
  const [p, setP] = useState(null);
  const [refresh, setRef] = useState(false);

  const carregar = useCallback(async () => {
    try { setP(await api.get('/motoboys/app/perfil')); }
    catch (e) { console.log('[PERFIL] erro:', e?.message); await api.logout(); router.replace('/'); }
  }, []);

  useEffect(() => { carregar(); }, []);

  async function toggleOnline(val) {
    try { await api.patch('/motoboys/app/status', { online: val }); setP(prev => ({ ...prev, online: val })); }
    catch (e) { Alert.alert('Erro', e.message); }
  }

  function sair() {
    Alert.alert('Sair', 'Encerrar sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => { await api.logout(); router.replace('/'); } },
    ]);
  }

  if (!p) return (
    <View style={st.splash}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <ActivityIndicator color={C.azulV} size="large" />
    </View>
  );

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />

      {/* Header escuro com avatar */}
      <View style={st.header}>
        <View style={st.headerTop}>
          <TouchableOpacity onPress={() => router.replace('/home')} style={st.voltar}>
            <Text style={st.voltarTxt}>‹ Início</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>Meu perfil</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={st.headerBody}>
          <Avatar nome={p.nome_completo} size={76} />
          <Text style={st.nome}>{p.nome_completo}</Text>
          <View style={st.codBadge}>
            <Text style={st.codTxt}>#{String(p.codigo || 0).padStart(3, '0')}</Text>
          </View>
          <View style={[st.statusPill, { backgroundColor: p.online ? C.okBg : '#e2e8f0' }]}>
            <View style={[st.statusDot, { backgroundColor: p.online ? C.ok : C.tinta3 }]} />
            <Text style={[st.statusTxt, { color: p.online ? C.ok : C.tinta2 }]}>{p.online ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={st.body}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRef(true); await carregar(); setRef(false); }} tintColor={C.azulV} />}
      >
        {/* Disponibilidade */}
        <View style={st.card}>
          <View style={st.rowBetween}>
            <View>
              <Text style={st.cardTitle}>Disponibilidade</Text>
              <Text style={st.cardSub}>Fique online para receber corridas</Text>
            </View>
            <Switch value={p.online} onValueChange={toggleOnline}
              trackColor={{ false: '#cbd5e1', true: C.ok }} thumbColor="#fff" ios_backgroundColor="#cbd5e1" />
          </View>
        </View>

        {/* Ganhos */}
        <Text style={st.secLabel}>Ganhos</Text>
        <View style={st.statsRow}>
          <View style={st.statCard}>
            <Text style={st.statVal}>{reais(p.ganhos_hoje_cent)}</Text>
            <Text style={st.statLbl}>Hoje</Text>
          </View>
          <View style={st.statCard}>
            <Text style={[st.statVal, { color: C.ok }]}>{reais(p.ganhos_mes_cent)}</Text>
            <Text style={st.statLbl}>Este mês</Text>
          </View>
        </View>

        {/* Entregas */}
        <Text style={st.secLabel}>Entregas</Text>
        <View style={st.statsRow}>
          <View style={st.statCard}>
            <Text style={st.statVal}>{p.entregues_hoje ?? 0}</Text>
            <Text style={st.statLbl}>Hoje</Text>
          </View>
          <View style={st.statCard}>
            <Text style={st.statVal}>{p.total_entregues ?? 0}</Text>
            <Text style={st.statLbl}>Total</Text>
          </View>
        </View>

        {/* Dados pessoais */}
        <Text style={st.secLabel}>Dados pessoais</Text>
        <View style={st.card}>
          <Linha rotulo="Telefone" valor={fmtTel(p.telefone_principal)} />
          <Linha rotulo="Emergência" valor={fmtTel(p.telefone_emergencia)} />
          <Linha rotulo="CPF" valor={fmtCpf(p.cpf)} />
          <Linha rotulo="Cadastro" valor={dataBR(p.criado_em)} ultimo />
        </View>

        <Text style={st.aviso}>Para alterar seus dados, fale com o operador da central.</Text>

        <TouchableOpacity style={st.btnSair} onPress={sair} activeOpacity={0.8}>
          <Text style={st.btnSairTxt}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom nav */}
      <View style={st.tab}>
        <TouchableOpacity style={st.tabItem} onPress={() => router.replace('/home')}>
          <Text style={st.tabIco}>🏠</Text><Text style={st.tabLbl}>Início</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.tabItem} onPress={() => router.replace('/home')}>
          <Text style={st.tabIco}>📍</Text><Text style={st.tabLbl}>Rotas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.tabItem} onPress={() => router.replace('/home')}>
          <Text style={st.tabIco}>💰</Text><Text style={st.tabLbl}>Ganhos</Text>
        </TouchableOpacity>
        <View style={[st.tabItem, st.tabOn]}>
          <Text style={st.tabIco}>👤</Text><Text style={[st.tabLbl, { color: C.azulP }]}>Perfil</Text>
        </View>
      </View>
    </View>
  );
}

function Linha({ rotulo, valor, ultimo }) {
  return (
    <View style={[st.dadoLinha, !ultimo && st.dadoBorda]}>
      <Text style={st.dadoRot}>{rotulo}</Text>
      <Text style={st.dadoVal}>{valor}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  av: { justifyContent: 'center', alignItems: 'center' },
  avTxt: { color: '#fff', fontWeight: '800' },

  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 },
  voltar: { width: 60 },
  voltarTxt: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerBody: { alignItems: 'center', gap: 8 },
  nome: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 10 },
  codBadge: { backgroundColor: C.navy800, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  codTxt: { color: C.azulC, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTxt: { fontSize: 12, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  card: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, padding: 16, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: C.tinta },
  cardSub: { fontSize: 12, color: C.tinta2, marginTop: 2 },

  secLabel: { fontSize: 11.5, fontWeight: '800', color: C.tinta2, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 9, marginLeft: 2 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 16, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800', color: C.tinta },
  statLbl: { fontSize: 11, color: C.tinta2, fontWeight: '600', marginTop: 3 },

  dadoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  dadoBorda: { borderBottomWidth: 1, borderBottomColor: C.linha },
  dadoRot: { fontSize: 13, color: C.tinta2, fontWeight: '600' },
  dadoVal: { fontSize: 13.5, color: C.tinta, fontWeight: '700' },

  aviso: { fontSize: 11.5, color: C.tinta3, textAlign: 'center', marginTop: 14, paddingHorizontal: 20, lineHeight: 17 },
  btnSair: { marginTop: 18, padding: 15, alignItems: 'center', borderRadius: 13, borderWidth: 1.5, borderColor: C.erroBg, backgroundColor: C.erroBg },
  btnSairTxt: { color: C.erro, fontSize: 14, fontWeight: '700' },

  tab: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 11, paddingBottom: 28 },
  tabItem: { alignItems: 'center', gap: 3 },
  tabOn: {},
  tabIco: { fontSize: 20 },
  tabLbl: { fontSize: 9.5, fontWeight: '700', color: C.tinta3 },
});
