import * as SecureStore from 'expo-secure-store';
import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';

// Aviso PROEMINENTE de uso de localização, exigido pela Google Play ANTES de
// pedir a permissão de localização em segundo plano. Precisa: (1) dizer que
// coleta localização inclusive com o app fechado, (2) explicar pra quê, e (3)
// ter uma ação afirmativa do usuário. Sem isto, a Play reprova o app.
//
// Mostramos uma vez; guardamos o aceite no SecureStore. Se o motoboy recusar,
// não pedimos a permissão de fundo (o app cai no rastreio só em primeiro plano).

const KEY = 'lx_disclosure_loc_v1';

export async function garantirDisclosureLocalizacao() {
  try {
    const ja = await SecureStore.getItemAsync(KEY);
    if (ja) return true;
  } catch {}

  const aceitou = await new Promise((resolve) => {
    Alert.alert(
      'Uso da sua localização',
      'Para funcionar, este app coleta a sua localização — inclusive em segundo plano, ' +
      'com o app fechado ou sem uso — para:\n\n' +
      '•  enviar sua posição à central durante as entregas;\n' +
      '•  permitir que você receba corridas próximas;\n' +
      '•  registrar o trajeto de cada entrega.\n\n' +
      'O compartilhamento acontece apenas enquanto você está ONLINE. ' +
      'Fique offline a qualquer momento para parar.',
      [
        { text: 'Agora não', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Entendi e permito', onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });

  if (aceitou) { try { await SecureStore.setItemAsync(KEY, '1'); } catch {} }
  return aceitou;
}

// ── Localização "o tempo todo" OBRIGATÓRIA para operar ──────────────────────
function avisarPermissaoSempre() {
  Alert.alert(
    'Ative a localização "o tempo todo"',
    'Para ficar ONLINE e receber corridas, o app precisa da localização como "PERMITIR O TEMPO TODO" ' +
    '(não só "enquanto usa o app").\n\n' +
    'Sem isso, sua posição não é enviada com o app fechado — você deixa de receber corridas e o trajeto ' +
    'das entregas não é registrado.\n\n' +
    'Toque em "Abrir configurações", vá em Permissões \u2192 Localização e escolha "Permitir o tempo todo".',
    [
      { text: 'Agora não', style: 'cancel' },
      { text: 'Abrir configurações', onPress: () => Linking.openSettings() },
    ],
    { cancelable: false }
  );
}

// Exige a permissão de fundo. Retorna true só se concedida ("o tempo todo").
export async function garantirLocalizacaoSempre() {
  let fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') { avisarPermissaoSempre(); return false; }

  const consentiu = await garantirDisclosureLocalizacao();
  if (!consentiu) return false;

  let bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') { avisarPermissaoSempre(); return false; }
  await pedirIsencaoBateria();
  return true;
}

// Só checa (sem pedir) se já tem "o tempo todo".
export async function temLocalizacaoSempre() {
  try { const bg = await Location.getBackgroundPermissionsAsync(); return bg.status === 'granted'; }
  catch (e) { return false; }
}

// Pede ao Android para NÃO otimizar a bateria do app (senão o SO mata o serviço de
// localização em 2º plano). Mostra o diálogo do sistema uma única vez.
const KEY_BAT = 'lx_isencao_bateria_v1';
export async function pedirIsencaoBateria() {
  if (Platform.OS !== 'android') return;
  try { if (await SecureStore.getItemAsync(KEY_BAT)) return; } catch {}
  try {
    await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', {
      data: 'package:' + Application.applicationId,
    });
    try { await SecureStore.setItemAsync(KEY_BAT, '1'); } catch {}
  } catch (e) {
    try { await IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS'); } catch (e2) {}
  }
}
