import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, StatusBar, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', navy800: '#0a3a66', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5', ok: '#1f9d6b',
};

function Campo({ label, ...props }) {
  return (
    <View style={{ marginBottom: 13 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={st.input} placeholderTextColor={C.tinta3} {...props} />
    </View>
  );
}
function Segmento({ opcoes, valor, onEscolher }) {
  return (
    <View style={st.seg}>
      {opcoes.map(([v, rot]) => {
        const on = valor === v;
        return (
          <TouchableOpacity key={v} activeOpacity={0.8} onPress={() => onEscolher(v)} style={[st.segItem, on && st.segItemOn]}>
            <Text style={[st.segTxt, on && st.segTxtOn]}>{rot}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function DadosBancarios() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({
    pix_tipo: 'cpf', pix_chave: '', titular_nome: '', titular_doc: '',
    banco_codigo: '', banco_nome: '', agencia: '', conta: '', conta_tipo: 'corrente',
    nome_completo: '', cpf: '',
  });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  useEffect(() => {
    api.perfil().then(p => {
      setF(s => ({
        ...s,
        pix_tipo: p.pix_tipo || 'cpf', pix_chave: p.pix_chave || '',
        titular_nome: p.titular_nome || '', titular_doc: p.titular_doc || '',
        banco_codigo: p.banco_codigo || '', banco_nome: p.banco_nome || '',
        agencia: p.agencia || '', conta: p.conta || '', conta_tipo: p.conta_tipo || 'corrente',
        nome_completo: p.nome_completo || '', cpf: p.cpf || '',
      }));
      setCarregando(false);
    }).catch(() => setCarregando(false));
  }, []);

  async function salvar() {
    setSalvando(true);
    try {
      await api.atualizarMeusDados({
        pix_tipo: f.pix_tipo, pix_chave: f.pix_chave, titular_nome: f.titular_nome, titular_doc: f.titular_doc,
        banco_codigo: f.banco_codigo, banco_nome: f.banco_nome, agencia: f.agencia, conta: f.conta, conta_tipo: f.conta_tipo,
      });
      Alert.alert('Pronto', 'Dados bancários atualizados. A central foi avisada.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) { Alert.alert('Erro', e?.message || 'Não foi possível salvar.'); }
    setSalvando(false);
  }

  if (carregando) return (
    <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>
  );

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={st.bk}>←</Text></TouchableOpacity>
        <Text style={st.htitle}>Dados bancários</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <Text style={st.secSub}>É a conta que a central usa para pagar seus repasses. Ao salvar, a central é avisada.</Text>

          <Text style={st.label}>Tipo de chave Pix</Text>
          <Segmento opcoes={[['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['email', 'E-mail'], ['telefone', 'Telefone'], ['aleatoria', 'Aleatória']]} valor={f.pix_tipo} onEscolher={v => set('pix_tipo', v)} />
          <View style={{ height: 12 }} />
          <Campo label="Chave Pix" value={f.pix_chave} onChangeText={t => set('pix_chave', t)} autoCapitalize="none" />

          <TouchableOpacity style={st.chkline} activeOpacity={0.8} onPress={() => setF(s => ({ ...s, titular_nome: s.nome_completo || s.titular_nome, titular_doc: s.cpf || s.titular_doc }))}>
            <View style={st.chk}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✓</Text></View>
            <Text style={st.chkTxt}>A conta é minha (usar meu nome e CPF)</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1.4 }}><Campo label="Titular da conta" value={f.titular_nome} onChangeText={t => set('titular_nome', t)} /></View>
            <View style={{ flex: 1 }}><Campo label="CPF/CNPJ do titular" value={f.titular_doc} onChangeText={t => set('titular_doc', t)} keyboardType="numeric" /></View>
          </View>

          <View style={st.divisor}><View style={st.divLinha} /><Text style={st.divTxt}>Dados bancários — opcional (TED)</Text><View style={st.divLinha} /></View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Campo label="Banco (código)" value={f.banco_codigo} onChangeText={t => set('banco_codigo', t)} keyboardType="numeric" placeholder="260" /></View>
            <View style={{ flex: 2 }}><Campo label="Nome do banco" value={f.banco_nome} onChangeText={t => set('banco_nome', t)} placeholder="Nubank" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Campo label="Agência" value={f.agencia} onChangeText={t => set('agencia', t)} keyboardType="numeric" /></View>
            <View style={{ flex: 1.4 }}><Campo label="Conta c/ dígito" value={f.conta} onChangeText={t => set('conta', t)} keyboardType="numeric" placeholder="00000-0" /></View>
          </View>
          <Text style={st.label}>Tipo de conta</Text>
          <Segmento opcoes={[['corrente', 'Corrente'], ['poupanca', 'Poupança']]} valor={f.conta_tipo} onEscolher={v => set('conta_tipo', v)} />
        </ScrollView>

        <View style={st.footer}>
          <TouchableOpacity style={[st.btnP, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando} activeOpacity={0.85}>
            {salvando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPTxt}>Salvar</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bk: { fontSize: 22, color: '#fff', width: 26 },
  htitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  secSub: { fontSize: 12.5, color: C.tinta2, marginBottom: 16, lineHeight: 18 },
  label: { fontSize: 12.5, fontWeight: '700', color: C.tinta2, marginBottom: 6 },
  input: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.tinta },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  segItem: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 9, borderWidth: 1, borderColor: C.linha, backgroundColor: C.sup },
  segItemOn: { borderColor: C.azulV, backgroundColor: '#eaf3fc' },
  segTxt: { fontSize: 12.5, fontWeight: '700', color: C.tinta2 },
  segTxtOn: { color: C.azulP },
  chkline: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, borderRadius: 11, padding: 11, marginBottom: 14 },
  chk: { width: 20, height: 20, borderRadius: 6, backgroundColor: C.azulP, alignItems: 'center', justifyContent: 'center' },
  chkTxt: { flex: 1, fontSize: 12, color: C.tinta, fontWeight: '600' },
  divisor: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 10 },
  divLinha: { flex: 1, height: 1, backgroundColor: C.linha },
  divTxt: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: C.tinta3 },
  footer: { padding: 16, paddingBottom: 30, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha },
  btnP: { backgroundColor: C.azulP, paddingVertical: 15, borderRadius: 13, alignItems: 'center' },
  btnPTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
});
