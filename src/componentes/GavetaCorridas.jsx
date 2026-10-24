import { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, Animated } from 'react-native';
import { router } from 'expo-router';
import { T, reais, curto } from '../tema';
import Icone from './Icone';
import { abrirNavegacao } from '../state/navegacao';
import ValorDinamica from './ValorDinamica';

// Corridas na Início (ADR-053; botões aprovados em 18/10/2026). O mapa fica livre e,
// embaixo, dois botões: "Disponíveis" (corridas para aceitar — fica verde e pisca quando
// chega uma; abre a tela "Corridas disponíveis") e "Minhas corridas" (as que ele já
// aceitou). "Minhas corridas" abre por cima do mapa a lista das PARADAS na ordem da rota
// otimizada — coletar ou entregar, cliente/destinatário, endereço, distância, NF, valor —
// com o número da parada igual ao do pino no mapa. Offline: regiões com movimento e o
// "Ficar online".

const ALTURA_TELA = Dimensions.get('window').height;
export const ABA_BARRA = 0;        // a BarraAbas agora é a tabBar das abas: a tela já termina em cima dela

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

  // ── Contagem para o botão "Minhas corridas" ─────────────────────────
  const pendentes = (e) => (e.pontos || []).filter((p) => !feitoP(p));
  const nColetar = ativas.filter((e) => e.status !== 'em_rota').length;
  const nEntregar = ativas.reduce((n, e) => n + pendentes(e).length, 0);

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

  // ── Minhas corridas (por cima do mapa): UM cartão por corrida ───────
  // Aprovado em 24/10/2026: antes a lista era de PARADAS (a mesma corrida aparecia uma vez
  // na coleta e outra em cada entrega). Agora cada corrida aceita é um cartão com tudo dela —
  // cliente, protocolo, situação, coleta, cada entrega com NF, km e valor (com a dinâmica
  // separada). Tocar no cartão abre a tela da corrida; o botão principal abre a navegação
  // direto no próximo ponto pendente.
  const Cartao = ({ e }) => {
    const pts = e.pontos || [];
    const coletou = e.status === 'em_rota';
    const proxIdx = pts.findIndex((p) => !feitoP(p));
    const prox = !coletou ? { lat: e.coleta_lat, lng: e.coleta_lng, endereco: e.coleta_endereco }
      : proxIdx >= 0 ? { lat: pts[proxIdx].lat, lng: pts[proxIdx].lng, endereco: pts[proxIdx].endereco } : null;
    const feitas = pts.filter(feitoP).length;
    const tag = !coletou ? (e.status === 'em_coleta' ? 'Coletando' : 'Coletar') : `Em rota · ${Math.min(feitas + 1, pts.length)} de ${pts.length}`;
    const dProx = kmTxt(distKm(eu, prox));
    const kmCorrida = Number(e.distancia_km) > 0 ? `${Number(e.distancia_km).toFixed(1).replace('.', ',')} km` : null;
    const abrir = () => { setGrupo(null); router.push({ pathname: '/corrida', params: { entrega_id: e.id } }); };
    return (
      <TouchableOpacity style={st.card} activeOpacity={0.88} onPress={abrir}
        accessibilityRole="button" accessibilityLabel={`Corrida ${e.protocolo}, ${e.cliente_nome || ''}, ${tag}`}>
        <View style={st.cardTopo}>
          <Text style={st.prot}>#{e.protocolo}</Text>
          <View style={[st.tag, coletou ? { backgroundColor: T.suave } : { backgroundColor: T.atencaoBg }]}>
            <Text style={[st.tagTxt, { color: coletou ? T.primario : T.atencaoTx }]}>{tag}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {Number(e.valor_motoboy_cent) > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.valor}>{reais(e.valor_motoboy_cent)}</Text>
              <ValorDinamica totalCent={e.valor_motoboy_cent} dinamicaCent={e.dinamica_motoboy_cent} style={{ fontSize: 10.5 }} />
            </View>
          )}
        </View>
        <Text style={st.cliente} numberOfLines={1}>{e.cliente_nome || e.coleta_nome || 'Cliente'}</Text>

        <View style={st.trilho}>
          <View style={st.pt}>
            <View style={[st.ptIc, { backgroundColor: coletou ? T.tinta3 : '#e8562a' }]}><Text style={st.ptIcTxt}>C</Text></View>
            <Text style={[st.ptTxt, coletou && st.ptFeito]} numberOfLines={2}>
              <Text style={st.ptForte}>{coletou ? 'Coletada' : 'Coleta'}</Text> · {curto(e.coleta_endereco)}
            </Text>
          </View>
          {pts.map((p, i) => {
            const feito = feitoP(p);
            return (
              <View key={p.id || i} style={st.pt}>
                <View style={[st.ptIc, { backgroundColor: feito ? T.tinta3 : T.ganho }]}><Text style={st.ptIcTxt}>{i + 1}</Text></View>
                <Text style={[st.ptTxt, feito && st.ptFeito]} numberOfLines={2}>
                  <Text style={st.ptForte}>{p.nome_fantasia || p.nome || `Entrega ${i + 1}`}</Text> · {curto(p.endereco)}{p.numero_nf ? ` · NF ${p.numero_nf}` : ''}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={st.meta}>
          {!!kmCorrida && <Text style={st.metaTxt}>{kmCorrida}</Text>}
          <Text style={st.metaTxt}>{pts.length === 1 ? '1 entrega' : `${pts.length} entregas`}</Text>
          {!!dProx && <Text style={st.metaTxt}>{coletou ? 'próxima' : 'coleta'} a {dProx}</Text>}
        </View>

        <View style={st.acoes}>
          {!!prox && prox.lat != null && (
            <TouchableOpacity style={[st.ac, st.acPri]} activeOpacity={0.85}
              onPress={() => abrirNavegacao({ lat: Number(prox.lat), lng: Number(prox.lng), label: prox.endereco })}>
              <Icone nome="navegar" tam={15} cor="#fff" />
              <Text style={[st.acTxt, { color: '#fff' }]} numberOfLines={1}>{coletou ? `Ir para a entrega ${proxIdx + 1}` : 'Ir para a coleta'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={st.ac} activeOpacity={0.85} onPress={abrir}>
            <Text style={st.acTxt}>Abrir corrida</Text>
          </TouchableOpacity>
          {chatAtivo && (
            <TouchableOpacity style={st.acIco} activeOpacity={0.85} accessibilityLabel="Falar com a central sobre esta corrida"
              onPress={() => router.push({ pathname: '/chat', params: { entregaId: e.id, protocolo: e.protocolo } })}>
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
        <ScrollView contentContainerStyle={{ paddingBottom: 14, gap: 10 }} showsVerticalScrollIndicator={false}>
          {!ativas.length && <Text style={st.vazio}>Nenhuma corrida aceita.</Text>}
          {ativas.map((e) => <Cartao key={e.id} e={e} />)}
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
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  metaTxt: { fontSize: 11, fontWeight: '800', color: T.tinta2, backgroundColor: T.suave, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  dk: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: T.linha, borderRadius: 16, padding: 10 },
  dkN: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dkNTxt: { fontSize: 17, fontWeight: '900' },
  nome: { fontSize: 13.5, fontWeight: '800', color: T.tinta },
  sub: { fontSize: 11.5, color: T.tinta2, fontWeight: '600', marginTop: 1 },
  painelTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  fechar: { width: 38, height: 38, borderRadius: 12, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  vazio: { textAlign: 'center', color: T.tinta3, fontWeight: '600', marginTop: 24 },
  card: { borderWidth: 1, borderColor: T.linha, borderRadius: 16, padding: 12, backgroundColor: T.sup },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  prot: { fontSize: 11.5, fontWeight: '800', color: T.tinta2 },
  valor: { fontSize: 16, fontWeight: '900', color: T.ganhoEsc },
  cliente: { fontSize: 15, fontWeight: '800', color: T.tinta, marginTop: 6 },
  trilho: { marginTop: 8, gap: 7 },
  pt: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ptIc: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  ptIcTxt: { color: '#fff', fontWeight: '900', fontSize: 10.5 },
  ptTxt: { flex: 1, fontSize: 12.5, color: T.tinta2, fontWeight: '600', lineHeight: 17 },
  ptForte: { color: T.tinta, fontWeight: '800' },
  ptFeito: { textDecorationLine: 'line-through', color: T.tinta3 },
  acoes: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  ac: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.linha, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8 },
  acPri: { backgroundColor: T.primario, borderColor: T.primario, flex: 1.3 },
  acTxt: { fontSize: 12.5, fontWeight: '800', color: T.primario },
  acIco: { width: 40, height: 40, borderRadius: 12, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
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
