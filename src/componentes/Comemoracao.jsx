// "Caiu na sua conta!" — tela cheia que comemora o Pix da antecipação (mockup aprovado em
// 11/10/2026). Aparece quando o pedido vira "paga" com ele na tela de antecipação: chega
// pelo WebSocket ou pela conferência a cada 15 s. Só Animated do React Native (sem
// biblioteca nativa nova): o anel cresce, o check se desenha e o confete cai.
import { useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Dimensions, Vibration, AccessibilityInfo } from 'react-native';
import { T, reais } from '../tema';

const { height: ALTURA, width: LARGURA } = Dimensions.get('window');
const CONFETE = [
  { x: 0.1, cor: T.vivo, atraso: 0 }, { x: 0.24, cor: '#ffffff', atraso: 500 }, { x: 0.38, cor: T.claro, atraso: 200 },
  { x: 0.52, cor: T.vivo, atraso: 800 }, { x: 0.66, cor: '#ffffff', atraso: 300 }, { x: 0.8, cor: T.claro, atraso: 650 },
  { x: 0.9, cor: T.vivo, atraso: 1000 }, { x: 0.16, cor: T.claro, atraso: 1200 },
];

function Confete({ x, cor, atraso, ativo }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ativo) return undefined;
    const loop = Animated.loop(Animated.timing(y, { toValue: 1, duration: 2600, delay: atraso, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [ativo]);
  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [-20, ALTURA + 20] });
  const rotate = y.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] });
  return <Animated.View style={[st.confete, { left: x * LARGURA, backgroundColor: cor, transform: [{ translateY }, { rotate }] }]} />;
}

// pedido: { recebe_cent, valor_cent, taxa_cent, gratuidade, pix_chave_mascarada? }
export default function Comemoracao({ pedido, aoVerExtrato, aoFechar }) {
  const anel = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const reduzir = useRef(false);

  useEffect(() => {
    if (!pedido) return;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { reduzir.current = !!r; }).catch(() => {});
    try { Vibration.vibrate([0, 60, 80, 120]); } catch {}
    anel.setValue(0); check.setValue(0);
    Animated.sequence([
      Animated.spring(anel, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(check, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [pedido]);

  if (!pedido) return null;
  const escala = anel.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const taxa = pedido.gratuidade ? 'sem taxa (gratuidade)' : pedido.taxa_cent ? `taxa ${reais(pedido.taxa_cent)}` : 'sem taxa';

  return (
    <Modal transparent={false} visible animationType="fade" statusBarTranslucent onRequestClose={aoFechar}>
      <View style={st.fundo} accessibilityLiveRegion="assertive">
        {CONFETE.map((c, i) => <Confete key={i} {...c} ativo={!reduzir.current} />)}
        <Animated.View style={[st.anel, { opacity: anel, transform: [{ scale: escala }] }]}>
          <View style={st.miolo}>
            <Animated.Text style={[st.check, { opacity: check, transform: [{ scale: check }] }]}>✓</Animated.Text>
          </View>
        </Animated.View>
        <Text style={st.titulo}>Caiu na sua conta!</Text>
        <Text style={st.valor}>{reais(pedido.recebe_cent)}</Text>
        {!!pedido.chave && <Text style={st.sub}>{`Pix para ${pedido.chave}`}</Text>}
        <Text style={st.sub2}>{`Antecipação de ${reais(pedido.valor_cent)} · ${taxa}`}</Text>
        <View style={{ height: 34 }} />
        <TouchableOpacity style={st.botao} activeOpacity={0.85} onPress={aoVerExtrato} accessibilityRole="button">
          <Text style={st.botaoTx}>Ver no extrato</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.fechar} activeOpacity={0.7} onPress={aoFechar} accessibilityRole="button">
          <Text style={st.fecharTx}>Fechar</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: T.ganho, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, overflow: 'hidden' },
  confete: { position: 'absolute', top: 0, width: 9, height: 14, borderRadius: 2 },
  anel: { width: 132, height: 132, borderRadius: 66, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  miolo: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  check: { fontSize: 54, fontWeight: '900', color: T.ganho, lineHeight: 62 },
  titulo: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 22, opacity: 0.95 },
  valor: { color: '#fff', fontSize: 42, fontWeight: '900', marginTop: 6 },
  sub: { color: '#fff', fontSize: 14, opacity: 0.88, marginTop: 6, textAlign: 'center' },
  sub2: { color: '#fff', fontSize: 13, opacity: 0.75, marginTop: 6, textAlign: 'center' },
  botao: { alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 15, paddingVertical: 16, alignItems: 'center' },
  botaoTx: { color: T.ganhoEsc, fontSize: 15.5, fontWeight: '800' },
  fechar: { marginTop: 10, padding: 12 },
  fecharTx: { color: '#fff', fontSize: 14, fontWeight: '700', opacity: 0.85 },
});
