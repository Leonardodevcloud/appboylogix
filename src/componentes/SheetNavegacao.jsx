import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Pressable } from 'react-native';

const C = {
  tinta: '#0e2138', tinta3: '#8ba5bc', borda: '#dde9f5',
  gmapsBg: '#e8f0fe', gmaps: '#185FA5',
  wazeBg: '#e0f3ff', waze: '#0bb7e8',
};

// Bottom sheet para escolher app de navegação. Uso:
// const [nav, setNav] = useState(null);  // { lat, lng, label }
// <SheetNavegacao alvo={nav} aoFechar={() => setNav(null)} />
export default function SheetNavegacao({ alvo, aoFechar }) {
  const visivel = !!alvo;
  const q = alvo ? (alvo.lat && alvo.lng ? `${alvo.lat},${alvo.lng}` : encodeURIComponent(alvo.label || '')) : '';

  function abrir(url) {
    Linking.openURL(url);
    aoFechar?.();
  }

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={aoFechar}>
      <Pressable style={st.overlay} onPress={aoFechar}>
        <Pressable style={st.sheet} onPress={() => {}}>
          <View style={st.handle} />
          <Text style={st.titulo}>Abrir navegação</Text>
          {!!alvo?.label && <Text style={st.endereco} numberOfLines={2}>{alvo.label}</Text>}

          <TouchableOpacity style={st.opcao} activeOpacity={0.8}
            onPress={() => abrir(`https://www.google.com/maps/dir/?api=1&destination=${q}`)}>
            <View style={[st.icoWrap, { backgroundColor: C.gmapsBg }]}>
              <Text style={[st.icoMarca, { color: C.gmaps }]}>◉</Text>
            </View>
            <Text style={st.opcaoTxt}>Google Maps</Text>
            <Text style={st.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={st.opcao} activeOpacity={0.8}
            onPress={() => abrir(`https://waze.com/ul?ll=${q}&navigate=yes`)}>
            <View style={[st.icoWrap, { backgroundColor: C.wazeBg }]}>
              <Text style={[st.icoMarca, { color: C.waze }]}>◈</Text>
            </View>
            <Text style={st.opcaoTxt}>Waze</Text>
            <Text style={st.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={st.cancelar} onPress={aoFechar} activeOpacity={0.7}>
            <Text style={st.cancelarTxt}>Cancelar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(4,44,83,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
  handle: { width: 38, height: 4, borderRadius: 3, backgroundColor: C.borda, alignSelf: 'center', marginBottom: 16 },
  titulo: { fontSize: 17, fontWeight: '800', color: C.tinta, marginBottom: 3 },
  endereco: { fontSize: 13, color: C.tinta3, marginBottom: 16 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: C.borda, borderRadius: 12, marginBottom: 10 },
  icoWrap: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  icoMarca: { fontSize: 22, fontWeight: '700' },
  opcaoTxt: { flex: 1, fontSize: 15, fontWeight: '700', color: C.tinta },
  chevron: { fontSize: 22, color: C.tinta3 },
  cancelar: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelarTxt: { fontSize: 15, color: C.tinta3, fontWeight: '600' },
});
