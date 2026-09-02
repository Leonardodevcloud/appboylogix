import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4', roxo: '#6B4FC9',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5', ok: '#1f9d6b', erro: '#D0584F',
};
// Emoji de nível só ilustrativo (app é informal); o painel usa a biblioteca SVG.
const SELO = { Bronze: '🥉', Prata: '🥈', Ouro: '🥇', Diamante: '💎' };

export default function Score() {
  const [d, setD] = useState(null);
  const [missoes, setMissoes] = useState([]);
  const [refresh, setRef] = useState(false);

  const carregar = useCallback(async () => {
    try { setD(await api.meuScore()); }
    catch (e) { if (e?.status === 401) { await api.logout(); router.replace('/'); } else setD({ erro: true }); }
    try { const r = await api.minhasMissoes(); setMissoes(r.missoes || []); } catch {}
  }, []);

  useEffect(() => { carregar(); }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  if (!d) return (
    <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>
  );

  const niv = d.nivel || { nome: '—', progresso: 0, faltam: 0, proximo: null };

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={st.bk}>←</Text></TouchableOpacity>
        <Text style={st.htitle}>Score e metas</Text>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRef(true); await carregar(); setRef(false); }} tintColor={C.azulV} />}>

        {d.erro ? (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <Text style={{ color: C.tinta2, textAlign: 'center' }}>Não consegui carregar seu score agora. Puxe para atualizar.</Text>
          </View>
        ) : (
          <>
            {/* Nível */}
            <View style={st.nivelCard}>
              <View style={st.nivelTop}>
                <View>
                  <Text style={st.nivelLbl}>SEU NÍVEL</Text>
                  <Text style={st.nivelNome}>{niv.nome}</Text>
                </View>
                <Text style={st.nivelSelo}>{SELO[niv.nome] || '⭐'}</Text>
              </View>
              <View style={st.barra}><View style={[st.barraFill, { width: `${niv.progresso || 0}%` }]} /></View>
              <Text style={st.nivelSub}>
                {d.pontos} pts{niv.proximo ? ` · faltam ${niv.faltam} pra ${niv.proximo}` : ' · nível máximo'}
              </Text>
            </View>

            {/* Como pontuou */}
            <Text style={st.secLbl}>Como você pontuou · {d.janela}</Text>
            <View style={st.box}>
              {(d.detalhe || []).map((it, i) => (
                <View key={i} style={[st.linha, i === (d.detalhe.length - 1) && { borderBottomWidth: 0 }]}>
                  <Text style={st.lRot}>{it.rotulo}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={st.lQtd}>{it.qtd}×</Text>
                    <Text style={[st.lPts, { color: it.pontos >= 0 ? C.ok : C.erro }]}>{it.pontos >= 0 ? '+' : ''}{it.pontos}</Text>
                  </View>
                </View>
              ))}
              <View style={[st.linha, st.linhaTotal]}>
                <Text style={st.totalRot}>Total</Text>
                <Text style={st.totalPts}>{d.pontos} pts</Text>
              </View>
            </View>

            {/* Missões */}
            {missoes.length > 0 && (
              <>
                <Text style={st.secLbl}>Missões pra você</Text>
                {missoes.map((m) => (
                  <View key={m.id} style={st.missao}>
                    <View style={st.mTop}>
                      <Text style={st.mNome}>{m.nome}</Text>
                      <Text style={st.mPremio}>{'R$ ' + (Number(m.premio_cent || 0) / 100).toFixed(2).replace('.', ',')}</Text>
                    </View>
                    <View style={st.mBar}><View style={[st.mBarFill, { width: `${m.progresso || 0}%` }, m.completo && { backgroundColor: C.ok }]} /></View>
                    <View style={st.mFoot}>
                      <Text style={st.mProg}>{m.feitas} de {m.meta} entregas</Text>
                      {m.jaPago
                        ? <Text style={[st.mEstado, { color: C.ok }]}>✓ bônus liberado</Text>
                        : m.completo
                          ? <Text style={[st.mEstado, { color: C.azulP }]}>meta batida! aguarde a liberação</Text>
                          : <Text style={st.mProg}>faltam {Math.max(0, m.meta - m.feitas)}</Text>}
                    </View>
                  </View>
                ))}
              </>
            )}

            {/* Níveis */}
            {!!(d.niveis && d.niveis.length) && (
              <>
                <Text style={st.secLbl}>Trilha de níveis</Text>
                <View style={st.box}>
                  {[...d.niveis].sort((a, b) => a.min - b.min).map((n, i, arr) => {
                    const atual = n.nome === niv.nome;
                    return (
                      <View key={i} style={[st.linha, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                          <Text style={{ fontSize: 16 }}>{SELO[n.nome] || '•'}</Text>
                          <Text style={[st.lRot, atual && { color: C.azulP, fontWeight: '800' }]}>{n.nome}</Text>
                          {atual && <View style={st.voceTag}><Text style={st.voceTxt}>você</Text></View>}
                        </View>
                        <Text style={st.lQtd}>{n.min} pts</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <View style={st.tip}>
              <Text style={{ fontSize: 15 }}>🎯</Text>
              <Text style={st.tipTxt}>O ranking entre entregadores chega em breve. Continue entregando com qualidade que seu nível sobe e as missões liberam bônus.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bk: { fontSize: 22, color: '#fff', width: 26 },
  htitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },

  nivelCard: { borderRadius: 18, padding: 16, backgroundColor: C.roxo, marginBottom: 6 },
  nivelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nivelLbl: { color: '#fff', opacity: 0.85, fontSize: 11, fontWeight: '700' },
  nivelNome: { color: '#fff', fontSize: 22, fontWeight: '800' },
  nivelSelo: { fontSize: 32 },
  barra: { height: 8, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 12, overflow: 'hidden' },
  barraFill: { height: '100%', backgroundColor: '#fff', borderRadius: 99 },
  nivelSub: { color: '#fff', opacity: 0.92, fontSize: 11.5, marginTop: 8, fontWeight: '600' },

  secLbl: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: C.tinta3, marginTop: 16, marginBottom: 8, marginLeft: 4 },
  box: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, paddingHorizontal: 13 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.linha },
  lRot: { fontSize: 12.5, color: C.tinta, fontWeight: '600' },
  lQtd: { fontSize: 12, color: C.tinta3, fontWeight: '700' },
  lPts: { fontSize: 13, fontWeight: '800' },
  linhaTotal: { borderTopWidth: 1, borderTopColor: C.linha, borderBottomWidth: 0 },
  totalRot: { fontSize: 13, fontWeight: '800', color: C.tinta },
  totalPts: { fontSize: 14, fontWeight: '800', color: C.azulP },
  voceTag: { backgroundColor: '#eaf3fc', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  voceTxt: { fontSize: 9.5, fontWeight: '800', color: C.azulP },

  tip: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: '#eef6ff', borderWidth: 1, borderColor: '#cfe3fb', borderRadius: 12, padding: 12, marginTop: 16 },
  tipTxt: { flex: 1, fontSize: 11.5, color: '#1f4b78', lineHeight: 17 },

  missao: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 13, marginBottom: 10 },
  mTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  mNome: { flex: 1, fontSize: 13.5, fontWeight: '800', color: C.tinta },
  mPremio: { fontSize: 13, fontWeight: '800', color: C.ok, marginLeft: 8 },
  mBar: { height: 7, borderRadius: 99, backgroundColor: '#eef2f7', overflow: 'hidden' },
  mBarFill: { height: '100%', backgroundColor: C.azulP, borderRadius: 99 },
  mFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  mProg: { fontSize: 11, color: C.tinta3, fontWeight: '600' },
  mEstado: { fontSize: 11, fontWeight: '800' },
});
