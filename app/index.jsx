import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { api, EMPRESA_NOME } from '../src/api';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [senha, setSenha]       = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando]     = useState(false);
  const [erro, setErro]             = useState('');

  useEffect(() => {
    api.isLogado().then(ok => { if (ok) router.replace('/home'); else setCarregando(false); }).catch(e => { console.log('[LOGIN] isLogado erro:', e?.message); setCarregando(false); });
  }, []);

  async function entrar() {
    setErro('');
    if (!email.trim() || !senha.trim()) { setErro('Preencha e-mail e senha'); return; }
    setEnviando(true);
    try { await api.loginEmail(email.trim(), senha); router.replace('/home'); }
    catch (e) { setErro(e.message); }
    setEnviando(false);
  }

  if (carregando) return (
    <View style={s.splash}>
      <Image source={require('../assets/marca/logo.png')} style={s.logoImg} resizeMode="contain" />
      <ActivityIndicator color="#378ADD" size="large" style={{ marginTop: 24 }} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Marca da empresa (white-label) */}
        <View style={s.hero}>
          <Image source={require('../assets/marca/logo.png')} style={s.logoImg} resizeMode="contain" />
          <Text style={s.empresaNome}>{EMPRESA_NOME}</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          <Text style={s.formTitle}>Entrar</Text>
          <Text style={s.formSub}>Acesse com seu e-mail e senha.</Text>

          <Text style={s.label}>E-mail</Text>
          <TextInput
            style={s.inp}
            placeholder="seu@email.com"
            placeholderTextColor="#94A3B8"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <Text style={[s.label, { marginTop: 16 }]}>Senha</Text>
          <TextInput
            style={s.inp}
            placeholder="Sua senha"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
            onSubmitEditing={entrar}
          />

          {!!erro && (
            <View style={s.erroBox}>
              <Text style={s.erroTxt}>{erro}</Text>
            </View>
          )}

          <TouchableOpacity style={[s.btn, enviando && s.btnDisabled]} onPress={entrar} disabled={enviando} activeOpacity={0.85}>
            {enviando
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnTxt}>Entrar</Text>}
          </TouchableOpacity>

          <View style={s.divisor}>
            <View style={s.divisorLinha} /><Text style={s.divisorTxt}>ou</Text><View style={s.divisorLinha} />
          </View>

          <TouchableOpacity style={s.btnCadastro} onPress={() => router.push('/cadastro')} activeOpacity={0.85}>
            <Text style={s.btnCadastroTxt}>Criar uma conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const NAV = '#042C53';
const AZUL = '#185FA5';
const AZUL_VIVO = '#378ADD';

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: NAV },
  splash:     { flex: 1, backgroundColor: NAV, justifyContent: 'center', alignItems: 'center' },
  scroll:     { flexGrow: 1 },
  hero:       { backgroundColor: NAV, padding: 32, paddingTop: 72, paddingBottom: 44, alignItems: 'center' },
  logoBox:    { width: 72, height: 72, borderRadius: 20, backgroundColor: AZUL, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  logoImg:    { width: 96, height: 96, marginBottom: 16 },
  logoTxt:    { color: '#E6F1FB', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  empresaNome:{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center' },
  form:       { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingTop: 32 },
  formTitle:  { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4, marginBottom: 6 },
  formSub:    { fontSize: 13.5, color: '#64748B', marginBottom: 24, lineHeight: 20 },
  label:      { fontSize: 12, fontWeight: '700', color: '#0F172A', marginBottom: 7 },
  inp:        { borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, fontSize: 15, color: '#0F172A', backgroundColor: '#F8FAFC' },
  erroBox:    { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 14, borderWidth: 1, borderColor: '#FECACA' },
  erroTxt:    { color: '#DC2626', fontSize: 13, fontWeight: '500', textAlign: 'center' },
  btn:        { backgroundColor: AZUL, borderRadius: 14, padding: 15, marginTop: 20, alignItems: 'center' },
  btnDisabled:{ opacity: 0.6 },
  btnTxt:     { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  divisor:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
  divisorLinha: { flex: 1, height: 1, backgroundColor: '#dde9f5' },
  divisorTxt: { color: '#8ba5bc', fontSize: 12, fontWeight: '600' },
  btnCadastro: { borderWidth: 1.5, borderColor: '#185FA5', paddingVertical: 14, borderRadius: 13, alignItems: 'center' },
  btnCadastroTxt: { color: '#185FA5', fontSize: 15, fontWeight: '800' },
});
