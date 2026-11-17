// Dinheiro digitado → centavos. Regra do app: a conta de dinheiro é do servidor; aqui só se
// converte o que a pessoa digitou no campo, e sempre para CENTAVOS inteiros.
//
// O teclado numérico do Android mostra "." ou "," conforme o idioma do aparelho. A versão
// antiga jogava o ponto fora: "50.5" virava "505" → R$ 505,00 (pedido de antecipação dez
// vezes maior). Agora:
//   - tem vírgula  → vírgula é o decimal e ponto é milhar:   "1.234,56" → 123456
//   - só ponto     → decimal quando sobra 1 ou 2 casas:      "50.5" → 5050, "50.50" → 5050
//                    milhar quando sobram exatamente 3:       "1.000" → 100000
//   - nada disso   → inteiro em reais:                        "50" → 5000
// Texto que não vira número (ou valor ≤ 0) devolve 0, e a tela trata como "informe o valor".
export function centavosDoTexto(texto) {
  let s = String(texto == null ? '' : texto).replace(/[^\d.,]/g, '');
  if (!s) return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}(\.|$)/.test(s) && !/\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Centavos → texto do campo, no formato brasileiro ("5050" → "50,50"). Zero vira campo vazio.
export function campoDeCentavos(cent) {
  const n = Math.round(Number(cent));
  return Number.isFinite(n) && n > 0 ? (n / 100).toFixed(2).replace('.', ',') : '';
}
