import { useState, useEffect, useRef } from 'react';
import { abrirSocket } from '../src/realtime/socket';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar, Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, getToken } from '../src/api';
import SheetNavegacao from '../src/componentes/SheetNavegacao';
import DeslizarParaConfirmar from '../src/componentes/DeslizarParaConfirmar';
import { T, reais, hora } from '../src/tema';


const PROXIMO = { aguardando_coleta: 'em_coleta', em_coleta: 'em_rota' };


export default function Corrida() {
  const params = useLocalSearchParams();
  const [entrega, setEntrega] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [navAlvo, setNavAlvo] = useState(null);
  const [chatAtivo, setChatAtivo] = useState(false);
  useEffect(() => {
    let vivo = true;
    api.chatNaoLidas().then(r => { if (vivo) setChatAtivo(!!r.ativo); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  async function carregar() {
    try {
      const fila = await api.get('/motoboys/app/fila');
      const e = (fila || []).find(x => x.id === params.entrega_id) || (fila || [])[0];
      if (!e) { router.replace('/home'); return null; }
      setEntrega(e);
      setCarregando(false);
      return e;
    } catch (err) { /* mantém */ }
    setCarregando(false);
    return null;
  }

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 20000);

    // WebSocket: reage na hora se a central editar, remover, cancelar ou finalizar esta corrida.
    let ws;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        ws = abrirSocket(token);
        ws.onmessage = (ev) => {
          try {
            const { evento, dados } = JSON.parse(ev.data);
            if (evento === 'entrega.editada') {
              if (!dados?.entregaId || dados.entregaId === params.entrega_id) {
                Alert.alert('Corrida atualizada', 'A central alterou esta corrida. Atualizando os dados.');
                carregar();
              }
            } else if (evento === 'entrega.removida') {
              if (!dados?.entregaId || dados.entregaId === params.entrega_id) {
                Alert.alert('Corrida removida', 'Esta corrida foi removida de você pela central.', [
                  { text: 'OK', onPress: () => router.replace('/home') },
                ]);
              } else {
                carregar();
              }
            } else if (evento === 'entrega.cancelada') {
              // A central cancelou ESTA corrida enquanto o motoboy está nela: avisa e volta para a Home.
              if (!dados?.entregaId || dados.entregaId === params.entrega_id) {
                Alert.alert('Corrida cancelada', 'Esta corrida foi cancelada pela central.', [
                  { text: 'OK', onPress: () => router.replace('/home') },
                ]);
              } else {
                carregar();
              }
            } else if (evento === 'entrega.concluida') {
              // Esta corrida foi finalizada (pela central): volta para a Home.
              if (!dados?.entregaId || dados.entregaId === params.entrega_id) {
                router.replace('/home');
              }
            } else if (evento === 'entrega.atribuida') {
              carregar();
            }
          } catch {}
        };
      } catch {}
    })();

    return () => { clearInterval(t); try { ws?.close(); } catch {} };
  }, []);

  async function avancar() {
    if (busy || !entrega) return;
    const prox = PROXIMO[entrega.status];
    if (!prox) return;
    setBusy(true);
    try {
      await api.patch(`/motoboys/app/entregas/${entrega.id}/status`, { status: prox });
      await carregar();
    } catch (e) {
      // A ação pode ter completado no servidor mesmo com falha de resposta
      // (rede instável). Re-sincroniza e só avisa se de fato não avançou.
      const atual = await carregar();
      const avancou = atual && atual.status !== entrega.status;
      if (!avancou) Alert.alert('Ops', e.message || 'Não foi possível avançar. Verifique sua conexão e tente de novo.');
    }
    setBusy(false);
  }

  async function chegarEntrega(pontoId) {
    if (busy || !entrega || !pontoId) return;
    setBusy(true);
    try {
      await api.patch(`/motoboys/app/entregas/${entrega.id}/pontos/${pontoId}/chegada`, {});
      carregar();
    } catch (e) {
      const atual = await carregar();
      const p = atual && (atual.pontos || []).find(x => x.id === pontoId);
      if (!(p && p.chegou_em)) Alert.alert('Ops', e.message || 'Não foi possível registrar a chegada. Verifique sua conexão e tente de novo.');
    }
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
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={T.profundo} /><ActivityIndicator color={T.vivo} size="large" /></View>;
  }
  if (!entrega) return null;

  const pontos = entrega.pontos || [];
  const jaColetou = entrega.status === 'em_rota';
  const feitoDe = (p) => p.status === 'entregue' || p.status === 'concluido' || !!p.finalizado_em;
  const concluidos = pontos.filter(feitoDe).length;
  const totalPontos = pontos.length;
  const proxPonto = pontos.find(p => !feitoDe(p));
  const idxProx = proxPonto ? pontos.findIndex(p => p.id === proxPonto.id) : -1;

  // Etapa atual explícita para a pílula e o rodapé.
  let etapaTxt = 'A caminho da coleta';
  if (entrega.status === 'aguardando_coleta') etapaTxt = 'A caminho da coleta';
  else if (entrega.status === 'em_coleta')    etapaTxt = 'Na coleta';
  else if (proxPonto && !proxPonto.chegou_em) etapaTxt = 'A caminho da entrega';
  else if (proxPonto)                          etapaTxt = 'Na entrega';
  if (!proxPonto) etapaTxt = 'Concluída';

  const prazoLabel = entrega.prazo_estado === 'estourado' ? 'Prazo estourado' : entrega.prazo_em ? ('Entregar até ' + hora(entrega.prazo_em)) : null;
  const abrirChat = chatAtivo ? () => router.push({ pathname: '/chat', params: { entregaId: entrega.id, protocolo: entrega.protocolo } }) : undefined;

  // Barra de progresso do header: coleta + cada entrega.
  const etapasBar = [jaColetou ? 'feita' : 'agora', ...pontos.map(p => feitoDe(p) ? 'feita' : (jaColetou && proxPonto && p.id === proxPonto.id ? 'agora' : 'depois'))];
  const prazoCorTxt = { estourado: T.alertaTx, iminente: '#a35a12', atencao: T.atencaoTx, no_prazo: T.ganhoEsc }[entrega.prazo_estado] || T.tinta2;
  const prazoCorBg = { estourado: T.alertaBg, iminente: '#fdeede', atencao: T.atencaoBg, no_prazo: T.ganhoBg }[entrega.prazo_estado] || T.suave;

  // ─── Nó da trilha (coleta ou entrega) ───
  function No({ num, tipo, titulo, tag, endereco, detalhes, estado, subs, acoes, ultimo }) {
    const corDot = estado === 'feita' ? T.ganho : estado === 'agora' ? T.vivo : T.sup;
    const corBorda = estado === 'feita' ? T.ganho : estado === 'agora' ? T.vivo : T.linha;
    const corNum = estado === 'depois' ? T.tinta3 : '#fff';
    return (
      <View style={st.no}>
        {!ultimo && <View style={[st.rail, estado === 'feita' && { backgroundColor: T.ganho }]} />}
        <View style={[st.dot, { backgroundColor: corDot, borderColor: corBorda }]}>
          <Text style={[st.dotTxt, { color: corNum }]}>{estado === 'feita' ? '✓' : num}</Text>
        </View>
        <View style={st.noBody}>
          <View style={st.noTit}>
            <Text style={st.noTitTxt}>{titulo}</Text>
            {!!tag && <View style={[st.tag, tipo === 'col' ? st.tagCol : st.tagEnt]}><Text style={[st.tagTxt, tipo === 'col' ? st.tagColTxt : st.tagEntTxt]}>{tag}</Text></View>}
          </View>
          {!!endereco && <Text style={st.noAddr}>{endereco}</Text>}
          {(detalhes || []).filter(Boolean).map((d, i) => <Text key={i} style={st.noDet}>{d}</Text>)}
          {(subs || []).map((s, i) => (
            <Text key={i} style={[st.sub, s.estado === 'feito' && st.subFeito, s.estado === 'agora' && st.subAgora]}>
              {s.estado === 'feito' ? '✓ ' : s.estado === 'agora' ? '● ' : '○ '}{s.txt}{s.hora ? ` · ${s.hora}` : ''}
            </Text>
          ))}
          {!!(acoes && acoes.length) && (
            <View style={st.acoes}>
              {acoes.map((a, i) => (
                <TouchableOpacity key={i} style={st.acaoBtn} onPress={a.onPress} activeOpacity={0.8}>
                  <Text style={st.acaoTxt}>{a.icone} {a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }

  const coletaEstado = jaColetou ? 'feita' : 'agora';
  const coletaAtual = !jaColetou;

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />

      <View style={st.header}>
        <View style={st.headerTopo}>
          <TouchableOpacity onPress={() => router.replace('/home')} style={{ minWidth: 64 }}><Text style={st.voltar}>‹ Início</Text></TouchableOpacity>
          <Text style={st.headerTit}>Serviço {entrega.protocolo}</Text>
          <View style={{ minWidth: 64, alignItems: 'flex-end' }}><View style={st.statusPill}><Text style={st.statusPillTxt}>{etapaTxt}</Text></View></View>
        </View>
        <View style={st.etapas}>
          {etapasBar.map((e, i) => <View key={i} style={[st.etapa, e === 'feita' && st.etapaFeita, e === 'agora' && st.etapaAgora]} />)}
        </View>
        <View style={st.headerLinha}>
          {!!prazoLabel ? (
            <View style={[st.prazo, { backgroundColor: prazoCorBg }]}>
              <Text style={[st.prazoTxt, { color: prazoCorTxt }]}>{prazoLabel}{entrega.prazo_resta_min != null && entrega.prazo_estado !== 'estourado' ? ` · faltam ${entrega.prazo_resta_min} min` : ''}</Text>
            </View>
          ) : <Text style={st.headerSub}>{entrega.cliente_nome || ''}</Text>}
          {Number(entrega.valor_motoboy_cent) > 0 && <Text style={st.headerValor}>{reais(entrega.valor_motoboy_cent)}</Text>}
        </View>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {/* Coleta */}
        <No
          num="C" tipo="col"
          titulo={`Coleta · ${entrega.coleta_nome || entrega.cliente_nome || 'Ponto de coleta'}`}
          endereco={entrega.coleta_endereco}
          estado={coletaEstado}
          subs={[
            { txt: 'Cheguei no local', estado: entrega.chegada_coleta_em ? 'feito' : (coletaAtual && entrega.status === 'aguardando_coleta' ? 'agora' : 'depois'), hora: entrega.chegada_coleta_em ? hora(entrega.chegada_coleta_em) : null },
            { txt: 'Peguei o pedido', estado: jaColetou ? 'feito' : (entrega.status === 'em_coleta' ? 'agora' : 'depois'), hora: jaColetou && entrega.iniciada_em ? hora(entrega.iniciada_em) : null },
          ]}
          acoes={coletaAtual ? [
            { icone: '➤', label: 'Navegar', onPress: () => navegar(entrega.coleta_lat, entrega.coleta_lng, entrega.coleta_endereco) },
            ...(abrirChat ? [{ icone: '💬', label: 'Central', onPress: abrirChat }] : []),
          ] : []}
        />
        {/* Entregas */}
        {pontos.map((p, i) => {
          const feito = feitoDe(p);
          const atual = jaColetou && !feito && proxPonto && p.id === proxPonto.id;
          const estado = feito ? 'feita' : atual ? 'agora' : 'depois';
          const titulo = totalPontos > 1 ? `Entrega ${i + 1}` : 'Entrega';
          return (
            <No key={p.id}
              num={i + 1} tipo="ent"
              titulo={titulo}
              tag={p.numero_nf ? `NF ${p.numero_nf}` : (p.nome_fantasia || null)}
              endereco={p.endereco + (p.complemento ? ` · ${p.complemento}` : '')}
              detalhes={[p.nome && p.nome !== p.nome_fantasia ? p.nome : null, p.observacoes ? `"${p.observacoes}"` : null, !feito && !atual && i > 0 ? `Depois da entrega ${i}` : null]}
              estado={estado}
              ultimo={i === pontos.length - 1}
              subs={[
                { txt: 'Cheguei no local', estado: p.chegou_em ? 'feito' : (atual && !p.chegou_em ? 'agora' : 'depois'), hora: p.chegou_em ? hora(p.chegou_em) : null },
                { txt: 'Confirmei a entrega', estado: feito ? 'feito' : (atual && p.chegou_em ? 'agora' : 'depois'), hora: feito && p.finalizado_em ? hora(p.finalizado_em) : null },
              ]}
              acoes={atual ? [
                { icone: '➤', label: 'Navegar', onPress: () => navegar(p.lat, p.lng, p.endereco) },
                ...(p.telefone ? [{ icone: '📞', label: 'Ligar', onPress: () => ligar(p.telefone) }] : []),
                ...(abrirChat ? [{ icone: '💬', label: 'Central', onPress: abrirChat }] : []),
              ] : []}
            />
          );
        })}
      </ScrollView>

      {/* Ação única — muda conforme a etapa. Chegar = toque; coletar = deslizar; entregar = abrir protocolo. */}
      <View style={st.rodape}>
        {entrega.status === 'aguardando_coleta' ? (
          <>
            <TouchableOpacity style={st.btn} onPress={avancar} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>Cheguei na coleta</Text>}
            </TouchableOpacity>
            <Text style={st.rodapeSub}>Ao chegar, deslize para confirmar a coleta</Text>
          </>
        ) : entrega.status === 'em_coleta' ? (
          <>
            <DeslizarParaConfirmar
              rotulo="Deslize: peguei o pedido" rotuloOk="Coleta confirmada ✓"
              cor={T.ganho} corFundo={T.ganhoBg} corBorda={T.ganhoBd}
              ocupado={busy} onConfirmar={avancar} icone="✓" />
            <Text style={st.rodapeSub}>Confirme só com a mercadoria em mãos</Text>
          </>
        ) : proxPonto && !proxPonto.chegou_em ? (
          <>
            <TouchableOpacity style={st.btn} onPress={() => chegarEntrega(proxPonto.id)} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>Cheguei na entrega{totalPontos > 1 ? ` ${concluidos + 1}` : ''}</Text>}
            </TouchableOpacity>
            <Text style={st.rodapeSub}>Ao chegar, abre o protocolo da entrega</Text>
          </>
        ) : proxPonto ? (
          <>
            <TouchableOpacity style={[st.btn, { backgroundColor: T.ganho }]}
              onPress={() => router.push({ pathname: '/concluir', params: { entregaId: entrega.id, pontoId: proxPonto.id, endereco: proxPonto.endereco, numero: concluidos + 1, total: totalPontos } })}
              activeOpacity={0.85}>
              <Text style={st.btnTxt}>Marcar entrega{totalPontos > 1 ? ` ${concluidos + 1}` : ''}</Text>
            </TouchableOpacity>
            <Text style={st.rodapeSub}>Foto, resultado e observação na próxima tela</Text>
          </>
        ) : (
          <View style={[st.btn, { backgroundColor: T.ganho }]}><Text style={st.btnTxt}>Corrida concluída ✓</Text></View>
        )}
      </View>

      <SheetNavegacao alvo={navAlvo} aoFechar={() => setNavAlvo(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.papel },
  splash: { flex: 1, backgroundColor: T.profundo, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: T.profundo, paddingTop: 50, paddingBottom: 14, paddingHorizontal: 20 },
  headerTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voltar: { color: T.claro, fontSize: 14, fontWeight: '700' },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  statusPill: { backgroundColor: T.vivo, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillTxt: { color: '#fff', fontSize: 11.5, fontWeight: '800' },
  etapas: { flexDirection: 'row', gap: 6, marginTop: 14 },
  etapa: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  etapaFeita: { backgroundColor: T.ganho },
  etapaAgora: { backgroundColor: T.vivo },
  headerLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 },
  headerSub: { color: T.claro, fontSize: 13, fontWeight: '600' },
  headerValor: { color: T.claro, fontSize: 13, fontWeight: '800' },
  prazo: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  prazoTxt: { fontSize: 12.5, fontWeight: '800' },
  body: { flex: 1 },

  // trilha
  no: { position: 'relative', paddingLeft: 42, paddingBottom: 18 },
  rail: { position: 'absolute', left: 15, top: 30, bottom: -2, width: 2, backgroundColor: T.linha },
  dot: { position: 'absolute', left: 3, top: 2, width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  dotTxt: { fontSize: 13, fontWeight: '800' },
  noBody: { backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 14, padding: 13 },
  noTit: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  noTitTxt: { fontSize: 15, fontWeight: '800', color: T.tinta },
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagCol: { backgroundColor: '#eaf1fb' }, tagEnt: { backgroundColor: '#eef7f1' },
  tagTxt: { fontSize: 11, fontWeight: '800' },
  tagColTxt: { color: '#2b5a95' }, tagEntTxt: { color: '#1f8a5e' },
  noAddr: { fontSize: 13, color: T.tinta2, marginTop: 3, lineHeight: 18 },
  noDet: { fontSize: 12.5, color: T.tinta3, marginTop: 2, fontWeight: '600' },
  sub: { fontSize: 12.5, color: T.tinta3, fontWeight: '700', marginTop: 6 },
  subFeito: { color: T.ganhoEsc }, subAgora: { color: T.vivo },
  acoes: { flexDirection: 'row', gap: 8, marginTop: 11, flexWrap: 'wrap' },
  acaoBtn: { backgroundColor: T.suave, borderWidth: 1, borderColor: T.linha, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  acaoTxt: { color: T.primario, fontWeight: '800', fontSize: 13 },

  rodape: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 26, backgroundColor: T.sup, borderTopWidth: 1, borderTopColor: T.linha },
  btn: { backgroundColor: T.primario, borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  rodapeSub: { textAlign: 'center', fontSize: 12.5, color: T.tinta2, fontWeight: '600', marginTop: 8 },
});
