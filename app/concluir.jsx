import { useState, useEffect, useRef } from 'react';
import { abrirSocket } from '../src/realtime/socket';
import {
  KeyboardAvoidingView, Platform,
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Image, StatusBar, PixelRatio,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Location from 'expo-location';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api, getToken } from '../src/api';
import { uploadDiretoVarios } from '../src/api/upload';
import DeslizarParaConfirmar from '../src/componentes/DeslizarParaConfirmar';
import { T } from '../src/tema';

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
  const shotRef = useRef(null);
  const [aCarimbar, setACarimbar]   = useState(null); // { uri, w, h, l1, l2 } durante a composição
  // Fluxo de geofence/liberação:
  //   bloqueio = null               -> tudo normal
  //   bloqueio = { distancia_m, raio_m, mensagem }  -> fora do raio, pode solicitar
  //   liberSolicitada = true        -> pedido enviado, aguardando central
  //   liberado = true               -> central liberou, pode marcar
  const [bloqueio, setBloqueio]           = useState(null);
  const [liberSolicitada, setLiberSolic]  = useState(false);
  const [liberado, setLiberado]           = useState(false);
  const [solicitando, setSolicitando]     = useState(false);
  const wsRef = useRef(null);

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

  // Ouve em tempo real a liberação deste ponto pela central.
  useEffect(() => {
    if (!pontoId) return;
    let vivo = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token || !vivo) return;
        const ws = abrirSocket(token);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const m = JSON.parse(ev.data);
            if (m.evento === 'ponto.liberado' && String(m.dados?.pontoId) === String(pontoId)) {
              setLiberado(true); setBloqueio(null); setLiberSolic(false);
              Alert.alert('Ponto liberado', 'A central liberou a marcação. Você já pode confirmar.');
            }
          } catch {}
        };
      } catch {}
    })();
    return () => { vivo = false; try { wsRef.current?.close(); } catch {} };
  }, [pontoId]);

  async function obterLocalizacao() {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        const pedido = await Location.requestForegroundPermissionsAsync();
        if (!pedido.granted) return null;
      }
      // 1) Última posição conhecida (instantânea). Aceita qualquer idade —
      //    o app já reporta GPS a cada 15s, então costuma estar fresca.
      const ultima = await Location.getLastKnownPositionAsync();
      if (ultima?.coords) return { lat: ultima.coords.latitude, lng: ultima.coords.longitude };
      // 2) Posição atual, mas com teto de 4s para não travar a tela. Se estourar,
      //    manda null e o backend usa a última posição do rastreamento.
      const atual = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (atual?.coords) return { lat: atual.coords.latitude, lng: atual.coords.longitude };
    } catch {}
    return null;
  }

  async function solicitarLiberacao() {
    setSolicitando(true);
    try {
      await api.post(`/motoboys/app/entregas/${entregaId}/pontos/${pontoId}/solicitar-liberacao`, {
        motivo: observacao.trim() || null,
      });
      setLiberSolic(true);
      Alert.alert('Solicitação enviada', 'A central foi avisada. Assim que liberarem, você poderá marcar este ponto.');
    } catch (e) {
      Alert.alert('Erro', e?.message || 'Não foi possível solicitar a liberação.');
    } finally {
      setSolicitando(false);
    }
  }

  const ehInsucesso = ocSel && ocSel.tipo === 'insucesso';
  const geraRetorno = ehInsucesso && ocSel.comportamento === 'retorno';

  async function tirarFoto() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', 'Autorize o acesso à câmera nas configurações.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6, exif: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      // 1) Reduz a foto (leve) — é a base que vai receber o carimbo.
      const base = await ImageManipulator.manipulateAsync(
        result.assets[0].uri, [{ resize: { width: 1080 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // 2) Data/hora e coordenada DO MOMENTO da captura.
      const loc = await obterLocalizacao();
      const agora = new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const coord = loc ? `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}` : 'GPS indisponivel';

      // 3) Tamanho da CAPTURA em DP, limitado pela densidade da tela.
      //    O ViewShot é rasterizado no tamanho (DP × densidade). Antes usávamos a
      //    largura real da foto (1080) como DP → num aparelho 2.75x virava um bitmap
      //    de ~2970px + a imagem original decodificada, estourando a memória e
      //    fechando o app. Fixando a SAÍDA em ~1080px (dividindo pela densidade),
      //    o bitmap fica pequeno e igual em todo aparelho.
      const wReal = base.width || 1080;
      const hReal = base.height || 1440;
      const SAIDA_PX = 1080;                          // largura final desejada, em pixels
      const densidade = PixelRatio.get() || 2;
      const wDp = Math.round(SAIDA_PX / densidade);   // captura ~1080px independente do device
      const hDp = Math.round(wDp * (hReal / wReal));
      // Fontes do carimbo proporcionais à largura da folha.
      const f1 = Math.max(11, Math.round(wDp * 0.062));
      const f2 = Math.max(10, Math.round(wDp * 0.052));

      // 4) Monta a view (foto + carimbo) fora da tela e "fotografa" ela.
      setACarimbar({ uri: base.uri, w: wDp, h: hDp, l1: agora, l2: coord, f1, f2 });
      await new Promise((r) => setTimeout(r, 400));
      let carimbada = base.uri;
      try { carimbada = await captureRef(shotRef, { format: 'jpg', quality: 0.7, result: 'tmpfile' }); } catch (e) {}
      setACarimbar(null);

      // 5) Comprime o resultado final + base64 pro upload (sem upscale).
      const finalImg = await ImageManipulator.manipulateAsync(
        carimbada, [{ resize: { width: SAIDA_PX } }],
        { compress: 0.6, base64: true, format: ImageManipulator.SaveFormat.JPEG }
      );
      setFotos((prev) => [...prev, { uri: finalImg.uri, base64: finalImg.base64, tipo: 'image/jpeg' }]);
    } catch (e) {
      // Nunca deixa uma exceção da câmera/processamento derrubar o app.
      setACarimbar(null);
      Alert.alert('Não consegui processar a foto', 'Tente tirar novamente. Se continuar, feche e abra o app.');
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
      // Upload DIRETO ao storage (R2). O que subir vai como fotos_keys; o que falhar
      // (sem rede/4G ruim) vai no fluxo antigo, em base64 — o servidor aceita os dois.
      const keys = await uploadDiretoVarios(fotos.map(f => ({ fonte: f.uri || `data:${f.tipo || 'image/jpeg'};base64,${f.base64}`, mime: f.tipo || 'image/jpeg', finalidade: 'protocolo' })));
      const fotos_keys = keys.filter(Boolean);
      const fotos_urls = fotos.filter((f, i) => !keys[i]).map(f => f.base64).filter(Boolean);
      const endpoint = pontoId
        ? `/motoboys/app/entregas/${entregaId}/pontos/${pontoId}/concluir`
        : `/motoboys/app/entregas/${entregaId}/concluir-sem-ponto`;

      // Posição atual para a validação de raio (geofence) na central.
      const loc = pontoId ? await obterLocalizacao() : null;

      const resp = await api.post(endpoint, {
        ocorrencia_id: ocSel.id,
        recebedor:  ehInsucesso ? null : recebedor.trim(),
        observacao: observacao.trim() || null,
        fotos_keys,
        fotos_urls,
        ...(loc ? { lat: loc.lat, lng: loc.lng } : {}),
      });

      const titulo = geraRetorno ? 'Retorno registrado' : (ehInsucesso ? 'Ocorrência registrada' : 'Entregue!');
      const msg = geraRetorno
        ? 'Foi criado um ponto de retorno à coleta. A corrida só finaliza quando você concluir o retorno.'
        : 'Protocolo registrado com sucesso.';
      Alert.alert(titulo, msg, [{ text: 'OK', onPress: () => router.replace('/home') }]);
    } catch (err) {
      // Fora do raio configurado pela loja: bloqueia e oferece solicitar liberação.
      // Detecta pelo corpo do erro (err.dados) OU, como reforço, pela mensagem —
      // assim o card com botão aparece mesmo que o api ainda não recarregue.
      const foraDoRaio = err?.dados?.erro === 'FORA_DO_RAIO' || /solicitar libera/i.test(err?.message || '');
      if (foraDoRaio) {
        setBloqueio({
          distancia_m: err?.dados?.distancia_m,
          raio_m: err?.dados?.raio_m,
          mensagem: err?.dados?.mensagem || err?.message,
        });
        setLiberSolic(false);
      } else if (/sem conex|network/i.test(err?.message || '') || err?.status >= 500) {
        // NÃO volta para a home: ficar nesta tela preserva a foto e os dados
        // preenchidos. O motoboy só toca em "Confirmar" de novo — e o api já
        // repete sozinho (o backend é idempotente), então costuma ir de primeira.
        Alert.alert('Falha ao enviar', 'A conexão oscilou. Sua foto e os dados continuam aqui — toque em "Confirmar entrega" novamente.');
      } else {
        Alert.alert('Erro', err?.message || 'Não foi possível registrar.');
      }
    } finally {
      setEnviando(false);
    }
  }

  const botaoTxt = geraRetorno ? 'Deslize para registrar o retorno' : (ehInsucesso ? 'Deslize para registrar' : 'Deslize para confirmar');
  const bloqueado = !!bloqueio && !liberado;

  return (
    <View style={s.root}>
      {aCarimbar && (
        <ViewShot ref={shotRef} options={{ format: 'jpg', quality: 0.7 }}
          style={{ position: 'absolute', left: -100000, top: 0, width: aCarimbar.w, height: aCarimbar.h }}>
          <Image source={{ uri: aCarimbar.uri }} style={{ width: aCarimbar.w, height: aCarimbar.h }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,20,40,0.74)', paddingVertical: Math.round(aCarimbar.w * 0.03), paddingHorizontal: Math.round(aCarimbar.w * 0.04) }}>
            <Text style={{ color: '#fff', fontSize: aCarimbar.f1, fontWeight: '800' }}>{aCarimbar.l1}</Text>
            <Text style={{ color: '#cfe0f2', fontSize: aCarimbar.f2, fontWeight: '600', marginTop: 4 }}>{aCarimbar.l2}</Text>
          </View>
        </ViewShot>
      )}
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      {/* 11i: com edge-to-edge (SDK 54) o Android não encolhe mais a janela sozinho — sem isto o
          teclado cobria "Quem recebeu" e a observação. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ minWidth: 64 }}><Text style={s.voltar}>‹ Corrida</Text></TouchableOpacity>
        <Text style={s.headerTit}>{total && Number(total) > 1 ? `Entrega ${numero}` : 'Marcar entrega'}</Text>
        <View style={{ minWidth: 64, alignItems: 'flex-end' }}>{!!total && Number(total) > 1 && <Text style={s.pill}>{numero} de {total}</Text>}</View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* 1. Foto — o que trava a conclusão vem primeiro e grande */}
        {fotos.length === 0 ? (
          <TouchableOpacity style={s.fotoVazia} onPress={tirarFoto} activeOpacity={0.85}>
            <Text style={s.fotoVaziaIco}>📷</Text>
            <Text style={s.fotoVaziaTit}>Tirar foto do protocolo</Text>
            <Text style={s.fotoVaziaSub}>Obrigatória — sem ela a entrega não fecha</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.fotoBox}>
            <Image source={{ uri: fotos[0].uri }} style={s.fotoGrande} />
            <View style={s.fotoTag}><Text style={s.fotoTagTxt}>{fotos.length} foto{fotos.length > 1 ? 's' : ''} ✓</Text></View>
            <TouchableOpacity style={s.fotoRemover} onPress={() => removerFoto(0)}><Text style={s.fotoRemoverTxt}>×</Text></TouchableOpacity>
          </View>
        )}
        {fotos.length > 0 && (
          <View style={s.fotosLinha}>
            {fotos.slice(1).map((f, i) => (
              <View key={i + 1} style={s.miniWrap}>
                <Image source={{ uri: f.uri }} style={s.mini} />
                <TouchableOpacity style={s.miniRemover} onPress={() => removerFoto(i + 1)}><Text style={s.fotoRemoverTxt}>×</Text></TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={s.maisFoto} onPress={tirarFoto} activeOpacity={0.8}><Text style={s.maisFotoTxt}>+ outra foto</Text></TouchableOpacity>
          </View>
        )}

        {/* 2. Resultado — botões grandes; os tipos vêm da central */}
        <Text style={s.label}>Resultado</Text>
        {carregandoOc ? <ActivityIndicator color={T.primario} style={{ marginVertical: 12 }} /> : (
          <View style={s.seg}>
            {ocorrencias.map(o => {
              const sel = ocSel && ocSel.id === o.id;
              const insuc = o.tipo === 'insucesso';
              return (
                <TouchableOpacity key={o.id} activeOpacity={0.8} onPress={() => setOcSel(o)}
                  style={[s.op, sel && (insuc ? s.opRuim : s.opBom)]}>
                  <Text style={[s.opTxt, sel && { color: insuc ? T.alertaTx : T.ganhoEsc }]} numberOfLines={2}>{o.nome}</Text>
                  {o.comportamento === 'retorno' && <Text style={s.opSub}>gera retorno</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {geraRetorno && (
          <View style={s.aviso}><Text style={s.avisoTxt}>Será criado um ponto de retorno à coleta. A corrida só finaliza quando você concluir esse retorno.</Text></View>
        )}

        {/* 3. Quem recebeu (só sucesso) e observação */}
        {!ehInsucesso && (
          <View style={s.campo}>
            <Text style={s.label}>Quem recebeu</Text>
            <TextInput style={s.input} value={recebedor} onChangeText={setRecebedor} placeholder="Nome de quem assinou / recebeu" placeholderTextColor={T.tinta3} returnKeyType="next" />
          </View>
        )}
        <View style={s.campo}>
          <Text style={s.label}>Observação <Text style={s.opcional}>(opcional)</Text></Text>
          <TextInput style={[s.input, s.textarea]} value={observacao} onChangeText={setObservacao}
            placeholder={ehInsucesso ? 'Explique o que aconteceu…' : 'Ex.: deixei com o porteiro…'}
            placeholderTextColor={T.tinta3} multiline numberOfLines={3} textAlignVertical="top" />
        </View>

        {/* 4. Geofence: fora do raio → pedir liberação daqui mesmo */}
        {bloqueado && (
          <View style={s.geo}>
            <Text style={s.geoTit}>Você está fora do ponto</Text>
            <Text style={s.geoTxt}>
              {bloqueio.distancia_m != null
                ? `Está a ${bloqueio.distancia_m} m do local; precisa estar a até ${bloqueio.raio_m} m para marcar.`
                : (bloqueio.mensagem || 'Fora do raio permitido para marcar esta entrega.')}
            </Text>
            {!liberSolicitada ? (
              <TouchableOpacity style={s.geoBtn} onPress={solicitarLiberacao} disabled={solicitando} activeOpacity={0.85}>
                {solicitando ? <ActivityIndicator color="#fff" /> : <Text style={s.geoBtnTxt}>Pedir liberação à central</Text>}
              </TouchableOpacity>
            ) : <Text style={s.geoAguard}>Pedido enviado. Aguardando a central liberar…</Text>}
          </View>
        )}
        {liberado && <View style={s.geoOk}><Text style={s.geoOkTxt}>Ponto liberado pela central — pode confirmar.</Text></View>}
      </ScrollView>

      <View style={s.rodape}>
        <DeslizarParaConfirmar
          rotulo={botaoTxt} rotuloOk={geraRetorno ? 'Retorno registrado ✓' : (ehInsucesso ? 'Ocorrência registrada ✓' : 'Entrega confirmada ✓')}
          cor={ehInsucesso ? T.alerta : T.ganho} corFundo={ehInsucesso ? T.alertaBg : T.ganhoBg} corBorda={ehInsucesso ? '#f0c4be' : T.ganhoBd}
          ocupado={enviando} onConfirmar={concluir} icone="✓" />
        <Text style={s.rodapeSub}>{fotos.length === 0 ? 'Tire a foto do protocolo para liberar a confirmação' : 'Fora do raio? A central pode liberar — o pedido sai daqui mesmo.'}</Text>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.papel },
  header: { backgroundColor: T.profundo, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voltar: { color: T.claro, fontSize: 14, fontWeight: '700' },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  pill: { color: '#fff', fontSize: 12, fontWeight: '800', backgroundColor: T.primario, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  fotoVazia: { height: 196, borderRadius: T.r, borderWidth: 2, borderStyle: 'dashed', borderColor: T.claro, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center', gap: 6 },
  fotoVaziaIco: { fontSize: 34 },
  fotoVaziaTit: { fontSize: 16, fontWeight: '800', color: T.primario },
  fotoVaziaSub: { fontSize: 12.5, color: T.tinta2, fontWeight: '600' },
  fotoBox: { height: 196, borderRadius: T.r, overflow: 'hidden', borderWidth: 2, borderColor: T.ganho, backgroundColor: T.ganhoBg },
  fotoGrande: { width: '100%', height: '100%' },
  fotoTag: { position: 'absolute', right: 10, top: 10, backgroundColor: T.ganho, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  fotoTagTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  fotoRemover: { position: 'absolute', left: 10, top: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  fotoRemoverTxt: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: -2 },
  fotosLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  miniWrap: { position: 'relative' },
  mini: { width: 56, height: 56, borderRadius: 10 },
  miniRemover: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: T.alerta, alignItems: 'center', justifyContent: 'center' },
  maisFoto: { paddingVertical: 8, paddingHorizontal: 4 },
  maisFotoTxt: { color: T.primario, fontWeight: '800', fontSize: 13.5 },
  label: { fontSize: 12.5, fontWeight: '700', color: T.tinta2, marginBottom: 8, marginTop: 16 },
  opcional: { fontWeight: '500', color: T.tinta3 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  op: { flexGrow: 1, flexBasis: '30%', borderWidth: 1.5, borderColor: T.linha, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', backgroundColor: T.sup },
  opBom: { borderColor: T.ganho, backgroundColor: T.ganhoBg },
  opRuim: { borderColor: T.alerta, backgroundColor: T.alertaBg },
  opTxt: { fontWeight: '800', fontSize: 14, color: T.tinta2, textAlign: 'center' },
  opSub: { fontSize: 11, color: T.tinta3, fontWeight: '600', marginTop: 2 },
  aviso: { marginTop: 10, backgroundColor: T.alertaBg, borderRadius: 12, padding: 12 },
  avisoTxt: { fontSize: 13, color: T.alertaTx, lineHeight: 18 },
  campo: { marginTop: 0 },
  input: { backgroundColor: T.sup, borderWidth: 1.5, borderColor: T.linha, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: T.tinta, fontWeight: '600' },
  textarea: { minHeight: 74, paddingTop: 12 },
  geo: { marginTop: 18, backgroundColor: T.atencaoBg, borderRadius: 14, padding: 14 },
  geoTit: { fontSize: 14.5, fontWeight: '800', color: T.atencaoTx },
  geoTxt: { fontSize: 13.5, color: T.atencaoTx, lineHeight: 19, marginTop: 4 },
  geoBtn: { marginTop: 12, backgroundColor: T.primario, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  geoBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  geoAguard: { marginTop: 10, fontSize: 13, color: T.atencaoTx, fontWeight: '700' },
  geoOk: { marginTop: 18, backgroundColor: T.ganhoBg, borderRadius: 14, padding: 12 },
  geoOkTxt: { color: T.ganhoEsc, fontWeight: '700', fontSize: 13.5 },
  rodape: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 26, backgroundColor: T.sup, borderTopWidth: 1, borderTopColor: T.linha },
  rodapeSub: { textAlign: 'center', fontSize: 12.5, color: T.tinta2, fontWeight: '600', marginTop: 8 },
});
