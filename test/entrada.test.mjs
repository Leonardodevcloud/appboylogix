// As tarefas de segundo plano têm de ser definidas no PONTO DE ENTRADA, antes do roteador.
// Em 19/11/2026 elas estavam em app/_layout.jsx (arquivo de rota, que só roda com a tela
// montada): com o app encerrado pelo Android, a posição chegava a uma tarefa "não definida"
// e o rastreamento era cancelado. Este teste impede a volta desse arranjo.
// Rodar: node --test test/entrada.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('o app começa pelo index.js, não direto pelo roteador', () => {
  assert.equal(JSON.parse(ler('package.json')).main, 'index.js');
});

test('index.js define as tarefas de fundo antes de carregar o roteador', () => {
  const imports = [...semComentario(ler('index.js')).matchAll(/^import\s+['"]([^'"]+)['"];?\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./src/tasks/gpsTask', './src/tasks/pushFundo', 'expo-router/entry']);
});

test('cada tarefa é definida no topo do seu módulo, uma única vez', () => {
  for (const [arq, nome] of [['src/tasks/gpsTask.js', 'GPS_TASK'], ['src/tasks/pushFundo.js', 'TASK_PUSH_FUNDO']]) {
    const s = semComentario(ler(arq));
    assert.equal((s.match(/TaskManager\.defineTask\(/g) || []).length, 1, arq);
    assert.match(s, new RegExp(`TaskManager\\.defineTask\\(${nome},`), arq);
  }
});

test('nenhum arquivo de tela ou de interface define tarefa de fundo', () => {
  for (const arq of ['app/_layout.jsx', 'src/push/index.js']) {
    assert.doesNotMatch(semComentario(ler(arq)), /defineTask\(/, arq);
  }
});

test('os módulos de tarefa são leves: nada de tela, som ou navegação', () => {
  for (const arq of ['src/tasks/gpsTask.js', 'src/tasks/pushFundo.js']) {
    const imports = [...semComentario(ler(arq)).matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const i of imports) assert.doesNotMatch(i, /expo-router|react-native$|^react$|expo-av|expo-audio|componentes|\/push|\/api$|utils\/alerta/, `${arq} importa ${i}`);
  }
});
