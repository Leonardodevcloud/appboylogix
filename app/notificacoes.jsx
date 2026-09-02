import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch,
  StatusBar, Platform, Linking, AppState,
} from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { garantirPrefs, setPref, assinarPrefs, SONS } from '../src/state/prefsAlerta';
import { alertaCorrida } from '../src/utils/alerta';
import { testarNotificacaoLocal } from '../src/push';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', erro: '#D0584F', erroBg: '#FBE8E6',
};
const PKG = Application.applicationId || '';

async function abrirAjustesAndroid() {
  if (Platform.OS !== 'android') { try { await Linking.openSettings(); } catch {} return; }
  try { await IntentLauncher.startActivityAsync('android.settings.APP_NOTIFICATION_SETTINGS', { extra: { 'android.provider.extra.APP_PACKAGE': PKG } }); return; } catch {}
  try { await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: 'package:' + PKG }); return; } catch {}
  try { await Linking.openSettings(); } catch {}
}

export default function Notificacoes() {
  const [perm, setPerm] = useState(null); // 'granted' | outros
  const [prefs, setPrefs] = useState({ som: true, vibracao: true, somNome: 'subida' });

  const checarPerm = useCallback(async () => {
    try { const p = await Notifications.getPermissionsAsync(); setPerm(p.status); } catch { setPerm('undetermined'); }
  }, []);

  useEffect(() => {
    (async () => { setPrefs(await garantirPrefs()); checarPerm(); })();
    const un = assinarPrefs(setPrefs);
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') checarPerm(); });
    return () => { un(); try { sub.remove(); } catch {} };
  }, [checarPerm]);

  const ativo = perm === 'granted';

  async function ativarPermissao() {
    try {
      const r = await Notifications.requestPermissionsAsync();
      setPerm(r.status);
      if (r.status !== 'granted') abrirAjustesAndroid();
    } catch { abrirAjustesAndroid(); }
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={st.bk}>←</Text></TouchableOpacity>
        <Text style={st.htitle}>Notificações e som</Text>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Status da permissão */}
        <View style={[st.stat, ativo ? st.statOk : st.statBad]}>
          <View style={[st.sIco, { backgroundColor: ativo ? C.ok : C.erro }]}><Text style={st.sIcoTxt}>{ativo ? '✓' : '!'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.sTt, { color: ativo ? '#0f6e56' : '#a23c34' }]}>{ativo ? 'Notificações ativas' : 'Notificações desligadas'}</Text>
            <Text style={st.sSub}>{ativo ? 'Você recebe corridas mesmo com o app fechado.' : 'Você pode perder corridas. Toque em ativar.'}</Text>
          </View>
          {!ativo && <TouchableOpacity style={st.sBtn} onPress={ativarPermissao}><Text style={st.sBtnTxt}>Ativar</Text></TouchableOpacity>}
        </View>

        {/* Alerta dentro do app */}
        <Text style={st.secLbl}>Alerta dentro do app</Text>
        <View style={st.box}>
          <View style={st.row}>
            <View style={st.rIco}><Text style={{ fontSize: 15 }}>🔊</Text></View>
            <View style={{ flex: 1 }}><Text style={st.rTt}>Som de corrida</Text></View>
            <Switch value={prefs.som} onValueChange={v => setPref('som', v)} trackColor={{ false: '#cbd5e1', true: C.ok }} thumbColor="#fff" ios_backgroundColor="#cbd5e1" />
          </View>
          <View style={[st.row, { borderBottomWidth: 0 }]}>
            <View style={st.rIco}><Text style={{ fontSize: 15 }}>📳</Text></View>
            <View style={{ flex: 1 }}><Text style={st.rTt}>Vibração</Text><Text style={st.rSub}>Funciona mesmo com o som desligado</Text></View>
            <Switch value={prefs.vibracao} onValueChange={v => setPref('vibracao', v)} trackColor={{ false: '#cbd5e1', true: C.ok }} thumbColor="#fff" ios_backgroundColor="#cbd5e1" />
          </View>
        </View>

        {/* Seletor de som */}
        <Text style={st.secLbl}>Som do alerta</Text>
        <View style={[st.box, !prefs.som && { opacity: 0.5 }]} pointerEvents={prefs.som ? 'auto' : 'none'}>
          {SONS.map((s, i) => {
            const sel = prefs.somNome === s.nome;
            return (
              <View key={s.nome} style={[st.som, i === SONS.length - 1 && { borderBottomWidth: 0 }, sel && st.somSel]}>
                <TouchableOpacity style={st.play} onPress={() => alertaCorrida(s.nome)} activeOpacity={0.7}><Text style={st.playTxt}>▶</Text></TouchableOpacity>
                <TouchableOpacity style={st.somNomeWrap} activeOpacity={0.7} onPress={() => setPref('somNome', s.nome)}>
                  <Text style={st.somNome}>{s.rotulo}</Text>
                  {s.padrao && <Text style={st.padraoTag}>padrão</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPref('somNome', s.nome)} activeOpacity={0.7}>
                  <View style={[st.radio, sel && st.radioOn]}>{sel && <View style={st.radioDot} />}</View>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={st.btnTest} activeOpacity={0.85} onPress={() => alertaCorrida()}>
          <Text style={st.btnTestTxt}>▶  Testar alerta agora</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => testarNotificacaoLocal()} activeOpacity={0.7}>
          <Text style={st.linkTest}>Testar notificação do sistema</Text>
        </TouchableOpacity>

        {/* Sistema */}
        <Text style={st.secLbl}>Sistema</Text>
        <View style={st.box}>
          <TouchableOpacity style={[st.row, { borderBottomWidth: 0 }]} activeOpacity={0.7} onPress={abrirAjustesAndroid}>
            <View style={st.rIco}><Text style={{ fontSize: 15 }}>⚙️</Text></View>
            <View style={{ flex: 1 }}><Text style={st.rTt}>Ajustes do Android</Text><Text style={st.rSub}>Som e prioridade do sistema</Text></View>
            <Text style={st.seta}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={st.tip}>
          <Text style={{ fontSize: 15 }}>💡</Text>
          <Text style={st.tipTxt}>O som escolhido toca com o app aberto/online. Com o app fechado, quem toca é o Android. Sumindo notificação? Veja "Rastreamento sempre ativo" no perfil.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bk: { fontSize: 22, color: '#fff', width: 26 },
  htitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },

  stat: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 13, borderWidth: 1, marginBottom: 14 },
  statOk: { backgroundColor: C.okBg, borderColor: '#b6e3ce' },
  statBad: { backgroundColor: C.erroBg, borderColor: '#f2c4be' },
  sIco: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sIcoTxt: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sTt: { fontSize: 13.5, fontWeight: '800' },
  sSub: { fontSize: 11, color: C.tinta2, marginTop: 2 },
  sBtn: { backgroundColor: C.erro, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 13 },
  sBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  secLbl: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: C.tinta3, marginTop: 14, marginBottom: 8, marginLeft: 4 },
  box: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderBottomWidth: 1, borderBottomColor: C.linha },
  rIco: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, alignItems: 'center', justifyContent: 'center' },
  rTt: { fontSize: 13, fontWeight: '700', color: C.tinta },
  rSub: { fontSize: 10.5, color: C.tinta3, marginTop: 1 },
  seta: { color: C.tinta3, fontSize: 18 },

  som: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: C.linha },
  somSel: { backgroundColor: '#f5faff' },
  play: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#eaf3fc', alignItems: 'center', justifyContent: 'center' },
  playTxt: { color: C.azulP, fontSize: 12 },
  somNomeWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  somNome: { fontSize: 13, fontWeight: '700', color: C.tinta },
  padraoTag: { fontSize: 10, fontWeight: '800', color: C.azulP, backgroundColor: '#eaf3fc', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6, overflow: 'hidden' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.tinta3, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.azulP },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.azulP },

  btnTest: { marginTop: 12, backgroundColor: C.azulP, borderRadius: 13, padding: 14, alignItems: 'center' },
  btnTestTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  linkTest: { textAlign: 'center', color: C.azulP, fontSize: 12, fontWeight: '700', marginTop: 11 },

  tip: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: '#eef6ff', borderWidth: 1, borderColor: '#cfe3fb', borderRadius: 12, padding: 12, marginTop: 16 },
  tipTxt: { flex: 1, fontSize: 11.3, color: '#1f4b78', lineHeight: 17 },
});
