import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, StatusBar, Image, Modal, Pressable, RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { irPara } from '../src/navegacao/abas';
import { api } from '../src/api';
import { T, reais } from '../src/tema';
import Icone from '../src/componentes/Icone';
import ValorDinamica from '../src/componentes/ValorDinamica';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Detalhe de uma corrida do Histórico (mockup aprovado em 12/10/2026): o que ele recebeu,
// km, duração, os horários de cada etapa, cada parada com quem recebeu (ou a ocorrência)
// e as fotos do comprovante. Backend: GET /motoboys/app/historico/:id (só a corrida dele).

const horaDe = (iso) => { try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const diaDe = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; } };
const kmTxt = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n.toFixed(1).replace('.', ',') + ' km' : '—'; };
function duracao(e) {
  let min = Number(e.tempo_total_min);
  if (!Number.isFinite(min) || min <= 0) {
    const ini = e.iniciada_em || e.criado_em;
    if (ini && e.concluida_em) min = Math.round((new Date(e.concluida_em) - new Date(ini)) / 60000);
  }
  if (!Number.isFinite(min) || min <= 0) return '—';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

export default function CorridaDetalhe() {
  const insetBaixo = useSafeAreaInsets().bottom;   // botões do Android no rodapé: o conteúdo fica acima deles
  const { id } = useLocalSearchParams();
  const [c, setC] = useState(null);
  const [erro, setErro] = useState(null);
  const [puxando, setPuxando] = useState(false);
  const [foto, setFoto] = useState(null);

  const carregar = useCallback(async () => {
    try { setC(await api.get('/motoboys/app/historico/' + id)); setErro(null); }
    catch (e) { setErro(e?.status === 404 ? 'Corrida não encontrada.' : (e?.message || 'Não consegui carregar a corrida.')); }
    setPuxando(false);
  }, [id]);
  useEffect(() => { carregar(); }, [carregar]);

  const voltar = () => (router.canGoBack() ? router.back() : irPara('/historico'));

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      <View style={st.header}>
        <TouchableOpacity onPress={voltar} style={st.btnVoltar} accessibilityLabel="Voltar"><Icone nome="voltar" tam={24} cor="#fff" traco={2.4} /></TouchableOpacity>
        <Text style={st.headerTit}>{c ? `Corrida ${c.protocolo}` : 'Corrida'}</Text>
        <View style={{ width: 38 }} />
      </View>

      {!c && !erro ? (
        <View style={st.center}><ActivityIndicator color={T.primario} size="large" /></View>
      ) : erro ? (
        <View style={st.center}>
          <View style={st.vazioIco}><Icone nome="alerta" tam={28} cor={T.primario} traco={1.8} /></View>
          <Text style={st.vazioTit}>{erro}</Text>
          <TouchableOpacity style={st.btnTentar} onPress={() => { setErro(null); carregar(); }}><Text style={st.btnTentarTxt}>Tentar de novo</Text></TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insetBaixo }}
          refreshControl={<RefreshControl refreshing={puxando} onRefresh={() => { setPuxando(true); carregar(); }} />}>
          <Text style={st.dia}>{diaDe(c.concluida_em || c.criado_em)}{c.cliente_nome ? ` · ${c.cliente_nome}` : ''}</Text>
          <View style={st.res}>
            <View style={st.resItem}><Text style={[st.resB, { color: T.ganho }]}>{reais(c.valor_motoboy_cent)}</Text><Text style={st.resL}>Você recebeu</Text></View>
            <View style={st.resItem}><Text style={st.resB}>{kmTxt(c.distancia_km)}</Text><Text style={st.resL}>Distância</Text></View>
            <View style={st.resItem}><Text style={st.resB}>{duracao(c)}</Text><Text style={st.resL}>Duração</Text></View>
          </View>
          {Number(c.dinamica_motoboy_cent) > 0 && (
            <View style={st.dinBox}>
              <ValorDinamica totalCent={c.valor_motoboy_cent} dinamicaCent={c.dinamica_motoboy_cent} nome={c.dinamica_nome} alinhar="center" numberOfLines={2} style={{ fontSize: 12.5 }} />
            </View>
          )}

          <View style={st.card}>
            <Parada letra="C" cor={T.profundo} titulo={`Coleta${c.coleta_nome ? ' · ' + c.coleta_nome : ''}`} endereco={c.coleta_endereco}
              linha={[c.chegada_coleta_em && `Chegou ${horaDe(c.chegada_coleta_em)}`, c.iniciada_em && `coletada ${horaDe(c.iniciada_em)}`].filter(Boolean).join(' · ')}
              ultimo={!(c.pontos || []).length} />
            {(c.pontos || []).map((p, i, arr) => {
              const insucesso = p.status === 'insucesso';
              const quando = p.entregue_em || p.finalizado_em;
              const titulo = p.eh_retorno ? 'Retorno à coleta' : `${arr.length > 1 ? `Entrega ${i + 1}` : 'Entrega'}${p.nome_fantasia || p.nome ? ' · ' + (p.nome_fantasia || p.nome) : ''}`;
              const linha = insucesso
                ? `${p.ocorrencia_nome || 'Não entregue'}${quando ? ' · ' + horaDe(quando) : ''}`
                : quando ? `Entregue ${horaDe(quando)}${p.recebedor ? ' · recebeu: ' + p.recebedor : ''}` : 'Pendente';
              return (
                <Parada key={p.id} feita={!insucesso && !!quando} insucesso={insucesso} titulo={titulo}
                  endereco={[p.endereco, p.complemento].filter(Boolean).join(' · ')} linha={linha}
                  nf={p.numero_nf} obs={p.observacao_motoboy} semSinal={!!p.enviado_depois_em}
                  fotos={p.fotos || []} aoVerFoto={setFoto} ultimo={i === arr.length - 1} />
              );
            })}
          </View>
          {(c.pontos || []).some(p => (p.fotos || []).length) && <Text style={st.dica}>Toque numa foto para ver em tela cheia.</Text>}
        </ScrollView>
      )}

      <Modal visible={!!foto} transparent animationType="fade" onRequestClose={() => setFoto(null)} statusBarTranslucent>
        <Pressable style={st.fotoFundo} onPress={() => setFoto(null)}>
          {!!foto && <Image source={{ uri: foto }} style={st.fotoCheia} resizeMode="contain" />}
          <View style={st.fotoFechar}><Icone nome="fechar" tam={22} cor="#fff" /></View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Parada({ letra, cor, feita, insucesso, titulo, endereco, linha, nf, obs, semSinal, fotos = [], aoVerFoto, ultimo }) {
  const fundo = insucesso ? T.alerta : feita ? T.ganho : (cor || T.tinta3);
  return (
    <View style={st.p}>
      {!ultimo && <View style={st.trilho} />}
      <View style={[st.pin, { backgroundColor: fundo }]}>
        {letra ? <Text style={st.pinTxt}>{letra}</Text> : <Icone nome={insucesso ? 'fechar' : 'check'} tam={12} cor="#fff" traco={3} />}
      </View>
      <View style={{ flex: 1, paddingBottom: ultimo ? 0 : 14 }}>
        <Text style={st.pTit}>{titulo}</Text>
        {!!endereco && <Text style={st.pEnd}>{endereco}</Text>}
        {!!linha && <Text style={[st.pLinha, insucesso && { color: T.alertaTx }]}>{linha}</Text>}
        {!!obs && <Text style={st.pObs}>"{obs}"</Text>}
        {fotos.length > 0 && (
          <View style={st.fotos}>
            {fotos.map((f, k) => f.url ? (
              <TouchableOpacity key={k} onPress={() => aoVerFoto(f.url)} activeOpacity={0.85} accessibilityLabel="Ver foto do comprovante">
                <Image source={{ uri: f.url }} style={st.thumb} />
              </TouchableOpacity>
            ) : null)}
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {!!nf && <View style={st.tag}><Icone nome="nota" tam={11} cor={T.ganhoEsc} /><Text style={st.tagTxt}>NF {nf}</Text></View>}
          {semSinal && <View style={[st.tag, { backgroundColor: T.atencaoBg }]}><Icone nome="semSinal" tam={11} cor={T.atencaoTx} /><Text style={[st.tagTxt, { color: T.atencaoTx }]}>Enviada depois (sem sinal)</Text></View>}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.papel },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { backgroundColor: T.profundo, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  dia: { fontSize: 12, fontWeight: '700', color: T.tinta2, marginBottom: 10 },
  res: { flexDirection: 'row', gap: 8 },
  dinBox: { backgroundColor: T.dinamicaBg, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, marginTop: -4, marginBottom: 12 },
  resItem: { flex: 1, backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  resB: { fontSize: 15.5, fontWeight: '800', color: T.tinta },
  resL: { fontSize: 9.5, color: T.tinta3, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  card: { backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 14, padding: 14, marginTop: 12 },
  p: { flexDirection: 'row', gap: 10, position: 'relative' },
  trilho: { position: 'absolute', left: 10, top: 24, bottom: 0, width: 2, backgroundColor: T.linha },
  pin: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pinTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  pTit: { fontSize: 13.5, fontWeight: '800', color: T.tinta },
  pEnd: { fontSize: 12, color: T.tinta2, marginTop: 1 },
  pLinha: { fontSize: 11.5, color: T.tinta3, fontWeight: '600', marginTop: 3 },
  pObs: { fontSize: 11.5, color: T.tinta2, fontStyle: 'italic', marginTop: 3 },
  fotos: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: T.suave },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: T.ganhoBg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  tagTxt: { fontSize: 10.5, fontWeight: '800', color: T.ganhoEsc },
  dica: { fontSize: 11.5, color: T.tinta3, textAlign: 'center', marginTop: 10 },
  vazioIco: { width: 56, height: 56, borderRadius: 16, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  vazioTit: { fontSize: 14, fontWeight: '700', color: T.tinta2, textAlign: 'center' },
  btnTentar: { marginTop: 14, backgroundColor: T.primario, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 },
  btnTentarTxt: { color: '#fff', fontWeight: '800' },
  fotoFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  fotoCheia: { width: '100%', height: '80%' },
  fotoFechar: { position: 'absolute', top: 48, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
