import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { irParaInicio } from '../../src/navegacao/abas';
import { api } from '../../src/api';
import FiltroPeriodo from '../../src/componentes/FiltroPeriodo';
import { T } from '../../src/tema';
import Icone from '../../src/componentes/Icone';
import ValorDinamica from '../../src/componentes/ValorDinamica';

const C = {
  navy900: T.profundo, azulP: T.primario, azulC: T.claro,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#fff', linha: '#dde9f5', ok: '#1f9d6b', okV: '#27b67f',
};

function reais(cent) {
  if (cent == null) return 'R$ 0,00';
  return 'R$ ' + (cent / 100).toFixed(2).replace('.', ',');
}
function horaDe(iso) { try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
function diaLabel(iso) {
  try {
    const d = new Date(iso);
    const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()];
    return `${dow}, ${d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' })}`;
  } catch { return ''; }
}
function chaveDia(iso) { try { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' }); } catch { return '—'; } }
const brData = (s) => { if (!s) return ''; const [a, m, d] = s.split('-'); return `${d}/${m}`; };
const rotuloPeriodo = (f) => f.tipo === 'hoje' ? 'hoje' : f.tipo === 'semana' ? 'últimos 7 dias' : f.tipo === 'mes' ? 'este mês' : `${brData(f.de)} – ${brData(f.ate)}`;

export default function Historico() {
  const [filtro, setFiltro] = useState({ tipo: 'mes' });
  const [dados, setDados] = useState({ corridas: [], total_cent: 0, quantidade: 0 });
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // A aba fica viva (app/(abas)): a tela de "carregando" só aparece na primeira vez. Trocar
  // o período mostra o indicador do puxar-para-atualizar por cima da lista que já está lá, e
  // voltar para a aba atualiza em segundo plano (no máximo a cada 20 s).
  const ultimo = useRef(0);
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;
  const carregar = useCallback(async (f) => {
    ultimo.current = Date.now();
    try {
      const qs = f.tipo === 'custom' ? `de=${f.de}&ate=${f.ate}` : `periodo=${f.tipo}`;
      const r = await api.get(`/motoboys/app/historico?${qs}`);
      setDados(r || { corridas: [], total_cent: 0, quantidade: 0 });
    } catch (e) { /* mantém */ }
    setCarregando(false); setRefreshing(false);
  }, []);

  useEffect(() => { if (ultimo.current) setRefreshing(true); carregar(filtro); }, [filtro]);
  useFocusEffect(useCallback(() => { if (ultimo.current && Date.now() - ultimo.current > 20000) carregar(filtroRef.current); }, [carregar]));

  // Agrupa por dia (mantendo a ordem desc) e calcula subtotal por dia.
  const grupos = [];
  const idx = {};
  for (const c of dados.corridas) {
    const k = chaveDia(c.concluida_em);
    if (idx[k] == null) { idx[k] = grupos.length; grupos.push({ chave: k, label: diaLabel(c.concluida_em), corridas: [], total: 0 }); }
    const g = grupos[idx[k]];
    g.corridas.push(c); g.total += Number(c.valor_motoboy_cent) || 0;
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => irParaInicio()} style={st.btnVoltar}>
          <Icone nome="voltar" tam={24} cor={'#fff'} traco={2.4} />
        </TouchableOpacity>
        <Text style={st.headerTit}>Histórico</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={st.filtroBox}>
        <FiltroPeriodo valor={filtro} aoSelecionar={(f) => setFiltro(f)} />
      </View>

      {carregando ? (
        <View style={st.center}><ActivityIndicator color={C.azulP} size="large" /></View>
      ) : (
        <ScrollView style={st.body} contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(filtro); }} />}>
          <Text style={st.periodoTit}>Mostrando: <Text style={{ color: C.azulP, fontWeight: '800' }}>{rotuloPeriodo(filtro)}</Text> · {dados.quantidade} corrida{dados.quantidade !== 1 ? 's' : ''} · {reais(dados.total_cent)}</Text>
          {Number(dados.dinamica_cent) > 0 && <Text style={st.periodoDin}>{`inclui ${reais(dados.dinamica_cent)} de dinâmica`}</Text>}

          {dados.corridas.length === 0 ? (
            <View style={st.vazio}>
              <View style={st.vazioIco}><Icone nome="caixa" tam={30} cor={C.azulP} traco={1.8} /></View>
              <Text style={st.vazioTit}>Nenhuma corrida neste período</Text>
              <Text style={st.vazioTxt}>Troque o período acima ou fique online para receber corridas.</Text>
            </View>
          ) : (
            grupos.map(g => (
              <View key={g.chave}>
                <View style={st.diaSep}>
                  <Text style={st.diaSepTxt}>{g.label}</Text>
                  <Text style={st.diaSepTot}>{reais(g.total)} · {g.corridas.length}</Text>
                </View>
                {g.corridas.map(c => (
                  <TouchableOpacity key={c.id} style={st.card} activeOpacity={0.8}
                    onPress={() => router.push({ pathname: '/corrida-detalhe', params: { id: c.id } })}
                    accessibilityRole="button" accessibilityLabel={`Corrida ${c.protocolo}, ver detalhe`}>
                    <View style={{ flex: 1 }}>
                    <View style={st.cardTopo}>
                      <Text style={st.cardProto}>{c.protocolo}</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={st.cardValor}>{reais(c.valor_motoboy_cent)}</Text>
                        <ValorDinamica totalCent={c.valor_motoboy_cent} dinamicaCent={c.dinamica_motoboy_cent} />
                      </View>
                    </View>
                    <View style={st.cardRodape}>
                      <Text style={st.cardMeta}>{horaDe(c.concluida_em)}{c.cliente_nome ? ` · ${c.cliente_nome}` : ''}</Text>
                      <Text style={st.cardMeta}>
                        {c.qtd_pontos > 1 ? `${c.qtd_pontos} paradas` : '1 parada'}
                        {Number.isFinite(Number(c.distancia_km)) && Number(c.distancia_km) > 0 ? ` · ${Number(c.distancia_km).toFixed(1)} km` : ''}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Icone nome="pin" tam={11} cor={C.tinta3} />
                      <Text style={[st.cardEnd, { marginTop: 0, flex: 1 }]} numberOfLines={1}>{c.ultimo_destino || c.coleta_endereco}</Text>
                    </View>
                    </View>
                    <Icone nome="seta" tam={18} cor={C.tinta3} />
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },

  filtroBox: { padding: 16, paddingBottom: 4 },
  periodoTit: { fontSize: 12, fontWeight: '700', color: C.tinta2, marginBottom: 10 },
  periodoDin: { fontSize: 11.5, fontWeight: '700', color: T.dinamica, marginTop: -6, marginBottom: 10 },

  body: { flex: 1 },
  diaSep: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 6, paddingHorizontal: 2 },
  diaSepTxt: { fontSize: 11.5, fontWeight: '800', color: C.tinta3, textTransform: 'uppercase', letterSpacing: 0.3 },
  diaSepTot: { fontSize: 11.5, fontWeight: '800', color: C.ok },

  card: { backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 12, padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardProto: { fontSize: 15, fontWeight: '800', color: C.navy900 },
  cardValor: { fontSize: 15, fontWeight: '800', color: C.ok },
  cardRodape: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  cardMeta: { fontSize: 11, color: C.tinta3 },
  cardEnd: { fontSize: 12, color: C.tinta2, marginTop: 4 },

  vazio: { alignItems: 'center', paddingVertical: 50 },
  vazioIco: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#eef4fb', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  vazioTit: { fontSize: 14.5, fontWeight: '800', color: C.tinta, marginBottom: 4 },
  vazioTxt: { fontSize: 13.5, color: C.tinta3, textAlign: 'center' },
});
