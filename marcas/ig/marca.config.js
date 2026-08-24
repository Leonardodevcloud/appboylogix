// ============================================================
//  MARCA DO CLIENTE (white-label) — troque ESTE arquivo por build/cliente.
//  O resto do app lê daqui. Nenhuma cor/nome/slug fica espalhado no código.
// ============================================================
module.exports = {
  // Identidade no backend e exibição
  slug: 'ig',                              // EMPRESA_SLUG (tenant no Logix)
  nomeApp: 'IG Entregas',                  // nome sob o ícone / título na loja
  nomeExibicao: 'IG Entregas Rápidas',     // nome mostrado no login do app

  // Identidade nativa (Play Store)
  // 1º cliente reaproveita o package base (casa com o google-services.json atual).
  // Cada NOVO cliente recebe package próprio + google-services.json próprio.
  pacote: 'br.com.logix.motoboy',
  scheme: 'igentregas',

  // Paleta IG (Manual de Marca v1.0)
  cores: {
    profundo: '#042C53',   // fundo/splash/adaptive bg
    primario: '#185FA5',   // dominante
    vivo:     '#378ADD',   // destaques
    claro:    '#B5D4F4',   // apoio
  },

  // Arte (geradas a partir da logo oficial)
  icones: {
    icon:     './assets/marca/ig/icon.png',
    adaptive: './assets/marca/ig/adaptive-icon.png',
    splash:   './assets/marca/ig/splash-icon.png',
  },
  // Logo exibida DENTRO do app (login, splash JS, home). Caminho fixo por build:
  // basta substituir assets/marca/logo.png pela logo do cliente (símbolo transparente).
  logoInApp: './assets/marca/logo.png',
};
