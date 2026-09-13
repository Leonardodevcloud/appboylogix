// Uma parada da corrida em andamento (mockup v1, tela 3): coleta ou entrega.
// estado: 'feita' | 'agora' | 'depois'. A parada "agora" traz as ações dentro dela.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { T, hora } from '../tema';

export default function Parada({ numero, titulo, endereco, detalhes = [], chips = [], estado, onNavegar, onLigar, onChat, telefone }) {
  const feita = estado === 'feita', agora = estado === 'agora';
  return (
    <View style={[st.box, agora && st.agora, feita && st.feita]}>
      <View style={[st.num, agora && st.numAgora, feita && st.numFeita]}>
        <Text style={[st.numTxt, (agora || feita) && { color: '#fff' }]}>{feita ? '✓' : numero}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.titulo} numberOfLines={2}>{titulo}</Text>
        {!!endereco && <Text style={st.endereco}>{endereco}</Text>}
        {detalhes.filter(Boolean).length > 0 && <Text style={st.detalhes}>{detalhes.filter(Boolean).join(' · ')}</Text>}
        {chips.filter(Boolean).length > 0 && (
          <View style={st.chips}>{chips.filter(Boolean).map((c, i) => <View key={i} style={st.chip}><Text style={st.chipTxt}>{c}</Text></View>)}</View>
        )}
        {agora && (
          <View style={st.botoes}>
            {!!onNavegar && <TouchableOpacity style={[st.btn, { flex: 1 }]} onPress={onNavegar} activeOpacity={0.8}><Text style={st.btnTxt}>➤  Navegar</Text></TouchableOpacity>}
            {!!telefone && !!onLigar && <TouchableOpacity style={[st.btn, { flex: 1 }]} onPress={onLigar} activeOpacity={0.8}><Text style={st.btnTxt}>Ligar</Text></TouchableOpacity>}
            {!!onChat && <TouchableOpacity style={st.btn} onPress={onChat} activeOpacity={0.8}><Text style={st.btnTxt}>Chat</Text></TouchableOpacity>}
          </View>
        )}
      </View>
    </View>
  );
}
export { hora };

const st = StyleSheet.create({
  box: { backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: T.r, padding: 14, paddingHorizontal: 16, marginBottom: 10, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  agora: { borderWidth: 2, borderColor: T.vivo, shadowColor: T.vivo, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  feita: { opacity: 0.55 },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  numAgora: { backgroundColor: T.vivo },
  numFeita: { backgroundColor: T.ganho },
  numTxt: { fontWeight: '800', fontSize: 13, color: T.tinta2 },
  titulo: { fontSize: 14.5, fontWeight: '800', color: T.tinta },
  endereco: { fontSize: 13.5, color: T.tinta2, lineHeight: 19, marginTop: 2 },
  detalhes: { fontSize: 13, color: T.tinta2, lineHeight: 18, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { backgroundColor: T.suave, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: T.tinta2 },
  botoes: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: T.primario, fontWeight: '800', fontSize: 14 },
});
