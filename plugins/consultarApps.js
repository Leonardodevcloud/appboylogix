// Config plugin do Expo: declara no AndroidManifest os apps de navegação que o app
// consulta (Android 11+ esconde os outros apps instalados se o manifest não pedir).
// Sem isto, Linking.canOpenURL('waze://') responde "não" mesmo com o Waze instalado e o
// app nunca ofereceria a escolha Waze/Google Maps (ADR-050 do backend).

const { withAndroidManifest } = require('@expo/config-plugins');

const PACOTES = ['com.waze', 'com.google.android.apps.maps'];
const ESQUEMAS = ['waze', 'google.navigation'];

module.exports = function consultarApps(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const queries = (manifest.queries = manifest.queries || [{}]);
    const q = queries[0];
    q.package = q.package || [];
    for (const nome of PACOTES) {
      if (!q.package.some((p) => p.$ && p.$['android:name'] === nome)) q.package.push({ $: { 'android:name': nome } });
    }
    q.intent = q.intent || [];
    for (const esquema of ESQUEMAS) {
      const ja = q.intent.some((i) => (i.data || []).some((d) => d.$ && d.$['android:scheme'] === esquema));
      if (!ja) q.intent.push({ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }], data: [{ $: { 'android:scheme': esquema } }] });
    }
    return cfg;
  });
};
