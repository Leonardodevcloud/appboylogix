import { useState, useEffect, useRef } from 'react';
import { abrirSocket } from '../src/realtime/socket';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar, Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, getToken } from '../src/api';
import SheetNavegacao from '../src/componentes/SheetNavegacao';
import Parada from '../src/componentes/Parada';
import { T, reais, hora } from '../src/tema';


const PROXIMO = { aguardando_coleta: 'em_coleta', em_coleta: 'em_rota' };


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

    // WebSocket: reage na hora se a central editar ou remover esta corrida.
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
      carregar();
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
  const concluidos = pontos.filter(p => p.status === 'entregue' || p.status === 'concluido' || p.finalizado_em).length;
  const totalPontos = pontos.length;
  const proxPonto = pontos.find(p => !(p.status === 'entregue' || p.status === 'concluido' || p.finalizado_em));
  // Etapa atual explícita (passo 1..4) para deixar claro onde o motoboy está.
  let passoN = 1, etapaTxt = 'A caminho da coleta';
  if (entrega.status === 'aguardando_coleta') { passoN = 1; etapaTxt = 'A caminho da coleta'; }
  else if (entrega.status === 'em_coleta')    { passoN = 2; etapaTxt = 'Na coleta'; }
  else if (proxPonto && !proxPonto.chegou_em) { passoN = 3; etapaTxt = 'A caminho da entrega'; }
  else if (proxPonto)                          { passoN = 4; etapaTxt = 'Na entrega'; }
  if (!proxPonto) { passoN = 4; etapaTxt = 'Concluída'; }
  const prazoLabel = entrega.prazo_estado === 'estourado' ? 'Prazo estourado' : entrega.prazo_em ? ('Entregar até ' + hora(entrega.prazo_em)) : null;

  const abrirChat = () => router.push({ pathname: '/chat', params: { entregaId: entrega.id, protocolo: entrega.protocolo } });
  // Etapas da barra: coleta + cada entrega. feita | agora | depois.
  const etapas = [jaColetou ? 'feita' : 'agora', ...pontos.map(p => {
    const feito = p.status === 'entregue' || p.status === 'concluido' || !!p.finalizado_em;
    return feito ? 'feita' : (jaColetou && proxPonto && p.id === proxPonto.id ? 'agora' : 'depois');
  })];
  const prazoCorTxt = { estourado: T.alertaTx, iminente: '#a35a12', atencao: T.atencaoTx, no_prazo: T.ganhoEsc }[entrega.prazo_estado] || T.tinta2;
  const prazoCorBg = { estourado: T.alertaBg, iminente: '#fdeede', atencao: T.atencaoBg, no_prazo: T.ganhoBg }[entrega.prazo_estado] || T.suave;

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
          {etapas.map((e, i) => <View key={i} style={[st.etapa, e === 'feita' && st.etapaFeita, e === 'agora' && st.etapaAgora]} />)}
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
        <Parada
          numero="C"
          titulo={`Coleta · ${entrega.coleta_nome || entrega.cliente_nome || 'Ponto de coleta'}`}
          endereco={entrega.coleta_endereco}
          chips={[entrega.chegada_coleta_em ? `Cheguei ${hora(entrega.chegada_coleta_em)}` : null, jaColetou && entrega.iniciada_em ? `Coletado ${hora(entrega.iniciada_em)}` : null]}
          estado={jaColetou ? 'feita' : 'agora'}
          onNavegar={() => navegar(entrega.coleta_lat, entrega.coleta_lng, entrega.coleta_endereco)}
          onChat={abrirChat}
        />
        {pontos.map((p, i) => {
          const feito = p.status === 'entregue' || p.status === 'concluido' || !!p.finalizado_em;
          const atual = jaColetou && !feito && proxPonto && p.id === proxPonto.id;
          return (
            <Parada key={p.id}
              numero={i + 1}
              titulo={p.nome_fantasia ? `${p.nome_fantasia}` : (totalPontos > 1 ? `Entrega ${i + 1}` : 'Entrega')}
              endereco={p.endereco + (p.complemento ? ` · ${p.complemento}` : '')}
              detalhes={[p.nome && p.nome !== p.nome_fantasia ? p.nome : null, p.numero_nf ? `NF ${p.numero_nf}` : null, p.observacoes ? `"${p.observacoes}"` : null]}
              chips={[p.chegou_em ? `Cheguei ${hora(p.chegou_em)}` : null, feito && p.finalizado_em ? `Entregue ${hora(p.finalizado_em)}` : null, !feito && !atual && i > 0 ? `depois da ${i}` : null]}
              estado={feito ? 'feita' : atual ? 'agora' : 'depois'}
              telefone={p.telefone}
              onNavegar={() => navegar(p.lat, p.lng, p.endereco)}
              onLigar={() => ligar(p.telefone)}
              onChat={abrirChat}
            />
          );
        })}
      </ScrollView>

      {/* Uma ação só, fixa: muda de texto conforme a etapa */}
      <View style={st.rodape}>
        {entrega.status === 'aguardando_coleta' ? (
          <TouchableOpacity style={st.btn} onPress={avancar} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>Cheguei na coleta</Text>}
          </TouchableOpacity>
        ) : entrega.status === 'em_coleta' ? (
          <TouchableOpacity style={[st.btn, { backgroundColor: T.ganho }]} onPress={avancar} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>Peguei o pedido, saindo</Text>}
          </TouchableOpacity>
        ) : proxPonto && !proxPonto.chegou_em ? (
          <TouchableOpacity style={st.btn} onPress={() => chegarEntrega(proxPonto.id)} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>Cheguei na entrega{totalPontos > 1 ? ` ${concluidos + 1}` : ''}</Text>}
          </TouchableOpacity>
        ) : proxPonto ? (
          <TouchableOpacity style={[st.btn, { backgroundColor: T.ganho }]}
            onPress={() => router.push({ pathname: '/concluir', params: { entregaId: entrega.id, pontoId: proxPonto.id, endereco: proxPonto.endereco, numero: concluidos + 1, total: totalPontos } })}
            activeOpacity={0.85}>
            <Text style={st.btnTxt}>Marcar entrega{totalPontos > 1 ? ` ${concluidos + 1}` : ''}</Text>
          </TouchableOpacity>
        ) : (
          <View style={[st.btn, { backgroundColor: T.ganho }]}><Text style={st.btnTxt}>Corrida concluída ✓</Text></View>
        )}
        {proxPonto && <Text style={st.rodapeSub}>{entrega.status === 'aguardando_coleta' ? 'Ao chegar, o botão vira "Peguei o pedido"' : entrega.status === 'em_coleta' ? 'Depois disso, a entrega 1 entra em foco' : !proxPonto.chegou_em ? 'Ao chegar, o botão vira "Marcar entrega"' : 'Foto de protocolo obrigatória na próxima tela'}</Text>}
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
  rodape: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 26, backgroundColor: T.sup, borderTopWidth: 1, borderTopColor: T.linha },
  btn: { backgroundColor: T.primario, borderRadius: 16, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontSize: 17, fontWeight: '800' },
  rodapeSub: { textAlign: 'center', fontSize: 12.5, color: T.tinta2, fontWeight: '600', marginTop: 8 },
});
