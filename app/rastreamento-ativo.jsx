import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking, AppState } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { backgroundAtivo, garantirUpdatesBackground } from '../src/tasks/gpsTask';

const COR = { navy: '#042C53', azul: '#185FA5', ok: '#1F9D6B', erro: '#D0584F', aten: '#C98A1A', tinta: '#0F2740', tinta2: '#486485', tinta3: '#8AA2BE', linha: '#E6EDF5', fundo: '#EEF3F9' };
const PKG = Application.applicationId || '';

// Abre a tela de INFO do app (onde ficam Bateria e Permissões) — o mais confiável.
async function abrirInfoApp() {
  try { await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: 'package:' + PKG }); }
  catch (e) { try { await Linking.openSettings(); } catch (e2) {} }
}
// Abre a tela de BATERIA do app. Usamos a INFO do app (que sempre abre e é onde
// ficam "Sem restrições" e os limites de segundo plano na Samsung).
//
// ATENÇÃO: NÃO usar aqui o intent REQUEST_IGNORE_BATTERY_OPTIMIZATIONS. Como o app
// já pede a isenção de bateria ao ficar online, esse intent NÃO abre tela nenhuma
// quando a isenção já foi concedida — e o startActivityAsync resolve SEM erro,
// então o `return` matava os fallbacks e o botão ficava "morto".
async function abrirBateria() {
  try { await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: 'package:' + PKG }); return; } catch (e) {}
  // Fallback: lista geral de otimização de bateria (sempre abre uma tela real).
  try { await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'); return; } catch (e) {}
  try { await Linking.openSettings(); } catch (e2) {}
}
// Abre a LISTA de otimização de bateria do sistema (tela real de bateria, não a
// config do app). É o mais perto que dá de um deep-link público na Samsung — a
// tela de "apps em suspensão profunda" NÃO tem intent público, então caímos aqui.
async function abrirListaBateria() {
  try { await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'); return; } catch (e) {}
  try { await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: 'package:' + PKG }); return; } catch (e2) {}
  try { await Linking.openSettings(); } catch (e3) {}
}
// Xiaomi/MIUI: tenta abrir o gerenciador de início automático; se falhar, info do app.
async function abrirAutostartXiaomi() {
  try { await IntentLauncher.startActivityAsync('android.intent.action.MAIN', { className: 'com.miui.permcenter.autostart.AutoStartManagementActivity', packageName: 'com.miui.securitycenter' }); return; } catch (e) {}
  abrirInfoApp();
}

// Passos por marca. verificavel=true significa que o app consegue confirmar sozinho.
function guiaDaMarca(marca) {
  const m = String(marca || '').toLowerCase();
  if (m.includes('samsung')) return {
    nome: 'Samsung', passos: [
      { titulo: 'Bateria "Sem restrições"', detalhe: 'Toque em "Abrir bateria" abaixo. Na tela do app, vá em Bateria e marque "Sem restrições" (NÃO deixe em "Otimizado"). É diferente da otimização geral — mesmo com ela desligada, o app precisa ficar "Sem restrições" aqui.', btn: 'Abrir bateria do app', acao: abrirInfoApp },
      { titulo: 'Tirar da "Suspensão profunda"', detalhe: 'Esta é a trava que mais atrapalha na Samsung. Vá em Configurações → Bateria → "Limites de uso em segundo plano":\n\n•  em "Apps em suspensão profunda", REMOVA este app se ele estiver lá;\n•  em "Apps que nunca entram em suspensão", ADICIONE este app.\n\n(A Samsung não deixa abrir essa lista direto — o botão te leva à tela de Bateria; siga o caminho acima ali dentro.)', btn: 'Abrir ajustes de bateria', acao: abrirListaBateria },
      { titulo: 'Desligar "Bateria adaptativa" (opcional)', detalhe: 'Configurações → Bateria → toque nos 3 pontinhos → Bateria adaptativa → desligar. Ajuda a manter o rastreio ativo por mais tempo.', btn: 'Abrir bateria', acao: abrirListaBateria },
    ],
  };
  if (m.includes('xiaomi') || m.includes('redmi') || m.includes('poco')) return {
    nome: 'Xiaomi', passos: [
      { titulo: 'Ativar "Início automático"', detalhe: 'No Xiaomi, sem o Início automático o app é fechado sozinho. Toque em "Abrir início automático" e LIGUE a chave para este app.', btn: 'Abrir início automático', acao: abrirAutostartXiaomi },
      { titulo: 'Bateria "Sem restrições"', detalhe: 'Abra a info do app → Economia de bateria → escolha "Sem restrições". E em "Economia de energia", desative para este app.', btn: 'Abrir bateria do app', acao: abrirInfoApp },
      { titulo: 'Bloquear na memória (recentes)', detalhe: 'Abra os apps recentes, segure o card do app e toque no cadeado 🔒 — isso impede o MIUI de fechá-lo ao limpar a memória.', btn: null, acao: null },
    ],
  };
  if (m.includes('motorola') || m.includes('moto')) return {
    nome: 'Motorola', passos: [
      { titulo: 'Bateria sem otimização', detalhe: 'Toque em "Abrir bateria" e escolha "Não otimizar" / "Sem restrições" para este app.', btn: 'Abrir bateria', acao: abrirBateria },
      { titulo: 'Permitir atividade em segundo plano', detalhe: 'Na info do app → Bateria → garanta que "Atividade em segundo plano" está PERMITIDA e o modo é "Sem restrições".', btn: 'Abrir info do app', acao: abrirInfoApp },
    ],
  };
  return {
    nome: 'seu aparelho', passos: [
      { titulo: 'Bateria sem otimização', detalhe: 'Toque em "Abrir bateria" e deixe o app "Sem restrições" / "Não otimizar".', btn: 'Abrir bateria', acao: abrirBateria },
      { titulo: 'Permitir em segundo plano', detalhe: 'Na info do app → Bateria → permita a atividade em segundo plano e desative qualquer restrição/economia para este app.', btn: 'Abrir info do app', acao: abrirInfoApp },
    ],
  };
}

export default function RastreamentoAtivo() {
  const [bgOk, setBgOk] = useState(null);
  const [servico, setServico] = useState(null); // serviço de background rodando?
  const [ultimaMs, setUltimaMs] = useState(null); // ms desde o último envio de GPS
  const guia = guiaDaMarca(Device.manufacturer || Device.brand);

  const checar = useCallback(async () => {
    try { const bg = await Location.getBackgroundPermissionsAsync(); setBgOk(bg.status === 'granted'); } catch { setBgOk(false); }
    try { setServico(await backgroundAtivo()); } catch { setServico(false); }
    try { const iso = await SecureStore.getItemAsync('lx_ultima_posicao_em'); setUltimaMs(iso ? (Date.now() - new Date(iso).getTime()) : null); } catch { setUltimaMs(null); }
  }, []);

  useEffect(() => {
    checar();
    const t = setInterval(checar, 5000);
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') checar(); });
    return () => { clearInterval(t); try { sub.remove(); } catch {} };
  }, [checar]);

  // "OK" = permissão "o tempo todo" liberada E serviço de background ativo.
  // NÃO usamos a hora da última posição como gatilho: em primeiro plano ela não
  // atualiza (o serviço de background pausa), o que dava falso "pode falhar".
  const enviandoOk = !!(bgOk && servico);
  const ultimaTxt = ultimaMs == null ? 'sem envio ainda' : (ultimaMs < 60000 ? 'há ' + Math.round(ultimaMs / 1000) + ' s' : 'há ' + Math.round(ultimaMs / 60000) + ' min');
  const subtitulo = enviandoOk
    ? ('Serviço ativo em segundo plano.' + (ultimaMs != null ? ' Última posição ' + ultimaTxt + '.' : ''))
    : (!bgOk ? 'A localização "o tempo todo" não está liberada.' : 'O serviço em segundo plano está parado — toque em "Reativar".');

  return (
    <View style={st.root}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.replace('/home')}><Text style={st.bk}>←</Text></TouchableOpacity>
        <Text style={st.htitle}>Rastreamento sempre ativo</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {/* Status atual */}
        <View style={[st.status, enviandoOk ? st.statusOk : st.statusBad]}>
          <View style={[st.sico, { backgroundColor: enviandoOk ? COR.ok : COR.erro }]}><Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{enviandoOk ? '✓' : '!'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[st.sb, { color: enviandoOk ? '#0f6e56' : '#a23c34' }]}>{enviandoOk ? 'Rastreamento ativo' : 'Rastreamento pode falhar'}</Text>
            <Text style={st.ss}>{subtitulo}</Text>
          </View>
        </View>

        <View style={st.marca}><Text style={st.marcaTxt}>📱 Ajustes para {guia.nome}</Text></View>

        {/* Diagnóstico do serviço em segundo plano */}
        <View style={st.diag}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[st.diagDot, { backgroundColor: servico ? COR.ok : COR.erro }]} />
            <Text style={st.diagTxt}>Serviço em segundo plano: <Text style={{ fontWeight: '800', color: servico ? '#0f6e56' : '#a23c34' }}>{servico == null ? '…' : (servico ? 'ativo' : 'parado')}</Text></Text>
          </View>
          <TouchableOpacity onPress={async () => { await garantirUpdatesBackground(false); setTimeout(checar, 800); }} style={{ opacity: servico ? 0 : 1 }} disabled={!!servico}>
            <Text style={st.diagBtn}>Reativar</Text>
          </TouchableOpacity>
        </View>
        <Text style={st.intro}>
          {enviandoOk
            ? 'Está tudo certo — o rastreamento já está ativo. Os passos abaixo são só para reforçar e evitar que o aparelho feche o app com o tempo.'
            : 'Pra você receber corridas e não perder o rastreio com a tela apagada, o ' + guia.nome + ' precisa liberar o app.\nImportante: isso é DIFERENTE de "otimização de bateria" — mesmo com ela desligada, o aparelho tem outras travas que precisam ser ajustadas abaixo.'}
        </Text>

        {!bgOk && (
          <View style={st.passo}>
            <View style={st.num}><Text style={st.numTxt}>!</Text></View>
            <Text style={st.pt}>Permitir localização "o tempo todo"</Text>
            <Text style={st.pd}>Sem isso o app não rastreia com a tela apagada. Toque abaixo e escolha "Permitir o tempo todo".</Text>
            <TouchableOpacity style={st.abrir} onPress={async () => { try { await Location.requestBackgroundPermissionsAsync(); } catch {} try { await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: 'package:' + PKG }); } catch {} }}>
              <Text style={st.abrirTxt}>Ajustar permissão ›</Text>
            </TouchableOpacity>
          </View>
        )}

        {guia.passos.map((p, i) => (
          <View key={i} style={st.passo}>
            <View style={st.num}><Text style={st.numTxt}>{i + 1}</Text></View>
            <Text style={st.pt}>{p.titulo}</Text>
            <Text style={st.pd}>{p.detalhe}</Text>
            {p.acao ? (
              <TouchableOpacity style={st.abrir} onPress={p.acao}><Text style={st.abrirTxt}>{p.btn} ›</Text></TouchableOpacity>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={st.rodape}>
        <TouchableOpacity style={[st.btnTest, { backgroundColor: enviandoOk ? COR.navy : COR.ok }]} onPress={enviandoOk ? () => router.replace('/home') : checar}>
          <Text style={st.btnTestTxt}>{enviandoOk ? 'Tudo certo — voltar ao início' : 'Já ajustei — testar rastreamento'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COR.fundo },
  header: { backgroundColor: '#fff', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: COR.linha, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bk: { fontSize: 22, color: COR.tinta2, width: 26 },
  htitle: { fontSize: 17, fontWeight: '800', color: COR.tinta },
  status: { borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, borderWidth: 1 },
  statusOk: { backgroundColor: '#E4F5EE', borderColor: '#b6e3ce' },
  statusBad: { backgroundColor: '#FBE8E6', borderColor: '#f2c4be' },
  sico: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sb: { fontSize: 14.5, fontWeight: '800' },
  ss: { fontSize: 12, color: COR.tinta2, marginTop: 2 },
  marca: { alignSelf: 'flex-start', backgroundColor: '#EAF1F9', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 11, marginBottom: 12 },
  marcaTxt: { color: COR.azul, fontWeight: '800', fontSize: 11.5 },
  diag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: COR.linha, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 12 },
  diagDot: { width: 9, height: 9, borderRadius: 5 },
  diagTxt: { fontSize: 12.5, color: COR.tinta2 },
  diagBtn: { fontSize: 12.5, fontWeight: '800', color: COR.azul },
  intro: { fontSize: 13, color: COR.tinta2, lineHeight: 19, marginBottom: 14 },
  passo: { backgroundColor: '#fff', borderWidth: 1, borderColor: COR.linha, borderRadius: 14, padding: 15, marginBottom: 12 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: COR.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  numTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pt: { fontSize: 14.5, fontWeight: '800', color: COR.tinta },
  pd: { fontSize: 12.5, color: COR.tinta2, lineHeight: 18, marginTop: 6, marginBottom: 12 },
  abrir: { alignSelf: 'flex-start', backgroundColor: COR.azul, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 14 },
  abrirTxt: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  rodape: { padding: 16, borderTopWidth: 1, borderTopColor: COR.linha, backgroundColor: '#fff' },
  btnTest: { borderRadius: 12, padding: 15, alignItems: 'center' },
  btnTestTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
