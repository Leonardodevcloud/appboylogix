// ============================================================
//  MARCA: MOTTY ENTREGAS RÁPIDAS (2º cliente white-label, 22/09/2026)
//  Ativa com: node scripts/set-marca.js motty  (ou MARCA=motty no profile EAS)
// ============================================================
module.exports = {
  // Identidade no backend e exibição
  slug: 'motty',                            // slug da empresa no Logix (cadastro e login por e-mail)
  nomeApp: 'Motty Entregas',                // nome sob o ícone / título na loja
  nomeExibicao: 'Motty Entregas Rápidas',   // nome no login do app

  // Identidade nativa (Play Store) — IMUTÁVEL depois de publicado
  pacote: 'br.com.motty.entregador',
  scheme: 'mottyentregas',

  // Canal do EAS que o app instalado escuta = `channel` dos profiles `motty` / `motty-loja`.
  canal: 'motty',

  // Push: google-services.json do app Android `br.com.motty.entregador` (Firebase → Adicionar app).
  // Enquanto o arquivo não existir, app.config.js cai no da raiz (IG) e o push NÃO chega.
  googleServices: './marcas/motty/google-services.json',

  // Paleta Motty (mesma do white-label do painel: primária #1A4A83, secundária #12386B,
  // destaque #FB5012, clara #D8E4F3). No app: profundo = fundo/splash, primario = dominante,
  // vivo = destaques/ofertas, claro = apoio.
  cores: {
    profundo: '#12386B',
    primario: '#1A4A83',
    vivo:     '#FB5012',
    claro:    '#D8E4F3',
  },

  icones: {
    icon:     './assets/marca/motty/icon.png',
    adaptive: './assets/marca/motty/adaptive-icon.png',
    splash:   './assets/marca/motty/splash-icon.png',
  },
  logoInApp: './assets/marca/logo.png',
};
