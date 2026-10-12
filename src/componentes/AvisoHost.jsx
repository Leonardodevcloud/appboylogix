import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Easing, Pressable, ScrollView,
} from 'react-native';
import { assinarAviso, responderAviso } from '../utils/aviso';
import { T } from '../tema';
import Icone from './Icone';

// Paleta do app (mesma da home/perfil).
const C = {
  navy900: T.profundo, azulP: T.primario, azulV: T.vivo, azulC: T.claro,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5', erro: '#c9352b', ok: '#1f9d6b', okEsc: '#0f6e56', atencao: '#c98a1a',
};

// Ícone por tom (ícone de traço, igual ao painel — o app não usa emoji).
const TONS = {
  info:    { fundo: C.azulP,   icone: 'info' },
  ok:      { fundo: C.ok,      icone: 'check' },
  atencao: { fundo: C.atencao, icone: 'alerta' },
  perigo:  { fundo: C.erro,    icone: 'fechar' },
};

// Modal "folha inferior" (bottom sheet) nativo do app — substitui o Alert do sistema.
//
// Config (todos opcionais, menos titulo):
//   tom: 'info' | 'ok' | 'atencao' | 'perigo'   → cor e símbolo do ícone
//   icone: nome de um ícone de src/componentes/Icone (ex.: 'pin')
//   titulo, sub, chip, lead
//   linhas: [{ rot, val, cor: 'ok'|'perigo'|null, forte }]   → caixa de conta
//   itens:  [{ ico, txt }], destaque, destaqueIco            → ico/destaqueIco = nome do ícone
//   botoes: [{ chave, texto, estilo: 'primario'|'perigo'|'ok'|'secundario'|'ghost' }]
//   botaoPrimario, botaoGhost                                → legado (2 botões)
//   fecharPorFora (padrão true), chaveFechar (o que "tocar fora/voltar" responde)
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
  const chaveFora = cfg.chaveFechar || (cfg.botaoGhost ? 'ghost' : 'fechar');
  const tom = TONS[cfg.tom] || (cfg.icone ? null : TONS.info);
  const botoes = Array.isArray(cfg.botoes) && cfg.botoes.length
    ? cfg.botoes
    : [{ chave: 'primario', texto: cfg.botaoPrimario || 'OK', estilo: 'primario' },
      ...(cfg.botaoGhost ? [{ chave: 'ghost', texto: cfg.botaoGhost, estilo: 'ghost' }] : [])];

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent
      onRequestClose={() => fechar(chaveFora)}>
      <View style={st.dim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => podeFecharFora && fechar(chaveFora)} />
        <Animated.View style={[st.sheet, { transform: [{ translateY }] }]}>
          <View style={st.grip} />
          <ScrollView bounces={false} style={{ maxHeight: 520 }}>
            <View style={st.titrow}>
              {tom ? (
                <View style={[st.badge, { backgroundColor: tom.fundo, shadowColor: tom.fundo }]}><Icone nome={tom.icone} tam={26} cor="#fff" traco={2.4} /></View>
              ) : !!cfg.icone && (
                <View style={st.badge}><Icone nome={cfg.icone} tam={26} cor="#fff" /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={st.ttl}>{cfg.titulo}</Text>
                {!!cfg.sub && <Text style={[st.sub, cfg.tom === 'ok' && { color: C.okEsc }]}>{cfg.sub}</Text>}
                {!!cfg.chip && (
                  <View style={st.chip}>
                    <View style={st.chipDot} />
                    <Text style={st.chipTxt}>{cfg.chip}</Text>
                  </View>
                )}
              </View>
            </View>

            {Array.isArray(cfg.linhas) && cfg.linhas.length > 0 && (
              <View style={st.conta}>
                {cfg.linhas.map((l, i) => (
                  <View key={i} style={[st.contaLinha, l.forte && st.contaForte]}>
                    <Text style={[st.contaRot, l.forte && { color: C.tinta, fontWeight: '800' }]}>{l.rot}</Text>
                    <Text style={[st.contaVal, l.cor === 'ok' && { color: C.okEsc }, l.cor === 'perigo' && { color: C.erro }, l.forte && { fontSize: 15 }]}>{l.val}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!cfg.lead && <Text style={st.lead}>{cfg.lead}</Text>}

            {Array.isArray(cfg.itens) && cfg.itens.length > 0 && (
              <View style={st.rows}>
                {cfg.itens.map((it, i) => (
                  <View key={i} style={st.row}>
                    <View style={st.rico}><Icone nome={it.ico} tam={16} cor={C.azulP} /></View>
                    <Text style={st.rtx}>{it.txt}</Text>
                  </View>
                ))}
              </View>
            )}

            {!!cfg.destaque && (
              <View style={st.hi}>
                {!!cfg.destaqueIco && <Icone nome={cfg.destaqueIco} tam={15} cor="#1f4b78" style={{ marginTop: 1 }} />}
                <Text style={st.hiTxt}>{cfg.destaque}</Text>
              </View>
            )}
          </ScrollView>

          <View style={st.acts}>
            {botoes.map((b, i) => {
              const est = b.estilo || (i === 0 ? 'primario' : 'ghost');
              const chave = b.chave || (i === 0 ? 'primario' : 'ghost');
              if (est === 'ghost') {
                return (
                  <TouchableOpacity key={chave} style={st.ghost} activeOpacity={0.7} onPress={() => fechar(chave)} accessibilityRole="button">
                    <Text style={st.ghostTxt}>{b.texto}</Text>
                  </TouchableOpacity>
                );
              }
              const fundo = est === 'perigo' ? st.perigo : est === 'ok' ? st.okBtn : est === 'secundario' ? st.secundario : st.primary;
              return (
                <TouchableOpacity key={chave} style={[st.btn, fundo]} activeOpacity={0.85} onPress={() => fechar(chave)} accessibilityRole="button">
                  <Text style={est === 'secundario' ? st.secundarioTxt : st.primaryTxt}>{b.texto}</Text>
                </TouchableOpacity>
              );
            })}
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
  ttl: { fontSize: 17, fontWeight: '800', color: C.tinta, lineHeight: 22 },
  sub: { fontSize: 12, fontWeight: '700', color: C.tinta2, marginTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: '#eaf1f9', borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10, marginTop: 6 },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.azulP },
  chipTxt: { color: C.azulP, fontSize: 10.5, fontWeight: '800' },

  conta: { marginTop: 14, backgroundColor: '#eef4fb', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 8 },
  contaLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 10 },
  contaForte: { borderTopWidth: 1, borderTopColor: C.linha, marginTop: 4, paddingTop: 9 },
  contaRot: { fontSize: 13, color: C.tinta2, flexShrink: 1 },
  contaVal: { fontSize: 13.5, fontWeight: '800', color: C.tinta },

  lead: { fontSize: 13, color: C.tinta2, lineHeight: 19, marginTop: 14 },

  rows: { marginTop: 14, gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  rico: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, alignItems: 'center', justifyContent: 'center' },
  rtx: { flex: 1, fontSize: 12.5, color: C.tinta, fontWeight: '600', lineHeight: 17 },

  hi: { marginTop: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: '#eef6ff', borderWidth: 1, borderColor: '#cfe3fb', borderRadius: 12, padding: 11 },
  hiTxt: { flex: 1, fontSize: 11.8, color: '#1f4b78', lineHeight: 17 },

  acts: { marginTop: 20, gap: 8 },
  btn: { borderRadius: 13, padding: 15, alignItems: 'center' },
  primary: { backgroundColor: C.azulP, shadowColor: C.azulP, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.26, shadowRadius: 12, elevation: 4 },
  perigo: { backgroundColor: C.erro },
  okBtn: { backgroundColor: C.ok },
  secundario: { backgroundColor: C.sup, borderWidth: 1.5, borderColor: C.azulP },
  primaryTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  secundarioTxt: { color: C.azulP, fontSize: 14.5, fontWeight: '800' },
  ghost: { padding: 11, alignItems: 'center' },
  ghostTxt: { color: C.tinta3, fontSize: 13.5, fontWeight: '700' },
});
