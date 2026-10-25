import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { irPara } from '../navegacao/abas';
import { assinarBanner } from '../state/banner';
import { T } from '../tema';
import Icone from './Icone';

// Aviso da central NO CENTRO DA TELA (aprovado em 24/10/2026). Substitui o banner que descia
// por cima da tela aberta — com uma tela por cima da outra ficava confuso. Mesmo tempo de
// antes (DURACAO): some sozinho, com a barra embaixo mostrando o tempo; o entregador pode
// tocar em OK para dar ciência na hora, ou na ação ("Abrir", "Ver histórico"…) quando houver.
// Avisos que chegam juntos entram numa fila e aparecem um depois do outro, nunca empilhados.
// API inalterada: qualquer parte do app chama mostrarBanner({ tipo, titulo, sub, motivo?, rota?, acao? }).
const TIPOS = {
  oferta:     { ico: 'moto', cor: T.vivo },
  atribuida:  { ico: 'caixa', cor: '#1f9d6b' },
  editada:    { ico: 'editar', cor: '#C98A1A' },
  removida:   { ico: 'desfazer', cor: '#D0584F' },
  cancelada:  { ico: 'fechar', cor: '#D0584F' },
  finalizada: { ico: 'check', cor: '#1f9d6b' },
  ponto:      { ico: 'check', cor: '#6B4FC9' },
  dinheiro:   { ico: 'dinheiro', cor: T.ganho },
  recusa:     { ico: 'alerta', cor: T.alerta },
  default:    { ico: 'sino', cor: T.primario },
};
const DURACAO = 4200;      // ms na tela (o mesmo tempo do banner antigo)
const COM_MOTIVO = 6500;   // cancelamento com motivo: um pouco mais, para dar tempo de ler

export default function BannerHost() {
  const [cfg, setCfg] = useState(null);
  const fila = useRef([]);
  const aberto = useRef(false);
  const escala = useRef(new Animated.Value(0.92)).current;
  const opac = useRef(new Animated.Value(0)).current;
  const prog = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  useEffect(() => assinarBanner((c) => {
    fila.current.push(c);
    if (!aberto.current) proximo();
  }), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  function proximo() {
    const c = fila.current.shift();
    if (!c) { aberto.current = false; setCfg(null); return; }
    aberto.current = true;
    const dur = c.motivo ? COM_MOTIVO : DURACAO;
    setCfg(c);
    escala.setValue(0.92); opac.setValue(0); prog.setValue(0);
    Animated.parallel([
      Animated.timing(opac, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(escala, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.timing(prog, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: false }).start();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fechar(), dur);
  }

  function fechar(depois) {
    clearTimeout(timer.current);
    prog.stopAnimation();
    Animated.timing(opac, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      if (depois) try { depois(); } catch {}
      proximo();
    });
  }

  if (!cfg) return null;
  const t = TIPOS[cfg.tipo] || TIPOS.default;
  const largura = prog.interpolate({ inputRange: [0, 1], outputRange: ['100%', '0%'] });
  const temAcao = !!cfg.rota;

  return (
    <Animated.View style={[st.scrim, { opacity: opac }]} accessibilityViewIsModal accessibilityLiveRegion="assertive">
      <Pressable style={StyleSheet.absoluteFill} onPress={() => fechar()} accessibilityLabel="Fechar aviso" />
      <Animated.View style={[st.card, { transform: [{ scale: escala }] }]}>
        <View style={[st.ico, { backgroundColor: t.cor }]}><Icone nome={t.ico} tam={26} cor="#fff" traco={2.4} /></View>
        <Text style={st.tt}>{cfg.titulo}</Text>
        {!!cfg.sub && <Text style={st.sub}>{cfg.sub}</Text>}
        {!!cfg.motivo && (
          <View style={st.motivo}><Text style={st.motivoRot}>Motivo</Text><Text style={st.motivoTx}>{cfg.motivo}</Text></View>
        )}
        <View style={st.bts}>
          <TouchableOpacity style={[st.bt, !temAcao && st.btPri]} activeOpacity={0.85} onPress={() => fechar()} accessibilityRole="button">
            <Text style={[st.btTx, !temAcao && st.btTxPri]}>OK</Text>
          </TouchableOpacity>
          {temAcao && (
            <TouchableOpacity style={[st.bt, st.btPri]} activeOpacity={0.85} accessibilityRole="button"
              onPress={() => { const r = cfg.rota; fechar(() => irPara(r)); }}>
              <Text style={[st.btTx, st.btTxPri]}>{cfg.acao || 'Abrir'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={st.tempo}>fecha sozinho</Text>
        <Animated.View style={[st.barra, { backgroundColor: t.cor, width: largura }]} />
      </Animated.View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(4,20,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22, zIndex: 9999, elevation: 9999 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 22, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 14, alignItems: 'center', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.25, shadowRadius: 24, elevation: 16 },
  ico: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  tt: { fontSize: 17, fontWeight: '900', color: T.tinta, textAlign: 'center' },
  sub: { fontSize: 13.5, color: T.tinta2, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  motivo: { alignSelf: 'stretch', backgroundColor: T.suave, borderRadius: 12, padding: 10, marginTop: 12 },
  motivoRot: { fontSize: 10.5, fontWeight: '800', color: T.tinta3, textTransform: 'uppercase', letterSpacing: 0.4 },
  motivoTx: { fontSize: 13, color: T.tinta, marginTop: 2, fontWeight: '600' },
  bts: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
  bt: { flex: 1, borderRadius: 13, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: T.linha, backgroundColor: '#fff' },
  btPri: { backgroundColor: T.primario, borderColor: T.primario },
  btTx: { fontSize: 14.5, fontWeight: '800', color: T.primario },
  btTxPri: { color: '#fff' },
  tempo: { fontSize: 11, color: T.tinta3, marginTop: 10 },
  barra: { position: 'absolute', left: 0, bottom: 0, height: 4 },
});
