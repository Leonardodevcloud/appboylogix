import { useEffect, useRef } from 'react';
import { View, Animated, Easing, AccessibilityInfo, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

// Ícone do Antecipar (opção A aprovada em 18/10/2026): carteira com uma nota que sobe e
// sai dela — "dinheiro saindo". A nota repete a cada ~2,6 s e fica parada quando o
// aparelho pede menos movimento (Acessibilidade › Remover animações).
export default function IconeAntecipar({ tam = 22, cor = '#fff' }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let laco = null, vivo = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduzir) => {
      if (!vivo) return;
      if (reduzir) { t.setValue(0.75); return; }
      laco = Animated.loop(Animated.sequence([
        Animated.delay(1300),
        Animated.timing(t, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
      laco.start();
    }).catch(() => {});
    return () => { vivo = false; laco?.stop(); };
  }, [t]);

  const k = tam / 24;
  // 0 → 0.4: entra (sobe de dentro da carteira); 0.4 → 0.75: fica; 0.75 → 1: sai por cima.
  const translateY = t.interpolate({ inputRange: [0, 0.4, 0.75, 1], outputRange: [5 * k, 0, -2 * k, -7 * k] });
  const opacity = t.interpolate({ inputRange: [0, 0.3, 0.75, 1], outputRange: [0, 1, 1, 0] });

  return (
    <View style={{ width: tam, height: tam }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity, transform: [{ translateY }] }]}>
        <Svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={7} y={3} width={10} height={6} rx={1} />
          <Circle cx={12} cy={6} r={1.2} />
        </Svg>
      </Animated.View>
      <Svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={StyleSheet.absoluteFill}>
        <Path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        <Path d="M17 14.5h.01" />
      </Svg>
    </View>
  );
}
