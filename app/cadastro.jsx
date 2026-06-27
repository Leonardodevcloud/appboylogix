import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', navy800: '#0a3a66',
  azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', erro: '#dc2626', erroBg: '#fef2f2',
};

const DOCS = [
  { tipo: 'selfie', rotulo: 'Selfie', sub: 'Só pela câmera', soCamera: true, flag: 'doc_selfie' },
  { tipo: 'habilitacao', rotulo: 'Habilitação (CNH)', sub: 'Câmera ou galeria', flag: 'doc_habilitacao' },
  { tipo: 'comprovante_endereco', rotulo: 'Comprovante de endereço', sub: 'Câmera ou galeria', flag: 'doc_comprovante_endereco' },
  { tipo: 'antecedentes', rotulo: 'Antecedentes criminais', sub: 'Câmera ou galeria', flag: 'doc_antecedentes' },
];

export default function Cadastro() {
  const [carregando, setCarregando] = useState(true);
  const [ctx, setCtx] = useState(null);       // { empresa, modalidades, campos }
  const [etapa, setEtapa] = useState(0);       // 0=modalidade 1=dados 2=endereco 3=docs
  const [enviando, setEnviando] = useState(false);

  const [form, setForm] = useState({
    modalidade_interesse_id: null,
    nome_completo: '', cpf: '', data_nascimento: '', telefone_principal: '', telefone_emergencia: '',
    email: '', senha: '',
    cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  });
  const [docs, setDocs] = useState({}); // { tipo: dataUri }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [camAberta, setCamAberta] = useState(null); // tipo do doc sendo capturado
  const [permCam, pedirPermCam] = useCameraPermissions();
  const camRef = useRef(null);

  useEffect(() => {
    api.contextoCadastro()
      .then(c => { setCtx(c); setCarregando(false); })
      .catch(e => { Alert.alert('Erro', e.message || 'Não foi possível carregar o cadastro'); router.back(); });
  }, []);

  const obrig = (campo) => ctx?.campos?.[campo] !== false;

  // ── Captura de documentos ──
  async function tirarFoto(tipo) {
    if (!permCam?.granted) { const r = await pedirPermCam(); if (!r.granted) { Alert.alert('Permissão', 'Precisamos da câmera para a foto.'); return; } }
    setCamAberta(tipo);
  }
  async function capturar() {
    if (!camRef.current) return;
    const foto = await camRef.current.takePictureAsync({ quality: 0.4, base64: true });
    setDocs(d => ({ ...d, [camAberta]: `data:image/jpeg;base64,${foto.base64}` }));
    setCamAberta(null);
  }
  async function daGaleria(tipo) {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.4, base64: true });
    if (!r.canceled && r.assets?.[0]?.base64) {
      const a = r.assets[0];
      const mime = a.mimeType || 'image/jpeg';
      setDocs(d => ({ ...d, [tipo]: `data:${mime};base64,${a.base64}` }));
    }
  }

  // ── CEP ──
  const [buscandoCep, setBuscandoCep] = useState(false);
  async function buscarCep(valor) {
    const cep = String(valor).replace(/\D/g, '');
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await api.cepCadastro(cep);
      setForm(f => ({ ...f, logradouro: r.logradouro || f.logradouro, bairro: r.bairro || f.bairro, cidade: r.cidade || f.cidade, estado: r.uf || f.estado }));
    } catch { /* preenche manual */ }
    setBuscandoCep(false);
  }

  // ── Validação por etapa ──
  function validarEtapa() {
    if (etapa === 0) { if (ctx.modalidades.length && !form.modalidade_interesse_id) return 'Selecione uma modalidade'; return null; }
    if (etapa === 1) {
      if (obrig('nome_completo') && !form.nome_completo.trim()) return 'Informe o nome completo';
      if (obrig('cpf') && form.cpf.replace(/\D/g, '').length !== 11) return 'CPF inválido';
      if (obrig('data_nascimento') && !form.data_nascimento) return 'Informe a data de nascimento';
      if (obrig('telefone_principal') && form.telefone_principal.replace(/\D/g, '').length < 10) return 'Telefone inválido';
      if (obrig('email') && !/^[^@]+@[^@]+\.[^@]+$/.test(form.email)) return 'E-mail inválido';
      if (obrig('senha') && form.senha.length < 6) return 'Senha de no mínimo 6 caracteres';
      return null;
    }
    if (etapa === 2) {
      if (obrig('cep') && form.cep.replace(/\D/g, '').length !== 8) return 'CEP inválido';
      if (obrig('logradouro') && !form.logradouro.trim()) return 'Informe o logradouro';
      if (obrig('numero') && !form.numero.trim()) return 'Informe o número';
      if (obrig('bairro') && !form.bairro.trim()) return 'Informe o bairro';
      if (obrig('cidade') && !form.cidade.trim()) return 'Informe a cidade';
      if (obrig('estado') && !form.estado.trim()) return 'Informe o estado';
      return null;
    }
    if (etapa === 3) {
      for (const d of DOCS) { if (ctx.campos[d.flag] !== false && !docs[d.tipo]) return `Envie: ${d.rotulo}`; }
      return null;
    }
    return null;
  }

  function avancar() {
    const err = validarEtapa();
    if (err) { Alert.alert('Atenção', err); return; }
    if (etapa < 3) setEtapa(etapa + 1);
    else enviar();
  }

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api.enviarCadastro({ ...form, documentos: docs });
      const modalidade = r.modalidade ? `\n\nModalidade escolhida: ${r.modalidade}` : '';
      // Login automático com o e-mail/senha recém-cadastrados, para o motoboy
      // já entrar logado e ver a tela de "em análise" sem precisar relogar.
      let logou = false;
      try { await api.loginEmail(form.email.trim(), form.senha); logou = true; } catch {}
      Alert.alert('Cadastro enviado!', `Seu cadastro foi enviado para análise.${modalidade}\n\nVocê receberá um aviso quando for aprovado.`, [
        { text: 'OK', onPress: () => router.replace(logou ? '/cadastro-status' : '/') },
      ]);
    } catch (e) { Alert.alert('Erro', e.message || 'Falha ao enviar'); }
    setEnviando(false);
  }

  if (carregando) return (
    <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>
  );

  // ── Câmera aberta (overlay) ──
  if (camAberta) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={camRef} style={{ flex: 1 }} facing={camAberta === 'selfie' ? 'front' : 'back'} />
        <View style={st.camBar}>
          <TouchableOpacity onPress={() => setCamAberta(null)}><Text style={st.camCancel}>Cancelar</Text></TouchableOpacity>
          <TouchableOpacity style={st.camBtn} onPress={capturar}><View style={st.camBtnInner} /></TouchableOpacity>
          <View style={{ width: 70 }} />
        </View>
      </View>
    );
  }

  const titulos = ['Modalidade', 'Seus dados', 'Endereço', 'Documentos'];

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      {/* Header com progresso */}
      <View style={st.header}>
        <View style={st.headerTop}>
          <TouchableOpacity onPress={() => etapa === 0 ? router.back() : setEtapa(etapa - 1)} style={{ width: 60 }}>
            <Text style={st.voltarTxt}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>Criar conta</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={st.progresso}>
          {[0, 1, 2, 3].map(i => <View key={i} style={[st.progItem, { backgroundColor: i <= etapa ? C.azulV : C.navy800 }]} />)}
        </View>
        <Text style={st.etapaLabel}>Etapa {etapa + 1} de 4 · {titulos[etapa]}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          {etapa === 0 && (
            <View>
              <Text style={st.secTit}>Qual modalidade te interessa?</Text>
              <Text style={st.secSub}>Escolha como você quer operar. Você pode confirmar com a central depois.</Text>
              {(!ctx.modalidades || !ctx.modalidades.length) && <Text style={st.aviso}>Nenhuma modalidade disponível no momento — você pode prosseguir.</Text>}
              {ctx.modalidades.map(m => {
                const sel = form.modalidade_interesse_id === m.id;
                return (
                  <TouchableOpacity key={m.id} style={[st.modCard, sel && st.modCardSel]} onPress={() => set('modalidade_interesse_id', m.id)} activeOpacity={0.8}>
                    <View style={[st.modDot, { backgroundColor: m.cor || C.azulV }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={st.modNome}>{m.nome}</Text>
                      {!!m.descricao && <Text style={st.modDesc}>{m.descricao}</Text>}
                    </View>
                    <View style={[st.radio, sel && st.radioSel]}>{sel && <View style={st.radioInner} />}</View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {etapa === 1 && (
            <View>
              <Campo label="Nome completo" obrig={obrig('nome_completo')} value={form.nome_completo} onChangeText={t => set('nome_completo', t)} />
              <Campo label="CPF" obrig={obrig('cpf')} value={form.cpf} onChangeText={t => set('cpf', t)} keyboardType="numeric" />
              <Campo label="Data de nascimento (DD/MM/AAAA)" obrig={obrig('data_nascimento')} value={form.data_nascimento} onChangeText={t => set('data_nascimento', formatarData(t))} keyboardType="numeric" placeholder="00/00/0000" />
              <Campo label="Telefone (WhatsApp)" obrig={obrig('telefone_principal')} value={form.telefone_principal} onChangeText={t => set('telefone_principal', t)} keyboardType="phone-pad" />
              {obrig('telefone_emergencia') !== false && <Campo label="Telefone de emergência" obrig={obrig('telefone_emergencia')} value={form.telefone_emergencia} onChangeText={t => set('telefone_emergencia', t)} keyboardType="phone-pad" />}
              <Campo label="E-mail (será seu login)" obrig={obrig('email')} value={form.email} onChangeText={t => set('email', t)} keyboardType="email-address" autoCapitalize="none" />
              <Campo label="Senha" obrig={obrig('senha')} value={form.senha} onChangeText={t => set('senha', t)} secureTextEntry />
            </View>
          )}

          {etapa === 2 && (
            <View>
              <View style={{ position: 'relative' }}>
                <Campo label="CEP" obrig={obrig('cep')} value={form.cep} onChangeText={t => { set('cep', t); if (t.replace(/\D/g, '').length === 8) buscarCep(t); }} keyboardType="numeric" placeholder="00000-000" />
                {buscandoCep && <ActivityIndicator color={C.azulV} style={{ position: 'absolute', right: 14, top: 38 }} />}
              </View>
              <Text style={st.dicaCep}>Digite o CEP que o endereço será preenchido. Se não vier, preencha manualmente.</Text>
              <Campo label="Logradouro" obrig={obrig('logradouro')} value={form.logradouro} onChangeText={t => set('logradouro', t)} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Campo label="Número" obrig={obrig('numero')} value={form.numero} onChangeText={t => set('numero', t)} keyboardType="numeric" /></View>
                <View style={{ flex: 1.4 }}><Campo label="Complemento" value={form.complemento} onChangeText={t => set('complemento', t)} /></View>
              </View>
              <Campo label="Bairro" obrig={obrig('bairro')} value={form.bairro} onChangeText={t => set('bairro', t)} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}><Campo label="Cidade" obrig={obrig('cidade')} value={form.cidade} onChangeText={t => set('cidade', t)} /></View>
                <View style={{ flex: 1 }}><Campo label="UF" obrig={obrig('estado')} value={form.estado} onChangeText={t => set('estado', t.toUpperCase().slice(0, 2))} autoCapitalize="characters" /></View>
              </View>
            </View>
          )}

          {etapa === 3 && (
            <View>
              <Text style={st.secTit}>Envie seus documentos</Text>
              <Text style={st.secSub}>A selfie é só pela câmera. Os demais você pode enviar da galeria.</Text>
              {DOCS.filter(d => ctx.campos[d.flag] !== false).map(d => {
                const enviado = !!docs[d.tipo];
                return (
                  <View key={d.tipo} style={st.docCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {enviado
                        ? <Image source={{ uri: docs[d.tipo] }} style={st.docThumb} />
                        : <View style={[st.docThumb, st.docThumbVazio]}><Text style={{ fontSize: 22 }}>{d.tipo === 'selfie' ? '🤳' : '📄'}</Text></View>}
                      <View style={{ flex: 1 }}>
                        <Text style={st.docNome}>{d.rotulo}</Text>
                        <Text style={st.docSub}>{enviado ? '✓ Enviado' : d.sub}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity style={st.docBtn} onPress={() => tirarFoto(d.tipo)}>
                        <Text style={st.docBtnTxt}>{enviado ? 'Refazer foto' : '📷 Câmera'}</Text>
                      </TouchableOpacity>
                      {!d.soCamera && (
                        <TouchableOpacity style={[st.docBtn, st.docBtnAlt]} onPress={() => daGaleria(d.tipo)}>
                          <Text style={[st.docBtnTxt, { color: C.azulP }]}>🖼 Galeria</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={st.footer}>
          <TouchableOpacity style={[st.btnAvancar, enviando && { opacity: 0.6 }]} onPress={avancar} disabled={enviando} activeOpacity={0.85}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnAvancarTxt}>{etapa < 3 ? 'Continuar' : 'Enviar cadastro'}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Campo({ label, obrig, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.label}>{label}{obrig && <Text style={{ color: C.erro }}> *</Text>}</Text>
      <TextInput style={st.input} placeholderTextColor={C.tinta3} {...props} />
    </View>
  );
}

function formatarData(t) {
  const n = t.replace(/\D/g, '').slice(0, 8);
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  voltarTxt: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  progresso: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  progItem: { flex: 1, height: 4, borderRadius: 2 },
  etapaLabel: { color: C.azulC, fontSize: 12, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 18 },
  secTit: { fontSize: 17, fontWeight: '800', color: C.tinta, marginBottom: 4 },
  secSub: { fontSize: 13, color: C.tinta2, marginBottom: 16, lineHeight: 18 },
  aviso: { fontSize: 12.5, color: C.tinta3, marginBottom: 12 },

  modCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.sup, borderWidth: 1.5, borderColor: C.linha, borderRadius: 14, marginBottom: 10 },
  modCardSel: { borderColor: C.azulV, backgroundColor: '#f0f7ff' },
  modDot: { width: 10, height: 10, borderRadius: 5 },
  modNome: { fontSize: 15, fontWeight: '700', color: C.tinta },
  modDesc: { fontSize: 12.5, color: C.tinta2, marginTop: 3, lineHeight: 17 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.tinta3, justifyContent: 'center', alignItems: 'center' },
  radioSel: { borderColor: C.azulV },
  radioInner: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.azulV },

  label: { fontSize: 12.5, fontWeight: '700', color: C.tinta2, marginBottom: 6 },
  input: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.tinta },
  dicaCep: { fontSize: 11.5, color: C.tinta3, marginTop: -8, marginBottom: 14, lineHeight: 16 },

  docCard: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 14, marginBottom: 12 },
  docThumb: { width: 54, height: 54, borderRadius: 10, backgroundColor: C.sup2 },
  docThumbVazio: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.linha, borderStyle: 'dashed' },
  docNome: { fontSize: 14, fontWeight: '700', color: C.tinta },
  docSub: { fontSize: 12, color: C.tinta2, marginTop: 2 },
  docBtn: { flex: 1, backgroundColor: C.navy900, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  docBtnAlt: { backgroundColor: '#eaf3fc' },
  docBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  footer: { padding: 16, paddingBottom: 28, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha },
  btnAvancar: { backgroundColor: C.azulP, paddingVertical: 16, borderRadius: 13, alignItems: 'center' },
  btnAvancarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  camBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, backgroundColor: 'rgba(0,0,0,0.4)' },
  camCancel: { color: '#fff', fontSize: 15, fontWeight: '700', width: 70 },
  camBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  camBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
});
