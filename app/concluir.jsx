import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Image, StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';

const C = {
  navy900: '#042C53', azul: '#185FA5', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#fff', cinza: '#F5F7FA', borda: '#D1DCE8',
  ok: '#1D9E75', okBg: '#eafaf3', okBorda: '#27b67f',
  erro: '#dc2626', erroBg: '#fef2f2', erroBorda: '#fca5a5',
};

export default function ConcluirScreen() {
  const router = useRouter();
  const { entregaId, pontoId, numero, total } = useLocalSearchParams();

  const [ocorrencias, setOcorrencias] = useState([]);
  const [carregandoOc, setCarregandoOc] = useState(true);
  const [ocSel, setOcSel]           = useState(null);
  const [recebedor, setRecebedor]   = useState('');
  const [observacao, setObservacao] = useState('');
  const [fotos, setFotos]           = useState([]);
  const [enviando, setEnviando]     = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const lista = await api.get('/motoboys/app/ocorrencias');
        setOcorrencias(lista || []);
        // Pré-seleciona a primeira de sucesso, se houver.
        const sucesso = (lista || []).find(o => o.tipo === 'sucesso');
        if (sucesso) setOcSel(sucesso);
      } catch (e) { /* segue sem lista; valida no envio */ }
      setCarregandoOc(false);
    })();
  }, []);

  const ehInsucesso = ocSel && ocSel.tipo === 'insucesso';
  const geraRetorno = ehInsucesso && ocSel.comportamento === 'retorno';

  async function tirarFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso à câmera nas configurações.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6, base64: true, exif: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setFotos(prev => [...prev, { uri: asset.uri, base64: asset.base64, tipo: asset.mimeType || 'image/jpeg' }]);
    }
  }

  function removerFoto(idx) {
    setFotos(prev => prev.filter((_, i) => i !== idx));
  }

  async function concluir() {
    if (!ocSel) { Alert.alert('Atenção', 'Selecione o resultado da entrega.'); return; }
    if (!ehInsucesso && !recebedor.trim()) { Alert.alert('Atenção', 'Informe quem recebeu.'); return; }
    if (fotos.length === 0) { Alert.alert('Atenção', 'A foto de protocolo é obrigatória.'); return; }

    setEnviando(true);
    try {
      const fotos_urls = fotos.map(f => f.base64).filter(Boolean);
      const endpoint = pontoId
        ? `/motoboys/app/entregas/${entregaId}/pontos/${pontoId}/concluir`
        : `/motoboys/app/entregas/${entregaId}/concluir-sem-ponto`;

      const resp = await api.post(endpoint, {
        ocorrencia_id: ocSel.id,
        recebedor:  ehInsucesso ? null : recebedor.trim(),
        observacao: observacao.trim() || null,
        fotos_urls,
      });

      const titulo = geraRetorno ? 'Retorno registrado' : (ehInsucesso ? 'Ocorrência registrada' : 'Entregue!');
      const msg = geraRetorno
        ? 'Foi criado um ponto de retorno à coleta. A corrida só finaliza quando você concluir o retorno.'
        : 'Protocolo registrado com sucesso.';
      Alert.alert(titulo, msg, [{ text: 'OK', onPress: () => router.replace('/home') }]);
    } catch (err) {
      if (err?.message?.toLowerCase().includes('network') || err?.status >= 500) {
        Alert.alert('Verifique', 'Possível problema de conexão. Atualize a lista para confirmar se foi registrado.',
          [{ text: 'Voltar', onPress: () => router.replace('/home') }]);
      } else {
        Alert.alert('Erro', err?.message || 'Não foi possível registrar.');
      }
    } finally {
      setEnviando(false);
    }
  }

  const botaoTxt = geraRetorno ? 'Registrar retorno' : (ehInsucesso ? 'Registrar ocorrência' : 'Confirmar entrega');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      {/* Header com voltar */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.btnVoltar}>
          <Text style={s.btnVoltarTxt}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={s.headerTit}>Finalizar entrega</Text>
          {!!total && <Text style={s.headerSub}>Ponto {numero} de {total}</Text>}
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {/* Resultado / ocorrência */}
        <Text style={s.label}>Resultado da entrega *</Text>
        {carregandoOc ? (
          <ActivityIndicator color={C.azul} style={{ marginVertical: 16 }} />
        ) : (
          <View style={s.ocLista}>
            {ocorrencias.map(o => {
              const sel = ocSel && ocSel.id === o.id;
              const insuc = o.tipo === 'insucesso';
              const ret = o.comportamento === 'retorno';
              return (
                <TouchableOpacity key={o.id} activeOpacity={0.8} onPress={() => setOcSel(o)}
                  style={[s.ocItem, sel && (insuc ? s.ocItemSelErro : s.ocItemSelOk)]}>
                  <View style={[s.ocDot, { backgroundColor: insuc ? C.erro : C.ok }]} />
                  <Text style={[s.ocNome, sel && { color: insuc ? '#991b1b' : '#0f6e56', fontWeight: '700' }]}>{o.nome}</Text>
                  <View style={[s.ocTag, { backgroundColor: insuc ? C.erroBg : C.okBg }]}>
                    <Text style={[s.ocTagTxt, { color: insuc ? C.erro : C.ok }]}>{ret ? 'RETORNO' : (insuc ? 'INSUCESSO' : 'SUCESSO')}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {geraRetorno && (
          <View style={s.avisoRetorno}>
            <Text style={s.avisoRetornoTxt}>↩ Será criado um ponto de retorno à coleta. A corrida só finaliza quando você concluir esse retorno.</Text>
          </View>
        )}

        {/* Recebedor — só no sucesso */}
        {!ehInsucesso && (
          <>
            <Text style={s.label}>Quem recebeu *</Text>
            <TextInput style={s.input} value={recebedor} onChangeText={setRecebedor}
              placeholder="Ex: João Silva" placeholderTextColor="#8AA2BE" returnKeyType="next" />
          </>
        )}

        {/* Observação — sempre opcional */}
        <Text style={s.label}>Observação <Text style={s.opcional}>(opcional)</Text></Text>
        <TextInput style={[s.input, s.textarea]} value={observacao} onChangeText={setObservacao}
          placeholder={ehInsucesso ? 'Explique o que aconteceu...' : 'Ex: deixei com o porteiro...'}
          placeholderTextColor="#8AA2BE" multiline numberOfLines={3} textAlignVertical="top" />

        {/* Foto — sempre obrigatória */}
        <Text style={s.label}>Foto de protocolo *</Text>
        <View style={s.fotosGrid}>
          {fotos.map((f, i) => (
            <View key={i} style={s.fotoWrap}>
              <Image source={{ uri: f.uri }} style={s.fotoThumb} />
              <TouchableOpacity style={s.removerFoto} onPress={() => removerFoto(i)}>
                <Text style={s.removerFotoTxt}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={s.addFoto} onPress={tirarFoto}>
            <Text style={s.addFotoIco}>+</Text>
            <Text style={s.addFotoTxt}>Tirar foto</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.btnConcluir, ehInsucesso && s.btnConcluirErro, enviando && s.btnDisabled]}
          onPress={concluir} disabled={enviando}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>{botaoTxt}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#fff' },
  header:         { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar:      { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  btnVoltarTxt:   { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: -2 },
  headerTit:      { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  headerSub:      { color: C.azulC, fontSize: 11, textAlign: 'center', marginTop: 1 },

  scroll:         { flex: 1, backgroundColor: '#fff' },
  content:        { padding: 20, paddingBottom: 40 },
  label:          { fontSize: 12, fontWeight: '700', color: C.tinta2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 18 },
  opcional:       { fontSize: 11, fontWeight: '400', color: '#8AA2BE', textTransform: 'none' },

  ocLista:        { gap: 8 },
  ocItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderWidth: 1, borderColor: C.borda, borderRadius: 12, backgroundColor: '#fff' },
  ocItemSelOk:    { borderWidth: 2, borderColor: C.okBorda, backgroundColor: C.okBg },
  ocItemSelErro:  { borderWidth: 2, borderColor: C.erro, backgroundColor: C.erroBg },
  ocDot:          { width: 10, height: 10, borderRadius: 5 },
  ocNome:         { flex: 1, fontSize: 14, color: C.tinta2 },
  ocTag:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  ocTagTxt:       { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  avisoRetorno:   { marginTop: 12, backgroundColor: C.erroBg, borderRadius: 10, padding: 12 },
  avisoRetornoTxt:{ fontSize: 12.5, color: '#991b1b', lineHeight: 18 },

  input:          { borderWidth: 1, borderColor: C.borda, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: C.tinta, backgroundColor: C.cinza },
  textarea:       { minHeight: 72, paddingTop: 12 },
  fotosGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  fotoWrap:       { position: 'relative' },
  fotoThumb:      { width: 88, height: 88, borderRadius: 10, backgroundColor: C.cinza },
  removerFoto:    { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#E24B4A', alignItems: 'center', justifyContent: 'center' },
  removerFotoTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  addFoto:        { width: 88, height: 88, borderRadius: 10, borderWidth: 1.5, borderColor: C.azul, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addFotoIco:     { fontSize: 28, color: C.azul },
  addFotoTxt:     { fontSize: 11, color: C.azul, fontWeight: '600' },
  btnConcluir:    { marginTop: 28, backgroundColor: C.okBorda, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnConcluirErro:{ backgroundColor: C.erro },
  btnDisabled:    { opacity: 0.6 },
  btnTxt:         { color: '#fff', fontSize: 16, fontWeight: '800' },
});
