// ============================================================
//  MODELO DE MARCA — copie esta pasta para marcas/<slug>/ e preencha.
//  Depois crie assets/marca/<slug>/ com: icon.png, adaptive-icon.png,
//  splash-icon.png e logo.png. Ative com: node scripts/set-marca.js <slug>
// ============================================================
module.exports = {
  slug: 'cliente-exemplo',                 // tenant no Logix (EMPRESA_SLUG)
  nomeApp: 'Cliente Entregas',             // nome sob o ícone na loja
  nomeExibicao: 'Cliente Entregas Ltda',   // nome no login do app

  pacote: 'br.com.cliente.motoboy',        // TROQUE: applicationId único
  scheme: 'clienteentregas',               // TROQUE: scheme único

  cores: {
    profundo: '#0B1B2B',
    primario: '#1E6FEB',
    vivo:     '#3D8BFF',
    claro:    '#BBD6FF',
  },
  icones: {
    icon:     './assets/marca/cliente-exemplo/icon.png',
    adaptive: './assets/marca/cliente-exemplo/adaptive-icon.png',
    splash:   './assets/marca/cliente-exemplo/splash-icon.png',
  },
  logoInApp: './assets/marca/logo.png',
};
