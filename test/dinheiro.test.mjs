// Conversão do valor digitado em centavos. Cada caso aqui é um jeito real de digitar no
// teclado numérico do Android (que mostra "." ou "," conforme o idioma do aparelho).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centavosDoTexto, campoDeCentavos } from '../src/utils/dinheiro.js';

test('o bug de 17/11/2026: "50.5" é R$ 50,50, não R$ 505,00', () => {
  assert.equal(centavosDoTexto('50.5'), 5050);
});

test('vírgula é o decimal', () => {
  assert.equal(centavosDoTexto('50,5'), 5050);
  assert.equal(centavosDoTexto('50,50'), 5050);
  assert.equal(centavosDoTexto('0,99'), 99);
});

test('ponto com 1 ou 2 casas é decimal', () => {
  assert.equal(centavosDoTexto('50.50'), 5050);
  assert.equal(centavosDoTexto('19.99'), 1999);
  assert.equal(centavosDoTexto('7.5'), 750);
});

test('ponto com 3 casas é milhar', () => {
  assert.equal(centavosDoTexto('1.000'), 100000);
  assert.equal(centavosDoTexto('1.234.567'), 123456700);
});

test('milhar com ponto e decimal com vírgula, juntos', () => {
  assert.equal(centavosDoTexto('1.234,56'), 123456);
});

test('inteiro é em reais', () => {
  assert.equal(centavosDoTexto('50'), 5000);
  assert.equal(centavosDoTexto(120), 12000);
});

test('símbolo e espaço não atrapalham', () => {
  assert.equal(centavosDoTexto('R$ 50,00'), 5000);
  assert.equal(centavosDoTexto(' 35 '), 3500);
});

test('o que não é valor devolve 0', () => {
  for (const v of ['', null, undefined, 'abc', '0', '0,00', ',', '.', '1,2,3']) {
    assert.equal(centavosDoTexto(v), 0, `entrada: ${JSON.stringify(v)}`);
  }
});

test('não erra o centavo por causa de ponto flutuante', () => {
  assert.equal(centavosDoTexto('0,07'), 7);
  assert.equal(centavosDoTexto('4,35'), 435);
  assert.equal(centavosDoTexto('1,15'), 115);
});

test('centavos → campo, e a ida e volta não muda o valor', () => {
  assert.equal(campoDeCentavos(5050), '50,50');
  assert.equal(campoDeCentavos(0), '');
  assert.equal(campoDeCentavos(null), '');
  for (const c of [1, 99, 100, 5050, 123456, 100000]) assert.equal(centavosDoTexto(campoDeCentavos(c)), c);
});
