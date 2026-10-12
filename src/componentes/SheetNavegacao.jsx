import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Image } from 'react-native';
import { T } from '../tema';
import Icone from './Icone';
import { APPS, registrarHostNavegacao, confirmarEscolha, getNavegacao, setNavegacao, wazeInstalado } from '../state/navegacao';

const LOGO = {
  waze: require('../../assets/navegacao/waze.png'),
  google: require('../../assets/navegacao/google-maps.png'),
};

// Folha "Abrir a rota com" (mockup aprovado em 12/10/2026). Montada uma vez no _layout;
// as telas chamam `abrirNavegacao(alvo)` de src/state/navegacao, que só abre esta folha
// quando ainda não há escolha salva e o Waze está instalado.
//
//   modo 'abrir'    → escolhe, abre a rota e (se "Lembrar") salva
//   modo 'escolher' → Perfil › Navegação: só salva (ou volta a perguntar)
export default function SheetNavegacao() {
  const [pedido, setPedido] = useState(null);
  const [app, setApp] = useState('waze');
  const [lembrar, setLembrar] = useState(true);
  const [temWaze, setTemWaze] = useState(true);

  useEffect(() => registrarHostNavegacao((p) => {
    setApp(getNavegacao() || 'waze');
    setLembrar(true);
    setPedido(p);
    wazeInstalado().then((ok) => { setTemWaze(ok); if (!ok) setApp('google'); });
  }), []);

  const fechar = () => setPedido(null);
  if (!pedido) return null;
  const escolher = pedido.modo === 'escolher';
  const opcoes = temWaze ? ['waze', 'google'] : ['google'];

  async function confirmar() {
    const alvo = pedido.alvo;
    fechar();
    if (escolher) await setNavegacao(app);
    else await confirmarEscolha({ app, lembrar, alvo });
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={fechar} statusBarTranslucent>
      <Pressable style={st.overlay} onPress={fechar}>
        <Pressable style={st.sheet} onPress={() => {}}>
          <View style={st.grip} />
          <View style={st.topo}>
            <View style={st.badge}><Icone nome="mapa" tam={22} cor="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.titulo}>{escolher ? 'Navegação' : 'Abrir a rota com'}</Text>
              <Text style={st.sub} numberOfLines={1}>{escolher ? 'Com qual aplicativo abrir as rotas' : (pedido.alvo?.label || 'Próximo destino')}</Text>
            </View>
          </View>

          {opcoes.map((k) => {
            const on = app === k;
            return (
              <TouchableOpacity key={k} style={[st.opcao, on && st.opcaoOn]} activeOpacity={0.85} onPress={() => setApp(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <Image source={LOGO[k]} style={st.logo} />
                <View style={{ flex: 1 }}>
                  <Text style={st.opcaoTxt}>{APPS[k].nome}</Text>
                  <Text style={st.opcaoSub}>{APPS[k].sub}</Text>
                </View>
                <View style={[st.radio, on && st.radioOn]} />
              </TouchableOpacity>
            );
          })}
          {!temWaze && <Text style={st.nota}>O Waze não está instalado neste celular.</Text>}

          {!escolher && (
            <TouchableOpacity style={st.lembrar} onPress={() => setLembrar((v) => !v)} activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked: lembrar }}>
              <View style={[st.chk, !lembrar && st.chkOff]}>{lembrar && <Icone nome="check" tam={13} cor="#fff" traco={3} />}</View>
              <Text style={st.lembrarTxt}>Lembrar minha escolha</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={st.btn} onPress={confirmar} activeOpacity={0.85}>
            <Text style={st.btnTxt}>{escolher ? 'Salvar' : `Abrir no ${APPS[app].nome}`}</Text>
          </TouchableOpacity>
          {escolher && !!getNavegacao() && (
            <TouchableOpacity style={st.ghost} onPress={async () => { fechar(); await setNavegacao(null); }} activeOpacity={0.7}>
              <Text style={st.ghostTxt}>Perguntar toda vez</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={st.ghost} onPress={fechar} activeOpacity={0.7}>
            <Text style={st.ghostTxt}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(4,20,40,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: T.sup, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  grip: { width: 38, height: 4, borderRadius: 99, backgroundColor: '#d3deeb', alignSelf: 'center', marginBottom: 16 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  badge: { width: 52, height: 52, borderRadius: 16, backgroundColor: T.primario, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 17, fontWeight: '800', color: T.tinta },
  sub: { fontSize: 12, fontWeight: '600', color: T.tinta2, marginTop: 2 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: T.linha, borderRadius: 16, padding: 12, marginTop: 10 },
  opcaoOn: { borderColor: T.primario, backgroundColor: T.suave },
  logo: { width: 40, height: 40, borderRadius: 10 },
  opcaoTxt: { fontSize: 15, fontWeight: '800', color: T.tinta },
  opcaoSub: { fontSize: 12, color: T.tinta3, fontWeight: '600', marginTop: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: T.linha },
  radioOn: { borderWidth: 6, borderColor: T.primario },
  nota: { fontSize: 12, color: T.tinta3, marginTop: 8 },
  lembrar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  chk: { width: 22, height: 22, borderRadius: 6, backgroundColor: T.primario, alignItems: 'center', justifyContent: 'center' },
  chkOff: { backgroundColor: T.sup, borderWidth: 2, borderColor: T.linha },
  lembrarTxt: { fontSize: 14, fontWeight: '700', color: T.tinta },
  btn: { marginTop: 18, backgroundColor: T.primario, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  ghost: { paddingVertical: 11, alignItems: 'center' },
  ghostTxt: { color: T.tinta3, fontSize: 14, fontWeight: '700' },
});
