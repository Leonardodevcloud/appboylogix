import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Switch, ActivityIndicator, StatusBar, Image, AppState,
} from 'react-native';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { irPara } from '../../src/navegacao/abas';
import { api } from '../../src/api';
import { useGPS } from '../../src/hooks/useGPS';
import * as SecureStore from 'expo-secure-store';
import { garantirLocalizacaoSempre, temLocalizacaoSempre } from '../../src/utils/disclosure';
import { garantirUpdatesBackground, pararUpdatesBackground } from '../../src/tasks/gpsTask';
import { setOnline, assinarOnline } from '../../src/state/online';
import { consumirDestino, marcarOfertaAberta, ofertaJaAberta } from '../../src/state/navegacaoPendente';
import { registrarPush } from '../../src/push';
import { iniciarAlertasTempoReal } from '../../src/realtime/alertas';
import { T } from '../../src/tema';
import { Alerta } from '../../src/utils/avisar';
import AvisoFilaConclusao from '../../src/componentes/AvisoFilaConclusao';
import CartaoSaldo from '../../src/componentes/CartaoSaldo';
import MapaInicio from '../../src/componentes/MapaInicio';
import GavetaCorridas from '../../src/componentes/GavetaCorridas';
import { assinarFila } from '../../src/state/filaConclusao';
import Icone from '../../src/componentes/Icone';

// Paleta exata do protótipo
const C = {
  navy950:  '#031f3b',
  navy900:  T.profundo,
  navy800:  '#0a3a66',
  azulP:    T.primario,
  azulV:    T.vivo,
  azulC:    T.claro,
  tinta:    '#0e2138',
  tinta2:   '#46637f',
  tinta3:   '#8ba5bc',
  fundo:    '#eef4fb',
  sup:      '#ffffff',
  sup2:     '#f6faff',
  linha:    '#dde9f5',
  ok:       '#1f9d6b',
  okBg:     '#e7f6ef',
  warn:     '#c98a1a',
  warnBg:   '#fbf2df',
  roxo:     '#7C3AED',
  roxoBg:   '#ede9fe',
};

function Av({ nome, foto, size = 38 }) {
  const ini = (nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const cores = [C.azulV, C.azulP, '#534AB7', '#0F6E56', '#854F0B'];
  const bg = cores[ini.charCodeAt(0) % cores.length];
  // Foto do entregador (selfie do cadastro) quando houver; senão, as iniciais.
  if (foto) {
    return <Image source={{ uri: foto }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }} />;
  }
  return (
    <View style={[s.av, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[s.avTxt, { fontSize: size * 0.34 }]}>{ini}</Text>
    </View>
  );
}

// Última vez que a tela guiada de GPS foi aberta automaticamente (por processo).
let ultimoAvisoGpsMs = 0;

export default function Home() {
  const [eu, setEu]       = useState(null);
  const [fila, setFila]   = useState([]);
  const [ordemRota, setOrdemRota] = useState([]); // entrega_ids na ordem otimizada
  // ponto_id → número na rota otimizada (1, 2, 3…): os pinos do mapa seguem a ROTA, não a
  // ordem em que ele aceitou (18/10/2026).
  const [ordemPontos, setOrdemPontos] = useState({});
  const rotaRef = useRef({ assin: '', em: 0 });
  const [qtdOfertas, setQtdOfertas] = useState(0);
  // Início com mapa (ADR-053): ofertas (para a gaveta), calor,
  // regiões (offline), camadas ligadas e a posição dele (distâncias da gaveta).
  const [ofertas, setOfertas] = useState([]);
  const [calor, setCalor] = useState(null);
  const [regioes, setRegioes] = useState([]);
  const [camadas, setCamadas] = useState({ demanda: true, lojas: true, minhas: true });
  const [posEu, setPosEu] = useState(null);
  const mapaRef = useRef(null);
  // "GPS enviado há X s": a validade da posição no servidor é de 10 min (Onda 10); o motoboy
  // vê aqui, antes de descobrir que não recebe corrida.
  const [gpsHaSeg, setGpsHaSeg] = useState(null);
  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try { const iso = await SecureStore.getItemAsync('lx_ultima_posicao_em'); if (vivo) setGpsHaSeg(iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)) : null); } catch {}
    };
    ler(); const t = setInterval(ler, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const gpsTxt = gpsHaSeg == null ? 'sem posição ainda' : gpsHaSeg < 60 ? `GPS enviado há ${gpsHaSeg} s` : gpsHaSeg < 600 ? `GPS enviado há ${Math.round(gpsHaSeg / 60)} min` : 'GPS parado há mais de 10 min';
  const [chat, setChat]   = useState({ ativo: false, total: 0 });
  // Recarrega os cards "Hoje" e "Onde tem corrida" junto com a Início.
  const [tick, setTick]   = useState(0);
  // Pontos concluídos no celular sem sinal (ainda na fila): já contam como feitos aqui.
  const [naFila, setNaFila] = useState(new Set());
  useEffect(() => assinarFila((itens) => {
    setNaFila(new Set(itens.map(i => String(i.pontoId))));
    setTick(t => t + 1);
  }), []);
  const avisoRastreio = useRef(false);
  // Onda 11b: a tela guiada de GPS reabria a cada volta à Home ("Tudo certo" → Home remonta →
  // ref zera → abre de novo) e o motoboy só saía fechando o app. Agora abre no máximo uma vez
  // a cada 30 min por processo, e só depois de a Home ter tentado enviar uma posição fresca.

  useGPS(
    fila.find(e => ['aguardando_coleta','em_coleta','em_rota'].includes(e.status))?.id || null,
    !!eu?.online,  // online esperando corrida também rastreia (para receber ofertas)
  );

  // Ofertas abertas: a gaveta mostra a lista e o contador "Disponíveis".
  const recontarOfertas = useCallback(() => {
    api.ofertas().then(r => { const l = r.ofertas || []; setOfertas(l); setQtdOfertas(l.length); }).catch(() => {});
  }, []);
  // Mapa de calor + lojas (cache de 2 min no servidor) e, offline, as regiões com movimento.
  const carregarMapa = useCallback(() => {
    api.get('/regioes/app/calor').then(setCalor).catch(() => {});
    api.get('/regioes/app/movimento').then(r => setRegioes(r?.regioes || [])).catch(() => {});
    Location.getLastKnownPositionAsync().then(p => { if (p?.coords) setPosEu({ lat: p.coords.latitude, lng: p.coords.longitude }); }).catch(() => {});
  }, []);
  useEffect(() => { carregarMapa(); const t = setInterval(carregarMapa, 2 * 60 * 1000); return () => clearInterval(t); }, [carregarMapa]);

  const carregar = useCallback(async () => {
    try {
      const [me, entregas] = await Promise.all([api.get('/motoboys/app/eu'), api.get('/motoboys/app/fila')]);
      setEu(me); setFila(entregas); setTick(t => t + 1);
      // Semeia o status compartilhado (mantém home e perfil em sincronia).
      if (me) setOnline(me.online);
      // Auto-abre a tela guiada se estiver ONLINE mas o GPS parou de enviar há muito tempo.
      if (me && me.online && !avisoRastreio.current && (Date.now() - ultimoAvisoGpsMs) > 30 * 60000) {
        try {
          const iso = await SecureStore.getItemAsync('lx_ultima_posicao_em');
          const paradoMuito = !iso || (Date.now() - new Date(iso).getTime()) > 180000; // 3 min sem enviar
          if (paradoMuito) {
            // Antes de acusar: tenta mandar uma posição agora. Se conseguir, não há o que corrigir.
            let enviou = false;
            try {
              const perm = await Location.getForegroundPermissionsAsync();
              if (perm.status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                await api.post('/motoboys/app/posicao', { lat: loc.coords.latitude, lng: loc.coords.longitude });
                await SecureStore.setItemAsync('lx_ultima_posicao_em', new Date().toISOString());
                enviou = true;
              }
            } catch {}
            if (!enviou) { avisoRastreio.current = true; ultimoAvisoGpsMs = Date.now(); router.push('/rastreamento-ativo'); }
          }
        } catch (e) {}
      }
      // Ordem otimizada das corridas ativas (mesma rota do "Ver minha rota").
      // Não bloqueia a tela: ordena assim que chegar; se falhar, mantém a ordem natural.
      // Só pede a rota quando as corridas/pontos mudam (ou a cada 3 min): ela otimiza no
      // ORS e, pedida a cada 30 s, deixava o servidor lento (18/10/2026).
      const ativasAgora = (entregas || []).filter(e => ['aguardando_coleta', 'em_coleta', 'em_rota'].includes(e.status));
      const assin = ativasAgora.map(e => `${e.id}:${e.status}:${(e.pontos || []).filter(p => p.status !== 'entregue' && !p.finalizado_em).length}`).sort().join('|');
      if (!ativasAgora.length) { rotaRef.current = { assin: '', em: 0 }; setOrdemRota([]); setOrdemPontos({}); }
      else if (assin !== rotaRef.current.assin || Date.now() - rotaRef.current.em > 3 * 60 * 1000) {
        rotaRef.current = { assin, em: Date.now() };
        api.get('/motoboys/app/minha-rota').then(r => {
          const ordem = []; const pts = {};
          (r.paradas || []).forEach((p, i) => {
            if (p.entrega_id && !ordem.includes(p.entrega_id)) ordem.push(p.entrega_id);
            if (p.ponto_id) pts[String(p.ponto_id)] = i + 1;
          });
          setOrdemRota(ordem); setOrdemPontos(pts);
        }).catch(() => { rotaRef.current.em = 0; });
      }
      // Reconta ofertas em TODO refresh (foco ao voltar, pull-to-refresh, polling de 30s).
      // Sem isto o contador/banner "Disponíveis" ficava preso após aceitar — mostrava um
      // número que já não existia e, ao tocar, a tela de ofertas vinha vazia.
      recontarOfertas();
    } catch (e) {
      // Qualquer falha ao carregar os dados do motoboy (token expirado/inválido,
      // sessão perdida) volta para o login. Não depende de casar texto da mensagem.
      console.log('[HOME] erro ao carregar:', e?.message);
      // Só desloga em falha de AUTENTICAÇÃO real (401). Uma queda de rede/timeout
      // no polling NÃO pode deslogar o motoboy no meio do turno — apenas mantém os
      // dados atuais na tela. (Este carregar roda a cada 30s e, como o app é um
      // Stack, continua rodando por baixo quando o motoboy está em Ganhos/Perfil.)
      if (e?.status === 401) { await api.logout(); router.replace('/'); }
    }
  }, []);

  useEffect(() => {
    // Antes de tudo: confere a situação do cadastro. Se não estiver aprovado,
    // o motoboy não acessa a operação — vai para a tela de status/bloqueio.
    (async () => {
      try {
        const mc = await api.meuCadastro();
        if (mc.situacao && mc.situacao !== 'aprovado') { router.replace('/cadastro-status'); return; }
      } catch { /* segue; se o token estiver ruim, o carregar() trata */ }
      // Notificação que abriu o app (estava fechado): agora que a Home existe e o cadastro
      // está ok, vai para o destino anotado pelo _layout (oferta ou chat).
      const destino = consumirDestino();
      if (destino) setTimeout(() => router.push(destino), 250);
      carregar();
      // Registra/atualiza o token de push deste aparelho (nao bloqueia a tela).
      registrarPush().catch(() => {});
      // Canal de alertas em tempo real (som+vibracao a prova de MIUI).
      iniciarAlertasTempoReal();
      // Se já houver uma oferta pendente (app abriu depois do disparo), mostra.
      // Conta ofertas disponíveis (badge na home).
      recontarOfertas();
    })();
    const t = setInterval(carregar, 30_000);

    // Ao voltar do background: re-sincroniza. Em background o GPS de foreground
    // congela e a central pode ver o motoboy como "sem sinal". Ao reabrir, a gente
    // atualiza a tela, re-afirma o online e manda uma posição fresca — assim ele
    // volta a aparecer "ao vivo" na hora, sem precisar reiniciar o app.
    const subApp = AppState.addEventListener('change', async (estado) => {
      if (estado !== 'active') return;
      carregar();
      try {
        const me = await api.get('/motoboys/app/eu').catch(() => null);
        if (me && me.online) {
          if (!(await temLocalizacaoSempre())) {
            // Permissão de fundo foi revogada nas configurações: cai offline.
            setEu(p => ({ ...p, online: false }));
            setOnline(false);
            api.patch('/motoboys/app/status', { online: false }).catch(() => {});
            return;
          }
          api.patch('/motoboys/app/status', { online: true }).catch(() => {});
          try {
            const perm = await Location.getForegroundPermissionsAsync();
            if (perm.status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              api.post('/motoboys/app/posicao', { lat: loc.coords.latitude, lng: loc.coords.longitude })
                .then(() => SecureStore.setItemAsync('lx_ultima_posicao_em', new Date().toISOString()).catch(() => {}))
                .catch(() => {});
            }
          } catch {}
        }
      } catch {}
    });

    // WebSocket: se a central solicitar reenvio enquanto o app está aberto,
    // mostra o aviso e redireciona para a correção (bloqueio).
    let ws;
    (async () => {
      try {
        const { getToken } = require('../../src/api');
        const { abrirSocket } = require('../../src/realtime/socket');
        const token = await getToken();
        if (!token) return;
        ws = abrirSocket(token);
        ws.onmessage = (ev) => {
          try {
            const { evento, dados } = JSON.parse(ev.data);
            if (evento === 'oferta.nova') {
              recontarOfertas();
              // Mockup v1, tela 1: a corrida chega em TELA CHEIA para decidir deslizando —
              // sem depender de o motoboy notar o badge. Uma vez por oferta (WS + push do
              // mesmo disparo não empilham).
              const id = dados?.ofertaId ? String(dados.ofertaId) : null;
              if (id && !ofertaJaAberta(id)) { marcarOfertaAberta(id); router.push('/oferta-detalhe?oferta_id=' + id); }
            } else if (evento === 'oferta.encerrada') {
              recontarOfertas();
            } else if (evento === 'entrega.atribuida') {
              // A central atribuiu uma corrida a este motoboy (ou ele aceitou uma oferta):
              // recarrega a lista na hora e reconta as ofertas — sem isto, o card de
              // "corrida disponível" ficava preso na tela depois do aceite até o próximo foco.
              carregar();
              recontarOfertas();
            } else if (evento === 'entrega.editada') {
              // A central alterou uma corrida ativa: recarrega para mostrar os novos dados.
              carregar();
            } else if (evento === 'entrega.removida') {
              // A central removeu/transferiu uma corrida: tira da tela na hora.
              carregar();
            } else if (evento === 'entrega.cancelada') {
              // A central cancelou uma corrida do motoboy: tira da tela na hora.
              carregar();
            } else if (evento === 'entrega.concluida') {
              // Corrida concluída (pelo motoboy ou finalizada pela central): tira da tela na hora.
              carregar();
            } else if (evento === 'cadastro.reenvio') {
              Alerta.alert('Ação necessária', dados?.motivo || 'A central pediu uma correção no seu cadastro.', [
                { text: 'Ver agora', onPress: () => router.replace('/cadastro-status') },
              ]);
            } else if (evento === 'cadastro.recusado') {
              router.replace('/cadastro-status');
            }
          } catch {}
        };
      } catch {}
    })();

    return () => { clearInterval(t); try { subApp.remove(); } catch {} try { ws?.close(); } catch {} };
  }, []);

  // Espelha o status compartilhado: se o perfil mudar o online, a home reflete na hora.
  useEffect(() => assinarOnline((v) => setEu(p => (p ? { ...p, online: v } : p))), []);

  // Badge de chat (não lidas). Só mostra o 💬 se o módulo chat estiver ativo.
  useEffect(() => {
    let vivo = true;
    const puxar = async () => { try { const r = await api.chatNaoLidas(); if (vivo) setChat(prev => (prev.ativo === !!r.ativo && prev.total === (r.total || 0)) ? prev : { ativo: !!r.ativo, total: r.total || 0 }); } catch {} };
    puxar();
    const t = setInterval(puxar, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // Ao voltar o foco para a home (ex.: vindo do perfil), re-sincroniza os dados.
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  async function toggleOnline(val) {
    // Localização "o tempo todo" é OBRIGATÓRIA para ficar online. Sem ela, o app
    // não rastreia com o celular fechado (perde corridas e não registra trajeto).
    if (val) {
      const ok = await garantirLocalizacaoSempre();
      if (!ok) { setEu(p => ({ ...p, online: false })); return; }
    }
    // Otimista: o switch mexe na hora (e reflete no perfil via estado compartilhado).
    // Se falhar, reverte em SILÊNCIO.
    setEu(p => ({ ...p, online: val }));
    setOnline(val);
    try {
      await api.patch('/motoboys/app/status', { online: val });
      // Arranca/para o serviço de GPS NA HORA (não espera o hook/reload) e atualiza a tela.
      if (val) { try { await garantirUpdatesBackground(false); } catch {} carregar(); }
      else { try { await pararUpdatesBackground(); } catch {} }
    } catch (e) {
      setEu(p => ({ ...p, online: !val }));
      setOnline(!val);
    }
  }



  if (!eu) return (
    <View style={s.splash}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <Image source={require('../../assets/marca/logo.png')} style={s.logoImg} resizeMode="contain" />
      <ActivityIndicator color={C.azulV} size="large" style={{ marginTop: 20 }} />
    </View>
  );

  // ── Início com mapa (ADR-053, mockup aprovado em 18/10/2026) ──────────────────────
  // O mapa ocupa a tela; em cima, o online e o saldo; embaixo, a gaveta das corridas.
  // Offline: o mapa mostra só o calor e as lojas, e a gaveta traz as regiões com mais
  // movimento e o "Ficar online" (antes a tela inteira ficava travada num cartão).
  const online = !!eu.online;
  const ativas = fila.filter(e => ['aguardando_coleta', 'em_coleta', 'em_rota'].includes(e.status));
  const ativasOrdenadas = ordemRota.length
    ? [...ativas].sort((a, b) => {
        const ia = ordemRota.indexOf(a.id); const ib = ordemRota.indexOf(b.id);
        return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
      })
    : ativas;

  const alternar = (k) => setCamadas(c => ({ ...c, [k]: !c[k] }));
  const Camada = ({ k, rotulo, cor, icone }) => (
    <TouchableOpacity style={[s.cam, camadas[k] && s.camOn]} onPress={() => alternar(k)} activeOpacity={0.85}
      accessibilityRole="switch" accessibilityState={{ checked: camadas[k] }} accessibilityLabel={rotulo}>
      {icone ? <Icone nome={icone} tam={12} cor={camadas[k] ? T.primario : C.tinta3} traco={2.4} /> : <View style={[s.camDot, { backgroundColor: camadas[k] ? cor : C.tinta3 }]} />}
      <Text style={[s.camTxt, camadas[k] && { color: C.navy900 }]}>{rotulo}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <MapaInicio ref={mapaRef} calor={calor} ativas={ativasOrdenadas} naFila={naFila} ordemPontos={ordemPontos} camadas={camadas} online={online} rodape={180} />

      {/* Topo flutuante: foto, online e avisos; logo abaixo, o saldo. */}
      <View style={s.topo} pointerEvents="box-none">
        <View style={s.barra}>
          <TouchableOpacity onPress={() => irPara('/perfil')} activeOpacity={0.8} style={s.avBorda}>
            <Av nome={eu.nome_completo} foto={eu.foto_url} size={38} />
          </TouchableOpacity>
          <View style={s.online}>
            <View style={[s.onPt, !online && { backgroundColor: C.tinta3 }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.onTit}>{online ? 'Online' : 'Offline'}</Text>
              <Text style={[s.onSub, online && gpsHaSeg != null && gpsHaSeg >= 600 && { color: '#a23c34' }]} numberOfLines={1}>{online ? gpsTxt : 'não recebe corridas'}</Text>
            </View>
            <Switch value={online} onValueChange={toggleOnline} trackColor={{ false: '#cbd5e1', true: C.ok }} thumbColor="#fff" ios_backgroundColor="#cbd5e1" />
          </View>
          {chat.ativo ? (
            <TouchableOpacity style={s.icoBtn} onPress={() => router.push('/mensagens')} activeOpacity={0.8} accessibilityLabel="Mensagens">
              <Icone nome="chat" tam={20} cor={C.navy900} />
              {chat.total > 0 && <View style={s.icoBadge}><Text style={s.icoBadgeTxt}>{chat.total > 9 ? '9+' : chat.total}</Text></View>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.icoBtn} onPress={() => router.push('/notificacoes')} activeOpacity={0.8} accessibilityLabel="Avisos">
              <Icone nome="sino" tam={20} cor={C.navy900} />
            </TouchableOpacity>
          )}
        </View>
        <CartaoSaldo atualizar={tick} />
        <View style={s.camadas}>
          <Camada k="demanda" rotulo="Demanda" cor="#e8562a" />
          <Camada k="lojas" rotulo="Lojas" icone="loja" />
          {online && <Camada k="minhas" rotulo="Minhas" cor={C.navy900} />}
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.mira} onPress={() => mapaRef.current?.centralizar()} activeOpacity={0.8} accessibilityLabel="Centralizar em mim">
            <Icone nome="mira" tam={20} cor={C.navy900} />
          </TouchableOpacity>
        </View>
        {!online && camadas.demanda && (
          <View style={s.legenda}>
            <Text style={s.legTit}>Demanda · {calor?.janela_min > 60 ? 'últimas 3 h' : 'última hora'}</Text>
            <View style={s.legEsc}>
              {['#f2b233', '#e86a2a', '#c9352b'].map(c => <View key={c} style={[s.legCor, { backgroundColor: c }]} />)}
            </View>
            <View style={s.legRot}><Text style={s.legTxt}>pouca</Text><Text style={s.legTxt}>muita</Text></View>
          </View>
        )}
      </View>

      <GavetaCorridas
        online={online}
        ofertas={ofertas}
        ativas={ativasOrdenadas}
        eu={posEu}
        regioes={regioes}
        naFila={naFila}
        ordemPontos={ordemPontos}
        onFicarOnline={() => toggleOnline(true)}
        chatAtivo={chat.ativo}
        aviso={<AvisoFilaConclusao />}
      />
    </View>
  );
}

const sombra = { shadowColor: '#042C53', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 6 };
const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#e6ecf1' },
  splash:    { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  logoImg:   { width: 72, height: 72, marginBottom: 8 },
  av:        { justifyContent: 'center', alignItems: 'center' },
  avTxt:     { color: '#fff', fontWeight: '800' },
  topo:      { position: 'absolute', top: 44, left: 12, right: 12, gap: 8 },
  barra:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avBorda:   { borderRadius: 24, borderWidth: 2.5, borderColor: '#fff', ...sombra },
  online:    { flex: 1, height: 46, borderRadius: 24, backgroundColor: C.sup, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, gap: 9, ...sombra },
  onPt:      { width: 9, height: 9, borderRadius: 5, backgroundColor: C.ok },
  onTit:     { fontSize: 13.5, fontWeight: '800', color: C.tinta },
  onSub:     { fontSize: 10.5, fontWeight: '600', color: C.tinta2 },
  icoBtn:    { width: 44, height: 44, borderRadius: 22, backgroundColor: C.sup, alignItems: 'center', justifyContent: 'center', ...sombra },
  icoBadge:  { position: 'absolute', top: 4, right: 3, backgroundColor: C.roxo, borderRadius: 99, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  icoBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  camadas:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cam:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.sup, borderRadius: 18, paddingVertical: 6, paddingHorizontal: 11, borderWidth: 1.5, borderColor: 'transparent', ...sombra },
  camOn:     { borderColor: T.primario },
  camDot:    { width: 9, height: 9, borderRadius: 5 },
  camTxt:    { fontSize: 11.5, fontWeight: '800', color: C.tinta2 },
  mira:      { width: 42, height: 42, borderRadius: 14, backgroundColor: C.sup, alignItems: 'center', justifyContent: 'center', ...sombra },
  legenda:   { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, paddingVertical: 7, paddingHorizontal: 10, ...sombra },
  legTit:    { fontSize: 10.5, fontWeight: '800', color: C.tinta2 },
  legEsc:    { flexDirection: 'row', marginTop: 4, borderRadius: 4, overflow: 'hidden', width: 120, height: 7 },
  legCor:    { flex: 1 },
  legRot:    { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  legTxt:    { fontSize: 9.5, fontWeight: '700', color: C.tinta3 },
});
