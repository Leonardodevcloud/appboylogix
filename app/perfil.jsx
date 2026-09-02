import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../src/api';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { assinarOnline } from '../src/state/online';

const VERSAO_APP = Constants.expoConfig?.version || '?';
const ID_UPDATE = Updates.updateId ? String(Updates.updateId).slice(0, 8) : 'base';
const CANAL = Updates.channel || 'dev';

const C = {
  navy900: '#042C53', navy800: '#0a3a66',
  azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', erro: '#dc2626', erroBg: '#fef2f2',
};

const PIX_LABEL = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Aleatória' };

function fmtTel(t) {
  if (!t) return '—';
  const n = String(t).replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t;
}
function mascararChave(tipo, chave) {
  if (!chave) return null;
  const s = String(chave);
  if (tipo === 'cpf') { const n = s.replace(/\D/g, ''); return n.length === 11 ? `•••.•••.${n.slice(6, 9)}-${n.slice(9)}` : s; }
  if (tipo === 'email') { const [u, d] = s.split('@'); return u ? `${u.slice(0, 2)}•••@${d || ''}` : s; }
  return s;
}

function Avatar({ nome, size = 74 }) {
  const ini = (nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={[st.av, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[st.avTxt, { fontSize: size * 0.34 }]}>{ini}</Text>
    </View>
  );
}

// Linha do menu de acessos.
function Item({ ico, tt, sub, onPress, badge, breve }) {
  return (
    <TouchableOpacity style={[st.item, breve && st.itemOff]} activeOpacity={breve ? 1 : 0.7} onPress={breve ? undefined : onPress}>
      <View style={st.itIco}><Text style={{ fontSize: 16 }}>{ico}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.itTt}>{tt}</Text>
        {!!sub && <Text style={st.itSub}>{sub}</Text>}
      </View>
      {breve ? <Text style={st.breve}>em breve</Text> : (badge ? <Text style={st.badgeAt}>{badge}</Text> : null)}
      {!breve && <Text style={st.itSeta}>›</Text>}
    </TouchableOpacity>
  );
}

export default function Perfil() {
  const [p, setP] = useState(null);
  const [online, setOn] = useState(false);
  const [refresh, setRef] = useState(false);

  const carregar = useCallback(async () => {
    try { const perfil = await api.perfil(); setP(perfil); if (perfil) setOn(!!perfil.online); }
    catch (e) { console.log('[PERFIL] erro:', e?.message); if (e?.status === 401) { await api.logout(); router.replace('/'); } }
  }, []);

  useEffect(() => { carregar(); }, []);
  useEffect(() => assinarOnline((v) => setOn(!!v)), []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const saindoRef = useRef(false);
  function sair() {
    Alert.alert('Sair', 'Encerrar sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => {
        if (saindoRef.current) return;
        saindoRef.current = true;
        try { await api.logout(); router.replace('/'); }
        catch { saindoRef.current = false; }
      } },
    ]);
  }

  if (!p) return (
    <View style={st.splash}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <ActivityIndicator color={C.azulV} size="large" />
    </View>
  );

  const temBanco = !!(p.pix_chave || p.banco_nome);
  const resumoBanco = temBanco
    ? [PIX_LABEL[p.pix_tipo] && p.pix_chave ? `${PIX_LABEL[p.pix_tipo]} ${mascararChave(p.pix_tipo, p.pix_chave)}` : null,
       p.banco_nome ? `${p.banco_codigo ? p.banco_codigo + ' · ' : ''}${p.banco_nome}` : null].filter(Boolean).join(' · ')
    : 'Toque para cadastrar sua chave Pix';
  const resumoDados = `${fmtTel(p.telefone_principal)}${p.cidade ? ' · ' + p.cidade : ''}`;

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />

      {/* Header identidade */}
      <View style={st.header}>
        <View style={st.headerTop}>
          <TouchableOpacity onPress={() => router.replace('/home')} style={st.voltar}><Text style={st.voltarTxt}>‹ Início</Text></TouchableOpacity>
          <Text style={st.headerTitle}>Meu perfil</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={st.headerBody}>
          <Avatar nome={p.nome_completo} size={74} />
          <Text style={st.nome}>{p.nome_completo}</Text>
          <View style={st.codBadge}><Text style={st.codTxt}>#{String(p.codigo || 0).padStart(3, '0')}</Text></View>
          <View style={[st.statusPill, { backgroundColor: online ? C.okBg : '#e2e8f0' }]}>
            <View style={[st.statusDot, { backgroundColor: online ? C.ok : C.tinta3 }]} />
            <Text style={[st.statusTxt, { color: online ? C.ok : C.tinta2 }]}>{online ? 'Online' : 'Offline'}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRef(true); await carregar(); setRef(false); }} tintColor={C.azulV} />}>

        {/* Cards editáveis */}
        <TouchableOpacity style={st.card} activeOpacity={0.85} onPress={() => router.push('/dados-bancarios')}>
          <View style={st.cardHd}>
            <Text style={st.cardTt}>🏦  Dados bancários</Text>
            <Text style={st.editar}>Editar</Text>
          </View>
          <Text style={st.cardMini} numberOfLines={1}>{resumoBanco}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={st.card} activeOpacity={0.85} onPress={() => router.push('/meus-dados')}>
          <View style={st.cardHd}>
            <Text style={st.cardTt}>👤  Meus dados</Text>
            <Text style={st.itSeta}>›</Text>
          </View>
          <Text style={st.cardMini} numberOfLines={1}>{resumoDados}</Text>
        </TouchableOpacity>

        {/* Operação */}
        <Text style={st.secLbl}>Operação</Text>
        <View style={st.menu}>
          <Item ico="📡" tt="Rastreamento sempre ativo" sub="Evita que o celular bloqueie o app" badge="ação" onPress={() => router.push('/rastreamento-ativo')} />
          <Item ico="🔔" tt="Notificações e som" sub="Alerta, vibração e som de corrida" onPress={() => router.push('/notificacoes')} />
        </View>

        {/* Mais */}
        <Text style={st.secLbl}>Mais</Text>
        <View style={st.menu}>
          <Item ico="💳" tt="Carteira e saques" sub="Repasses e Pix" breve />
          <Item ico="🏆" tt="Score e metas" sub="Seu nível e pontuação" onPress={() => router.push('/score')} />
          <Item ico="🎁" tt="Indique e ganhe" breve />
        </View>

        {/* Suporte */}
        <Text style={st.secLbl}>Suporte</Text>
        <View style={st.menu}>
          <Item ico="❓" tt="Ajuda e suporte" breve />
          <View style={[st.item, { borderBottomWidth: 0 }]}>
            <View style={st.itIco}><Text style={{ fontSize: 16 }}>ℹ️</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.itTt}>Sobre o app</Text>
              <Text style={st.itSub}>v{VERSAO_APP} · {ID_UPDATE} · {CANAL}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={st.btnSair} onPress={sair} activeOpacity={0.85}><Text style={st.btnSairTxt}>Sair da conta</Text></TouchableOpacity>
      </ScrollView>

      {/* Bottom nav */}
      <View style={st.tab}>
        <TouchableOpacity style={st.tabItem} onPress={() => router.replace('/home')}><Text style={st.tabIco}>🏠</Text><Text style={st.tabLbl}>Início</Text></TouchableOpacity>
        <TouchableOpacity style={st.tabItem} onPress={() => router.push('/historico')}><Text style={st.tabIco}>🗂</Text><Text style={st.tabLbl}>Histórico</Text></TouchableOpacity>
        <TouchableOpacity style={st.tabItem} onPress={() => router.push('/ganhos')}><Text style={st.tabIco}>💰</Text><Text style={st.tabLbl}>Ganhos</Text></TouchableOpacity>
        <View style={[st.tabItem, st.tabOn]}><Text style={st.tabIco}>👤</Text><Text style={[st.tabLbl, { color: C.azulP }]}>Perfil</Text></View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  av: { justifyContent: 'center', alignItems: 'center', backgroundColor: C.azulP },
  avTxt: { color: '#fff', fontWeight: '800' },

  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  voltar: { width: 60 },
  voltarTxt: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerBody: { alignItems: 'center', gap: 7 },
  nome: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 9 },
  codBadge: { backgroundColor: C.navy800, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  codTxt: { color: C.azulC, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusTxt: { fontSize: 12, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  card: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, padding: 13, marginBottom: 10 },
  cardHd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTt: { fontSize: 13.5, fontWeight: '800', color: C.tinta },
  editar: { fontSize: 12, fontWeight: '800', color: C.azulP, backgroundColor: '#eaf3fc', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 11, overflow: 'hidden' },
  cardMini: { fontSize: 11.5, color: C.tinta2, marginTop: 7 },

  secLbl: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: C.tinta3, marginTop: 16, marginBottom: 8, marginLeft: 4 },
  menu: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: 1, borderBottomColor: C.linha },
  itemOff: { opacity: 0.55 },
  itIco: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, alignItems: 'center', justifyContent: 'center' },
  itTt: { fontSize: 13.5, fontWeight: '700', color: C.tinta },
  itSub: { fontSize: 11, color: C.tinta3, marginTop: 1 },
  itSeta: { color: C.tinta3, fontSize: 18 },
  badgeAt: { backgroundColor: '#fbe8e6', color: C.erro, fontSize: 9.5, fontWeight: '800', borderRadius: 99, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },
  breve: { backgroundColor: '#eef2f7', color: C.tinta3, fontSize: 9.5, fontWeight: '800', borderRadius: 99, paddingVertical: 2, paddingHorizontal: 7, overflow: 'hidden' },

  btnSair: { marginTop: 18, padding: 15, alignItems: 'center', borderRadius: 13, borderWidth: 1.5, borderColor: C.erroBg, backgroundColor: C.erroBg },
  btnSairTxt: { color: C.erro, fontSize: 14, fontWeight: '700' },

  tab: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 11, paddingBottom: 28 },
  tabItem: { alignItems: 'center', gap: 3 },
  tabOn: {},
  tabIco: { fontSize: 20 },
  tabLbl: { fontSize: 9.5, fontWeight: '700', color: C.tinta3 },
});
