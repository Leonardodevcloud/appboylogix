// Quem está online tem de mandar posição mesmo PARADO.
// Em 19/11/2026 o app mostrava "GPS parado há mais de 10 min" com o motoboy online e parado:
// fora de entrega o rastreamento usava precisão Balanced, e nessa precisão o Android deixa de
// entregar posição a um celular que não se move. Este teste impede a volta desse arranjo.
// Rodar: node --test test/rastreio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

test('o serviço de localização roda em precisão High, sem intervalo por distância', () => {
  const s = semComentario(ler('src/tasks/gpsTask.js'));
  const bloco = s.slice(s.indexOf('startLocationUpdatesAsync('), s.indexOf('foregroundService'));
  assert.match(bloco, /accuracy:\s*Location\.Accuracy\.High,/);
  assert.doesNotMatch(bloco, /Balanced/);
  assert.match(bloco, /distanceInterval:\s*0,/);
  assert.match(bloco, /timeInterval:\s*15000,/);
});

test('com o app aberto há um batimento que envia a posição quando o serviço atrasa', () => {
  const tarefa = semComentario(ler('src/tasks/gpsTask.js'));
  assert.match(tarefa, /export async function baterPonto\(/);
  const gancho = semComentario(ler('src/hooks/useGPS.js'));
  assert.match(gancho, /setInterval\(\(\) => \{ baterPonto\(\)/);
});

test('o batimento não duplica ponto quando o serviço está em dia', () => {
  const s = semComentario(ler('src/tasks/gpsTask.js'));
  const corpo = s.slice(s.indexOf('export async function baterPonto('));
  assert.match(corpo, /Date\.now\(\) - ultimo < BATIMENTO_FOLGA_MS/);
});
