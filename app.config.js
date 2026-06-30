// Config dinâmica do Expo: parte do app.json e injeta a marca do cliente.
// Para trocar de cliente, basta trocar o marca.config.js (e os assets).
const marca = require('./marca.config.js');

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
    adaptiveIcon: {
      foregroundImage: marca.icones.adaptive,
      backgroundColor: marca.cores.profundo,
    },
  },
});
