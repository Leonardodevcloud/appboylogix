import { Tabs } from 'expo-router';
import BarraAbas from '../../src/componentes/BarraAbas';

// Início, Histórico, Ganhos e Perfil como abas de verdade (pedido do Tutts em 24/10/2026:
// "toda troca de tela o aplicativo dá um reload"). Cada aba é montada na primeira visita e
// fica viva: voltar a ela mostra na hora o que já estava lá; os dados se atualizam em
// segundo plano (useFocusEffect sem tela de "carregando"). As URLs não mudam (/home,
// /historico, /ganhos, /perfil) — o grupo (abas) não entra no caminho.
export default function LayoutAbas() {
  return (
    <Tabs
      initialRouteName="home"
      backBehavior="initialRoute"
      tabBar={(props) => <BarraAbas {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="historico" />
      <Tabs.Screen name="ganhos" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}
