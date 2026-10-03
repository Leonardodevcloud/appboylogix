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

// Logo in-app (login/splash JS) = logo da marca ATIVA. O app lê sempre de
// ./assets/marca/logo.png (require estático do Metro). Para o arquivo nunca ficar com a
// logo de OUTRA marca (ex.: a IG aparecendo por um instante no app da Motty), copiamos
// aqui, em todo build/update, a logo da pasta da marca ativa para a raiz.
function sincronizarLogoInApp() {
  try {
    const dir = path.dirname(marca.icones.icon);          // ./assets/marca/<slug>
    const origem = path.join(__dirname, dir, 'logo.png');
    const destino = path.join(__dirname, 'assets', 'marca', 'logo.png');
    if (!fs.existsSync(origem)) {
      console.warn(`[app.config] logo da marca não encontrada em ${origem} — logo in-app pode ficar desatualizada`);
      return;
    }
    const mesma = fs.existsSync(destino) && fs.readFileSync(origem).equals(fs.readFileSync(destino));
    if (!mesma) { fs.copyFileSync(origem, destino); console.log(`[app.config] logo in-app sincronizada da marca "${marca.slug}"`); }
  } catch (e) { console.warn('[app.config] falha ao sincronizar logo in-app:', e.message); }
}

module.exports = ({ config }) => {
  sincronizarLogoInApp();
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
