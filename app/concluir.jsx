import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';

export default function ConcluirScreen() {
  const router = useRouter();
  const { entregaId, pontoId } = useLocalSearchParams();

  const [recebedor, setRecebedor]   = useState('');
  const [observacao, setObservacao] = useState('');
  const [fotos, setFotos]           = useState([]);
  const [enviando, setEnviando]     = useState(false);

  async function tirarFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissao necessaria', 'Autorize o acesso a camera nas configuracoes.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
      exif: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setFotos(prev => [...prev, {
        uri: asset.uri,
        base64: asset.base64,
        tipo: asset.mimeType || 'image/jpeg',
      }]);
    }
  }

  function removerFoto(idx) {
    setFotos(prev => prev.filter((_, i) => i !== idx));
  }

  async function concluir() {
    if (!recebedor.trim()) {
      Alert.alert('Atencao', 'Informe o nome do recebedor.');
      return;
    }
    setEnviando(true);
    try {
      const fotos_urls = fotos.map(f => f.base64).filter(Boolean);
      const endpoint = pontoId
        ? `/motoboys/app/entregas/${entregaId}/pontos/${pontoId}/concluir`
        : `/motoboys/app/entregas/${entregaId}/concluir-sem-ponto`;

      await api.post(endpoint, {
        recebedor:  recebedor.trim(),
        observacao: observacao.trim() || null,
        fotos_urls,
      });

      Alert.alert('Entregue!', 'Protocolo registrado com sucesso.', [
        { text: 'OK', onPress: () => router.replace('/home') },
      ]);
    } catch (err) {
      if (err?.message?.toLowerCase().includes('network') || err?.status >= 500) {
        Alert.alert(
          'Verifique',
          'Possivel problema de conexao. Atualize a lista para confirmar se foi registrado.',
          [{ text: 'Voltar', onPress: () => router.replace('/home') }]
        );
      } else {
        Alert.alert('Erro', err?.message || 'Nao foi possivel registrar a entrega.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <Text style={s.titulo}>Finalizar entrega</Text>

      <Text style={s.label}>Nome do recebedor *</Text>
      <TextInput
        style={s.input}
        value={recebedor}
        onChangeText={setRecebedor}
        placeholder="Ex: Joao Silva"
        placeholderTextColor="#8AA2BE"
        returnKeyType="next"
      />

      <Text style={s.label}>Observacao <Text style={s.opcional}>(opcional)</Text></Text>
      <TextInput
        style={[s.input, s.textarea]}
        value={observacao}
        onChangeText={setObservacao}
        placeholder="Ex: Deixei com porteiro, portao trancado..."
        placeholderTextColor="#8AA2BE"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      <Text style={s.label}>Fotos de protocolo</Text>
      <View style={s.fotosGrid}>
        {fotos.map((f, i) => (
          <View key={i} style={s.fotoWrap}>
            <Image source={{ uri: f.uri }} style={s.fotoThumb} />
            <TouchableOpacity style={s.removerFoto} onPress={() => removerFoto(i)}>
              <Text style={s.removerFotoTxt}>X</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.addFoto} onPress={tirarFoto}>
          <Text style={s.addFotoIco}>+</Text>
          <Text style={s.addFotoTxt}>Tirar foto</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.btnConcluir, enviando && s.btnDisabled]}
        onPress={concluir}
        disabled={enviando}
      >
        {enviando
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnTxt}>Confirmar entrega</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const VERDE  = '#1D9E75';
const AZUL   = '#185FA5';
const CINZA  = '#F5F7FA';
const BORDA  = '#D1DCE8';
const TINTA  = '#0F2740';
const TINTA2 = '#6B7A8F';

const s = StyleSheet.create({
  scroll:         { flex: 1, backgroundColor: '#fff' },
  content:        { padding: 20, paddingBottom: 40 },
  titulo:         { fontSize: 20, fontWeight: '800', color: TINTA, marginBottom: 24 },
  label:          { fontSize: 12, fontWeight: '700', color: TINTA2, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 16 },
  opcional:       { fontSize: 11, fontWeight: '400', color: '#8AA2BE', textTransform: 'none' },
  input:          { borderWidth: 1, borderColor: BORDA, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TINTA, backgroundColor: CINZA },
  textarea:       { minHeight: 72, paddingTop: 12 },
  fotosGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  fotoWrap:       { position: 'relative' },
  fotoThumb:      { width: 88, height: 88, borderRadius: 10, backgroundColor: CINZA },
  removerFoto:    { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#E24B4A', alignItems: 'center', justifyContent: 'center' },
  removerFotoTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  addFoto:        { width: 88, height: 88, borderRadius: 10, borderWidth: 1.5, borderColor: AZUL, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addFotoIco:     { fontSize: 28, color: AZUL },
  addFotoTxt:     { fontSize: 11, color: AZUL, fontWeight: '600' },
  btnConcluir:    { marginTop: 32, backgroundColor: VERDE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  btnDisabled:    { opacity: 0.6 },
  btnTxt:         { color: '#fff', fontSize: 16, fontWeight: '800' },
});
