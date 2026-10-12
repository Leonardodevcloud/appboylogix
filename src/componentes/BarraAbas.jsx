import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { T } from '../tema';
import Icone from './Icone';

// Barra de baixo (Início, Histórico, Ganhos, Perfil) com os ícones de traço do painel.
// Uma só para a Início e o Perfil — antes cada tela tinha a sua, com emoji.
const ABAS = [
  { chave: 'inicio', rotulo: 'Início', icone: 'inicio', ir: () => router.replace('/home') },
  { chave: 'historico', rotulo: 'Histórico', icone: 'historico', ir: () => router.push('/historico') },
  { chave: 'ganhos', rotulo: 'Ganhos', icone: 'carteira', ir: () => router.push('/ganhos') },
  { chave: 'perfil', rotulo: 'Perfil', icone: 'usuario', ir: () => router.push('/perfil') },
];

export default function BarraAbas({ ativa }) {
  return (
    <View style={st.barra}>
      {ABAS.map((a) => {
        const on = a.chave === ativa;
        const cor = on ? T.primario : T.tinta3;
        return (
          <TouchableOpacity key={a.chave} style={st.item} onPress={on ? undefined : a.ir} activeOpacity={on ? 1 : 0.7}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={a.rotulo}>
            <Icone nome={a.icone} tam={22} cor={cor} />
            <Text style={[st.rotulo, { color: cor }]}>{a.rotulo}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  barra: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.sup, borderTopWidth: 1, borderTopColor: T.linha, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10, paddingBottom: 28 },
  item: { alignItems: 'center', gap: 3, minWidth: 64 },
  rotulo: { fontSize: 10, fontWeight: '700' },
});
