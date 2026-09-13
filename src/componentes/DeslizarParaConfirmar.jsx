// Botão deslizante (aceitar corrida / confirmar entrega). PanResponder + Animated do
// núcleo do React Native — sem reanimated/gesture-handler (OTA, sem build nativo).
//
//   <DeslizarParaConfirmar rotulo="Deslize para aceitar" rotuloOk="Corrida aceita ✓"
//                          cor={T.ganho} ocupado={aceitando} onConfirmar={aceitar} />
//
// Regra: só dispara onConfirmar quando a bolinha chega ao fim; soltar antes volta ao
// início. Enquanto `ocupado`, mostra o spinner no lugar da seta e ignora o gesto.
import { useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet, ActivityIndicator, Vibration } from 'react-native';
import { T } from '../tema';

const BOLHA = 54, ALTURA = 66, FOLGA = 4;

export default function DeslizarParaConfirmar({ rotulo, rotuloOk, cor = T.ganho, corFundo = T.ganhoBg, corBorda = T.ganhoBd, ocupado = false, feito = false, onConfirmar, icone = '›' }) {
  const [largura, setLargura] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const maxRef = useRef(0);
  maxRef.current = Math.max(0, largura - BOLHA - FOLGA * 2);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !ocupado && !feito,
    onMoveShouldSetPanResponder: (_, g) => !ocupado && !feito && Math.abs(g.dx) > 4,
    onPanResponderMove: (_, g) => { x.setValue(Math.max(0, Math.min(maxRef.current, g.dx))); },
    onPanResponderRelease: (_, g) => {
      if (maxRef.current > 0 && g.dx >= maxRef.current - 8) {
        Animated.timing(x, { toValue: maxRef.current, duration: 80, useNativeDriver: false }).start();
        try { Vibration.vibrate(30); } catch {}
        onConfirmar && onConfirmar();
        // Volta ao início logo depois: se a tela validar e recusar (ex.: sem foto), o gesto
        // pode ser repetido; se der certo, a tela troca ou marca `feito` e a bolinha some.
        setTimeout(() => Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 2 }).start(), 600);
      } else {
        Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 4 }).start();
      }
    },
    onPanResponderTerminate: () => { Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(); },
  })).current;

  const opacidadeRotulo = x.interpolate({ inputRange: [0, Math.max(1, maxRef.current * 0.6)], outputRange: [1, 0], extrapolate: 'clamp' });
  const larguraCheio = Animated.add(x, BOLHA / 2 + FOLGA);

  return (
    <View onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
      style={[st.trilho, { backgroundColor: feito ? cor : corFundo, borderColor: feito ? cor : corBorda }]}>
      {!feito && <Animated.View style={[st.cheio, { backgroundColor: cor, width: larguraCheio }]} />}
      <Animated.View style={[st.rotuloBox, { opacity: feito ? 1 : opacidadeRotulo }]}>
        <Text style={[st.rotulo, { color: feito ? '#fff' : (cor === T.ganho ? T.ganhoEsc : cor) }]}>{feito ? rotuloOk : rotulo}</Text>
        {!feito && <Text style={[st.setas, { color: corBorda }]}>›››</Text>}
      </Animated.View>
      {!feito && (
        <Animated.View {...pan.panHandlers} style={[st.bolha, { backgroundColor: cor, transform: [{ translateX: x }] }]}>
          {ocupado ? <ActivityIndicator color="#fff" /> : <Text style={st.icone}>{icone === '›' ? '→' : icone}</Text>}
        </Animated.View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  trilho: { height: ALTURA, borderRadius: ALTURA / 2, borderWidth: 2, overflow: 'hidden', justifyContent: 'center' },
  cheio: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.14 },
  rotuloBox: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingLeft: 40 },
  rotulo: { fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  setas: { marginLeft: 8, fontSize: 18, fontWeight: '800', letterSpacing: -2 },
  bolha: { position: 'absolute', left: FOLGA, top: FOLGA, width: BOLHA, height: BOLHA, borderRadius: BOLHA / 2, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  icone: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: -2 },
});
