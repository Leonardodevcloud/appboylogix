import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar, Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';
import SheetNavegacao from '../src/componentes/SheetNavegacao';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', linha: '#dde9f5',
  ok: '#1f9d6b', okV: '#27b67f', warn: '#f59e0b',
};

const STATUS_LABEL = {
  aguardando_coleta: 'Ir coletar',
  em_coleta: 'Coletando',
  em_rota: 'Em rota',
};
const PROXIMO = { aguardando_coleta: 'em_coleta', em_coleta: 'em_rota' };

function reais(cent) {
  if (cent == null) return '—';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}
function hora(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

export default function Corrida() {
  const params = useLocalSearchParams();
  const [entrega, setEntrega] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [navAlvo, setNavAlvo] = useState(null);

  async function carregar() {
    try {
      const fila = await api.get('/motoboys/app/fila');
      const e = (fila || []).find(x => x.id === params.entrega_id) || (fila || [])[0];
      if (!e) { router.replace('/home'); return; }
      setEntrega(e);
    } catch (err) { /* mantém */ }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 20000);
    return () => clearInterval(t);
  }, []);

  async function avancar() {
    if (busy || !entrega) return;
    const prox = PROXIMO[entrega.status];
    if (!prox) return;
    setBusy(true);
    try { await api.patch(`/motoboys/app/entregas/${entrega.id}/status`, { status: prox }); await carregar(); }
    catch (e) { Alert.alert('Ops', e.message || 'Não foi possível avançar'); }
    setBusy(false);
  }

  function navegar(lat, lng, label) {
    setNavAlvo({ lat, lng, label });
  }

  function ligar(tel) {
    if (!tel) return;
    Linking.openURL(`tel:${tel.replace(/\D/g, '')}`);
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }
  if (!entrega) return null;

  const pontos = entrega.pontos || [];
  const coletou = entrega.status === 'em_rota' || entrega.status === 'em_coleta' ? entrega.status === 'em_rota' : false;
  const jaColetou = entrega.status === 'em_rota';
  const concluidos = pontos.filter(p => p.status === 'entregue' || p.status === 'concluido' || p.finalizado_em).length;
  const totalPontos = pontos.length;
  const proxPonto = pontos.find(p => !(p.status === 'entregue' || p.status === 'concluido' || p.finalizado_em));

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />

      {/* Cabeçalho resumo */}
      <View style={st.header}>
        <View style={st.headerTopo}>
          <TouchableOpacity onPress={() => router.replace('/home')} style={{ width: 56 }}>
            <Text style={st.voltar}>‹ Início</Text>
          </TouchableOpacity>
          <View style={st.statusPill}><Text style={st.statusPillTxt}>{STATUS_LABEL[entrega.status] || entrega.status}</Text></View>
        </View>
        <Text style={st.osLabel}>CORRIDA ATIVA</Text>
        <Text style={st.osNum}>{entrega.protocolo}</Text>
        {!!entrega.cliente_nome && <Text style={st.cliente}>🏢 {entrega.cliente_nome}</Text>}
        <View style={st.resumoStats}>
          <View><Text style={st.statB}>{reais(entrega.valor_motoboy_cent)}</Text><Text style={st.statL}>valor</Text></View>
          <View><Text style={st.statB}>{concluidos} de {totalPontos}</Text><Text style={st.statL}>entregas</Text></View>
          {Number.isFinite(Number(entrega.distancia_km)) && Number(entrega.distancia_km) > 0 && <View><Text style={st.statB}>{Number(entrega.distancia_km).toFixed(1)} km</Text><Text style={st.statL}>rota</Text></View>}
        </View>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={st.timeline}>
          {/* COLETA */}
          <View style={st.linha}>
            <View style={st.coluna}>
              <View style={[st.no, jaColetou ? st.noOk : st.noAtual]}>
                {jaColetou ? <Text style={st.noIco}>✓</Text> : <View style={st.noPulse} />}
              </View>
              <View style={[st.traco, jaColetou ? st.tracoOk : st.tracoOff]} />
            </View>
            <View style={st.conteudo}>
              <Text style={[st.etapaTit, jaColetou ? st.txtOk : st.txtAtual]}>Coleta {jaColetou ? '' : '· agora'}</Text>
              <Text style={st.etapaNome}>{entrega.coleta_nome || 'Ponto de coleta'}</Text>
              <Text style={st.etapaEnd}>{entrega.coleta_endereco}</Text>
              {jaColetou && !!entrega.iniciada_em && <Text style={st.etapaHora}>Coletado às {hora(entrega.iniciada_em)}</Text>}
              {!jaColetou && (
                <View style={st.acoesPonto}>
                  <TouchableOpacity style={st.btnNav} onPress={() => navegar(entrega.coleta_lat, entrega.coleta_lng, entrega.coleta_endereco)}>
                    <Text style={st.btnNavTxt}>➤  Navegar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* PONTOS DE ENTREGA */}
          {pontos.map((p, i) => {
            const feito = p.status === 'entregue' || p.status === 'concluido' || !!p.finalizado_em;
            const atual = jaColetou && !feito && proxPonto && p.id === proxPonto.id;
            const ultimo = i === pontos.length - 1;
            return (
              <View key={p.id} style={st.linha}>
                <View style={st.coluna}>
                  <View style={[st.no, feito ? st.noOk : atual ? st.noAtual : st.noFuturo]}>
                    {feito ? <Text style={st.noIco}>✓</Text> : atual ? <View style={st.noPulse} /> : <Text style={st.noNum}>{i + 1}</Text>}
                  </View>
                  {!ultimo && <View style={[st.traco, feito ? st.tracoOk : st.tracoOff]} />}
                </View>
                <View style={st.conteudo}>
                  <Text style={[st.etapaTit, feito ? st.txtOk : atual ? st.txtAtual : st.txtFuturo]}>
                    {totalPontos > 1 ? `Entrega ${i + 1}` : 'Entrega'}{atual ? ' · agora' : ''}
                  </Text>
                  <Text style={[st.etapaNome, !feito && !atual && st.txtFuturo]}>{p.nome_fantasia || 'Destino'}</Text>
                  <Text style={[st.etapaEnd, !feito && !atual && st.txtFuturo]}>{p.endereco}</Text>
                  {!!p.complemento && <Text style={st.etapaInfo}>📌 {p.complemento}</Text>}
                  {!!p.numero_nf && <Text style={st.etapaInfo}>🧾 NF {p.numero_nf}</Text>}
                  {!!p.observacoes && atual && <Text style={st.etapaObs}>💬 {p.observacoes}</Text>}
                  {feito && !!p.finalizado_em && <Text style={st.etapaHora}>Entregue às {hora(p.finalizado_em)}</Text>}
                  {atual && (
                    <View style={st.acoesPonto}>
                      <TouchableOpacity style={st.btnNav} onPress={() => navegar(p.lat, p.lng, p.endereco)}>
                        <Text style={st.btnNavTxt}>➤  Navegar</Text>
                      </TouchableOpacity>
                      {!!p.telefone && (
                        <TouchableOpacity style={st.btnTel} onPress={() => ligar(p.telefone)}>
                          <Text style={st.btnTelTxt}>📞 Ligar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Ação principal da etapa */}
      <View style={st.rodape}>
        {!jaColetou ? (
          entrega.status === 'aguardando_coleta' ? (
            <TouchableOpacity style={st.btnPrincipal} onPress={avancar} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPrincipalTxt}>Cheguei na coleta</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={st.btnPrincipal} onPress={avancar} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnPrincipalTxt}>Coletei — iniciar entregas</Text>}
            </TouchableOpacity>
          )
        ) : proxPonto ? (
          <TouchableOpacity style={st.btnPrincipal}
            onPress={() => router.push({ pathname: '/concluir', params: { entregaId: entrega.id, pontoId: proxPonto.id, endereco: proxPonto.endereco, numero: concluidos + 1, total: totalPontos } })}
            activeOpacity={0.85}>
            <Text style={st.btnPrincipalTxt}>Cheguei — confirmar entrega {totalPontos > 1 ? concluidos + 1 : ''}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[st.btnPrincipal, { backgroundColor: C.ok }]}>
            <Text style={st.btnPrincipalTxt}>Corrida concluída ✓</Text>
          </View>
        )}
      </View>

      <SheetNavegacao alvo={navAlvo} aoFechar={() => setNavAlvo(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },

  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 18, paddingHorizontal: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  voltar: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  statusPill: { backgroundColor: C.azulP, paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20 },
  statusPillTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  osLabel: { color: '#9fb8d0', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  osNum: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 1 },
  cliente: { color: C.azulC, fontSize: 13, marginTop: 3, fontWeight: '600' },
  resumoStats: { flexDirection: 'row', gap: 20, marginTop: 14 },
  statB: { color: '#fff', fontSize: 16, fontWeight: '800' },
  statL: { color: '#9fb8d0', fontSize: 10, marginTop: 1 },

  body: { flex: 1 },
  timeline: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, padding: 16 },
  linha: { flexDirection: 'row', gap: 12 },
  coluna: { width: 26, alignItems: 'center' },
  no: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  noOk: { backgroundColor: C.okV },
  noAtual: { backgroundColor: C.azulP, borderWidth: 3, borderColor: C.azulC },
  noFuturo: { backgroundColor: C.fundo, borderWidth: 2, borderColor: '#cdd9e8' },
  noIco: { color: '#fff', fontSize: 15, fontWeight: '900' },
  noNum: { color: C.tinta3, fontSize: 12, fontWeight: '800' },
  noPulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  traco: { width: 2, flex: 1, minHeight: 22, marginVertical: 3 },
  tracoOk: { backgroundColor: C.okV },
  tracoOff: { backgroundColor: C.linha },

  conteudo: { flex: 1, paddingBottom: 22 },
  etapaTit: { fontSize: 13, fontWeight: '800' },
  txtOk: { color: C.ok },
  txtAtual: { color: C.azulP },
  txtFuturo: { color: C.tinta3 },
  etapaNome: { fontSize: 14.5, fontWeight: '700', color: C.tinta, marginTop: 2 },
  etapaEnd: { fontSize: 13, color: C.tinta2, marginTop: 1, lineHeight: 18 },
  etapaInfo: { fontSize: 12.5, color: C.tinta2, marginTop: 4 },
  etapaObs: { fontSize: 12.5, color: C.tinta2, marginTop: 6, fontStyle: 'italic', backgroundColor: '#f6f9fc', padding: 8, borderRadius: 8 },
  etapaHora: { fontSize: 12, color: C.ok, marginTop: 3, fontWeight: '600' },

  acoesPonto: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnNav: { backgroundColor: '#eef4fb', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  btnNavTxt: { color: C.azulP, fontSize: 12.5, fontWeight: '700' },
  btnTel: { backgroundColor: '#eef4fb', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
  btnTelTxt: { color: C.azulP, fontSize: 12.5, fontWeight: '700' },

  rodape: { padding: 16, paddingBottom: 28, backgroundColor: C.fundo, borderTopWidth: 1, borderTopColor: C.linha },
  btnPrincipal: { backgroundColor: C.okV, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnPrincipalTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
