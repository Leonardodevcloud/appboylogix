import * as SecureStore from 'expo-secure-store';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

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
  return true;
}

// Só checa (sem pedir) se já tem "o tempo todo".
export async function temLocalizacaoSempre() {
  try { const bg = await Location.getBackgroundPermissionsAsync(); return bg.status === 'granted'; }
  catch (e) { return false; }
}
