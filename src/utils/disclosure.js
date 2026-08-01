import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

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
