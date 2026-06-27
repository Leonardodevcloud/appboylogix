import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Image, Alert, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api, API_URL, getToken } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  ok: '#1f9d6b', okBg: '#e7f6ef', erro: '#dc2626', erroBg: '#fef2f2',
  amber: '#b45309', amberBg: '#fef3c7',
};

const DOCS = [
  { tipo: 'selfie', rotulo: 'Selfie', soCamera: true },
  { tipo: 'habilitacao', rotulo: 'Habilitação (CNH)' },
  { tipo: 'comprovante_endereco', rotulo: 'Comprovante de endereço' },
  { tipo: 'antecedentes', rotulo: 'Antecedentes criminais' },
];

export default function CadastroStatus() {
  const [estado, setEstado] = useState(null); // { situacao, motivo, documentos }
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [docs, setDocs] = useState({});
  const [camAberta, setCamAberta] = useState(null);
  const [permCam, pedirPermCam] = useCameraPermissions();
  const camRef = useRef(null);
  const wsRef = useRef(null);

  async function carregar() {
    try {
      const r = await api.meuCadastro();
      setEstado(r);
      // Se foi aprovado, libera para a home.
      if (r.situacao === 'aprovado') { router.replace('/home'); return; }
    } catch (e) { console.log('[STATUS] erro:', e?.message); }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // WebSocket: reage a aprovação/reenvio em tempo real.
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const wsUrl = API_URL.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws?token=' + token;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const { evento } = JSON.parse(ev.data);
            if (evento === 'cadastro.aprovado') { Alert.alert('Aprovado!', 'Seu cadastro foi aprovado. Bem-vindo!', [{ text: 'Começar', onPress: () => router.replace('/home') }]); }
            else if (evento === 'cadastro.reenvio' || evento === 'cadastro.recusado') { carregar(); }
          } catch {}
        };
      } catch {}
    })();
    return () => { try { wsRef.current?.close(); } catch {} };
  }, []);

  // ── Captura de documentos (só no modo reenvio) ──
  async function tirarFoto(tipo) {
    if (!permCam?.granted) { const r = await pedirPermCam(); if (!r.granted) { Alert.alert('Permissão', 'Precisamos da câmera.'); return; } }
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
    if (!r.canceled && r.assets?.[0]?.base64) setDocs(d => ({ ...d, [tipo]: `data:${r.assets[0].mimeType || 'image/jpeg'};base64,${r.assets[0].base64}` }));
  }

  async function reenviar() {
    setEnviando(true);
    try {
      await api.reenviarCadastro({ documentos: docs });
      Alert.alert('Reenviado!', 'Seus dados foram reenviados para análise.', [{ text: 'OK' }]);
      setDocs({});
      carregar();
    } catch (e) { Alert.alert('Erro', e.message || 'Falha ao reenviar'); }
    setEnviando(false);
  }

  async function sair() { await api.logout(); router.replace('/'); }

  if (carregando) return (
    <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>
  );

  // Câmera
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

  const sit = estado?.situacao || 'pendente';

  // Documentos que faltam (foram removidos pela central no reenvio).
  const tiposPresentes = new Set((estado?.documentos || []).map(d => d.tipo));
  const docsFaltando = DOCS.filter(d => !tiposPresentes.has(d.tipo));

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Topo conforme situação */}
        {sit === 'pendente' && (
          <View style={[st.hero, { backgroundColor: C.navy900 }]}>
            <Text style={st.heroEmoji}>⏳</Text>
            <Text style={st.heroTit}>Cadastro em análise</Text>
            <Text style={st.heroSub}>Recebemos seu cadastro! Nossa equipe está analisando seus dados e documentos. Você será avisado assim que for aprovado.</Text>
          </View>
        )}
        {sit === 'recusado' && (
          <View style={[st.hero, { backgroundColor: '#7f1d1d' }]}>
            <Text style={st.heroEmoji}>✕</Text>
            <Text style={st.heroTit}>Cadastro não aprovado</Text>
            <Text style={st.heroSub}>{estado.motivo || 'Seu cadastro não foi aprovado. Entre em contato com a central para mais informações.'}</Text>
          </View>
        )}
        {sit === 'reenvio' && (
          <View style={[st.hero, { backgroundColor: C.amber }]}>
            <Text style={st.heroEmoji}>📋</Text>
            <Text style={st.heroTit}>Ação necessária</Text>
            <Text style={st.heroSub}>A central pediu uma correção no seu cadastro. Veja o que precisa e reenvie para continuar.</Text>
          </View>
        )}

        <View style={st.body}>
          {sit === 'reenvio' && (
            <>
              {!!estado.motivo && (
                <View style={st.motivoBox}>
                  <Text style={st.motivoLabel}>O que precisa ser corrigido:</Text>
                  <Text style={st.motivoTxt}>{estado.motivo}</Text>
                </View>
              )}

              {docsFaltando.length > 0 && (
                <>
                  <Text style={st.secTit}>Reenvie os documentos</Text>
                  {docsFaltando.map(d => {
                    const enviado = !!docs[d.tipo];
                    return (
                      <View key={d.tipo} style={st.docCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          {enviado
                            ? <Image source={{ uri: docs[d.tipo] }} style={st.docThumb} />
                            : <View style={[st.docThumb, st.docThumbVazio]}><Text style={{ fontSize: 20 }}>{d.tipo === 'selfie' ? '🤳' : '📄'}</Text></View>}
                          <View style={{ flex: 1 }}>
                            <Text style={st.docNome}>{d.rotulo}</Text>
                            <Text style={st.docSub}>{enviado ? '✓ Pronto' : 'Pendente'}</Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity style={st.docBtn} onPress={() => tirarFoto(d.tipo)}><Text style={st.docBtnTxt}>{enviado ? 'Refazer' : '📷 Câmera'}</Text></TouchableOpacity>
                          {!d.soCamera && <TouchableOpacity style={[st.docBtn, st.docBtnAlt]} onPress={() => daGaleria(d.tipo)}><Text style={[st.docBtnTxt, { color: C.azulP }]}>🖼 Galeria</Text></TouchableOpacity>}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}

              <TouchableOpacity style={[st.btnPrincipal, enviando && { opacity: 0.6 }]} onPress={reenviar} disabled={enviando} activeOpacity={0.85}>
                {enviando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPrincipalTxt}>Reenviar para análise</Text>}
              </TouchableOpacity>
            </>
          )}

          {sit === 'pendente' && (
            <View style={st.infoCard}>
              <Text style={st.infoTxt}>Assim que seu cadastro for aprovado, esta tela libera o acesso automaticamente. Você pode fechar o app — avisaremos quando estiver tudo certo.</Text>
              <TouchableOpacity style={st.btnAtualizar} onPress={carregar}><Text style={st.btnAtualizarTxt}>Verificar novamente</Text></TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={st.btnSair} onPress={sair}><Text style={st.btnSairTxt}>Sair</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  hero: { paddingTop: 70, paddingBottom: 36, paddingHorizontal: 24, alignItems: 'center', borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  heroEmoji: { fontSize: 44, marginBottom: 12 },
  heroTit: { color: '#fff', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, textAlign: 'center', marginTop: 10, lineHeight: 20 },

  body: { padding: 18 },
  motivoBox: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 14, padding: 16, marginBottom: 18 },
  motivoLabel: { fontSize: 12, fontWeight: '800', color: C.amber, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  motivoTxt: { fontSize: 14, color: '#7c2d12', lineHeight: 20 },

  secTit: { fontSize: 15, fontWeight: '800', color: C.tinta, marginBottom: 12 },
  docCard: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 14, marginBottom: 12 },
  docThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: C.sup2 },
  docThumbVazio: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.linha, borderStyle: 'dashed' },
  docNome: { fontSize: 14, fontWeight: '700', color: C.tinta },
  docSub: { fontSize: 12, color: C.tinta2, marginTop: 2 },
  docBtn: { flex: 1, backgroundColor: C.navy900, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  docBtnAlt: { backgroundColor: '#eaf3fc' },
  docBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  btnPrincipal: { backgroundColor: C.azulP, paddingVertical: 16, borderRadius: 13, alignItems: 'center', marginTop: 8 },
  btnPrincipalTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  infoCard: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 14, padding: 18 },
  infoTxt: { fontSize: 13.5, color: C.tinta2, lineHeight: 20, textAlign: 'center' },
  btnAtualizar: { marginTop: 16, paddingVertical: 13, borderRadius: 11, borderWidth: 1.5, borderColor: C.azulP, alignItems: 'center' },
  btnAtualizarTxt: { color: C.azulP, fontSize: 14, fontWeight: '700' },

  btnSair: { marginTop: 22, alignItems: 'center', padding: 12 },
  btnSairTxt: { color: C.tinta3, fontSize: 14, fontWeight: '700' },

  camBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 40, paddingTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, backgroundColor: 'rgba(0,0,0,0.4)' },
  camCancel: { color: '#fff', fontSize: 15, fontWeight: '700', width: 70 },
  camBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  camBtnInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
});
