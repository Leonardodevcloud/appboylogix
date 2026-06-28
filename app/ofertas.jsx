import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import { api, API_URL, getToken } from '../src/api';
import { alertaCorrida, pararAlerta } from '../src/utils/alerta';

const C = {
  navy900: '#042C53', azulP: '#185FA5', azulV: '#378ADD', azulC: '#B5D4F4',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#ffffff', linha: '#dde9f5',
  ok: '#1f9d6b', okV: '#27b67f',
};

function reais(cent) {
  if (cent == null) return '—';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}
function curto(end) {
  if (!end) return '—';
  return end.split(',').slice(0, 2).join(',').trim();
}

export default function Ofertas() {
  const [ofertas, setOfertas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const travaRef = useRef(false);
  const wsRef = useRef(null);
  const qtdAnterior = useRef(0);

  async function carregar(primeira = false) {
    try {
      const r = await api.ofertas();
      const lista = r.ofertas || [];
      if (!primeira && lista.length > qtdAnterior.current) alertaCorrida();
      if (primeira && lista.length) alertaCorrida();
      qtdAnterior.current = lista.length;
      setOfertas(lista);
      if (!lista.length && !primeira) router.replace('/home');
    } catch (e) { /* mantém */ }
    setCarregando(false);
  }

  useEffect(() => {
    carregar(true);
    const poll = setInterval(() => carregar(), 8000);
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const wsUrl = API_URL.replace(/^http/, 'ws').replace('/api/v1', '') + '/ws?token=' + token;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const { evento, dados } = JSON.parse(ev.data);
            if (evento === 'oferta.nova') { carregar(); }
            else if (evento === 'oferta.encerrada') {
              setOfertas(prev => {
                const nova = prev.filter(o => o.oferta_id !== dados?.ofertaId);
                qtdAnterior.current = nova.length;
                if (!nova.length) router.replace('/home');
                return nova;
              });
            }
          } catch {}
        };
      } catch {}
    })();
    return () => { clearInterval(poll); pararAlerta(); try { wsRef.current?.close(); } catch {} };
  }, []);

  async function aceitar(oferta) {
    if (travaRef.current) return;
    travaRef.current = true;
    pararAlerta();
    try {
      await api.aceitarOferta(oferta.oferta_id);
      router.replace('/home');
    } catch (e) {
      travaRef.current = false;
      Alert.alert('Ops', e.message || 'Não foi possível aceitar essa corrida');
      carregar();
    }
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => { pararAlerta(); router.replace('/home'); }} style={{ width: 64 }}>
          <Text style={st.voltar}>‹ Início</Text>
        </TouchableOpacity>
        <Text style={st.headerTit}>Corridas disponíveis</Text>
        <View style={st.contador}><Text style={st.contadorTxt}>{ofertas.length}</Text></View>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {!ofertas.length && (
          <View style={st.vazio}>
            <Text style={st.vazioEmoji}>🛵</Text>
            <Text style={st.vazioTit}>Nenhuma corrida agora</Text>
            <Text style={st.vazioSub}>Fique online que avisamos assim que aparecer.</Text>
          </View>
        )}

        {ofertas.map(o => {
          const totalDest = o.qtd_pontos || 1;
          return (
            <View key={o.oferta_id} style={st.card}>
              <View style={st.cardTopo}>
                <View style={{ flex: 1 }}>
                  <Text style={st.osLabel}>SERVIÇO</Text>
                  <Text style={st.osNum}>{o.protocolo}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.valorLabel}>Você recebe</Text>
                  <Text style={st.valor}>{reais(o.valor_motoboy_cent)}</Text>
                </View>
              </View>

              <View style={st.metaLinha}>
                {!!o.cliente_nome && (
                  <View style={st.metaChip}><Text style={st.metaChipTxt}>🏢 {o.cliente_nome}</Text></View>
                )}
                {!!o.primeiro_nf && (
                  <View style={st.metaChip}><Text style={st.metaChipTxt}>NF {o.primeiro_nf}</Text></View>
                )}
              </View>

              <View style={st.rota}>
                <View style={st.ponto}>
                  <View style={[st.bolinha, { backgroundColor: C.azulV }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.pontoLbl}>COLETA</Text>
                    <Text style={st.pontoTxt} numberOfLines={2}>{o.coleta_nome ? o.coleta_nome + ' · ' : ''}{curto(o.coleta_endereco)}</Text>
                  </View>
                </View>
                <View style={st.traco} />
                <View style={st.ponto}>
                  <View style={[st.bolinha, { backgroundColor: C.okV }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.pontoLbl}>{totalDest > 1 ? `ENTREGA · ${totalDest} pontos` : 'ENTREGA'}</Text>
                    <Text style={st.pontoTxt} numberOfLines={2}>{curto(o.primeiro_destino)}{totalDest > 1 ? ` · +${totalDest - 1}` : ''}</Text>
                  </View>
                </View>
              </View>

              <View style={st.distLinha}>
                <Text style={st.dist}>📍 {o.distancia_km != null ? Number(o.distancia_km).toFixed(1) + ' km até a coleta' : '—'}</Text>
                {o.rota_km != null && <Text style={st.dist}>🛣 {Number(o.rota_km).toFixed(1)} km de rota</Text>}
              </View>

              <View style={st.acoes}>
                <TouchableOpacity style={st.btnDetalhes} onPress={() => router.push({ pathname: '/oferta-detalhe', params: { oferta_id: o.oferta_id } })} activeOpacity={0.8}>
                  <Text style={st.btnDetalhesTxt}>Ver detalhes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.btnAceitar} onPress={() => aceitar(o)} activeOpacity={0.85}>
                  <Text style={st.btnAceitarTxt}>Aceitar</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {!!ofertas.length && <Text style={st.rodapeLimite}>As corridas ficam disponíveis até alguém aceitar. Aceite as que conseguir cumprir.</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 54, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  voltar: { color: C.azulC, fontSize: 14, fontWeight: '700' },
  headerTit: { color: '#fff', fontSize: 16, fontWeight: '800' },
  contador: { width: 64, alignItems: 'flex-end' },
  contadorTxt: { color: '#fff', fontSize: 14, fontWeight: '800', backgroundColor: C.azulP, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20, overflow: 'hidden' },

  body: { flex: 1 },
  vazio: { alignItems: 'center', paddingTop: 70 },
  vazioEmoji: { fontSize: 44, marginBottom: 10 },
  vazioTit: { fontSize: 17, fontWeight: '800', color: C.tinta },
  vazioSub: { fontSize: 13.5, color: C.tinta2, marginTop: 6, textAlign: 'center' },

  card: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 16, padding: 15, marginBottom: 12 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  osLabel: { fontSize: 10, fontWeight: '800', color: C.tinta3, letterSpacing: 1 },
  osNum: { fontSize: 20, fontWeight: '900', color: C.navy900, marginTop: 1 },
  valorLabel: { fontSize: 10, color: C.tinta3, fontWeight: '600' },
  valor: { color: C.okV, fontSize: 22, fontWeight: '900' },

  metaLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  metaChip: { backgroundColor: '#eef4fb', borderRadius: 7, paddingVertical: 4, paddingHorizontal: 9 },
  metaChipTxt: { fontSize: 12, color: C.tinta2, fontWeight: '600' },

  rota: { marginBottom: 10 },
  ponto: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bolinha: { width: 11, height: 11, borderRadius: 6, marginTop: 3 },
  traco: { width: 2, height: 16, backgroundColor: '#cdd9e8', marginLeft: 4.5, marginVertical: 2 },
  pontoLbl: { fontSize: 9.5, fontWeight: '800', color: C.tinta3, letterSpacing: 0.8 },
  pontoTxt: { fontSize: 13.5, color: C.tinta, fontWeight: '600', marginTop: 1 },

  distLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 13 },
  dist: { fontSize: 11.5, color: C.tinta3 },

  acoes: { flexDirection: 'row', gap: 10 },
  btnDetalhes: { flex: 1, borderWidth: 1.5, borderColor: '#cdd9e8', borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  btnDetalhesTxt: { color: C.azulP, fontSize: 13.5, fontWeight: '700' },
  btnAceitar: { flex: 1.3, backgroundColor: C.okV, borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  btnAceitarTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },

  rodapeLimite: { fontSize: 11.5, color: C.tinta3, textAlign: 'center', marginTop: 8, lineHeight: 16 },
});
