import { useState, useEffect, useRef } from 'react';
import { abrirSocket } from '../src/realtime/socket';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList,
  ActivityIndicator, Alert, StatusBar, Linking, useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { api, getToken } from '../src/api';
import { alertaCorrida, pararAlerta } from '../src/utils/alerta';
import CartaoCorrida from '../src/componentes/CartaoCorrida';
import DeslizarParaConfirmar from '../src/componentes/DeslizarParaConfirmar';
import { T, reais } from '../src/tema';

function abrirMapa(lat, lng, endereco) {
  const q = (lat && lng) ? `${lat},${lng}` : encodeURIComponent(endereco || '');
  if (!q) return;
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`).catch(() => {});
}

export default function Ofertas() {
  const { width } = useWindowDimensions();
  const [ofertas, setOfertas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aceitandoId, setAceitandoId] = useState(null);
  const [aceitaIds, setAceitaIds] = useState([]);   // ids já aceitos (mostra ✓ antes de sumir)
  const [indice, setIndice] = useState(0);
  const wsRef = useRef(null);
  const listRef = useRef(null);
  const qtdAnterior = useRef(0);

  async function carregar(primeira = false) {
    try {
      const r = await api.ofertas();
      const lista = r.ofertas || [];
      if (!primeira && lista.length > qtdAnterior.current) alertaCorrida();
      if (primeira && lista.length) alertaCorrida();
      qtdAnterior.current = lista.length;
      // Mantém ordem por proximidade (a mais perto primeiro).
      const ord = [...lista].sort((a, b) => (Number(a.distancia_km) || 1e9) - (Number(b.distancia_km) || 1e9));
      setOfertas(ord);
      if (!lista.length && !primeira) router.replace('/home');
    } catch (e) { /* mantém */ }
    setCarregando(false);
  }

  // Remove uma oferta da pilha (aceita/recusada/encerrada) e, se esvaziar, volta pra home.
  function removerOferta(ofertaId) {
    setOfertas(prev => {
      const nova = prev.filter(o => o.oferta_id !== ofertaId);
      qtdAnterior.current = nova.length;
      if (!nova.length) setTimeout(() => router.replace('/home'), 350);
      else setIndice(i => Math.min(i, nova.length - 1));
      return nova;
    });
  }

  async function aceitar(o) {
    if (aceitandoId) return;
    setAceitandoId(o.oferta_id);
    try {
      await api.aceitarOferta(o.oferta_id);
      // NÃO redireciona pra corrida: marca como aceita e deixa o motoboy seguir
      // deslizando/aceitando outras. A corrida aceita aparece na Home ("A caminho").
      setAceitaIds(prev => [...prev, o.oferta_id]);
      setTimeout(() => { setAceitandoId(null); removerOferta(o.oferta_id); }, 650);
    } catch (e) {
      setAceitandoId(null);
      const conexao = /sem conex|network|tempo|timeout/i.test(e?.message || '') || e?.status >= 500;
      if (conexao) {
        Alert.alert('Conexão instável', 'Não deu pra confirmar agora. Tente de novo — é seguro (se já tiver aceitado, a corrida aparece nas suas corridas).');
      } else {
        // Já era (outro aceitou / saiu da fila): tira da pilha e segue.
        Alert.alert('Ops', e.message || 'Essa corrida já não está disponível');
        removerOferta(o.oferta_id);
      }
    }
  }

  function recusar(o) {
    Alert.alert('Recusar esta corrida?', 'Ela some da sua lista; outros motoboys continuam vendo.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Recusar', style: 'destructive', onPress: async () => { try { await api.recusarOferta(o.oferta_id); } catch {} removerOferta(o.oferta_id); } },
    ]);
  }

  useEffect(() => {
    carregar(true);
    const poll = setInterval(() => carregar(), 8000);
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const ws = abrirSocket(token);
        wsRef.current = ws;
        ws.onmessage = (ev) => {
          try {
            const { evento, dados } = JSON.parse(ev.data);
            if (evento === 'oferta.nova') { carregar(); }
            else if (evento === 'oferta.encerrada') { removerOferta(dados?.ofertaId); }
          } catch {}
        };
      } catch {}
    })();
    return () => { clearInterval(poll); pararAlerta(); try { wsRef.current?.close(); } catch {} };
  }, []);

  function onScroll(e) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== indice) setIndice(i);
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={T.profundo} /><ActivityIndicator color={T.vivo} size="large" /></View>;
  }

  const total = ofertas.length;

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => { pararAlerta(); router.replace('/home'); }} style={{ minWidth: 72 }}>
          <Text style={st.voltar}>‹ Início</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.headerTit}>Corridas disponíveis</Text>
          {total > 1 && <Text style={st.headerSub}>{indice + 1} de {total} · deslize para ver</Text>}
        </View>
        <View style={{ minWidth: 72, alignItems: 'flex-end' }}><Text style={st.contadorTxt}>{total}</Text></View>
      </View>

      {!total ? (
        <View style={st.vazio}>
          <Text style={st.vazioTit}>Nenhuma corrida agora</Text>
          <Text style={st.vazioSub}>Fique online que avisamos assim que aparecer uma perto de você.</Text>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={ofertas}
            keyExtractor={o => o.oferta_id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            renderItem={({ item: o }) => {
              const temValor = Number(o.valor_motoboy_cent) > 0;
              const aceita = aceitaIds.includes(o.oferta_id);
              return (
                <View style={{ width }}>
                  <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                    <CartaoCorrida oferta={o} mostrarAcoes={false} />
                    <TouchableOpacity style={st.btnMapa} activeOpacity={0.85}
                      onPress={() => abrirMapa(o.coleta_lat, o.coleta_lng, o.coleta_endereco)}>
                      <Text style={st.btnMapaTxt}>🗺️  Abrir no mapa</Text>
                    </TouchableOpacity>
                    <View style={st.decisao}>
                      <DeslizarParaConfirmar
                        rotulo={temValor ? `Deslize para aceitar · ${reais(o.valor_motoboy_cent)}` : 'Deslize para aceitar'}
                        rotuloOk="Corrida aceita ✓"
                        ocupado={aceitandoId === o.oferta_id}
                        feito={aceita}
                        onConfirmar={() => aceitar(o)} />
                      <TouchableOpacity onPress={() => recusar(o)} disabled={!!aceitandoId || aceita} style={st.recusa} activeOpacity={0.7}>
                        <Text style={st.recusaTxt}>Não posso agora · <Text style={{ color: T.alerta }}>recusar</Text></Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              );
            }}
          />
          {total > 1 && (
            <View style={st.dots}>
              {ofertas.map((o, i) => <View key={o.oferta_id} style={[st.dot, i === indice && st.dotOn]} />)}
            </View>
          )}
          <Text style={st.rodape}>Aceite quantas conseguir cumprir no prazo — elas vão para “A caminho” na Início.</Text>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.papel },
  splash: { flex: 1, backgroundColor: T.profundo, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: T.profundo, paddingTop: 54, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voltar: { color: T.claro, fontSize: 14, fontWeight: '700' },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSub: { color: T.claro, fontSize: 12, fontWeight: '600', marginTop: 2 },
  contadorTxt: { color: '#fff', fontSize: 13, fontWeight: '800', backgroundColor: T.primario, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  vazioTit: { fontSize: 18, fontWeight: '800', color: T.tinta },
  vazioSub: { fontSize: 14, color: T.tinta2, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  btnMapa: { marginTop: 12, backgroundColor: T.suave, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  btnMapaTxt: { color: T.primario, fontWeight: '800', fontSize: 14.5 },
  decisao: { marginTop: 16 },
  recusa: { alignItems: 'center', paddingTop: 14 },
  recusaTxt: { fontSize: 14, color: T.tinta2, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.linha },
  dotOn: { backgroundColor: T.primario, width: 20 },
  rodape: { textAlign: 'center', fontSize: 12.5, color: T.tinta3, fontWeight: '600', paddingHorizontal: 20, paddingBottom: 14 },
});
