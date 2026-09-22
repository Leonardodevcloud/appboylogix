// Config dinâmica do Expo: parte do app.json e injeta a marca do cliente.
// Para trocar de cliente, basta trocar o marca.config.js (e os assets).
const fs = require('fs');
const path = require('path');
const marca = require('./marca.config.js');

// google-services.json é POR PACOTE Android: o plugin do Google Services QUEBRA o Gradle se
// o package dentro do arquivo não for o do app ("No matching client found for package name").
// Por isso nunca se usa o arquivo de outra marca como reserva. Regra:
//   - marca declara `googleServices` e o arquivo existe → usa ele;
//   - marca declara e o arquivo NÃO existe → build sem google-services (push não chega) + aviso;
//   - marca não declara (IG, 1º cliente) → o ./google-services.json da raiz, que é do pacote dela.
function googleServicesFile() {
  const proprio = marca.googleServices;
  if (!proprio) return './google-services.json';
  if (fs.existsSync(path.join(__dirname, proprio))) return proprio;
  console.warn(`[app.config] ${proprio} não encontrado — build SEM google-services (push da marca "${marca.slug}" NÃO vai funcionar até o arquivo entrar)`);
  return undefined;
}

module.exports = ({ config }) => {
  const gs = googleServicesFile();
  const android = { ...(config.android || {}) };
  if (gs) android.googleServicesFile = gs; else delete android.googleServicesFile;
  return {
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
      ...android,
      package: marca.pacote,
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
  };
};
