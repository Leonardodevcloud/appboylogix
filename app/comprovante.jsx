// Comprovante do acerto (mockup aprovado em 12/10/2026, ADR-049 do backend).
// O que entrou no acerto (corridas, créditos, débitos com as parcelas e saques), quanto
// caiu, quando, para qual chave Pix e a transação. "Compartilhar PDF" manda o link do PDF
// (assinado, abre sem login) pelo WhatsApp ou onde ele escolher; "Abrir PDF" abre no
// navegador do celular, de onde dá para salvar. Abre também pelo push "Acerto pago".
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, StatusBar, Share, Linking, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, API_URL } from '../src/api';
import { T, reais } from '../src/tema';
import { Alerta } from '../src/utils/avisar';
import Icone from '../src/componentes/Icone';

const br = (iso, ano = true) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return ano ? `${d}/${m}/${a}` : `${d}/${m}`; };
const dataHora = (iso) => {
  try { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' })}`; }
  catch { return ''; }
};

function Linha({ rot, val, cor, forte, grande }) {
  return (
    <View style={st.linha}>
      <Text style={[st.rot, grande && st.rotGrande]}>{rot}</Text>
      <Text style={[st.val, forte && st.valForte, grande && st.valGrande, cor && { color: cor }]} numberOfLines={2}>{val}</Text>
    </View>
  );
}

export default function Comprovante() {
  const { id } = useLocalSearchParams();
  const [c, setC] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    try { setC(await api.get('/app/financeiro/acertos/' + id)); setErro(null); }
    catch (e) { setErro(e?.status === 404 ? 'Este acerto não foi encontrado.' : 'Não deu para carregar o comprovante agora.'); }
  }, [id]);
  useEffect(() => { if (id) carregar(); }, [id, carregar]);

  const urlPdf = c && c.pdf ? API_URL + c.pdf.caminho : null;
  const periodo = c ? `${br(c.periodo_de, false)} a ${br(c.periodo_ate)}` : '';

  async function compartilhar() {
    if (!urlPdf) return;
    try {
      await Share.share({ title: 'Comprovante do acerto', message: `Comprovante do acerto ${periodo} · ${reais(c.valor_cent)} (${c.empresa_nome})\n${urlPdf}` });
    } catch { /* cancelou */ }
  }
  async function abrir() {
    if (!urlPdf) return;
    try { await Linking.openURL(urlPdf); } catch { Alerta.alert('Não deu para abrir o PDF', 'Tente pelo "Compartilhar PDF".', [{ text: 'Fechar' }]); }
  }

  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/ganhos?aba=acertos'));
  const pago = c && c.status === 'pago';

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      <View style={st.header}>
        <TouchableOpacity onPress={voltar} style={st.btnVoltar} accessibilityLabel="Voltar"><Icone nome="voltar" tam={24} cor={'#fff'} traco={2.4} /></TouchableOpacity>
        <Text style={st.headerTit}>Comprovante</Text>
        <View style={{ width: 38 }} />
      </View>
      {!c && !erro && <ActivityIndicator color={T.vivo} size="large" style={{ marginTop: 60 }} />}
      {erro && !c && (
        <View style={st.vazio}>
          <Text style={st.vazioTx}>{erro}</Text>
          <TouchableOpacity onPress={carregar} style={st.btnSec}><Text style={st.btnSecTx}>Tentar de novo</Text></TouchableOpacity>
        </View>
      )}
      {c && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={st.card}>
            <View style={{ alignItems: 'center', marginBottom: 14 }}>
              <Image source={require('../assets/marca/logo.png')} style={st.logo} resizeMode="contain" />
              <Text style={[st.tag, pago ? st.tagOk : st.tagAt]}>{pago ? 'Acerto pago' : 'A pagar pela central'}</Text>
            </View>
            <Linha rot="Profissional" val={`${c.profissional.nome}${c.profissional.codigo ? ' · cód. ' + c.profissional.codigo : ''}`} forte />
            <Linha rot="Período" val={`${br(c.periodo_de, false)} a ${br(c.periodo_ate)}`} forte />
            <Linha rot={`Corridas (${c.corridas.qtd})`} val={reais(c.corridas.total_cent)} forte />
            {c.creditos.qtd > 0 && <Linha rot={`Créditos (${c.creditos.qtd})`} val={`+ ${reais(c.creditos.total_cent)}`} cor={T.ganho} forte />}
            {c.creditos.itens.map((x, i) => <Text key={'c' + i} style={st.det}>{x.descricao} ({reais(x.valor_cent)})</Text>)}
            {c.debitos.qtd > 0 && <Linha rot={`Débitos (${c.debitos.qtd})`} val={`− ${reais(c.debitos.total_cent)}`} cor={T.alerta} forte />}
            {c.debitos.itens.map((x, i) => <Text key={'d' + i} style={st.det}>{x.descricao} ({reais(x.valor_cent)})</Text>)}
            <View style={st.tracejado} />
            <Linha rot={pago ? 'Recebido' : 'A receber'} val={reais(c.valor_cent)} forte grande />
            {pago && <Linha rot="Pago em" val={dataHora(c.pago_em)} forte />}
            {pago && c.forma && <Linha rot="Forma" val={c.forma} />}
            {c.pix && <Linha rot="Pix para" val={`${c.pix.rotulo} ${c.pix.chave}`} forte />}
            {c.transacao && <Linha rot="Transação" val={c.transacao.curta} />}
          </View>
          {pago ? (
            <>
              <TouchableOpacity style={st.btnPri} onPress={compartilhar} accessibilityRole="button"><Text style={st.btnPriTx}>Compartilhar PDF</Text></TouchableOpacity>
              <TouchableOpacity style={st.btnSec} onPress={abrir} accessibilityRole="button"><Text style={st.btnSecTx}>Abrir PDF</Text></TouchableOpacity>
              <Text style={st.nota}>O link do PDF vale por {c.pdf && c.pdf.expira_em ? `até ${br(c.pdf.expira_em.slice(0, 10))}` : 'alguns dias'}. Depois, é só abrir este comprovante de novo.</Text>
            </>
          ) : (
            <Text style={st.nota}>Quando a central pagar, este comprovante mostra quando e como, e libera o PDF.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.papel },
  header: { backgroundColor: T.profundo, paddingTop: 52, paddingBottom: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  btnVoltarTxt: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: -2 },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  card: { backgroundColor: T.sup, borderRadius: T.r, borderWidth: 1, borderColor: T.linha, padding: 18, marginBottom: 14 },
  logo: { width: 120, height: 40, marginBottom: 6 },
  tag: { fontSize: 11, fontWeight: '800', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  tagOk: { color: T.ganhoEsc, backgroundColor: T.ganhoBg },
  tagAt: { color: T.atencaoTx, backgroundColor: T.atencaoBg },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, gap: 12 },
  rot: { fontSize: 13.5, color: T.tinta2 },
  rotGrande: { fontSize: 15, color: T.tinta, fontWeight: '700' },
  val: { fontSize: 13.5, color: T.tinta, flexShrink: 1, textAlign: 'right' },
  valForte: { fontWeight: '800' },
  valGrande: { fontSize: 22, fontWeight: '900' },
  det: { fontSize: 11.5, color: T.tinta3, marginLeft: 8, marginTop: -2, marginBottom: 4 },
  tracejado: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: T.linha, marginVertical: 10 },
  btnPri: { backgroundColor: T.primario, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  btnPriTx: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnSec: { backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4, paddingHorizontal: 18 },
  btnSecTx: { color: T.primario, fontSize: 14, fontWeight: '800' },
  nota: { fontSize: 11.5, color: T.tinta3, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  vazio: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  vazioTx: { fontSize: 14, color: T.tinta2, textAlign: 'center', marginBottom: 14 },
});
