import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View, StyleSheet, TouchableOpacity, PanResponder, Platform, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { assinarBanner } from '../state/banner';

// Ícone + cor por tipo de gatilho.
const TIPOS = {
  oferta:    { ico: '🛵', cor: '#378ADD' },
  atribuida: { ico: '📦', cor: '#1f9d6b' },
  editada:   { ico: '✏️', cor: '#C98A1A' },
  removida:  { ico: '↩️', cor: '#D0584F' },
  ponto:     { ico: '✅', cor: '#6B4FC9' },
  default:   { ico: '🔔', cor: '#185FA5' },
};
const DURACAO = 4200; // ms na tela

export default function BannerHost() {
  const [cfg, setCfg] = useState(null);
  const y = useRef(new Animated.Value(-200)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const pulso = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  useEffect(() => assinarBanner((c) => mostrar(c)), []);

  function mostrar(c) {
    clearTimeout(timer.current);
    setCfg(c);
    y.setValue(-200); prog.setValue(0);
    Animated.timing(y, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.timing(prog, { toValue: 1, duration: DURACAO, easing: Easing.linear, useNativeDriver: false }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 0, duration: 10, useNativeDriver: true }),
    ])).start();
    timer.current = setTimeout(() => fechar(), DURACAO);
  }

  function fechar(cb) {
    clearTimeout(timer.current);
    Animated.timing(y, { toValue: -200, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => { setCfg(null); if (cb) cb(); });
  }

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy < -6,
    onPanResponderMove: (_, g) => { if (g.dy < 0) y.setValue(g.dy); },
    onPanResponderRelease: (_, g) => { if (g.dy < -30) fechar(); else Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(); },
  })).current;

  if (!cfg) return null;
  const t = TIPOS[cfg.tipo] || TIPOS.default;
  const larguraBarra = prog.interpolate({ inputRange: [0, 1], outputRange: ['100%', '0%'] });
  const escalaPulso = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const opacPulso = pulso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Animated.View style={[st.wrap, { transform: [{ translateY: y }] }]} {...pan.panHandlers}>
      <TouchableOpacity activeOpacity={0.92} style={[st.card, { borderLeftColor: t.cor }]}
        onPress={() => { const r = cfg.rota; fechar(() => { if (r) try { router.push(r); } catch {} }); }}>
        <View style={st.icoWrap}>
          <Animated.View style={[st.pulso, { borderColor: t.cor, transform: [{ scale: escalaPulso }], opacity: opacPulso }]} />
          <View style={[st.ico, { backgroundColor: t.cor + '22' }]}><Text style={{ fontSize: 20 }}>{t.ico}</Text></View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.tt} numberOfLines={1}>{cfg.titulo}</Text>
          {!!cfg.sub && <Text style={st.sub} numberOfLines={1}>{cfg.sub}</Text>}
        </View>
        <Text style={st.seta}>›</Text>
        <Animated.View style={[st.bar, { backgroundColor: t.cor, width: larguraBarra }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const TOPO = (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 48) + 6;
const st = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: TOPO, paddingHorizontal: 10, zIndex: 9999, elevation: 9999 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderLeftWidth: 5, borderWidth: 1, borderColor: '#dde9f5', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 14 },
  icoWrap: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  pulso: { position: 'absolute', width: 42, height: 42, borderRadius: 14, borderWidth: 2 },
  ico: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tt: { fontSize: 14, fontWeight: '800', color: '#0e2138' },
  sub: { fontSize: 11.5, color: '#46637f', marginTop: 1 },
  seta: { fontSize: 22, color: '#8ba5bc', fontWeight: '700' },
  bar: { position: 'absolute', left: 0, bottom: 0, height: 3 },
});
