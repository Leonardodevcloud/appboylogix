import { Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Rede de segurança: se alguma tela lançar um erro de RENDER, mostramos uma
// tela amigável com "tentar de novo" em vez de o app fechar na cara do motoboy.
//
// OBS.: isto NÃO captura crash NATIVO (ex.: falta de memória ao processar foto)
// — esse tipo derruba o processo por baixo do JS. O tratamento desse caso é a
// redução de memória no fluxo da foto (concluir.jsx). Aqui cobrimos os erros de
// JavaScript, que antes viravam "app fechou sozinho" sem explicação.
export default class ErroBoundary extends Component {
  constructor(props) { super(props); this.state = { erro: null }; }

  static getDerivedStateFromError(erro) { return { erro }; }

  componentDidCatch(erro, info) {
    // Deixa um rastro no log (visível no logcat / EAS) para diagnóstico.
    try { console.log('[ERRO_BOUNDARY]', erro?.message, info?.componentStack); } catch {}
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <View style={st.root}>
        <Text style={st.ico}>😕</Text>
        <Text style={st.tit}>Algo deu errado</Text>
        <Text style={st.sub}>Tivemos um problema ao mostrar esta tela. Toque para tentar de novo.</Text>
        <TouchableOpacity style={st.btn} activeOpacity={0.85} onPress={() => this.setState({ erro: null })}>
          <Text style={st.btnTxt}>Tentar de novo</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef4fb', alignItems: 'center', justifyContent: 'center', padding: 30 },
  ico: { fontSize: 46, marginBottom: 12 },
  tit: { fontSize: 18, fontWeight: '800', color: '#0e2138' },
  sub: { fontSize: 13, color: '#46637f', textAlign: 'center', lineHeight: 19, marginTop: 8, marginBottom: 22 },
  btn: { backgroundColor: '#185FA5', borderRadius: 13, paddingVertical: 14, paddingHorizontal: 28 },
  btnTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
