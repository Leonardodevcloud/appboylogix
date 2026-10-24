import { Text, StyleSheet } from 'react-native';
import { T, reais } from '../tema';

// Dinâmica visível para o entregador (aprovado em 24/10/2026). O valor da corrida
// (valor_motoboy_cent) JÁ inclui o adicional da dinâmica — o destaque continua sendo o
// total que ele recebe; embaixo, menor: "R$ 8,00 tarifa + R$ 2,00 dinâmica". Sem dinâmica
// não aparece nada (o componente devolve null).
export function partesDinamica(totalCent, dinamicaCent) {
  const din = Number(dinamicaCent) || 0;
  const total = Number(totalCent) || 0;
  if (din <= 0 || total <= 0) return null;
  return { tarifa: Math.max(0, total - din), dinamica: din };
}

export function textoDinamica(totalCent, dinamicaCent) {
  const p = partesDinamica(totalCent, dinamicaCent);
  return p ? `${reais(p.tarifa)} tarifa + ${reais(p.dinamica)} dinâmica` : null;
}

export default function ValorDinamica({ totalCent, dinamicaCent, nome, style, alinhar = 'right', claro = false, numberOfLines = 1 }) {
  const t = textoDinamica(totalCent, dinamicaCent);
  if (!t) return null;
  return (
    <Text style={[st.linha, { textAlign: alinhar }, claro && st.claro, style]} numberOfLines={numberOfLines}
      accessibilityLabel={`Inclui ${reais(dinamicaCent)} de dinâmica${nome ? ', ' + nome : ''}`}>
      {t}{nome ? ` · ${nome}` : ''}
    </Text>
  );
}

const st = StyleSheet.create({
  linha: { fontSize: 11, fontWeight: '700', color: T.dinamica, marginTop: 1 },
  claro: { color: '#e4d7fd' },
});
