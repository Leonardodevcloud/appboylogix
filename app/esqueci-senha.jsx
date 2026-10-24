// Esqueci minha senha — app do entregador.
//
// Dois passos na mesma tela: (1) e-mail → a central manda um código de 6 dígitos;
// (2) código + senha nova. Código e não link: ele digita aqui mesmo, sem abrir navegador.
// O servidor responde igual exista ou não o e-mail (ninguém descobre quem tem conta), por
// isso a tela não diz "e-mail não encontrado" — diz para conferir a caixa de entrada.
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';
import { T } from '../src/tema';
import { Alerta } from '../src/utils/avisar';
import Icone from '../src/componentes/Icone';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SENHA_MIN = 6;
const emailValido = (v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(v || '').trim());

export default function EsqueciSenha() {
  const insetBaixo = useSafeAreaInsets().bottom;   // botões do Android no rodapé: o conteúdo fica acima deles
  const params = useLocalSearchParams();
  const [passo, setPasso] = useState('email');            // 'email' | 'codigo'
  const [email, setEmail] = useState(String(params.email || ''));
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  async function pedirCodigo() {
    setErro(''); setAviso('');
    if (!emailValido(email)) { setErro('Digite o e-mail da sua conta.'); return; }
    setEnviando(true);
    try {
      const r = await api.esqueciSenha(email.trim());
      setAviso(r.mensagem || 'Se o e-mail estiver cadastrado, enviamos um código.');
      setPasso('codigo');
    } catch (e) { setErro(e.message || 'Não foi possível enviar agora. Tente de novo.'); }
    setEnviando(false);
  }

  async function salvar() {
    setErro('');
    if (!/^\d{6}$/.test(codigo.trim())) { setErro('O código tem 6 números. Confira o e-mail.'); return; }
    if (senha.length < SENHA_MIN) { setErro(`A senha nova precisa ter pelo menos ${SENHA_MIN} caracteres.`); return; }
    if (senha !== repetir) { setErro('As duas senhas não são iguais.'); return; }
    setEnviando(true);
    try {
      await api.redefinirSenha(email.trim(), codigo.trim(), senha);
      Alerta.alert('Senha alterada', 'Pronto. Entre com o seu e-mail e a senha nova.', [
        { text: 'Entrar', onPress: () => router.replace('/') },
      ]);
    } catch (e) { setErro(e.message || 'Não foi possível salvar. Tente de novo.'); }
    setEnviando(false);
  }

  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      <View style={s.cab}>
        <TouchableOpacity style={s.voltar} onPress={() => router.back()} hitSlop={10} accessibilityLabel="Voltar">
          <Icone nome="voltar" tam={22} cor={'#fff'} traco={2.4} />
        </TouchableOpacity>
        <Text style={s.cabTitulo}>Criar nova senha</Text>
      </View>

      <ScrollView contentContainerStyle={[s.corpo, { paddingBottom: 40 + insetBaixo }]} keyboardShouldPersistTaps="handled">
        {passo === 'email' ? (
          <>
            <Text style={s.titulo}>Qual é o seu e-mail?</Text>
            <Text style={s.sub}>Mandamos um código de 6 números para você criar uma senha nova.</Text>
            <Text style={s.label}>E-mail</Text>
            <TextInput style={s.inp} value={email} onChangeText={setEmail} placeholder="seu@email.com" placeholderTextColor="#94A3B8"
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={pedirCodigo} />
            {!!erro && <Text style={s.erro}>{erro}</Text>}
            <TouchableOpacity style={[s.btn, enviando && s.btnOff]} onPress={pedirCodigo} disabled={enviando} activeOpacity={0.85}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTx}>Enviar código</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.titulo}>Digite o código</Text>
            {!!aviso && <Text style={s.aviso}>{aviso}</Text>}
            <Text style={s.sub}>{`Enviado para ${email.trim()}. Vale por 15 minutos.`}</Text>

            <Text style={s.label}>Código</Text>
            <TextInput style={[s.inp, s.inpCodigo]} value={codigo} onChangeText={(v) => setCodigo(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000" placeholderTextColor="#94A3B8" keyboardType="number-pad" maxLength={6}
              autoComplete="one-time-code" textContentType="oneTimeCode" accessibilityLabel="Código de 6 números" />

            <Text style={[s.label, { marginTop: 16 }]}>Senha nova</Text>
            <TextInput style={s.inp} value={senha} onChangeText={setSenha} placeholder={`Pelo menos ${SENHA_MIN} caracteres`}
              placeholderTextColor="#94A3B8" secureTextEntry autoComplete="password-new" />
            <Text style={[s.label, { marginTop: 16 }]}>Repita a senha nova</Text>
            <TextInput style={s.inp} value={repetir} onChangeText={setRepetir} placeholder="Digite de novo"
              placeholderTextColor="#94A3B8" secureTextEntry onSubmitEditing={salvar} />

            {!!erro && <Text style={s.erro}>{erro}</Text>}
            <TouchableOpacity style={[s.btn, enviando && s.btnOff]} onPress={salvar} disabled={enviando} activeOpacity={0.85}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTx}>Salvar senha nova</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.link} onPress={() => { setCodigo(''); setPasso('email'); }} disabled={enviando}>
              <Text style={s.linkTx}>Não chegou? Pedir outro código</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#fff' },
  cab: { backgroundColor: T.profundo, paddingTop: 46, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  voltar: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  voltarTx: { color: '#fff', fontSize: 20, lineHeight: 22, marginTop: -2 },
  cabTitulo: { color: '#fff', fontSize: 17, fontWeight: '800' },
  corpo: { padding: 24, paddingBottom: 40 },
  titulo: { fontSize: 21, fontWeight: '800', color: '#0F172A', marginBottom: 6 },
  sub: { fontSize: 13.5, color: '#64748B', lineHeight: 20, marginBottom: 20 },
  aviso: { fontSize: 13, color: T.ganhoEsc, backgroundColor: T.ganhoBg, borderRadius: 10, padding: 12, marginBottom: 10, lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '700', color: '#0F172A', marginBottom: 7 },
  inp: { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 15, color: '#0F172A', backgroundColor: '#F8FAFC' },
  inpCodigo: { fontSize: 24, fontWeight: '800', letterSpacing: 8, textAlign: 'center' },
  erro: { color: '#DC2626', fontSize: 13, fontWeight: '600', marginTop: 14, lineHeight: 19 },
  btn: { backgroundColor: T.primario, borderRadius: 14, padding: 15, marginTop: 20, alignItems: 'center' },
  btnOff: { opacity: 0.6 },
  btnTx: { color: '#fff', fontSize: 15, fontWeight: '700' },
  link: { marginTop: 16, alignItems: 'center', paddingVertical: 6 },
  linkTx: { color: T.primario, fontSize: 13.5, fontWeight: '700' },
});
