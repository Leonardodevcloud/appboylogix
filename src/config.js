// Endereço da API — o ÚNICO lugar do app que sabe onde o servidor mora.
//
// Sem variável nenhuma, o app fala com produção (é o que todo build de loja e todo OTA
// usam hoje). Para apontar para outro ambiente (staging, servidor local), defina
// EXPO_PUBLIC_API_URL antes de `expo start`, `eas build` ou `eas update`: o Metro troca
// o valor na hora de montar o pacote. Ex.:
//   $env:EXPO_PUBLIC_API_URL = "https://<staging>/api/v1" ; npx expo start
//
// Este arquivo não importa nada de propósito: api, gpsTask (tarefa de fundo), push e
// socket leem daqui sem risco de dependência circular. test/config-unica.test.js reprova
// qualquer outro arquivo que escreva o endereço à mão.
const PRODUCAO = 'https://logix-production-61ae.up.railway.app/api/v1';

export const API_URL = String(process.env.EXPO_PUBLIC_API_URL || PRODUCAO).replace(/\/+$/, '');
