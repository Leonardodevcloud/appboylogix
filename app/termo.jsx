// Termo de uso do entregador (mockups AppTermo e AppAceite, aprovados em 05/11/2026).
//
//   /termo?slug=ig     → público, antes do login (link "Ler o termo" do cadastro)
//   /termo             → logado (Perfil, cadastro aguardando a região): mostra quando ele aceitou
//   /termo?aceitar=1   → re-aceite obrigatório: a central publicou versão nova pedindo aceite.
//                        Sem voltar (nem pelo botão do Android) até ele aceitar.
//
// Termo em texto aparece com rolagem; em PDF abre no leitor de PDF do celular.
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, StatusBar, Linking, BackHandler,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, EMPRESA_NOME } from '../src/api';
import { T } from '../src/tema';
import { Alerta } from '../src/utils/avisar';
import { dataBR, horaBR, termoAceito } from '../src/utils/termo';
import Icone from '../src/componentes/Icone';

const C = {
  navy900: T.profundo, azulP: T.primario, azulV: T.vivo, azulC: T.claro,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#f4f8fd', sup: '#ffffff', sup2: '#f6faff', linha: '#dde9f5',
  okTx: '#13724c', okBg: '#e4f5ee', atenBg: '#fbf1dd', atenBd: '#ecd3a0', atenTx: '#5c3f06',
  desativado: '#9fb3c8',
};

// A URL do PDF é assinada e vale ~1 h: passou disso, busca de novo antes de abrir.
const VALIDADE_URL_MS = 50 * 60 * 1000;

export default function Termo() {
  const insetBaixo = useSafeAreaInsets().bottom;
  const { slug, aceitar } = useLocalSearchParams();
  const publico = !!slug;
  const bloquear = !publico && String(aceitar || '') === '1';

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);       // { termo, aceite, precisa }
  const [marcado, setMarcado] = useState(false);  // NUNCA começa marcado
  const [enviando, setEnviando] = useState(false);
  const buscadoEm = useRef(0);

  const buscar = useCallback(async () => {
    if (publico) {
      try {
        const t = await api.termoPublico(String(slug));
        return { termo: t && t.versao ? t : null, aceite: null, precisa: false };
      } catch (e) {
        if (e?.status === 404) return { termo: null, aceite: null, precisa: false };
        throw e;
      }
    }
    const r = await api.termoApp();
    return { termo: r?.termo || null, aceite: r?.aceite || null, precisa: !!(r?.termo && r?.precisa_aceitar) };
  }, [publico, slug]);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const d = await buscar();
      buscadoEm.current = Date.now();
      setDados(d);
      // Abriu para aceitar, mas não há o que aceitar (já aceitou em outro aparelho, termo
      // removido…): segue para a Início.
      if (bloquear && !d.precisa) { termoAceito(); router.replace('/home'); return d; }
      return d;
    } catch (e) {
      if (e?.status === 401) { await api.logout(); router.replace('/'); return null; }
      // Servidor sem a rota (versão antiga) no modo de aceite: não prende o entregador.
      if (bloquear && e?.status === 404) { termoAceito(); router.replace('/home'); return null; }
      setErro(e?.message || 'Não foi possível carregar o termo.');
      return null;
    } finally {
      setCarregando(false);
    }
  }, [buscar, bloquear]);

  useEffect(() => { carregar(); }, [carregar]);

  // Re-aceite obrigatório: o "voltar" do Android não sai desta tela.
  useEffect(() => {
    if (!bloquear) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [bloquear]);

  async function abrirPdf() {
    let url = dados?.termo?.url;
    if (!url || Date.now() - buscadoEm.current > VALIDADE_URL_MS) {
      try { const d = await buscar(); buscadoEm.current = Date.now(); setDados(d); url = d?.termo?.url; } catch { /* tenta com a que tem */ }
    }
    if (!url) { Alerta.alert('Não deu para abrir o PDF', 'Tente de novo em instantes.', [{ text: 'Fechar' }]); return; }
    try { await Linking.openURL(url); }
    catch { Alerta.alert('Não deu para abrir o PDF', 'Confira se o celular tem um leitor de PDF e tente de novo.', [{ text: 'Fechar' }]); }
  }

  async function confirmarAceite() {
    if (!marcado || enviando || !dados?.termo) return;
    setEnviando(true);
    try {
      await api.aceitarTermo(dados.termo.versao);
      termoAceito();
      if (bloquear) { router.replace('/home'); return; }
      setMarcado(false);
      await carregar();
    } catch (e) {
      if (e?.status === 409) {
        setMarcado(false);
        await carregar();
        Alerta.alert('Atenção', 'O termo foi atualizado enquanto você lia. Leia a nova versão e aceite de novo.');
      } else {
        Alerta.alert('Não foi possível', e?.message || 'Não deu para registrar o aceite. Tente de novo.');
      }
    }
    setEnviando(false);
  }

  async function sair() {
    try { await api.logout(); } catch {}
    router.replace('/');
  }

  const termo = dados?.termo || null;
  const aceite = dados?.aceite || null;
  const pedirAceite = !publico && !!termo && (bloquear || !!dados?.precisa);
  const subtitulo = termo
    ? `${EMPRESA_NOME} · versão ${termo.versao}${termo.publicado_em ? ` · publicada em ${dataBR(termo.publicado_em)}` : ''}`
    : EMPRESA_NOME;

  return (
    <View style={st.root}>
      <Stack.Screen options={{ gestureEnabled: !bloquear }} />
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <View style={st.headerLinha}>
          {!bloquear && (
            <TouchableOpacity style={st.voltar} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={8}>
              <Icone nome="voltar" tam={16} cor="#fff" traco={2.4} />
            </TouchableOpacity>
          )}
          <Text style={st.htit}>Termo de uso</Text>
        </View>
        <Text style={st.hsub}>{subtitulo}</Text>
      </View>

      {carregando ? (
        <View style={st.centro}><ActivityIndicator color={C.azulP} size="large" /></View>
      ) : erro ? (
        <View style={st.centro}>
          <Text style={st.vazioTxt}>{erro}</Text>
          <TouchableOpacity style={st.btnSec} onPress={() => { setCarregando(true); carregar(); }} accessibilityRole="button">
            <Text style={st.btnSecTxt}>Tentar de novo</Text>
          </TouchableOpacity>
          {bloquear && <TouchableOpacity style={st.btnSair} onPress={sair}><Text style={st.btnSairTxt}>Sair da conta</Text></TouchableOpacity>}
        </View>
      ) : !termo ? (
        <View style={st.centro}>
          <View style={st.vazioIco}><Icone nome="documento" tam={26} cor={C.azulP} /></View>
          <Text style={st.vazioTit}>Nenhum termo publicado</Text>
          <Text style={st.vazioTxt}>A {EMPRESA_NOME} ainda não publicou um termo de uso.</Text>
          {!bloquear && <TouchableOpacity style={st.btnSec} onPress={() => router.back()}><Text style={st.btnSecTxt}>Voltar</Text></TouchableOpacity>}
        </View>
      ) : (
        <>
          {pedirAceite && (
            <View style={st.atualizado}>
              <Icone nome="info" tam={18} cor={C.atenTx} />
              <Text style={st.atualizadoTxt}>A {EMPRESA_NOME} atualizou o termo de uso. Leia e aceite para continuar usando o app.</Text>
            </View>
          )}

          {termo.tipo === 'pdf' ? (
            <View style={[st.cartao, st.cartaoPdf]}>
              <View style={st.pdfIco}><Icone nome="documento" tam={28} cor={C.azulP} /></View>
              <Text style={st.pdfNome} numberOfLines={2}>{termo.arquivo_nome || 'Termo de uso (PDF)'}</Text>
              <Text style={st.pdfTxt}>O termo está em PDF. Ele abre no leitor de PDF do seu celular.</Text>
              <TouchableOpacity style={st.btnPdf} onPress={abrirPdf} activeOpacity={0.85} accessibilityRole="button">
                <Text style={st.btnPdfTxt}>Abrir o termo (PDF)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={st.cartao} contentContainerStyle={{ padding: 16 }}>
              <Text style={st.texto} selectable>{termo.texto || ''}</Text>
            </ScrollView>
          )}

          {!pedirAceite && !!aceite && (
            <View style={[st.aceitoBox, { marginBottom: 16 + insetBaixo }]}>
              <Icone nome="check" tam={18} cor={C.okTx} traco={2.4} />
              <Text style={st.aceitoTxt}>
                {aceite.versao === termo.versao
                  ? `Você aceitou esta versão em ${dataBR(aceite.aceito_em)} às ${horaBR(aceite.aceito_em)}`
                  : `Você aceitou a versão ${aceite.versao} em ${dataBR(aceite.aceito_em)} às ${horaBR(aceite.aceito_em)}`}
              </Text>
            </View>
          )}

          {pedirAceite && (
            <View style={[st.rodape, { paddingBottom: Math.max(18, 12 + insetBaixo) }]}>
              <TouchableOpacity style={st.aceiteLinha} onPress={() => setMarcado(v => !v)} activeOpacity={0.8}
                accessibilityRole="checkbox" accessibilityState={{ checked: marcado }} accessibilityLabel="Li e aceito o termo de uso">
                <View style={[st.caixa, marcado && st.caixaOn]}>{marcado && <Icone nome="check" tam={15} cor="#fff" traco={3} />}</View>
                <Text style={st.aceiteTxt}>Li e aceito o termo de uso</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btnAceitar, !marcado && st.btnDesativado, enviando && { opacity: 0.6 }]}
                onPress={confirmarAceite} disabled={!marcado || enviando} activeOpacity={0.85}
                accessibilityRole="button" accessibilityState={{ disabled: !marcado || enviando }}>
                {enviando ? <ActivityIndicator color="#fff" /> : <Text style={st.btnAceitarTxt}>Aceitar e continuar</Text>}
              </TouchableOpacity>
              {bloquear && (
                <TouchableOpacity style={st.btnSair} onPress={sair} accessibilityRole="button">
                  <Text style={st.btnSairTxt}>Sair da conta</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {!pedirAceite && !aceite && <View style={{ height: 12 + insetBaixo }} />}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16, gap: 6 },
  headerLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  voltar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  htit: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hsub: { color: C.azulC, fontSize: 12, fontWeight: '600' },

  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  vazioIco: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, alignItems: 'center', justifyContent: 'center' },
  vazioTit: { fontSize: 16, fontWeight: '800', color: C.tinta },
  vazioTxt: { fontSize: 13.5, color: C.tinta2, textAlign: 'center', lineHeight: 20 },

  atualizado: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginHorizontal: 12, marginTop: 12, backgroundColor: C.atenBg, borderWidth: 1, borderColor: C.atenBd, borderRadius: 12, padding: 12 },
  atualizadoTxt: { flex: 1, fontSize: 13, color: C.atenTx, lineHeight: 19, fontWeight: '600' },

  cartao: { flex: 1, margin: 12, backgroundColor: C.sup, borderRadius: 16, borderWidth: 1, borderColor: C.linha },
  texto: { fontSize: 13.5, lineHeight: 21.5, color: C.tinta },
  cartaoPdf: { alignItems: 'center', justifyContent: 'center', padding: 22, gap: 10 },
  pdfIco: { width: 60, height: 60, borderRadius: 16, backgroundColor: C.sup2, borderWidth: 1, borderColor: C.linha, alignItems: 'center', justifyContent: 'center' },
  pdfNome: { fontSize: 15, fontWeight: '800', color: C.tinta, textAlign: 'center' },
  pdfTxt: { fontSize: 13, color: C.tinta2, textAlign: 'center', lineHeight: 19 },
  btnPdf: { marginTop: 6, alignSelf: 'stretch', backgroundColor: C.azulP, borderRadius: 13, paddingVertical: 15, alignItems: 'center' },
  btnPdfTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  aceitoBox: { marginHorizontal: 12, backgroundColor: C.okBg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  aceitoTxt: { flex: 1, fontSize: 12.5, color: C.okTx, fontWeight: '600' },

  rodape: { backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha, paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  aceiteLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  caixa: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.tinta3, backgroundColor: C.sup, alignItems: 'center', justifyContent: 'center' },
  caixaOn: { borderColor: C.azulP, backgroundColor: C.azulP },
  aceiteTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: C.tinta },
  btnAceitar: { backgroundColor: C.azulP, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnDesativado: { backgroundColor: C.desativado },
  btnAceitarTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  btnSec: { marginTop: 6, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.azulP },
  btnSecTxt: { color: C.azulP, fontSize: 14, fontWeight: '700' },
  btnSair: { alignItems: 'center', paddingVertical: 8 },
  btnSairTxt: { color: C.tinta3, fontSize: 13, fontWeight: '700' },
});
