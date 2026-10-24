import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../tema';
import Icone from './Icone';

// Barra de baixo (Início, Histórico, Ganhos, Perfil) com os ícones de traço do painel.
//
// É a `tabBar` de app/(abas)/_layout.jsx: as quatro telas ficam montadas e trocar de aba
// só mostra a que já estava pronta — nada de recarregar (antes cada toque empilhava uma
// tela nova e a Início, com o mapa, era refeita do zero).
//
// Área segura: em celular com os 3 botões do Android (voltar, início, recentes) no rodapé,
// a barra sobe acima deles; com navegação por gestos fica como antes.
const ABAS = [
  { rota: 'home', rotulo: 'Início', icone: 'inicio' },
  { rota: 'historico', rotulo: 'Histórico', icone: 'historico' },
  { rota: 'ganhos', rotulo: 'Ganhos', icone: 'carteira' },
  { rota: 'perfil', rotulo: 'Perfil', icone: 'usuario' },
];

export const ALTURA_BARRA = 62;   // sem a área segura de baixo

export default function BarraAbas({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const atual = state ? state.routes[state.index]?.name : null;
  return (
    <View style={[st.barra, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {ABAS.map((a) => {
        const on = a.rota === atual;
        const cor = on ? T.primario : T.tinta3;
        const ir = () => {
          const rota = state && state.routes.find((r) => r.name === a.rota);
          const ev = navigation.emit({ type: 'tabPress', target: rota?.key, canPreventDefault: true });
          if (!on && !ev.defaultPrevented) navigation.navigate(a.rota);
        };
        return (
          <TouchableOpacity key={a.rota} style={st.item} onPress={ir} activeOpacity={on ? 1 : 0.7}
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
  barra: { backgroundColor: T.sup, borderTopWidth: 1, borderTopColor: T.linha, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 },
  item: { alignItems: 'center', gap: 3, minWidth: 64, paddingBottom: 4 },
  rotulo: { fontSize: 10, fontWeight: '700' },
});
