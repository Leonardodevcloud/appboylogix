import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Application from 'expo-application';
import { mostrarAviso } from './aviso';

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

  const escolha = await mostrarAviso({
    icone: '📍',
    titulo: 'Uso da sua localização',
    chip: 'Antes de continuar',
    lead: 'Para funcionar, o app coleta a sua localização — inclusive em segundo plano, com o app fechado — para:',
    itens: [
      { ico: '📡', txt: 'Enviar sua posição à central durante as entregas' },
      { ico: '🛵', txt: 'Deixar você receber corridas próximas' },
      { ico: '🗺️', txt: 'Registrar o trajeto de cada entrega' },
    ],
    destaque: 'O compartilhamento acontece só enquanto você está ONLINE. Fique offline quando quiser para parar.',
    destaqueIco: '🔒',
    botaoPrimario: 'Entendi e permito',
    botaoGhost: 'Agora não',
    fecharPorFora: false,
  });

  const aceitou = escolha === 'primario';
  if (aceitou) { try { await SecureStore.setItemAsync(KEY, '1'); } catch {} }
  return aceitou;
}

// ── Localização "o tempo todo" OBRIGATÓRIA para operar ──────────────────────
async function avisarPermissaoSempre() {
  const escolha = await mostrarAviso({
    icone: '📍',
    titulo: 'Ative a localização “o tempo todo”',
    chip: 'Necessário para ficar online',
    lead: 'Com o app fechado, é assim que você continua recebendo corridas e o trajeto fica registrado.',
    itens: [
      { ico: '🛵', txt: 'Recebe corridas mesmo com a tela apagada' },
      { ico: '📡', txt: 'Sua posição chega à central em tempo real' },
      { ico: '🗺️', txt: 'O trajeto de cada entrega é registrado' },
    ],
    destaque: 'Na tela que abrir, escolha “Permitir o tempo todo” — não só “enquanto usa o app”.',
    botaoPrimario: 'Abrir configurações',
    botaoGhost: 'Agora não',
    fecharPorFora: false,
  });
  if (escolha === 'primario') { try { Linking.openSettings(); } catch {} }
}

// Exige a permissão de fundo. Retorna true só se concedida ("o tempo todo").
export async function garantirLocalizacaoSempre() {
  let fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') { await avisarPermissaoSempre(); return false; }

  const consentiu = await garantirDisclosureLocalizacao();
  if (!consentiu) return false;

  let bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') { await avisarPermissaoSempre(); return false; }
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
