import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, StatusBar, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', aten: '#C98A1A', atenBg: '#FBF1DD', info: '#185FA5', infoBg: '#e4eef9',
};

const DOCS = [
  { tipo: 'selfie', rotulo: 'Selfie', ico: '🤳', soCamera: true },
  { tipo: 'habilitacao', rotulo: 'Habilitação (CNH)', ico: '📄' },
  { tipo: 'comprovante_endereco', rotulo: 'Comprovante de endereço', ico: '📄' },
  { tipo: 'antecedentes', rotulo: 'Antecedentes criminais', ico: '📄' },
];

function fmtTel(t) {
  if (!t) return '—';
  const n = String(t).replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t;
}
function fmtCpf(c) {
  const n = String(c || '').replace(/\D/g, '');
  if (n.length !== 11) return c || '—';
  return `•••.•••.${n.slice(6, 9)}-${n.slice(9)}`;
}
function fmtData(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
const DOC_ST = {
  aprovado: { txt: 'aprovado', s: [C.okBg, '#0f6e56'] },
  enviado: { txt: 'enviado', s: [C.infoBg, C.info] },
  pendente: { txt: 'pendente', s: [C.atenBg, C.aten] },
};

function Campo({ label, ...props }) {
  return (
    <View style={{ marginBottom: 11 }}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={st.input} placeholderTextColor={C.tinta3} {...props} />
    </View>
  );
}

export default function MeusDados() {
  const [p, setP] = useState(null);
  const [docs, setDocs] = useState({});     // tipo -> status
  const [editPessoal, setEditPessoal] = useState(false);
  const [editEndereco, setEditEndereco] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviandoDoc, setEnviandoDoc] = useState(null);
  const [f, setF] = useState({});
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const carregar = useCallback(async () => {
    try {
      const perfil = await api.perfil();
      setP(perfil);
      setF({
        telefone_principal: perfil.telefone_principal || '', telefone_emergencia: perfil.telefone_emergencia || '',
        cep: perfil.cep || '', logradouro: perfil.logradouro || '', numero: perfil.numero || '',
        complemento: perfil.complemento || '', bairro: perfil.bairro || '', cidade: perfil.cidade || '', estado: perfil.estado || '',
      });
    } catch (e) { if (e?.status === 401) { await api.logout(); router.replace('/'); } }
    try { const mc = await api.meuCadastro(); const map = {}; (mc.documentos || []).forEach(d => { map[d.tipo] = d.status; }); setDocs(map); } catch {}
  }, []);

  useEffect(() => { carregar(); }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function salvarPessoal() {
    setSalvando(true);
    const payload = { telefone_principal: f.telefone_principal, telefone_emergencia: f.telefone_emergencia };
    try { await api.atualizarMeusDados(payload); setEditPessoal(false); await carregar(); }
    catch (e) {
      const conexao = /sem conex|network|tempo|timeout/i.test(e?.message || '') || e?.status >= 500;
      if (conexao) {
        try { const p = await api.perfil(); if ((p.telefone_principal || '').replace(/\D/g, '') === (payload.telefone_principal || '').replace(/\D/g, '')) { setEditPessoal(false); await carregar(); setSalvando(false); return; } } catch {}
        Alert.alert('Conexão instável', 'Não deu pra confirmar agora. Toque em "Salvar" de novo — é seguro.');
      } else Alert.alert('Erro', e?.message || 'Não foi possível salvar.');
    }
    setSalvando(false);
  }
  async function salvarEndereco() {
    setSalvando(true);
    const payload = { cep: f.cep, logradouro: f.logradouro, numero: f.numero, complemento: f.complemento, bairro: f.bairro, cidade: f.cidade, estado: f.estado };
    try { await api.atualizarMeusDados(payload); setEditEndereco(false); await carregar(); }
    catch (e) {
      const conexao = /sem conex|network|tempo|timeout/i.test(e?.message || '') || e?.status >= 500;
      if (conexao) {
        try { const p = await api.perfil(); if ((p.cidade || '') === (payload.cidade || '') && (p.logradouro || '') === (payload.logradouro || '')) { setEditEndereco(false); await carregar(); setSalvando(false); return; } } catch {}
        Alert.alert('Conexão instável', 'Não deu pra confirmar agora. Toque em "Salvar" de novo — é seguro.');
      } else Alert.alert('Erro', e?.message || 'Não foi possível salvar.');
    }
    setSalvando(false);
  }

  async function enviarDoc(d) {
    try {
      let res;
      if (d.soCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permissão', 'Autorize a câmera para enviar a selfie.'); return; }
        res = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, cameraType: ImagePicker.CameraType?.front });
      } else {
        res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 });
      }
      if (res.canceled || !res.assets?.[0]) return;
      setEnviandoDoc(d.tipo);
      const img = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1280 } }], { compress: 0.6, base64: true, format: ImageManipulator.SaveFormat.JPEG });
      await api.enviarDocumento(d.tipo, `data:image/jpeg;base64,${img.base64}`);
      await carregar();
      Alert.alert('Enviado', 'Documento enviado. A central vai revisar.');
    } catch (e) { Alert.alert('Erro', e?.message || 'Não foi possível enviar o documento.'); }
    setEnviandoDoc(null);
  }

  if (!p) return (
    <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>
  );

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={st.bk}>←</Text></TouchableOpacity>
        <Text style={st.htitle}>Meus dados</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

          {/* Dados pessoais */}
          <View style={st.grpHd}><Text style={st.grpTt}>👤  Dados pessoais</Text></View>
          <View style={st.box}>
            <Linha rot="Nome" val={p.nome_completo} lock />
            <Linha rot="CPF" val={fmtCpf(p.cpf)} lock />
            <Linha rot="Nascimento" val={fmtData(p.data_nascimento)} lock />
            {!editPessoal ? (
              <>
                <Linha rot="Telefone" val={fmtTel(p.telefone_principal)} />
                <Linha rot="Emergência" val={fmtTel(p.telefone_emergencia)} ultimo />
              </>
            ) : (
              <View style={{ paddingTop: 6 }}>
                <Campo label="Telefone (WhatsApp)" value={f.telefone_principal} onChangeText={t => set('telefone_principal', t)} keyboardType="phone-pad" />
                <Campo label="Telefone de emergência" value={f.telefone_emergencia} onChangeText={t => set('telefone_emergencia', t)} keyboardType="phone-pad" />
              </View>
            )}
          </View>
          <Text style={st.lockNota}>🔒 Nome, CPF e nascimento só a central altera.</Text>
          {!editPessoal
            ? <TouchableOpacity style={st.editaBtn} onPress={() => setEditPessoal(true)}><Text style={st.editaTxt}>Editar telefones</Text></TouchableOpacity>
            : <View style={st.edRow}>
                <TouchableOpacity style={[st.editaBtn, st.editaSec]} onPress={() => { setEditPessoal(false); carregar(); }}><Text style={[st.editaTxt, { color: C.tinta2 }]}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[st.editaBtn, st.editaPri, salvando && { opacity: 0.6 }]} onPress={salvarPessoal} disabled={salvando}>{salvando ? <ActivityIndicator color="#fff" /> : <Text style={[st.editaTxt, { color: '#fff' }]}>Salvar</Text>}</TouchableOpacity>
              </View>}

          {/* Endereço */}
          <View style={st.grpHd}><Text style={st.grpTt}>📍  Endereço</Text></View>
          <View style={st.box}>
            {!editEndereco ? (
              <>
                <Linha rot="CEP" val={p.cep || '—'} />
                <Linha rot="Endereço" val={[p.logradouro, p.numero].filter(Boolean).join(', ') || '—'} />
                <Linha rot="Bairro" val={p.bairro || '—'} />
                <Linha rot="Cidade" val={[p.cidade, p.estado].filter(Boolean).join(' · ') || '—'} ultimo />
              </>
            ) : (
              <View style={{ paddingTop: 6 }}>
                <Campo label="CEP" value={f.cep} onChangeText={t => set('cep', t)} keyboardType="numeric" />
                <Campo label="Logradouro" value={f.logradouro} onChangeText={t => set('logradouro', t)} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Campo label="Número" value={f.numero} onChangeText={t => set('numero', t)} keyboardType="numeric" /></View>
                  <View style={{ flex: 1.4 }}><Campo label="Complemento" value={f.complemento} onChangeText={t => set('complemento', t)} /></View>
                </View>
                <Campo label="Bairro" value={f.bairro} onChangeText={t => set('bairro', t)} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 2 }}><Campo label="Cidade" value={f.cidade} onChangeText={t => set('cidade', t)} /></View>
                  <View style={{ flex: 1 }}><Campo label="UF" value={f.estado} onChangeText={t => set('estado', t.toUpperCase().slice(0, 2))} autoCapitalize="characters" /></View>
                </View>
              </View>
            )}
          </View>
          {!editEndereco
            ? <TouchableOpacity style={st.editaBtn} onPress={() => setEditEndereco(true)}><Text style={st.editaTxt}>Editar endereço</Text></TouchableOpacity>
            : <View style={st.edRow}>
                <TouchableOpacity style={[st.editaBtn, st.editaSec]} onPress={() => { setEditEndereco(false); carregar(); }}><Text style={[st.editaTxt, { color: C.tinta2 }]}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={[st.editaBtn, st.editaPri, salvando && { opacity: 0.6 }]} onPress={salvarEndereco} disabled={salvando}>{salvando ? <ActivityIndicator color="#fff" /> : <Text style={[st.editaTxt, { color: '#fff' }]}>Salvar</Text>}</TouchableOpacity>
              </View>}

          {/* Documentos */}
          <View style={st.grpHd}><Text style={st.grpTt}>🧾  Documentos</Text></View>
          <View style={st.box}>
            {DOCS.map((d, i) => {
              const stt = docs[d.tipo];
              const meta = stt ? (DOC_ST[stt] || DOC_ST.enviado) : null;
              const enviando = enviandoDoc === d.tipo;
              return (
                <View key={d.tipo} style={[st.docRow, i === DOCS.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={st.docIco}><Text style={{ fontSize: 15 }}>{d.ico}</Text></View>
                  <Text style={st.docNome}>{d.rotulo}</Text>
                  {meta && <View style={[st.stTag, { backgroundColor: meta.s[0] }]}><Text style={[st.stTxt, { color: meta.s[1] }]}>{meta.txt}</Text></View>}
                  {enviando
                    ? <ActivityIndicator color={C.azulP} style={{ marginLeft: 10 }} />
                    : <TouchableOpacity onPress={() => enviarDoc(d)} style={{ marginLeft: 10 }}><Text style={st.docAcao}>{stt ? 'reenviar' : 'enviar'}</Text></TouchableOpacity>}
                </View>
              );
            })}
          </View>
          <Text style={st.lockNota}>Ao (re)enviar um documento, a central revisa. Você continua operando normalmente.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Linha({ rot, val, lock, ultimo }) {
  return (
    <View style={[st.dl, ultimo && { borderBottomWidth: 0 }]}>
      <Text style={st.dlR}>{rot}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={st.dlV}>{val}</Text>
        {lock && <Text style={st.lockIco}>🔒</Text>}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bk: { fontSize: 22, color: '#fff', width: 26 },
  htitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

  grpHd: { marginTop: 16, marginBottom: 8, marginLeft: 2 },
  grpTt: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: C.tinta2 },
  box: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, paddingHorizontal: 13 },
  dl: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.linha },
  dlR: { fontSize: 12, color: C.tinta2, fontWeight: '600' },
  dlV: { fontSize: 12.5, color: C.tinta, fontWeight: '700' },
  lockIco: { fontSize: 10 },
  lockNota: { fontSize: 10.5, color: C.tinta3, marginTop: 6, marginLeft: 2, lineHeight: 15 },

  label: { fontSize: 12, fontWeight: '700', color: C.tinta2, marginBottom: 6 },
  input: { backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 14.5, color: C.tinta },

  editaBtn: { marginTop: 10, backgroundColor: '#eaf3fc', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  editaTxt: { color: C.azulP, fontWeight: '800', fontSize: 12.5 },
  edRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  editaSec: { flex: 1, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, marginTop: 0 },
  editaPri: { flex: 1.4, backgroundColor: C.azulP, marginTop: 0 },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.linha },
  docIco: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, alignItems: 'center', justifyContent: 'center' },
  docNome: { flex: 1, fontSize: 12.5, fontWeight: '700', color: C.tinta },
  stTag: { borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 },
  stTxt: { fontSize: 9.5, fontWeight: '800' },
  docAcao: { fontSize: 11.5, fontWeight: '800', color: C.azulP },
});
