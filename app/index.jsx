import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';

export default function Login() {
  const [telefone, setTelefone] = useState('');
  const [pin, setPin]           = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando]     = useState(false);
  const [erro, setErro]             = useState('');

  useEffect(() => {
    api.isLogado().then(ok => { if (ok) router.replace('/home'); else setCarregando(false); });
  }, []);

  async function entrar() {
    if (!telefone.trim() || !pin.trim()) { setErro('Preencha telefone e PIN'); return; }
    setEnviando(true); setErro('');
    try {
      await api.login(telefone.replace(/\D/g, ''), pin);
      router.replace('/home');
    } catch (e) { setErro(e.message); }
    setEnviando(false);
  }

  if (carregando) return (
    <View style={s.splash}>
      <View style={s.logoBox}><Text style={s.logoTxt}>LX</Text></View>
      <ActivityIndicator color="#378ADD" size="large" style={{ marginTop: 24 }} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroLines}>
            <View style={[s.line, { width: 78 }]} />
            <View style={[s.line, { width: 120 }]} />
            <View style={[s.line, { width: 54 }]} />
          </View>
          <View style={s.logoBox}><Text style={s.logoTxt}>LX</Text></View>
          <Text style={s.heroTitle}>Sua entrega,{'\n'}na velocidade certa.</Text>
          <Text style={s.heroSub}>Plataforma de gestão de entregas com rastreamento em tempo real.</Text>
          <View style={s.heroFeats}>
            <View style={s.feat}><View style={s.featDot} /><Text style={s.featTxt}>GPS em tempo real</Text></View>
            <View style={s.feat}><View style={s.featDot} /><Text style={s.featTxt}>Protocolos digitais</Text></View>
          </View>
        </View>

        {/* Form */}
        <View style={s.form}>
          <Text style={s.formTitle}>Entrar no app</Text>
          <Text style={s.formSub}>Use seu telefone e PIN fornecido pelo operador</Text>

          <Text style={s.label}>Telefone</Text>
          <TextInput
            style={s.inp}
            placeholder="(71) 99999-9999"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={telefone}
            onChangeText={setTelefone}
            autoFocus
          />

          <Text style={[s.label, { marginTop: 16 }]}>PIN</Text>
          <TextInput
            style={[s.inp, { letterSpacing: 10, textAlign: 'center', fontSize: 20 }]}
            placeholder="• • • • • •"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            keyboardType="numeric"
            maxLength={8}
            value={pin}
            onChangeText={setPin}
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
              : <Text style={s.btnTxt}>Entrar na plataforma</Text>}
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
  hero:       { backgroundColor: NAV, padding: 32, paddingTop: 64, paddingBottom: 40, position: 'relative', overflow: 'hidden' },
  heroLines:  { position: 'absolute', top: 52, right: 32, alignItems: 'flex-end', gap: 7 },
  line:       { height: 3, borderRadius: 2, backgroundColor: AZUL_VIVO, opacity: 0.5 },
  logoBox:    { width: 52, height: 52, borderRadius: 14, backgroundColor: AZUL, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  logoTxt:    { color: '#E6F1FB', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  heroTitle:  { color: '#fff', fontSize: 28, fontWeight: '800', lineHeight: 34, letterSpacing: -0.5, marginBottom: 12 },
  heroSub:    { color: '#B5D4F4', fontSize: 14, lineHeight: 22, fontWeight: '500', marginBottom: 20 },
  heroFeats:  { flexDirection: 'row', gap: 20 },
  feat:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featDot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: AZUL_VIVO },
  featTxt:    { color: '#B5D4F4', fontSize: 12, fontWeight: '600' },
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
});
