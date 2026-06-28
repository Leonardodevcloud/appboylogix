import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Switch, ActivityIndicator, StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';
import { useGPS } from '../src/hooks/useGPS';

// Paleta exata do protótipo
const C = {
  navy950:  '#031f3b',
  navy900:  '#042C53',
  navy800:  '#0a3a66',
  azulP:    '#185FA5',
  azulV:    '#378ADD',
  azulC:    '#B5D4F4',
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

const STATUS_COR = {
  aguardando_atribuicao: C.roxo,
  aguardando_coleta:     C.warn,
  em_coleta:             C.warn,
  em_rota:               C.azulP,
  entregue:              C.ok,
};
const STATUS_LABEL = {
  aguardando_atribuicao: 'Nova',
  aguardando_coleta:     'Ir coletar',
  em_coleta:             'Coletando',
  em_rota:               'Em rota',
  entregue:              'Entregue',
};
const PROXIMO = {
  aguardando_atribuicao: 'aguardando_coleta',
  aguardando_coleta:     'em_coleta',
  em_coleta:             'em_rota',
};

function Av({ nome, size = 38 }) {
  const ini = (nome || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const cores = [C.azulV, C.azulP, '#534AB7', '#0F6E56', '#854F0B'];
  const bg = cores[ini.charCodeAt(0) % cores.length];
  return (
    <View style={[s.av, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[s.avTxt, { fontSize: size * 0.34 }]}>{ini}</Text>
    </View>
  );
}

export default function Home() {
  const [eu, setEu]       = useState(null);
  const [fila, setFila]   = useState([]);
  const [qtdOfertas, setQtdOfertas] = useState(0);
  const [refresh, setRef] = useState(false);
  const [busy, setBusy]   = useState({});

  useGPS(
    fila.find(e => ['aguardando_coleta','em_coleta','em_rota'].includes(e.status))?.id || null,
    !!eu?.online,  // online esperando corrida também rastreia (para receber ofertas)
  );

  const carregar = useCallback(async () => {
    try {
      const [me, entregas] = await Promise.all([api.get('/motoboys/app/eu'), api.get('/motoboys/app/fila')]);
      setEu(me); setFila(entregas);
    } catch (e) {
      // Qualquer falha ao carregar os dados do motoboy (token expirado/inválido,
      // sessão perdida) volta para o login. Não depende de casar texto da mensagem.
      console.log('[HOME] erro ao carregar:', e?.message);
      await api.logout();
      router.replace('/');
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
      carregar();
      // Se já houver uma oferta pendente (app abriu depois do disparo), mostra.
      // Conta ofertas disponíveis (badge na home).
      try { const r = await api.ofertas(); setQtdOfertas((r.ofertas || []).length); } catch {}
    })();
    const t = setInterval(carregar, 30_000);

    // WebSocket: se a central solicitar reenvio enquanto o app está aberto,
    // mostra o aviso e redireciona para a correção (bloqueio).
    let ws;
    (async () => {
      try {
        const { getToken, API_URL } = require('../src/api');
        const token = await getToken();
        if (!token) return;
        const wsUrl = API_URL.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws?token=' + token;
        ws = new WebSocket(wsUrl);
        ws.onmessage = (ev) => {
          try {
            const { evento, dados } = JSON.parse(ev.data);
            if (evento === 'oferta.nova') {
              // Nova corrida disponível: atualiza o badge (não abre tela cheia).
              api.ofertas().then(r => setQtdOfertas((r.ofertas || []).length)).catch(() => {});
            } else if (evento === 'oferta.encerrada') {
              api.ofertas().then(r => setQtdOfertas((r.ofertas || []).length)).catch(() => {});
            } else if (evento === 'cadastro.reenvio') {
              Alert.alert('Ação necessária', dados?.motivo || 'A central pediu uma correção no seu cadastro.', [
                { text: 'Ver agora', onPress: () => router.replace('/cadastro-status') },
              ]);
            } else if (evento === 'cadastro.recusado') {
              router.replace('/cadastro-status');
            }
          } catch {}
        };
      } catch {}
    })();

    return () => { clearInterval(t); try { ws?.close(); } catch {} };
  }, []);

  async function toggleOnline(val) {
    try { await api.patch('/motoboys/app/status', { online: val }); setEu(p => ({ ...p, online: val })); }
    catch (e) { Alert.alert('Erro', e.message); }
  }

  async function avancar(entrega) {
    const prox = PROXIMO[entrega.status];
    if (!prox) return;
    setBusy(p => ({ ...p, [entrega.id]: true }));
    try { await api.patch(`/motoboys/app/entregas/${entrega.id}/status`, { status: prox }); carregar(); }
    catch (e) { Alert.alert('Erro', e.message); }
    setBusy(p => ({ ...p, [entrega.id]: false }));
  }

  async function sair() {
    Alert.alert('Sair', 'Encerrar sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => { await api.logout(); router.replace('/'); } },
    ]);
  }

  if (!eu) return (
    <View style={s.splash}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={s.logoBox}><Text style={s.logoTxt}>LX</Text></View>
      <ActivityIndicator color={C.azulV} size="large" style={{ marginTop: 20 }} />
    </View>
  );

  const novas    = fila.filter(e => e.status === 'aguardando_atribuicao');
  const emColeta = fila.filter(e => ['aguardando_coleta','em_coleta'].includes(e.status));
  const emRota   = fila.filter(e => e.status === 'em_rota');

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />

      {/* Status bar topo — fundo claro como no prototipo */}
      <View style={s.mStatus}>
        <View style={s.hello}>
          <Text style={s.helloSmall}>Boa tarde,</Text>
          <Text style={s.helloB}>{eu.nome_completo.split(' ')[0]} 👋</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Switch value={eu.online} onValueChange={toggleOnline}
            trackColor={{ false: '#cbd5e1', true: C.ok }} thumbColor="#fff"
            ios_backgroundColor="#cbd5e1" />
          <Av nome={eu.nome_completo} size={38} />
        </View>
      </View>

      <ScrollView
        style={s.mBody}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={async () => { setRef(true); await carregar(); setRef(false); }} tintColor={C.azulV} />}
      >
        {/* Stats */}
        <View style={s.mStats}>
          <View style={s.mStat}><Text style={s.mStatB}>{emRota.length}</Text><Text style={s.mStatS}>Em rota</Text></View>
          <View style={s.mStat}><Text style={s.mStatB}>{eu.entregas_ativas}</Text><Text style={s.mStatS}>Hoje</Text></View>
          <View style={s.mStat}><Text style={s.mStatB}>{fila.length}</Text><Text style={s.mStatS}>Na fila</Text></View>
        </View>

        {/* Badge de ofertas disponíveis (corridas que o motoboy pode aceitar) */}
        {qtdOfertas > 0 && (
          <TouchableOpacity style={s.ofertaBadge} onPress={() => router.push('/ofertas')} activeOpacity={0.8}>
            <View style={s.ofertaIco}><Text style={{ fontSize: 18 }}>🛵</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.ofertaTit}>{qtdOfertas} corrida{qtdOfertas > 1 ? 's' : ''} disponível{qtdOfertas > 1 ? 'eis' : ''}</Text>
              <Text style={s.ofertaSub}>Toque para ver e aceitar</Text>
            </View>
            <Text style={s.ofertaSeta}>›</Text>
          </TouchableOpacity>
        )}

        {/* Novas corridas */}
        {novas.length > 0 && (
          <>
            <View style={s.mSec}>
              <Text style={s.mSecTxt}>Nova corrida disponível</Text>
              <Text style={s.mSecBadge}>{novas.length} nova{novas.length > 1 ? 's' : ''}</Text>
            </View>
            {novas.map(e => (
              <View key={e.id} style={[s.ride, s.rideNew]}>
                <View style={s.rTop}>
                  <Text style={s.rTopB}>{e.protocolo}</Text>
                  <View style={[s.pill, { backgroundColor: C.roxoBg }]}><Text style={[s.pillTxt, { color: C.roxo }]}>Nova</Text></View>
                </View>
                <View style={s.rRoute}>
                  <View style={s.rPt}>
                    <View style={[s.pin, { backgroundColor: C.navy900 }]}><Text style={s.pinTxt}>C</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rPtMain} numberOfLines={1}>{e.coleta_endereco}</Text>
                      <Text style={s.rPtSub}>Coleta</Text>
                    </View>
                  </View>
                  {(e.pontos || []).length > 0 && (
                    <View style={s.rPt}>
                      <View style={[s.pin, { backgroundColor: C.azulV }]}><Text style={s.pinTxt}>⬡</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rPtMain}>{e.pontos.length} destino{e.pontos.length > 1 ? 's' : ''}</Text>
                        <Text style={s.rPtSub}>{e.pontos.map(p => p.nome_fantasia || p.endereco?.split(',')[0]).join(', ')}</Text>
                      </View>
                    </View>
                  )}
                </View>
                <View style={s.rMeta}>
                  {e.distancia_km && <View><Text style={s.rMetaB}>{Number(e.distancia_km).toFixed(1)} km</Text><Text style={s.rMetaL}>Distância</Text></View>}
                  <View><Text style={s.rMetaB}>{(e.pontos || []).length}</Text><Text style={s.rMetaL}>Paradas</Text></View>
                </View>
                <TouchableOpacity
                  style={[s.mBtn, s.mBtnP, busy[e.id] && s.mBtnBusy]}
                  onPress={() => router.push({ pathname: '/aceitar', params: { entregaId: e.id } })}
                  activeOpacity={0.85}
                >
                  <Text style={s.mBtnTxt}>Ver detalhes</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Em coleta */}
        {emColeta.length > 0 && (
          <>
            <View style={[s.mSec, { marginTop: 18 }]}>
              <Text style={s.mSecTxt}>Aguardando coleta</Text>
            </View>
            {emColeta.map(e => (
              <View key={e.id} style={s.ride}>
                <View style={s.rTop}>
                  <Text style={s.rTopB}>{e.protocolo}</Text>
                  <View style={[s.pill, { backgroundColor: C.warnBg }]}><Text style={[s.pillTxt, { color: C.warn }]}>{STATUS_LABEL[e.status]}</Text></View>
                </View>
                <View style={s.rRoute}>
                  <View style={s.rPt}>
                    <View style={[s.pin, { backgroundColor: C.navy900 }]}><Text style={s.pinTxt}>C</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rPtMain} numberOfLines={1}>{e.coleta_endereco}</Text>
                      <Text style={s.rPtSub}>Ir até o ponto de coleta</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={[s.mBtn, s.mBtnSec, busy[e.id] && s.mBtnBusy]}
                  onPress={() => avancar(e)} disabled={busy[e.id]} activeOpacity={0.85}
                >
                  {busy[e.id] ? <ActivityIndicator color={C.azulP} size="small" />
                    : <Text style={[s.mBtnTxt, { color: C.azulP }]}>
                        {e.status === 'aguardando_coleta' ? 'Iniciar coleta' : 'Coleta concluida — saindo'}
                      </Text>}
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Em andamento */}
        {emRota.length > 0 && (
          <>
            <View style={[s.mSec, { marginTop: 18 }]}>
              <Text style={s.mSecTxt}>Em andamento</Text>
            </View>
            {emRota.map(e => {
              const pontos = e.pontos || [];
              const pendentes = pontos.filter(p => !p.status || p.status === 'pendente');
              const concluidos = pontos.length - pendentes.length;
              const prox = pendentes[0] || pontos[0];
              return (
                <View key={e.id} style={s.ride}>
                  <View style={s.rTop}>
                    <Text style={s.rTopB}>{e.protocolo}</Text>
                    <View style={[s.pill, { backgroundColor: C.azulV + '22' }]}><Text style={[s.pillTxt, { color: C.azulP }]}>Em rota</Text></View>
                  </View>
                  <View style={s.rRoute}>
                    <View style={s.rPt}>
                      <View style={[s.pin, { backgroundColor: C.azulV }]}><Text style={s.pinTxt}>⬡</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rPtMain}>{concluidos} de {pontos.length} paradas concluídas</Text>
                        {prox && <Text style={s.rPtSub} numberOfLines={1}>Próx.: {prox.nome_fantasia || prox.endereco}</Text>}
                      </View>
                    </View>
                  </View>
                  {prox && (
                    <TouchableOpacity
                      style={[s.mBtn, s.mBtnP]}
                      onPress={() => router.push({ pathname: '/concluir', params: { entregaId: e.id, pontoId: prox.id, endereco: prox.endereco, numero: concluidos + 1, total: pontos.length } })}
                      activeOpacity={0.85}
                    >
                      <Text style={s.mBtnTxt}>Finalizar parada {concluidos + 1}</Text>
                    </TouchableOpacity>
                  )}
                  {!prox && (
                    <TouchableOpacity style={[s.mBtn, s.mBtnP]} onPress={() => avancar(e)} activeOpacity={0.85}>
                      <Text style={s.mBtnTxt}>Continuar rota</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {fila.length === 0 && (
          <View style={s.vazio}>
            <Text style={s.vaziIco}>📦</Text>
            <Text style={s.vaziTxt}>Nenhuma entrega na fila</Text>
            <Text style={s.vaziSub}>Puxe para atualizar</Text>
          </View>
        )}

        <TouchableOpacity style={s.btnSair} onPress={sair}>
          <Text style={s.btnSairTxt}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom nav — igual ao prototipo */}
      <View style={s.mTab}>
        <View style={[s.mTabItem, s.mTabOn]}><Text style={s.mTabIco}>🏠</Text><Text style={[s.mTabLbl, { color: C.azulP }]}>Início</Text></View>
        <TouchableOpacity style={s.mTabItem}><Text style={s.mTabIco}>📍</Text><Text style={s.mTabLbl}>Rotas</Text></TouchableOpacity>
        <TouchableOpacity style={s.mTabItem}><Text style={s.mTabIco}>💰</Text><Text style={s.mTabLbl}>Ganhos</Text></TouchableOpacity>
        <TouchableOpacity style={s.mTabItem} onPress={() => router.push('/perfil')}><Text style={s.mTabIco}>👤</Text><Text style={s.mTabLbl}>Perfil</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.fundo },
  splash:    { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  logoBox:   { width: 52, height: 52, borderRadius: 14, backgroundColor: C.azulP, justifyContent: 'center', alignItems: 'center' },
  logoTxt:   { color: C.azulC, fontSize: 22, fontWeight: '800' },
  av:        { justifyContent: 'center', alignItems: 'center' },
  avTxt:     { color: '#fff', fontWeight: '800' },
  mStatus:   { backgroundColor: C.sup, paddingTop: 52, paddingBottom: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.linha },
  hello:     {},
  helloSmall:{ fontSize: 11, fontWeight: '600', color: C.tinta3 },
  helloB:    { fontSize: 16, fontWeight: '800', color: C.tinta },
  mBody:     { flex: 1, paddingHorizontal: 16, paddingTop: 6 },
  mStats:    { flexDirection: 'row', gap: 8, marginBottom: 14, marginTop: 8 },
  ofertaBadge: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.sup, borderWidth: 1, borderColor: '#dde9f5', borderLeftWidth: 4, borderLeftColor: '#378ADD', borderRadius: 12, padding: 13, marginBottom: 14 },
  ofertaIco: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eaf3fc', alignItems: 'center', justifyContent: 'center' },
  ofertaTit: { fontSize: 14.5, fontWeight: '800', color: '#0e2138' },
  ofertaSub: { fontSize: 12, color: '#46637f', marginTop: 1 },
  ofertaSeta: { fontSize: 22, color: '#8ba5bc', fontWeight: '700' },
  mStat:     { flex: 1, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 12, padding: 11, alignItems: 'center' },
  mStatB:    { fontSize: 19, fontWeight: '800', color: C.tinta },
  mStatS:    { fontSize: 9.5, color: C.tinta2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  mSec:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },
  mSecTxt:   { fontSize: 12, fontWeight: '800', color: C.tinta },
  mSecBadge: { fontSize: 10, color: C.azulP, fontWeight: '700' },
  ride:      { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, padding: 14, marginBottom: 11, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  rideNew:   { borderColor: C.azulV, shadowColor: C.azulV, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  rTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  rTopB:     { fontSize: 13, fontWeight: '800', color: C.tinta },
  pill:      { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt:   { fontSize: 10.5, fontWeight: '700' },
  rRoute:    { flexDirection: 'column', gap: 9 },
  rPt:       { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pin:       { width: 18, height: 18, borderRadius: 6, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  pinTxt:    { color: '#fff', fontSize: 8, fontWeight: '800' },
  rPtMain:   { fontSize: 12, color: C.tinta, fontWeight: '600' },
  rPtSub:    { fontSize: 10.5, color: C.tinta3, fontWeight: '600', marginTop: 1 },
  rMeta:     { flexDirection: 'row', gap: 14, marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.linha, borderStyle: 'dashed' },
  rMetaB:    { fontSize: 14, fontWeight: '800', color: C.tinta },
  rMetaL:    { fontSize: 11, color: C.tinta2, fontWeight: '600', marginTop: 1 },
  mBtn:      { width: '100%', padding: 13, borderRadius: 13, alignItems: 'center', marginTop: 12 },
  mBtnP:     { backgroundColor: C.azulP },
  mBtnSec:   { backgroundColor: C.sup2, borderWidth: 1.5, borderColor: C.azulV },
  mBtnBusy:  { opacity: 0.5 },
  mBtnTxt:   { fontWeight: '800', fontSize: 14, color: '#fff' },
  vazio:     { alignItems: 'center', paddingVertical: 48 },
  vaziIco:   { fontSize: 44, marginBottom: 12 },
  vaziTxt:   { fontSize: 16, fontWeight: '700', color: C.tinta2 },
  vaziSub:   { fontSize: 13, color: C.tinta3, marginTop: 6 },
  btnSair:   { marginTop: 24, padding: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.linha },
  btnSairTxt:{ color: C.tinta3, fontSize: 13, fontWeight: '600' },
  mTab:      { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.sup, borderTopWidth: 1, borderTopColor: C.linha, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 11, paddingBottom: 28 },
  mTabItem:  { alignItems: 'center', gap: 3 },
  mTabOn:    {},
  mTabIco:   { fontSize: 20, color: C.tinta3 },
  mTabLbl:   { fontSize: 9.5, fontWeight: '700', color: C.tinta3 },
});
