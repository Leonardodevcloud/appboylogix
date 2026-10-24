import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, StatusBar, Linking,
} from 'react-native';
import { irParaInicio } from '../src/navegacao/abas';
import { api } from '../src/api';
import { T } from '../src/tema';
import { Alerta } from '../src/utils/avisar';
import { abrirNavegacao } from '../src/state/navegacao';
import Icone from '../src/componentes/Icone';
import { agruparPorLocal, rotuloGrupo, distM } from '../src/utils/agrupar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

let MapView = null, Marker = null, Polyline = null, UrlTile = null, PROVIDER_DEFAULT = undefined, mapaDisponivel = false;
try {
  const maps = require('react-native-maps');
  MapView = maps.default; Marker = maps.Marker; Polyline = maps.Polyline; UrlTile = maps.UrlTile; PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
  mapaDisponivel = !!MapView;
} catch (e) { mapaDisponivel = false; }

const C = {
  navy900: T.profundo, azulP: T.primario, azulV: T.vivo, azulC: T.claro,
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  fundo: '#eef4fb', sup: '#fff', linha: '#dde9f5', ok: '#27b67f',
};

export default function Rota() {
  const insetBaixo = useSafeAreaInsets().bottom;   // botões do Android no rodapé: o conteúdo fica acima deles
  const [dados, setDados] = useState(null);
  const [paradas, setParadas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mapaPronto, setMapaPronto] = useState(false);
  const [reordenado, setReordenado] = useState(false);

  const [erro, setErro] = useState(false);
  async function carregar() {
    setCarregando(true); setErro(false);
    try {
      const r = await api.get('/motoboys/app/minha-rota');
      setDados(r);
      setParadas(r.paradas || []);
    } catch (e) { setErro(true); }
    setCarregando(false);
  }
  useEffect(() => { carregar(); }, []);

  function mover(idx, dir) {
    const novo = [...paradas];
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= novo.length) return;
    [novo[idx], novo[alvo]] = [novo[alvo], novo[idx]];
    setParadas(novo);
    setReordenado(true);
  }

  // Rota inteira (coleta + entregas na ordem) no app escolhido: o Google Maps recebe todas
  // as paradas; o Waze, que não aceita paradas pela URL, vai para a primeira.
  function seguirRota() {
    if (!paradas.length) { Alerta.alert('Sem rota', 'Você não tem corridas ativas com endereço.'); return; }
    const pts = [];
    if (dados?.coleta?.lat) pts.push({ lat: dados.coleta.lat, lng: dados.coleta.lng });
    paradas.forEach(p => pts.push({ lat: p.lat, lng: p.lng }));
    const destino = pts[pts.length - 1];
    abrirNavegacao({ ...destino, label: paradas[paradas.length - 1]?.endereco, paradas: pts.slice(0, -1), primeira: pts[0] });
  }

  if (carregando) {
    return <View style={st.splash}><StatusBar barStyle="light-content" backgroundColor={C.navy900} /><ActivityIndicator color={C.azulV} size="large" /></View>;
  }

  // Sem resposta (servidor ou rede): antes a tela quebrava ("Algo deu errado") porque
  // lia dados.coordenadas com dados vazio (18/10/2026). Agora mostra o erro e o "tentar".
  if (!dados) {
    return (
      <View style={[st.splash, { padding: 30 }]}>
        <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
        <Icone nome="semSinal" tam={34} cor={C.azulC} traco={1.8} />
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 12, textAlign: 'center' }}>{erro ? 'Não consegui montar a rota agora' : 'Sem rota'}</Text>
        <TouchableOpacity onPress={carregar} style={{ marginTop: 18, backgroundColor: C.azulP, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Tentar de novo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => irParaInicio()} style={{ marginTop: 14 }}>
          <Text style={{ color: C.azulC, fontWeight: '700' }}>Voltar para o Início</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const temColeta = dados?.coleta?.lat != null;
  const totalParadas = paradas.length;
  // Blocos da lista: paradas SEGUIDAS a até ~30 m uma da outra ficam juntas (ADR-053).
  const blocos = [];
  paradas.forEach((p, i) => {
    const ult = blocos[blocos.length - 1];
    if (ult && distM(ult[ult.length - 1].p, p) <= 30) ult.push({ p, i });
    else blocos.push([{ p, i }]);
  });
  const corridasUnicas = new Set(paradas.map(p => p.entrega_id)).size;

  // Região do mapa.
  let regiao = null;
  if (temColeta || paradas.length) {
    const todos = [];
    if (temColeta) todos.push({ lat: dados.coleta.lat, lng: dados.coleta.lng });
    paradas.forEach(p => todos.push({ lat: p.lat, lng: p.lng }));
    if (todos.length) {
      const lats = todos.map(p => p.lat), lngs = todos.map(p => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      regiao = {
        latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.5),
        longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.5),
      };
    }
  }

  // Linha do mapa: usa a geometria real (segue as ruas) vinda do ORS quando a ordem
  // está como o backend otimizou. Se o motoboy reordenar, cai para a linha reta entre pontos.
  let linhaRota = [];
  const temGeometria = Array.isArray(dados.coordenadas) && dados.coordenadas.length > 1;
  if (temGeometria && !reordenado) {
    linhaRota = dados.coordenadas.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
  } else {
    if (temColeta) linhaRota.push({ latitude: dados.coleta.lat, longitude: dados.coleta.lng });
    paradas.forEach(p => linhaRota.push({ latitude: p.lat, longitude: p.lng }));
  }

  // 11f: sem overlay CARTO no MapView — o CARTO passou a exigir chave e carimbava "KEY REQUIRED"
  // no mapa. O mapa nativo (Google, chave no app.json; sem custo no SDK Android) fica sozinho.
  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy900} />
      <View style={st.header}>
        <TouchableOpacity onPress={() => irParaInicio()} style={st.btnVoltar}>
          <Icone nome="voltar" tam={24} cor={'#fff'} traco={2.4} />
        </TouchableOpacity>
        <Text style={st.headerTit}>Minha rota</Text>
        <View style={{ width: 38 }} />
      </View>

      {paradas.length === 0 ? (
        <View style={st.vazio}>
          <View style={st.vazioIco}><Icone nome="mapa" tam={32} cor={C.azulP} traco={1.8} /></View>
          <Text style={st.vazioTxt}>Você não tem corridas ativas no momento</Text>
          <TouchableOpacity style={st.vazioBtn} onPress={() => irParaInicio()}>
            <Text style={st.vazioBtnTxt}>Voltar ao início</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={st.body} contentContainerStyle={{ paddingBottom: 30 + insetBaixo }}>
          {/* Resumo */}
          <View style={st.resumo}>
            <View style={st.resumoItem}><Text style={st.resumoVal}>{corridasUnicas}</Text><Text style={st.resumoLbl}>corrida{corridasUnicas !== 1 ? 's' : ''}</Text></View>
            <View style={st.resumoItem}><Text style={st.resumoVal}>{totalParadas}</Text><Text style={st.resumoLbl}>parada{totalParadas !== 1 ? 's' : ''}</Text></View>
            {Number.isFinite(Number(dados.distancia_km)) && Number(dados.distancia_km) > 0 && (
              <View style={st.resumoItem}><Text style={st.resumoVal}>{Number(dados.distancia_km).toFixed(1)}</Text><Text style={st.resumoLbl}>km</Text></View>
            )}
            {Number(dados.duracao_min) > 0 && (
              <View style={st.resumoItem}><Text style={st.resumoVal}>{dados.duracao_min}</Text><Text style={st.resumoLbl}>min</Text></View>
            )}
          </View>

          {/* Mapa */}
          {mapaDisponivel && regiao && (
            <View style={st.mapaWrap}>
              <MapView style={st.mapa} provider={PROVIDER_DEFAULT} initialRegion={regiao} mapType="standard"
                onMapReady={() => setMapaPronto(true)} rotateEnabled={false} pitchEnabled={false}>
                {linhaRota.length > 1 && <Polyline coordinates={linhaRota} strokeColor={C.azulP} strokeWidth={4} zIndex={3} />}
                {temColeta && (
                  <Marker coordinate={{ latitude: dados.coleta.lat, longitude: dados.coleta.lng }} title="Coleta" anchor={{ x: 0.5, y: 0.5 }}>
                    <View style={[st.pin, { backgroundColor: C.navy900 }]}><Text style={st.pinTxt}>C</Text></View>
                  </Marker>
                )}
                {/* ADR-053: paradas no mesmo lugar (até ~30 m) viram um pino só ("1·2"). */}
                {agruparPorLocal(paradas).filter(g => g.lat != null).map((g, gi, todos) => {
                  const varios = g.itens.length > 1;
                  return (
                    <Marker key={g.itens[0].parada.ponto_id} coordinate={{ latitude: g.lat, longitude: g.lng }} anchor={{ x: 0.5, y: 0.5 }}
                      title={varios ? `${g.itens.length} entregas aqui` : `${g.itens[0].indice + 1} · ${g.itens[0].parada.protocolo}`}
                      description={varios ? g.itens.map(x => x.parada.protocolo).join(', ') : undefined}>
                      <View style={[st.pin, varios && { width: undefined, paddingHorizontal: 8 }, { backgroundColor: gi === todos.length - 1 ? C.ok : C.azulP }]}><Text style={st.pinTxt}>{rotuloGrupo(g)}</Text></View>
                    </Marker>
                  );
                })}
              </MapView>
            </View>
          )}

          {/* Sequência */}
          <View style={st.seq}>
            <Text style={st.seqTit}>SEQUÊNCIA SUGERIDA</Text>

            {temColeta && (
              <View style={st.parada}>
                <View style={[st.badge, { backgroundColor: C.navy900 }]}><Text style={st.badgeTxt}>C</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.paradaTit}>Coleta{dados.coleta.cliente_nome ? ` · ${dados.coleta.cliente_nome}` : ''}</Text>
                  <Text style={st.paradaEnd} numberOfLines={1}>{dados.coleta.endereco}</Text>
                </View>
              </View>
            )}

            {blocos.map((bl) => {
              const linhas = bl.map(({ p, i }) => (
              <View key={p.ponto_id} style={st.parada}>
                <View style={[st.badge, { backgroundColor: i === paradas.length - 1 ? C.ok : C.azulP }]}><Text style={st.badgeTxt}>{i + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.paradaTit}>Entrega · {p.protocolo}</Text>
                  <Text style={st.paradaEnd} numberOfLines={1}>{p.endereco}</Text>
                </View>
                <View style={st.reorder}>
                  <TouchableOpacity onPress={() => mover(i, -1)} disabled={i === 0} style={[st.setaBtn, i === 0 && st.setaOff]}><Text style={st.seta}>▲</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => mover(i, 1)} disabled={i === paradas.length - 1} style={[st.setaBtn, i === paradas.length - 1 && st.setaOff]}><Text style={st.seta}>▼</Text></TouchableOpacity>
                </View>
              </View>
              ));
              if (bl.length < 2) return linhas;
              // Entregas seguidas no mesmo lugar: quadro "Mesmo local" (ADR-053).
              return (
                <View key={'g' + bl[0].p.ponto_id} style={st.grupo}>
                  <View style={st.grupoH}><Icone nome="pin" tam={14} cor={C.azulP} traco={2.4} /><Text style={st.grupoTxt} numberOfLines={1}>Mesmo local · {String(bl[0].p.endereco || '').split(',')[0]}</Text></View>
                  {linhas}
                </View>
              );
            })}

            <TouchableOpacity style={st.btnSeguir} onPress={seguirRota} activeOpacity={0.85}>
              <Text style={st.btnSeguirTxt}>Seguir rota no Google Maps</Text>
            </TouchableOpacity>
            <Text style={st.dica}>Abre o Google Maps com todas as paradas na ordem acima. Use as setas para reordenar.</Text>
            {reordenado && <Text style={st.dicaAlt}>Você alterou a ordem — a linha do mapa é aproximada, mas o Google Maps traçará o caminho real.</Text>}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.fundo },
  splash: { flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: C.navy900, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  btnVoltar: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  btnVoltarTxt: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: -2 },
  headerTit: { color: '#fff', fontSize: 17, fontWeight: '800' },

  body: { flex: 1 },
  resumo: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: C.navy900, paddingVertical: 14, paddingHorizontal: 16 },
  resumoItem: { alignItems: 'center' },
  resumoVal: { color: '#fff', fontSize: 19, fontWeight: '900' },
  resumoLbl: { color: '#9fb8d0', fontSize: 10, marginTop: 1 },

  mapaWrap: { height: 220, backgroundColor: '#cfe0ee' },
  mapa: { flex: 1 },
  pin: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' },
  pinTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },

  seq: { padding: 16 },
  seqTit: { fontSize: 10, fontWeight: '800', color: C.tinta3, letterSpacing: 0.5, marginBottom: 12 },
  parada: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.sup, borderWidth: 1, borderColor: C.linha, borderRadius: 12, padding: 12, marginBottom: 8 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  grupo: { borderWidth: 1.5, borderColor: C.azulV, borderRadius: 16, paddingHorizontal: 8, paddingTop: 8, marginBottom: 8, backgroundColor: '#f1f7fe' },
  grupoH: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingBottom: 8 },
  grupoTxt: { fontSize: 12, fontWeight: '800', color: C.azulP, flexShrink: 1 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  paradaTit: { fontSize: 13, fontWeight: '700', color: C.tinta },
  paradaEnd: { fontSize: 11.5, color: C.tinta3, marginTop: 1 },
  reorder: { flexDirection: 'column', gap: 2 },
  setaBtn: { width: 26, height: 20, alignItems: 'center', justifyContent: 'center' },
  setaOff: { opacity: 0.25 },
  seta: { fontSize: 11, color: C.azulP },

  btnSeguir: { backgroundColor: C.azulP, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  btnSeguirTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dica: { fontSize: 11, color: C.tinta3, textAlign: 'center', marginTop: 8, lineHeight: 16 },
  dicaAlt: { fontSize: 11, color: '#854F0B', textAlign: 'center', marginTop: 6, lineHeight: 16, backgroundColor: '#FAEEDA', padding: 8, borderRadius: 8 },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  vazioIco: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#eef4fb', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  vazioTxt: { fontSize: 14, color: C.tinta2, textAlign: 'center', marginBottom: 18 },
  vazioBtn: { backgroundColor: C.azulP, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  vazioBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
