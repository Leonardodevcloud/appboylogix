// Ganhos › Acertos (comprovante do acerto, mockup aprovado em 12/10/2026, ADR-049 do backend).
// Cada acerto que a central gerou para o profissional: período, valor e se já foi pago (e
// como). Tocar abre o comprovante. Fonte: GET /app/financeiro/acertos.
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { api } from '../api';
import { T, reais } from '../tema';

const br = (iso) => { if (!iso) return ''; const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; };
const diaPago = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' }); } catch { return ''; } };

export default function ListaAcertos({ recarregarToken = 0 }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    try { setDados(await api.get('/app/financeiro/acertos')); setErro(false); } catch { setErro(true); }
  }, []);
  useEffect(() => { carregar(); }, [carregar, recarregarToken]);

  if (!dados && !erro) return <ActivityIndicator color={T.vivo} style={{ marginTop: 40 }} />;
  if (erro && !dados) {
    return (
      <View style={st.vazio}>
        <Text style={st.vazioTx}>Não deu para carregar seus acertos agora.</Text>
        <TouchableOpacity onPress={carregar} style={st.tentar}><Text style={st.tentarTx}>Tentar de novo</Text></TouchableOpacity>
      </View>
    );
  }
  const lista = dados.acertos || [];
  if (!lista.length) {
    return <View style={st.vazio}><Text style={st.vazioTx}>Nenhum acerto ainda. Quando a central fechar o seu período, ele aparece aqui com o comprovante.</Text></View>;
  }
  return (
    <View>
      <Text style={st.nota}>Toque num acerto para ver o comprovante.</Text>
      {lista.map((a) => {
        const pago = a.status === 'pago';
        return (
          <TouchableOpacity key={a.id} style={st.card} activeOpacity={0.8} onPress={() => router.push('/comprovante?id=' + a.id)}
            accessibilityRole="button" accessibilityLabel={`Acerto de ${br(a.periodo_de)} a ${br(a.periodo_ate)}, ${reais(a.valor_cent)}`}>
            <View style={{ flex: 1 }}>
              <Text style={st.tit}>Acerto de {br(a.periodo_de)} a {br(a.periodo_ate)}</Text>
              <Text style={st.sub}>{pago ? `pago em ${diaPago(a.pago_em)}${a.forma ? ' · ' + a.forma : ''}` : 'a pagar pela central'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.valor}>{reais(a.valor_cent)}</Text>
              {!pago && <Text style={st.tagAt}>a pagar</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  nota: { fontSize: 12, fontWeight: '700', color: T.tinta2, marginBottom: 10 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 14, padding: 16, marginBottom: 10 },
  tit: { fontSize: 14.5, fontWeight: '800', color: T.tinta },
  sub: { fontSize: 12, color: T.tinta3, marginTop: 3 },
  valor: { fontSize: 15.5, fontWeight: '900', color: T.tinta },
  tagAt: { marginTop: 4, fontSize: 10.5, fontWeight: '800', color: T.atencaoTx, backgroundColor: T.atencaoBg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  vazio: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 20 },
  vazioTx: { fontSize: 13.5, color: T.tinta3, textAlign: 'center', lineHeight: 20 },
  tentar: { marginTop: 14, backgroundColor: T.primario, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  tentarTx: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
