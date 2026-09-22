// Config dinâmica do Expo: parte do app.json e injeta a marca do cliente.
// Para trocar de cliente, basta trocar o marca.config.js (e os assets).
const fs = require('fs');
const path = require('path');
const marca = require('./marca.config.js');

// google-services.json é POR PACOTE Android. Cada marca aponta o seu em `marca.googleServices`;
// se o arquivo ainda não existir, cai no da raiz (o do IG) e avisa — o build passa, mas o push
// da marca nova não chega até o arquivo certo entrar (Firebase → Adicionar app → pacote da marca).
function googleServicesFile() {
  const proprio = marca.googleServices;
  if (proprio && fs.existsSync(path.join(__dirname, proprio))) return proprio;
  if (proprio) console.warn(`[app.config] ${proprio} não encontrado — usando ./google-services.json (push da marca "${marca.slug}" NÃO vai funcionar)`);
  return './google-services.json';
}

module.exports = ({ config }) => ({
  ...config,
  name: marca.nomeApp,
  scheme: marca.scheme,
  icon: marca.icones.icon,
  splash: {
    ...(config.splash || {}),
    image: marca.icones.splash,
    resizeMode: 'contain',
    backgroundColor: marca.cores.profundo,
  },
  android: {
    ...(config.android || {}),
    package: marca.pacote,
    googleServicesFile: googleServicesFile(),
    adaptiveIcon: {
      foregroundImage: marca.icones.adaptive,
      backgroundColor: marca.cores.profundo,
    },
  },
  plugins: (config.plugins || []).map((p) =>
    // Cor da notificação push = primária da marca (era o azul IG fixo no app.json).
    Array.isArray(p) && p[0] === 'expo-notifications' ? [p[0], { ...(p[1] || {}), color: marca.cores.primario }] : p
  ),
  extra: { ...(config.extra || {}), marca: marca.slug },
});
