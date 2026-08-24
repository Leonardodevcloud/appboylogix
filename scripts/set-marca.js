#!/usr/bin/env node
/**
 * Ativa a marca de um cliente (white-label).
 * Uso local:  node scripts/set-marca.js <slug>
 * No EAS:      roda no "eas-build-pre-install" lendo a env MARCA (por profile).
 * Sem slug/MARCA: nao altera nada (mantem a marca atual), pra nao quebrar
 * builds que nao definem MARCA (preview/production usam o marca.config.js commitado).
 */
const fs = require('fs');
const path = require('path');
const raiz = process.cwd();
const slug = (process.argv[2] || process.env.MARCA || '').trim();

function disponiveis() {
  try {
    return fs.readdirSync(path.join(raiz, 'marcas'))
      .filter((d) => !d.startsWith('_') && fs.existsSync(path.join(raiz, 'marcas', d, 'marca.config.js')));
  } catch (e) { return []; }
}

if (!slug) {
  console.log('[set-marca] Nenhuma MARCA definida. Mantendo a marca atual.');
  process.exit(0);
}
const cfgOrigem = path.join(raiz, 'marcas', slug, 'marca.config.js');
if (!fs.existsSync(cfgOrigem)) {
  console.error(`\n[set-marca] Marca "${slug}" nao encontrada em marcas/${slug}/marca.config.js`);
  console.error('[set-marca] Disponiveis:', disponiveis().join(', ') || '(nenhuma)');
  process.exit(1);
}
fs.copyFileSync(cfgOrigem, path.join(raiz, 'marca.config.js'));
const logoOrigem = path.join(raiz, 'assets', 'marca', slug, 'logo.png');
const logoDestino = path.join(raiz, 'assets', 'marca', 'logo.png');
if (fs.existsSync(logoOrigem)) {
  fs.mkdirSync(path.dirname(logoDestino), { recursive: true });
  fs.copyFileSync(logoOrigem, logoDestino);
} else {
  console.warn(`[set-marca] AVISO: assets/marca/${slug}/logo.png nao encontrado. Mantive o logo atual.`);
}
console.log(`\n[set-marca] Marca ativa: ${slug}  OK`);
