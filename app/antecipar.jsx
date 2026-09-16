// Antecipar saldo (saque emergencial) — app do profissional.
//
// Regra do produto: só dá para antecipar o que ele JÁ ganhou em corridas concluídas.
// A tela bloqueia o que já sabe que falha, para não frustrar; mas quem decide é o
// servidor, que reavalia no pedido e de novo antes de pagar.
//
// Decisões de tela (mockup aprovado em 16/09/2026):
//  · o saldo é a primeira coisa, grande — é a pergunta que traz ele aqui;
//  · usar a gratuidade é ESCOLHA dele: o vale se encerra no uso, então às vezes vale
//    guardar para um saque maior. O texto diz o que ele perde em cada opção;
//  · a conta (pede / taxa / recebe) aparece enquanto digita, nunca depois;
//  · sem valores sugeridos: ele digita. O único atalho é "usar o máximo", que é o
//    número que ele não sabe de cabeça.
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, RefreshControl, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { api } from '../src/api';
import { T, reais } from '../src/tema';

const centavos = (texto) => {
  const n = Math.round(Number(String(texto).replace(/[^\d,]/g, '').replace(',', '.')) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const paraCampo = (cent) => (cent ? (cent / 100).toFixed(2).replace('.', ',') : '');
const dataHora = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' })
      + ' · ' + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

export default function Antecipar() {
  const [info, setInfo] = useState(null);          // saldo, limites, gratuidade
  const [sim, setSim] = useState(null);            // taxa e recebe do valor digitado
  const [historico, setHistorico] = useState([]);
  const [valor, setValor] = useState('');
  const [usarGratuidade, setUsarGratuidade] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aba, setAba] = useState('pedir');
  const temporizador = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const [i, h] = await Promise.all([
        api.get('/app/antecipacoes'),
        api.get('/app/antecipacoes/historico'),
      ]);
      setInfo(i);
      setHistorico((h && h.linhas) || []);
    } catch (e) {
      setInfo({ disponivel: false, erro: e.message });
    } finally { setCarregando(false); setRefreshing(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Simula no servidor a cada mudança: a taxa, os limites e o vale são regra dele, não
  // da tela. O atraso evita uma chamada por tecla digitada.
  useEffect(() => {
    const cent = centavos(valor);
    if (!cent) { setSim(null); return undefined; }
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      try {
        const r = await api.get(`/app/antecipacoes?valor_cent=${cent}&usar_gratuidade=${usarGratuidade}`);
        setSim(r);
      } catch { setSim(null); }
    }, 350);
    return () => clearTimeout(temporizador.current);
  }, [valor, usarGratuidade]);

  const emAnalise = historico.find((h) => h.status === 'aguardando');

  async function solicitar() {
    const cent = centavos(valor);
    if (!cent) return;
    setEnviando(true);
    try {
      const r = await api.post('/app/antecipacoes', { valor_cent: cent, usar_gratuidade: usarGratuidade });
      setValor('');
      await carregar();
      Alert.alert(
        r.status === 'paga' ? 'Pagamento enviado' : 'Pedido recebido',
        r.status === 'paga'
          ? 'O valor já foi enviado para a sua chave Pix.'
          : 'Seu pedido está em análise. Você recebe um aviso assim que for pago.',
      );
    } catch (e) {
      Alert.alert('Não foi possível', e.message || 'Tente novamente em instantes.');
    } finally { setEnviando(false); }
  }

  if (carregando) {
    return (
      <View style={[st.tela, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={T.primario} size="large" />
      </View>
    );
  }

  const podePedir = sim && sim.pode && !emAnalise && !enviando;
  const maximo = info && info.maximo_cent ? info.maximo_cent : 0;

  return (
    <View style={st.tela}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />

      <View style={st.cab}>
        <TouchableOpacity style={st.voltar} onPress={() => router.back()} hitSlop={10}>
          <Text style={st.voltarTx}>‹</Text>
        </TouchableOpacity>
        <Text style={st.cabTitulo}>{aba === 'pedir' ? 'Antecipar saldo' : 'Meus saques'}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar(); }} tintColor={T.primario} />}
      >
        {aba === 'pedir' ? (
          <>
            <View style={st.hero}>
              <Text style={st.heroRot}>Disponível para antecipar</Text>
              <Text style={st.heroVal}>{reais(info.saldo_cent || 0)}</Text>
              <Text style={st.heroNota}>do que você já ganhou em corridas concluídas</Text>
            </View>

            {!info.disponivel ? (
              <Faixa tipo="nega"
                titulo="Antecipação indisponível"
                texto="Sua central não está com a antecipação ligada no momento." />
            ) : emAnalise ? (
              <>
                <Faixa tipo="espera"
                  titulo="Seu pedido está em análise"
                  texto={`${reais(emAnalise.valor_cent)} solicitados em ${dataHora(emAnalise.criado_em)}. Você recebe um aviso assim que for pago.`} />
                <View style={st.bloco}>
                  <Text style={st.rotulo}>Pedido em análise</Text>
                  <Resumo pede={emAnalise.valor_cent} taxa={emAnalise.taxa_cent} recebe={emAnalise.recebe_cent} gratis={emAnalise.gratuidade} />
                  <Text style={st.ajuda}>Enquanto este pedido não for resolvido, não dá para fazer outro.</Text>
                </View>
              </>
            ) : !info.saldo_cent ? (
              <Faixa tipo="nega"
                titulo="Você ainda não tem saldo para antecipar"
                texto="A antecipação usa o que você já ganhou em corridas concluídas e ainda não recebeu. Assim que concluir corridas, o valor aparece aqui." />
            ) : (
              <>
                {info.gratuidade_disponivel && (
                  <View style={st.grat}>
                    <View style={st.gratTopo}>
                      <Text style={st.gratTitulo}>Você tem 1 gratuidade</Text>
                      <TouchableOpacity
                        style={[st.switch, usarGratuidade && st.switchOn]}
                        activeOpacity={0.8}
                        onPress={() => setUsarGratuidade((v) => !v)}
                      >
                        <View style={[st.switchBola, usarGratuidade && st.switchBolaOn]} />
                      </TouchableOpacity>
                    </View>
                    <Text style={st.gratTexto}>
                      {`Vale até ${reais(info.gratuidade_disponivel_max_cent)} sem taxa. `}
                      {usarGratuidade
                        ? 'Vai ser usada neste saque — e acaba aqui, mesmo que você peça menos que o valor dela.'
                        : 'Guardada para depois. Este saque vai com taxa normal.'}
                    </Text>
                  </View>
                )}

                <View style={st.bloco}>
                  <Text style={st.rotulo}>Quanto você quer</Text>
                  <View style={st.campoValor}>
                    <Text style={st.cifrao}>R$</Text>
                    <TextInput
                      style={st.entrada}
                      value={valor}
                      onChangeText={setValor}
                      keyboardType="numeric"
                      placeholder="0,00"
                      placeholderTextColor={T.tinta3}
                    />
                  </View>

                  {maximo > 0 && (
                    <>
                      <TouchableOpacity style={st.atalho} activeOpacity={0.85} onPress={() => setValor(paraCampo(maximo))}>
                        <Text style={st.atalhoTx}>{`Usar o máximo · ${reais(maximo)}`}</Text>
                      </TouchableOpacity>
                      {/* O máximo quase nunca é o saldo inteiro — dizer o porquê evita a
                          leitura de que o app "está errado" ou que sumiu dinheiro. */}
                      {info.limitado_por !== 'seu saldo' && (
                        <Text style={st.ajuda}>
                          {info.limitado_por === 'limite do dia'
                            ? `Hoje você ainda pode antecipar ${reais(info.restante_dia_cent)}. O resto do saldo continua seu, disponível amanhã ou no fechamento.`
                            : `Cada pedido vai até ${reais(info.maximo_cent)}. O resto do saldo continua seu.`}
                        </Text>
                      )}
                    </>
                  )}

                  {sim && sim.pode && (
                    <Resumo pede={sim.valor_cent} taxa={sim.taxa_cent} recebe={sim.recebe_cent} gratis={sim.gratuidade} />
                  )}
                  {sim && !sim.pode && <Text style={st.erro}>{sim.motivo}</Text>}
                </View>

                <TouchableOpacity
                  style={[st.botao, !podePedir && st.botaoOff]}
                  activeOpacity={0.85}
                  disabled={!podePedir}
                  onPress={solicitar}
                >
                  {enviando
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={st.botaoTx}>{sim && sim.pode ? `Solicitar ${reais(sim.recebe_cent)}` : 'Solicitar'}</Text>}
                </TouchableOpacity>

                <Text style={st.rodape}>
                  {`Mínimo ${reais(info.minimo_cent)} por pedido`}
                  {info.pedidos_restantes_dia > 0 ? ` · resta ${info.pedidos_restantes_dia} pedido hoje` : ''}
                </Text>
              </>
            )}

            <TouchableOpacity style={st.linkAba} onPress={() => setAba('historico')}>
              <Text style={st.linkAbaTx}>Ver meus saques</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ResumoMes linhas={historico} />
            <View style={{ paddingHorizontal: 14, marginTop: 14 }}>
              {historico.length === 0 && (
                <Text style={st.vazio}>Você ainda não pediu nenhuma antecipação.</Text>
              )}
              {historico.map((h) => (
                <View key={h.id} style={st.item}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.itemValor}>{reais(h.valor_cent)}</Text>
                    <Text style={st.itemQuando}>
                      {`${dataHora(h.criado_em)} · ${h.gratuidade ? 'sem taxa (gratuidade)' : (h.taxa_cent ? 'taxa ' + reais(h.taxa_cent) : 'sem taxa')}`}
                    </Text>
                    {h.status === 'recusada' && !!h.motivo_recusa && (
                      <Text style={st.itemMotivo}>{h.motivo_recusa}</Text>
                    )}
                  </View>
                  <Text style={[st.selo, h.status === 'paga' ? st.seloOk : h.status === 'recusada' ? st.seloErro : st.seloEspera]}>
                    {h.status === 'paga' ? 'recebido' : h.status}
                  </Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={st.linkAba} onPress={() => setAba('pedir')}>
              <Text style={st.linkAbaTx}>Voltar para antecipar</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// Pede, taxa, recebe — os três sempre juntos. Com gratuidade, a taxa cheia aparece
// riscada: ele vê o quanto está economizando, não só que está de graça.
function Resumo({ pede, taxa, recebe, gratis }) {
  return (
    <View style={st.resumo}>
      <View style={st.resumoLinha}>
        <Text style={st.resumoRot}>Você pede</Text>
        <Text style={st.resumoVal}>{reais(pede)}</Text>
      </View>
      <View style={[st.resumoLinha, st.resumoBorda]}>
        <Text style={st.resumoRot}>{gratis ? 'Taxa (gratuidade)' : 'Taxa'}</Text>
        <Text style={[st.resumoVal, gratis ? st.resumoGratis : st.resumoTaxa]}>
          {gratis ? 'grátis' : `− ${reais(taxa)}`}
        </Text>
      </View>
      <View style={[st.resumoLinha, st.resumoBorda, st.resumoRecebe]}>
        <Text style={st.resumoRot}>Você recebe</Text>
        <Text style={st.resumoRecebeVal}>{reais(recebe)}</Text>
      </View>
    </View>
  );
}

// Resumo do mês: é o que ele quer saber para decidir se vale sacar de novo.
function ResumoMes({ linhas }) {
  const mes = new Date().getMonth();
  const doMes = linhas.filter((l) => l.status === 'paga' && new Date(l.criado_em).getMonth() === mes);
  const total = doMes.reduce((s, l) => s + l.valor_cent, 0);
  const taxa = doMes.reduce((s, l) => s + l.taxa_cent, 0);
  const gratis = doMes.filter((l) => l.gratuidade).length;
  return (
    <View style={st.resumoMes}>
      <View style={st.resumoMesCard}>
        <Text style={st.resumoMesRot}>Antecipado</Text>
        <Text style={st.resumoMesVal}>{reais(total)}</Text>
      </View>
      <View style={st.resumoMesCard}>
        <Text style={st.resumoMesRot}>Taxa paga</Text>
        <Text style={[st.resumoMesVal, { color: T.alertaTx }]}>{reais(taxa)}</Text>
      </View>
      <View style={st.resumoMesCard}>
        <Text style={st.resumoMesRot}>Grátis</Text>
        <Text style={[st.resumoMesVal, { color: T.ganhoEsc }]}>{gratis}</Text>
      </View>
    </View>
  );
}

function Faixa({ tipo, titulo, texto }) {
  const cores = {
    espera: { bg: T.atencaoBg, bd: '#efdcb0', tx: T.atencaoTx },
    nega: { bg: T.alertaBg, bd: '#f0cdc8', tx: T.alertaTx },
    bom: { bg: T.ganhoBg, bd: T.ganhoBd, tx: T.ganhoEsc },
  }[tipo];
  return (
    <View style={[st.faixa, { backgroundColor: cores.bg, borderColor: cores.bd }]}>
      <Text style={[st.faixaTitulo, { color: cores.tx }]}>{titulo}</Text>
      <Text style={[st.faixaTexto, { color: cores.tx }]}>{texto}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  tela: { flex: 1, backgroundColor: T.papel },
  cab: { backgroundColor: T.profundo, paddingTop: 46, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  voltar: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  voltarTx: { color: '#fff', fontSize: 20, lineHeight: 22, marginTop: -2 },
  cabTitulo: { color: '#fff', fontSize: 17, fontWeight: '800' },

  hero: { backgroundColor: T.profundo, paddingHorizontal: 18, paddingBottom: 22 },
  heroRot: { color: T.claro, fontSize: 12, fontWeight: '600' },
  heroVal: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 4 },
  heroNota: { color: T.claro, fontSize: 12, marginTop: 4, opacity: 0.85 },

  bloco: { backgroundColor: T.sup, marginHorizontal: 14, marginTop: 14, borderRadius: T.r, padding: 16 },
  rotulo: { fontSize: 11.5, fontWeight: '700', color: T.tinta2, textTransform: 'uppercase', letterSpacing: 0.4 },
  campoValor: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderColor: T.linha, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  cifrao: { fontSize: 19, fontWeight: '800', color: T.tinta3 },
  entrada: { flex: 1, fontSize: 30, fontWeight: '800', color: T.tinta, padding: 0 },
  atalho: { marginTop: 12, alignSelf: 'flex-start', backgroundColor: T.suave, borderWidth: 1, borderColor: T.linha, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  atalhoTx: { fontSize: 13, fontWeight: '700', color: T.primario },

  resumo: { marginTop: 14, borderWidth: 1, borderColor: T.linha, borderRadius: 14, overflow: 'hidden' },
  resumoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  resumoBorda: { borderTopWidth: 1, borderTopColor: T.linha },
  resumoRot: { fontSize: 13.5, color: T.tinta2 },
  resumoVal: { fontSize: 14, fontWeight: '800', color: T.tinta },
  resumoTaxa: { color: T.alertaTx },
  resumoGratis: { color: T.ganhoEsc },
  resumoRecebe: { backgroundColor: T.ganhoBg },
  resumoRecebeVal: { fontSize: 17, fontWeight: '800', color: T.ganhoEsc },

  grat: { marginHorizontal: 14, marginTop: 14, borderRadius: T.r, padding: 16, backgroundColor: T.atencaoBg, borderWidth: 1, borderColor: '#efdcb0' },
  gratTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  gratTitulo: { fontSize: 14, fontWeight: '800', color: T.atencaoTx },
  gratTexto: { marginTop: 6, fontSize: 12.5, color: '#8a6412', lineHeight: 18 },
  switch: { width: 50, height: 29, borderRadius: 999, backgroundColor: '#d9c9a4', padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: T.ganho },
  switchBola: { width: 23, height: 23, borderRadius: 12, backgroundColor: '#fff' },
  switchBolaOn: { marginLeft: 21 },

  botao: { marginHorizontal: 14, marginTop: 16, backgroundColor: T.ganho, borderRadius: 15, paddingVertical: 16, alignItems: 'center' },
  botaoOff: { backgroundColor: '#c7d6e4' },
  botaoTx: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  rodape: { fontSize: 11.5, color: T.tinta3, textAlign: 'center', marginTop: 9, marginHorizontal: 18, lineHeight: 17 },
  ajuda: { fontSize: 11.5, color: T.tinta3, marginTop: 12, lineHeight: 17 },
  erro: { fontSize: 13, color: T.alertaTx, fontWeight: '700', marginTop: 12 },

  faixa: { marginHorizontal: 14, marginTop: 14, borderRadius: 14, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 13 },
  faixaTitulo: { fontSize: 13.5, fontWeight: '800' },
  faixaTexto: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  linkAba: { marginTop: 18, alignItems: 'center', paddingVertical: 8 },
  linkAbaTx: { color: T.primario, fontSize: 14, fontWeight: '700' },

  resumoMes: { flexDirection: 'row', gap: 9, marginHorizontal: 14, marginTop: 14 },
  resumoMesCard: { flex: 1, backgroundColor: T.sup, borderRadius: 15, padding: 13, alignItems: 'center' },
  resumoMesRot: { fontSize: 11, color: T.tinta3, fontWeight: '700' },
  resumoMesVal: { fontSize: 17, fontWeight: '800', marginTop: 3, color: T.tinta },

  item: { backgroundColor: T.sup, borderRadius: 15, padding: 14, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemValor: { fontSize: 15, fontWeight: '800', color: T.tinta },
  itemQuando: { fontSize: 11.5, color: T.tinta3, fontWeight: '600', marginTop: 2 },
  itemMotivo: { fontSize: 12, color: T.alertaTx, marginTop: 4, lineHeight: 17 },
  selo: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  seloOk: { backgroundColor: T.ganhoBg, color: T.ganhoEsc },
  seloEspera: { backgroundColor: T.atencaoBg, color: T.atencaoTx },
  seloErro: { backgroundColor: T.alertaBg, color: T.alertaTx },
  vazio: { fontSize: 13, color: T.tinta3, textAlign: 'center', paddingVertical: 30 },
});
