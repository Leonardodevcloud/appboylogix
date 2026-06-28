// Push notifications do app do motoboy (Expo).
// Mostra som + vibracao + pop-up MESMO com o app fechado, porque o push e
// entregue pelo servidor (Expo -> FCM), nao depende do app estar aberto.
//
// Fluxo:
//  - configurarNotificacoes(): handler de foreground + canal Android HIGH.
//  - registrarPush(): pede permissao, pega o ExpoPushToken e envia ao backend.
//  - removerPushDoBackend(): no logout, descadastra este aparelho.
//  - aoTocarNotificacao(cb): navega quando o motoboy toca a notificacao.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api, getToken, API_URL } from '../api';

// Canal de notificação. IMPORTANTE: as configs de um canal travam após a 1a
// criação no Android — se precisar mudar som/vibração, troque o ID (sufixo _vN).
const CANAL_ID = 'corridas_v2';

// Foreground: quando o app esta aberto, ainda assim exibe banner + toca som.
export function configurarNotificacoes() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Canal de alta prioridade no Android (pop-up + som + vibracao com app fechado).
export async function criarCanalAndroid() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_ID, {
      name: 'Corridas',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#185FA5',
      sound: 'default',
      enableVibrate: true,
      enableLights: true,
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (e) {
    console.log('[push] canal android:', e?.message);
  }
}

// Pede permissao e devolve o ExpoPushToken (string) ou null.
async function obterTokenExpo() {
  const { status: atual } = await Notifications.getPermissionsAsync();
  let status = atual;
  if (status !== 'granted') {
    const r = await Notifications.requestPermissionsAsync();
    status = r.status;
  }
  if (status !== 'granted') {
    console.log('[push] permissao negada pelo motoboy');
    return null;
  }
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    'f9ea2287-dc0e-45d6-8f44-85620ee42cf5';
  try {
    const t = await Notifications.getExpoPushTokenAsync({ projectId });
    return t?.data || null;
  } catch (e) {
    console.log('[push] getExpoPushTokenAsync:', e?.message);
    return null;
  }
}

// Registra o token no backend. Chamar SEMPRE que o motoboy abre o app logado
// (cobre token novo, troca de aparelho e revalidacao).
export async function registrarPush() {
  try {
    await criarCanalAndroid();
    const token = await obterTokenExpo();
    if (!token) return false;
    await api.post('/motoboys/app/push/registrar', {
      token,
      plataforma: Platform.OS,
    });
    // Guarda para conseguir descadastrar no logout.
    globalThis.__lxPushToken = token;
    return true;
  } catch (e) {
    console.log('[push] registrarPush:', e?.message);
    return false;
  }
}

// Descadastra este aparelho no logout (para de receber push aqui).
export async function removerPushDoBackend() {
  try {
    const token = globalThis.__lxPushToken;
    if (!token) return;
    // Usa fetch direto: o api.logout ja vai limpar o token de auth depois.
    const auth = await getToken();
    await fetch(API_URL + '/motoboys/app/push/remover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: 'Bearer ' + auth } : {}),
      },
      body: JSON.stringify({ token }),
    });
    globalThis.__lxPushToken = null;
  } catch (e) {
    console.log('[push] removerPushDoBackend:', e?.message);
  }
}

// Registra o callback de toque na notificacao. Retorna funcao de cleanup.
export function aoTocarNotificacao(cb) {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const dados = resp?.notification?.request?.content?.data || {};
    cb(dados);
  });
  return () => sub.remove();
}

// Le os dados da notificacao que ABRIU o app (estava fechado). Use no boot.
export async function notificacaoQueAbriuApp() {
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    return resp?.notification?.request?.content?.data || null;
  } catch {
    return null;
  }
}
