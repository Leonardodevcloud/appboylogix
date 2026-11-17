// White-label: cada pasta em marcas/ vira um app na loja. Um campo errado aqui só aparece
// tarde — build que não instala, OTA que não chega, login "Empresa não encontrada".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const eas = JSON.parse(fs.readFileSync(path.join(raiz, 'eas.json'), 'utf8')).build;
const canais = new Set(Object.values(eas).map((p) => p.channel).filter(Boolean));
const marcas = fs.readdirSync(path.join(raiz, 'marcas'))
  .filter((d) => !d.startsWith('_') && fs.existsSync(path.join(raiz, 'marcas', d, 'marca.config.js')))
  .map((d) => ({ pasta: d, cfg: require(path.join(raiz, 'marcas', d, 'marca.config.js')) }));

test('há pelo menos uma marca', () => assert.ok(marcas.length >= 1));

for (const { pasta, cfg } of marcas) {
  test(`marca ${pasta}: campos obrigatórios`, () => {
    assert.equal(cfg.slug, pasta, 'slug = nome da pasta (e = identificador do cliente no painel master)');
    for (const campo of ['nomeApp', 'nomeExibicao', 'pacote', 'scheme', 'canal']) {
      assert.equal(typeof cfg[campo], 'string', campo);
      assert.ok(cfg[campo].trim(), campo);
    }
    assert.match(cfg.pacote, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/, 'pacote Android válido');
    for (const cor of ['profundo', 'primario', 'vivo', 'claro']) assert.match(cfg.cores[cor], /^#[0-9a-fA-F]{6}$/, `cor ${cor}`);
    for (const icone of ['icon', 'adaptive', 'splash']) assert.ok(fs.existsSync(path.join(raiz, cfg.icones[icone])), `ícone ${icone}: ${cfg.icones[icone]}`);
  });

  test(`marca ${pasta}: perfis de build e canal de atualização existem no eas.json`, () => {
    for (const perfil of [pasta, `${pasta}-loja`]) {
      assert.ok(eas[perfil], `perfil "${perfil}"`);
      assert.equal(eas[perfil].env && eas[perfil].env.MARCA, pasta, `perfil "${perfil}" define MARCA=${pasta}`);
    }
    assert.ok(canais.has(cfg.canal), `canal "${cfg.canal}" precisa ser o channel de algum perfil do eas.json`);
  });
}

test('nenhum pacote, scheme ou slug repetido entre marcas', () => {
  for (const campo of ['pacote', 'scheme', 'slug']) {
    const valores = marcas.map((m) => m.cfg[campo]);
    assert.equal(new Set(valores).size, valores.length, `${campo} repetido: ${valores.join(', ')}`);
  }
});

test('a marca ativa (marca.config.js da raiz) é uma das marcas', () => {
  const ativa = require(path.join(raiz, 'marca.config.js'));
  assert.ok(marcas.some((m) => m.cfg.slug === ativa.slug), `slug ativo: ${ativa.slug}`);
});
