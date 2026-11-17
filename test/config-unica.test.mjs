// O endereço da API mora só em src/config.js. Endereço escrito à mão em outro arquivo é como
// o app já teve dois lugares para trocar (api e gpsTask) — e esquecer um manda o GPS para o
// servidor errado sem ninguém ver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const fontes = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return fontes(p);
  return /\.(js|jsx)$/.test(n) ? [p] : [];
});

test('nenhum arquivo do app escreve o endereço do servidor fora de src/config.js', () => {
  const culpados = [...fontes(join(raiz, 'app')), ...fontes(join(raiz, 'src'))]
    .filter((p) => relative(raiz, p).replace(/\\/g, '/') !== 'src/config.js')
    .filter((p) => /https?:\/\/[a-z0-9.-]*railway\.app/i.test(readFileSync(p, 'utf8')))
    .map((p) => relative(raiz, p));
  assert.deepEqual(culpados, []);
});

test('src/config.js não importa nada (a tarefa de GPS depende disso)', () => {
  assert.doesNotMatch(readFileSync(join(raiz, 'src/config.js'), 'utf8'), /^\s*import\s/m);
});
