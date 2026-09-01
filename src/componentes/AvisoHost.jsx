import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Pressable,
} from 'react-native';
import { assinarAviso, responderAviso } from '../utils/aviso';

// Paleta do app (mesma da home/perfil).
const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5', erro: '#D0584F',
};

// Modal "folha inferior" (bottom sheet) nativo do app — substitui o Alert cru.
export default function AvisoHost() {
  const [cfg, setCfg] = useState(null);
  const y = useRef(new Animated.Value(1)).current; // 1 = escondido embaixo, 0 = visível

  useEffect(() => assinarAviso(setCfg), []);

  useEffect(() => {
    if (cfg) {
      y.setValue(1);
      Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [cfg]);

  if (!cfg) return null;

  const fechar = (chave) => {
    Animated.timing(y, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => responderAviso(chave));
  };

  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [0, 600] });
  const podeFecharFora = cfg.fecharPorFora !== false;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent
      onRequestClose={() => fechar(cfg.botaoGhost ? 'ghost' : 'fechar')}>
      <View style={st.dim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => podeFecharFora && fechar('fechar')} />
        <Animated.View style={[st.sheet, { transform: [{ translateY }] }]}>
          <View style={st.grip} />

          <View style={st.titrow}>
            {!!cfg.icone && <View style={st.badge}><Text style={st.badgeTxt}>{cfg.icone}</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={st.ttl}>{cfg.titulo}</Text>
              {!!cfg.chip && (
                <View style={st.chip}>
                  <View style={st.chipDot} />
                  <Text style={st.chipTxt}>{cfg.chip}</Text>
                </View>
              )}
            </View>
          </View>

          {!!cfg.lead && <Text style={st.lead}>{cfg.lead}</Text>}

          {Array.isArray(cfg.itens) && cfg.itens.length > 0 && (
            <View style={st.rows}>
              {cfg.itens.map((it, i) => (
                <View key={i} style={st.row}>
                  <View style={st.rico}><Text style={st.ricoTxt}>{it.ico}</Text></View>
                  <Text style={st.rtx}>{it.txt}</Text>
                </View>
              ))}
            </View>
          )}

          {!!cfg.destaque && (
            <View style={st.hi}>
              <Text style={st.hiK}>{cfg.destaqueIco || '✅'}</Text>
              <Text style={st.hiTxt}>{cfg.destaque}</Text>
            </View>
          )}

          <View style={st.acts}>
            <TouchableOpacity style={[st.btn, st.primary]} activeOpacity={0.85} onPress={() => fechar('primario')}>
              <Text style={st.primaryTxt}>{cfg.botaoPrimario || 'OK'}</Text>
            </TouchableOpacity>
            {!!cfg.botaoGhost && (
              <TouchableOpacity style={st.ghost} activeOpacity={0.7} onPress={() => fechar('ghost')}>
                <Text style={st.ghostTxt}>{cfg.botaoGhost}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  dim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4,20,40,0.55)' },
  sheet: {
    backgroundColor: C.sup, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 24,
  },
  grip: { width: 38, height: 4, borderRadius: 99, backgroundColor: '#d3deeb', alignSelf: 'center', marginBottom: 16 },

  titrow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: C.azulP,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.azulP, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 12, elevation: 6,
  },
  badgeTxt: { fontSize: 24 },
  ttl: { fontSize: 17, fontWeight: '800', color: C.tinta, lineHeight: 22 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#eaf1f9', borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10, marginTop: 6 },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.azulP },
  chipTxt: { color: C.azulP, fontSize: 10.5, fontWeight: '800' },

  lead: { fontSize: 12.5, color: C.tinta2, lineHeight: 19, marginTop: 14 },

  rows: { marginTop: 14, gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  rico: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, alignItems: 'center', justifyContent: 'center' },
  ricoTxt: { fontSize: 15 },
  rtx: { flex: 1, fontSize: 12.5, color: C.tinta, fontWeight: '600', lineHeight: 17 },

  hi: { marginTop: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: '#eef6ff', borderWidth: 1, borderColor: '#cfe3fb', borderRadius: 12, padding: 11 },
  hiK: { fontSize: 15, lineHeight: 18 },
  hiTxt: { flex: 1, fontSize: 11.8, color: '#1f4b78', lineHeight: 17 },

  acts: { marginTop: 20, gap: 8 },
  btn: { borderRadius: 13, padding: 15, alignItems: 'center' },
  primary: { backgroundColor: C.azulP, shadowColor: C.azulP, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.26, shadowRadius: 12, elevation: 4 },
  primaryTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  ghost: { padding: 11, alignItems: 'center' },
  ghostTxt: { color: C.tinta3, fontSize: 13, fontWeight: '700' },
});
