// Config plugin do Expo: remove do AndroidManifest permissoes que nenhuma tela
// usa mas que alguma lib readiciona sozinha (o expo-audio, por exemplo, injeta
// RECORD_AUDIO mesmo o app so TOCANDO som, nunca gravando). Microfone no app de
// entrega gera pergunta extra na revisao da Play Store e no formulario de
// seguranca de dados — entao tiramos de vez.
//
// Estrategia dupla: (1) filtra as permissoes ja presentes; (2) adiciona uma
// entrada com tools:node="remove", que faz o merge do Gradle descartar a
// permissao mesmo que uma dependencia tente readiciona-la depois.

const { withAndroidManifest } = require('@expo/config-plugins');

const REMOVER = [
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
];

module.exports = function removerPermissoes(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const atuais = manifest['uses-permission'] || [];
    const filtradas = atuais.filter(
      (p) => !REMOVER.includes(p && p.$ && p.$['android:name'])
    );
    for (const nome of REMOVER) {
      filtradas.push({ $: { 'android:name': nome, 'tools:node': 'remove' } });
    }
    manifest['uses-permission'] = filtradas;
    return cfg;
  });
};
