import { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, Animated } from 'react-native';
import { router } from 'expo-router';
import { T, reais, curto } from '../tema';
import Icone from './Icone';
import { abrirNavegacao } from '../state/navegacao';

// Corridas na Início (ADR-053; botões aprovados em 18/10/2026). O mapa fica livre e,
// embaixo, dois botões: "Disponíveis" (corridas para aceitar — fica verde e pisca quando
// chega uma; abre a tela "Corridas disponíveis") e "Minhas corridas" (as que ele já
// aceitou). "Minhas corridas" abre por cima do mapa a lista das PARADAS na ordem da rota
// otimizada — coletar ou entregar, cliente/destinatário, endereço, distância, NF, valor —
// com o número da parada igual ao do pino no mapa. Offline: regiões com movimento e o
// "Ficar online".

const ALTURA_TELA = Dimensions.get('window').height;
export const ABA_BARRA = 76;       // altura da BarraAbas (o painel fica em cima dela)

function distKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null || !Number.isFinite(Number(b.lat))) return null;
  const R = 6371, rad = Math.PI / 180;
  const bl = Number(b.lat), bg = Number(b.lng);
  const dLat = (bl - a.lat) * rad, dLng = (bg - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(bl * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const kmTxt = (d) => (d == null ? null : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1).replace('.', ',')} km`);

export default function GavetaCorridas({ online, ofertas = [], ativas = [], eu, regioes = [], naFila, ordemPontos = {}, onFicarOnline, aviso, chatAtivo }) {
  const [grupo, setGrupo] = useState(null);     // null | 'minhas'

  const feitoP = (p) => p.status === 'entregue' || p.status === 'concluido' || !!p.finalizado_em || !!naFila?.has(String(p.id));
  const zonas = useMemo(() => regioes.filter((r) => r.quantidade > 0).slice(0, 3)
    .map((r) => ({ ...r, dist: distKm(eu, r.centro) })), [regioes, eu]);

  // ── Offline ─────────────────────────────────────────────────────────
  if (!online) {
    return (
      <View style={st.gaveta}>
        {aviso}
        <Text style={st.ttl}>{zonas.length ? 'Mais movimento perto de você' : 'Fique online para receber corridas'}</Text>
        {zonas.map((z, i) => (
          <TouchableOpacity key={z.id} style={st.zona} activeOpacity={0.8} onPress={() => abrirNavegacao({ lat: z.centro.lat, lng: z.centro.lng, label: z.nome })}>
            <View style={[st.zonaN, { backgroundColor: i === 0 ? '#fbe8e6' : '#fbf2df' }]}><Text style={[st.zonaNTxt, { color: i === 0 ? '#c9352b' : '#c98a1a' }]}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.nome}>{z.nome}</Text>
              {z.dist != null && <Text style={st.sub}>a {kmTxt(z.dist)}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end' }}><Text style={st.zonaQ}>{z.quantidade}</Text><Text style={st.sub}>corridas/h</Text></View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={st.cta} onPress={onFicarOnline} activeOpacity={0.85}><Text style={st.ctaTxt}>Ficar online</Text></TouchableOpacity>
      </View>
    );
  }

  // ── Paradas na ordem da rota ────────────────────────────────────────
  // Coletas pendentes primeiro (na ordem das corridas, já ordenadas pela rota), depois as
  // entregas pelo número da parada na rota otimizada (o mesmo dos pinos do mapa).
  const paradas = [];
  ativas.forEach((e) => {
    if (e.status !== 'em_rota') paradas.push({ tipo: 'coleta', e, lat: e.coleta_lat, lng: e.coleta_lng, endereco: e.coleta_endereco, chave: 'c' + e.id });
  });
  const entregas = [];
  ativas.forEach((e) => (e.pontos || []).filter((p) => !feitoP(p)).forEach((p) => entregas.push({
    tipo: 'entrega', e, p, lat: p.lat, lng: p.lng, endereco: p.endereco, n: ordemPontos[String(p.id)] || null, chave: 'p' + p.id,
  })));
  entregas.sort((a, b) => (a.n || 999) - (b.n || 999));
  paradas.push(...entregas);
  const nColetar = paradas.filter((x) => x.tipo === 'coleta').length;
  const nEntregar = entregas.length;

  // ── Barra: Disponíveis | Minhas corridas ────────────────────────────
  const temNovas = ofertas.length > 0;
  const doca = (
    <View style={st.gaveta}>
      {aviso}
      <View style={st.doca}>
        <TouchableOpacity style={[st.dk, temNovas && st.dkNovas]} onPress={() => temNovas && router.push('/ofertas')} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={`${ofertas.length} corridas disponíveis para aceitar`}>
          {temNovas && <Pulso />}
          <View style={[st.dkN, { backgroundColor: temNovas ? T.ganho : T.suave }]}><Text style={[st.dkNTxt, { color: temNovas ? '#fff' : T.tinta3 }]}>{ofertas.length}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={st.nome}>Disponíveis</Text>
            <Text style={st.sub} numberOfLines={1}>{temNovas ? 'para aceitar' : 'nenhuma agora'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[st.dk, !ativas.length && { opacity: 0.6 }]} onPress={() => ativas.length && setGrupo('minhas')} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={`${ativas.length} corridas aceitas`}>
          <View style={[st.dkN, { backgroundColor: ativas.length ? T.primario : T.suave }]}><Text style={[st.dkNTxt, { color: ativas.length ? '#fff' : T.tinta3 }]}>{ativas.length}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={st.nome}>Minhas corridas</Text>
            <Text style={st.sub} numberOfLines={1}>{ativas.length ? [nColetar && `${nColetar} coletar`, nEntregar && `${nEntregar} entregar`].filter(Boolean).join(' · ') : 'nenhuma aceita'}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Minhas corridas (por cima do mapa) ──────────────────────────────
  const Linha = ({ x, anterior }) => {
    const { e } = x;
    const coleta = x.tipo === 'coleta';
    const d = kmTxt(distKm(eu, x));
    const mesmoLocal = anterior && anterior.tipo === x.tipo && distKm(anterior, x) != null && distKm(anterior, x) < 0.03;
    const valor = Number(e.valor_motoboy_cent) > 0 ? reais(e.valor_motoboy_cent) : null;
    const nPontos = (e.pontos || []).length;
    const titulo = coleta ? (e.cliente_nome || e.coleta_nome || 'Coleta') : (x.p.nome_fantasia || x.p.nome || 'Entrega');
    return (
      <TouchableOpacity style={st.lin} activeOpacity={0.85} onPress={() => { setGrupo(null); router.push({ pathname: '/corrida', params: { entrega_id: e.id } }); }}>
        <View style={[st.ic, { backgroundColor: coleta ? '#e8562a' : T.ganho }]}>
          <Text style={st.icTxt}>{coleta ? 'C' : (x.n || '•')}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={st.tagLinha}>
            <View style={[st.tag, coleta ? { backgroundColor: T.atencaoBg } : { backgroundColor: T.ganhoBg }]}>
              <Text style={[st.tagTxt, { color: coleta ? T.atencaoTx : T.ganhoEsc }]}>{coleta ? (e.status === 'em_coleta' ? 'Coletando' : 'Coletar') : 'Entregar'} · {e.protocolo}</Text>
            </View>
            {mesmoLocal && <Text style={st.mesmo}>mesmo local</Text>}
          </View>
          <Text style={st.nome} numberOfLines={1}>{titulo}</Text>
          <Text style={st.end} numberOfLines={2}>{curto(x.endereco)}{!coleta && x.p.complemento ? ` · ${x.p.complemento}` : ''}</Text>
          <View style={st.meta}>
            {!!d && <Text style={st.metaTxt}>{d}</Text>}
            {coleta && <Text style={st.metaTxt}>{nPontos === 1 ? '1 entrega' : `${nPontos} entregas`}</Text>}
            {!coleta && !!x.p.numero_nf && <Text style={st.metaTxt}>NF {x.p.numero_nf}</Text>}
            {!!valor && <Text style={[st.metaTxt, st.metaValor]}>{valor}</Text>}
          </View>
          {!coleta && !!x.p.observacoes && <Text style={st.obs} numberOfLines={2}>{x.p.observacoes}</Text>}
        </View>
        <View style={{ gap: 6 }}>
          <TouchableOpacity style={st.nav} onPress={() => abrirNavegacao({ lat: x.lat, lng: x.lng, label: x.endereco })} accessibilityLabel="Navegar">
            <Icone nome="navegar" tam={18} cor={T.primario} />
          </TouchableOpacity>
          {chatAtivo && (
            <TouchableOpacity style={st.nav} onPress={() => router.push({ pathname: '/chat', params: { entregaId: e.id, protocolo: e.protocolo } })} accessibilityLabel="Chat da corrida">
              <Icone nome="chat" tam={18} cor={T.primario} />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const painel = grupo && (
    <>
      <TouchableOpacity style={st.scrim} activeOpacity={1} onPress={() => setGrupo(null)} />
      <View style={[st.gaveta, st.painel]}>
        <View style={st.painelTopo}>
          <Text style={st.painelTit}>Minhas corridas · {ativas.length}</Text>
          <Text style={st.painelSub}>na ordem da rota</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={st.fechar} onPress={() => setGrupo(null)} accessibilityLabel="Fechar"><Icone nome="fechar" tam={18} cor={T.tinta2} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 14 }} showsVerticalScrollIndicator={false}>
          {!paradas.length && <Text style={st.vazio}>Nenhuma parada pendente.</Text>}
          {paradas.map((x, i) => <Linha key={x.chave} x={x} anterior={paradas[i - 1]} />)}
          {ativas.length > 0 && (
            <TouchableOpacity style={st.btnRota} onPress={() => { setGrupo(null); router.push('/rota'); }} activeOpacity={0.85}>
              <Icone nome="mapa" tam={16} cor="#fff" /><Text style={st.btnRotaTxt}>Ver rota completa</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </>
  );

  return (
    <>
      {doca}
      {painel}
    </>
  );
}

// Bolinha piscando em "Disponíveis" quando há corrida para aceitar.
function Pulso() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }));
    l.start(); return () => l.stop();
  }, [v]);
  return (
    <View style={st.pulsoWrap} pointerEvents="none">
      <Animated.View style={[st.pulsoAnel, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} />
      <View style={st.pulso} />
    </View>
  );
}

const sombra = { shadowColor: T.profundo, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 14 };
const st = StyleSheet.create({
  gaveta: { position: 'absolute', left: 0, right: 0, bottom: ABA_BARRA, backgroundColor: T.sup, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, ...sombra },
  painel: { top: Math.max(100, ALTURA_TELA * 0.16), paddingBottom: 0 },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(4,20,40,0.35)' },
  pulso: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.ganho },
  doca: { flexDirection: 'row', gap: 8 },
  dkNovas: { backgroundColor: T.ganhoBg, borderColor: T.ganhoBd, borderWidth: 1.5 },
  pulsoWrap: { position: 'absolute', top: 9, right: 9, width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  pulsoAnel: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: T.ganho },
  painelTit: { fontSize: 14.5, fontWeight: '900', color: T.tinta },
  painelSub: { fontSize: 11.5, fontWeight: '600', color: T.tinta3 },
  tag: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  tagTxt: { fontSize: 10.5, fontWeight: '800' },
  tagLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  mesmo: { fontSize: 10.5, fontWeight: '800', color: T.primario },
  end: { fontSize: 12, color: T.tinta2, fontWeight: '600', marginTop: 1, lineHeight: 16 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  metaTxt: { fontSize: 11, fontWeight: '800', color: T.tinta2, backgroundColor: T.suave, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  metaValor: { color: T.ganhoEsc, backgroundColor: T.ganhoBg },
  obs: { fontSize: 11.5, color: T.tinta2, marginTop: 4, fontStyle: 'italic' },
  dk: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: T.linha, borderRadius: 16, padding: 10 },
  dkN: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dkNTxt: { fontSize: 17, fontWeight: '900' },
  nome: { fontSize: 13.5, fontWeight: '800', color: T.tinta },
  sub: { fontSize: 11.5, color: T.tinta2, fontWeight: '600', marginTop: 1 },
  painelTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  fechar: { width: 38, height: 38, borderRadius: 12, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  vazio: { textAlign: 'center', color: T.tinta3, fontWeight: '600', marginTop: 24 },
  lin: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.linha },
  ic: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  icTxt: { color: '#fff', fontWeight: '900', fontSize: 12.5 },
  nav: { width: 38, height: 38, borderRadius: 12, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  btnRota: { marginTop: 12, backgroundColor: T.primario, borderRadius: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnRotaTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  ttl: { fontSize: 13, fontWeight: '800', color: T.tinta, marginBottom: 2 },
  zona: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: T.linha },
  zonaN: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  zonaNTxt: { fontWeight: '900', fontSize: 12 },
  zonaQ: { fontSize: 15, fontWeight: '900', color: T.tinta },
  cta: { marginTop: 12, backgroundColor: T.ganho, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
