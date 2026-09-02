import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, StatusBar, Image, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', chat: '#e9eff6', sup: '#fff', linha: '#dde9f5', ok: '#1f9d6b', erro: '#D0584F',
};

function hora(iso) { try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }

// Texto com links tocáveis.
function Texto({ children }) {
  const partes = String(children || '').split(/(\s+)/);
  return (
    <Text style={st.bTxt}>
      {partes.map((p, i) => /^https?:\/\//i.test(p)
        ? <Text key={i} style={st.link} onPress={() => Linking.openURL(p).catch(() => {})}>{p}</Text>
        : <Text key={i}>{p}</Text>)}
    </Text>
  );
}

export default function Chat() {
  const { entregaId, tipo: tipoParam, protocolo } = useLocalSearchParams();
  const [tipo, setTipo] = useState(tipoParam === 'solicitante' ? 'solicitante' : 'suporte');
  const [convId, setConvId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroLoja, setErroLoja] = useState(false);
  const scrollRef = useRef(null);
  const timer = useRef(null);

  const carregarMsgs = useCallback(async (id) => {
    if (!id) return;
    try { const r = await api.chatMensagens(id); setMsgs(r.mensagens || []); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); } catch {}
  }, []);

  const abrir = useCallback(async (t) => {
    setCarregando(true); setErroLoja(false); setMsgs([]);
    try {
      const r = await api.chatAbrir(entregaId, t);
      setConvId(r.conversa_id);
      await carregarMsgs(r.conversa_id);
    } catch (e) {
      setConvId(null);
      if (t === 'solicitante') setErroLoja(true);
    }
    setCarregando(false);
  }, [entregaId, carregarMsgs]);

  useEffect(() => { abrir(tipo); }, [tipo]);
  useEffect(() => {
    clearInterval(timer.current);
    timer.current = setInterval(() => { if (convId) carregarMsgs(convId); }, 3500);
    return () => clearInterval(timer.current);
  }, [convId, carregarMsgs]);

  async function enviarTexto() {
    const t = texto.trim(); if (!t || !convId) return;
    setTexto('');
    try { await api.chatEnviar(convId, { tipo: 'texto', texto: t }); await carregarMsgs(convId); } catch { setTexto(t); }
  }
  async function enviarFoto() {
    if (!convId) return;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const res = perm.granted
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5 });
      if (res.canceled || !res.assets?.[0]) return;
      setEnviando(true);
      const img = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1280 } }], { compress: 0.6, base64: true, format: ImageManipulator.SaveFormat.JPEG });
      await api.chatEnviar(convId, { tipo: 'foto', arquivo: `data:image/jpeg;base64,${img.base64}` });
      await carregarMsgs(convId);
    } catch {} finally { setEnviando(false); }
  }
  async function enviarLocal() {
    if (!convId) return;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) { const p = await Location.requestForegroundPermissionsAsync(); if (!p.granted) return; }
      setEnviando(true);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.chatEnviar(convId, { tipo: 'local', lat: loc.coords.latitude, lng: loc.coords.longitude });
      await carregarMsgs(convId);
    } catch {} finally { setEnviando(false); }
  }

  function Bolha({ m }) {
    const meu = m.autor_tipo === 'motoboy';
    return (
      <View style={[st.b, meu ? st.bOut : st.bIn]}>
        {m.tipo === 'foto' && m.midia_url
          ? <TouchableOpacity onPress={() => Linking.openURL(m.midia_url).catch(() => {})}><Image source={{ uri: m.midia_url }} style={st.foto} /></TouchableOpacity>
          : m.tipo === 'local' && m.lat != null
            ? <TouchableOpacity onPress={() => Linking.openURL(`https://maps.google.com/?q=${m.lat},${m.lng}`).catch(() => {})}><Text style={st.locTxt}>📍 Ver localização no mapa</Text></TouchableOpacity>
            : <Texto>{m.texto}</Texto>}
        <Text style={st.hora}>{hora(m.criado_em)}</Text>
      </View>
    );
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <View style={st.hTop}>
          <TouchableOpacity onPress={() => router.back()}><Text style={st.bk}>←</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.htit}>{tipo === 'suporte' ? 'Suporte' : 'Loja (solicitante)'}</Text>
            {!!protocolo && <Text style={st.hsub}>Corrida {protocolo}</Text>}
          </View>
        </View>
        <View style={st.seg}>
          <TouchableOpacity style={[st.segB, tipo === 'suporte' && st.segOn]} onPress={() => setTipo('suporte')}><Text style={[st.segT, tipo === 'suporte' && st.segTOn]}>Suporte</Text></TouchableOpacity>
          <TouchableOpacity style={[st.segB, tipo === 'solicitante' && st.segOn]} onPress={() => setTipo('solicitante')}><Text style={[st.segT, tipo === 'solicitante' && st.segTOn]}>Loja (solicitante)</Text></TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {carregando ? (
          <View style={st.center}><ActivityIndicator color={C.azulV} /></View>
        ) : erroLoja ? (
          <View style={st.center}><Text style={{ color: C.tinta2, textAlign: 'center', padding: 30 }}>O chat direto com a loja não está disponível nesta corrida. Use o Suporte.</Text></View>
        ) : (
          <ScrollView ref={scrollRef} style={st.msgs} contentContainerStyle={{ padding: 14, gap: 8 }}>
            {msgs.length === 0 && <Text style={st.vazio}>Nenhuma mensagem ainda. Diga oi 👋</Text>}
            {msgs.map(m => <Bolha key={m.id} m={m} />)}
          </ScrollView>
        )}

        {!carregando && !erroLoja && (
          <View style={st.comp}>
            <TouchableOpacity style={st.cIco} onPress={enviarFoto} disabled={enviando}><Text style={st.cIcoTxt}>📎</Text></TouchableOpacity>
            <TouchableOpacity style={st.cIco} onPress={enviarLocal} disabled={enviando}><Text style={st.cIcoTxt}>📍</Text></TouchableOpacity>
            <TextInput style={st.compIn} value={texto} onChangeText={setTexto} placeholder="Mensagem…" placeholderTextColor={C.tinta3} multiline />
            <TouchableOpacity style={st.cSend} onPress={enviarTexto}>{enviando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={st.cSendTxt}>➤</Text>}</TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.chat },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 50, paddingBottom: 10, paddingHorizontal: 14 },
  hTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bk: { fontSize: 22, color: '#fff', width: 26 },
  htit: { fontSize: 15, fontWeight: '800', color: '#fff' },
  hsub: { fontSize: 10.5, color: C.azulC },
  seg: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segB: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontSize: 11, fontWeight: '800', color: '#cfe0f2' },
  segTOn: { color: C.navy900 },
  msgs: { flex: 1 },
  vazio: { textAlign: 'center', color: C.tinta3, fontSize: 12.5, marginTop: 20 },
  b: { maxWidth: '80%', padding: 8, paddingHorizontal: 11, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1, elevation: 1 },
  bIn: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 5 },
  bOut: { alignSelf: 'flex-end', backgroundColor: '#d7ebff', borderBottomRightRadius: 5 },
  bTxt: { fontSize: 13, color: C.tinta, lineHeight: 18 },
  link: { color: C.azulP, textDecorationLine: 'underline' },
  foto: { width: 180, height: 130, borderRadius: 9, backgroundColor: '#cdd9e6' },
  locTxt: { fontSize: 13, fontWeight: '700', color: C.azulP },
  hora: { fontSize: 9.5, color: C.tinta3, marginTop: 3, alignSelf: 'flex-end' },
  comp: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 9, paddingBottom: 26, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.linha },
  cIco: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  cIcoTxt: { fontSize: 18 },
  compIn: { flex: 1, backgroundColor: C.fundo, borderWidth: 1, borderColor: C.linha, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 13.5, color: C.tinta, maxHeight: 100 },
  cSend: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.azulP, alignItems: 'center', justifyContent: 'center' },
  cSendTxt: { color: '#fff', fontSize: 16 },
});
