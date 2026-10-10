// Antecipar saldo (saque emergencial) — app do profissional.
//
// Regra do produto: só dá para antecipar o que ele JÁ ganhou em corridas concluídas.
// A tela bloqueia o que já sabe que falha, para não frustrar; mas quem decide é o
// servidor, que reavalia no pedido e de novo antes de pagar.
//
// Decisões de tela (mockups aprovados em 16/09 e 10/10/2026):
//  · o saldo é a primeira coisa, grande — é a pergunta que traz ele aqui;
//  · usar a gratuidade é ESCOLHA dele: o vale se encerra no uso, então às vezes vale
//    guardar para um saque maior. O texto diz o que ele perde em cada opção;
//  · a conta (pede / taxa / recebe) aparece enquanto digita, nunca depois — e a regra da
//    taxa da central aparece escrita ("4,5% + R$ 0,40"), sem surpresa;
//  · pedido em análise: dá para DESISTIR. Pagamento a caminho: não dá (o dinheiro já
//    está saindo) — a tela mostra as etapas em vez do botão;
//  · a tela se atualiza sozinha quando a central paga/recusa (WebSocket global).
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, StatusBar, RefreshControl, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../src/api';
import { T, reais } from '../src/tema';
import { ouvirAntecipacao } from '../src/state/antecipacao';

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
const horaDe = (iso) => {
  try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

// Como cada estado aparece para ELE (palavras dele, não do sistema).
const SELO = {
  aguardando: { tx: 'em análise', st: 'seloEspera' },
  processando: { tx: 'a caminho', st: 'seloInfo' },
  paga: { tx: 'recebido', st: 'seloOk' },
  recusada: { tx: 'recusado', st: 'seloErro' },
  devolvida: { tx: 'devolvido', st: 'seloErro' },
  cancelada: { tx: 'cancelado', st: 'seloNeutro' },
  estornada: { tx: 'estornado', st: 'seloNeutro' },
};

export default function Antecipar() {
  const params = useLocalSearchParams();
  const [info, setInfo] = useState(null);          // saldo, limites, gratuidade, pedido aberto
  const [sim, setSim] = useState(null);            // taxa e recebe do valor digitado
  const [historico, setHistorico] = useState([]);
  const [valor, setValor] = useState('');
  const [usarGratuidade, setUsarGratuidade] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [aba, setAba] = useState(params.aba === 'historico' ? 'historico' : 'pedir');
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
  // A central pagou/recusou/o banco devolveu: recarrega sem ele precisar puxar a tela.
  useEffect(() => ouvirAntecipacao(() => carregar()), [carregar]);
  useEffect(() => { if (params.aba === 'historico') setAba('historico'); }, [params.aba]);

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

  // O servidor diz qual pedido está aberto; o histórico é a reserva (versão antiga da API).
  const aberto = (info && info.pedido_aberto)
    || historico.find((h) => h.status === 'aguardando' || h.status === 'processando') || null;

  async function solicitar() {
    const cent = centavos(valor);
    if (!cent || !sim || !sim.pode) return;
    setEnviando(true);
    try {
      const r = await api.post('/app/antecipacoes', { valor_cent: cent, usar_gratuidade: usarGratuidade });
      setValor('');
      await carregar();
      const conta = `Você pediu ${reais(r.valor_cent)}${Number(r.taxa_cent) ? `, taxa de ${reais(r.taxa_cent)}` : ' sem taxa'}, e recebe ${reais(r.recebe_cent)} no Pix.`;
      Alert.alert(
        r.status === 'paga' ? 'Pagamento enviado' : 'Pedido recebido',
        r.status === 'paga'
          ? `${conta} Já foi enviado para a sua chave Pix. Saíram ${reais(r.valor_cent)} do seu saldo.`
          : `${conta} Seu pedido está em análise — você recebe um aviso quando o Pix cair.`,
      );
    } catch (e) {
      Alert.alert('Não foi possível', e.message || 'Tente novamente em instantes.');
    } finally { setEnviando(false); }
  }

  function desistir() {
    if (!aberto) return;
    Alert.alert('Desistir do pedido?', `O pedido de ${reais(aberto.valor_cent)} será cancelado. Você pode pedir de novo na hora.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Desistir', style: 'destructive', onPress: async () => {
        setCancelando(true);
        try { await api.post(`/app/antecipacoes/${aberto.id}/cancelar`, {}); await carregar(); }
        catch (e) { Alert.alert('Não foi possível', e.message || 'Tente novamente.'); await carregar(); }
        finally { setCancelando(false); }
      } },
    ]);
  }

  if (carregando) {
    return (
      <View style={[st.tela, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={T.primario} size="large" />
      </View>
    );
  }

  const podePedir = sim && sim.pode && !aberto && !enviando;
  const maximo = info && info.maximo_cent ? info.maximo_cent : 0;
  const aCaminho = aberto && aberto.status === 'processando';

  return (
    <View style={st.tela}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />

      <View style={st.cab}>
        <TouchableOpacity style={st.voltar} onPress={() => router.back()} hitSlop={10} accessibilityLabel="Voltar">
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
              <Text style={st.heroRot}>{aCaminho ? 'Seu saldo' : 'Disponível para antecipar'}</Text>
              <Text style={st.heroVal}>{reais(info.saldo_cent || 0)}</Text>
              <Text style={st.heroNota}>
                {aCaminho ? `${reais(aberto.valor_cent)} dele estão a caminho da sua conta` : 'do que você já ganhou em corridas concluídas'}
              </Text>
            </View>

            {!info.disponivel ? (
              <Faixa tipo="nega"
                titulo="Antecipação indisponível"
                texto="Sua central não está com a antecipação ligada no momento." />
            ) : aCaminho ? (
              <>
                <Faixa tipo="info"
                  titulo="Pagamento a caminho"
                  texto="A central aprovou seu pedido e o banco está processando o Pix. Você recebe um aviso quando cair." />
                <View style={[st.bloco, { gap: 14 }]}>
                  <Passo feito titulo="Pedido recebido" sub={dataHora(aberto.criado_em)} />
                  <Passo feito titulo="Aprovado pela central" />
                  <Passo atual numero="3" titulo="Pix sendo enviado" sub="para a sua chave cadastrada" />
                </View>
                <View style={st.bloco}>
                  <Resumo pede={aberto.valor_cent} taxa={aberto.taxa_cent} recebe={aberto.recebe_cent} gratis={aberto.gratuidade} rotuloRecebe="Vai cair na sua conta" />
                </View>
                <Text style={st.rodape}>Com o pagamento a caminho não dá mais para desistir — o dinheiro já está saindo.</Text>
              </>
            ) : aberto ? (
              <>
                <Faixa tipo="espera"
                  titulo="Seu pedido está em análise"
                  texto={`${reais(aberto.valor_cent)} pedidos às ${horaDe(aberto.criado_em)}. Você recebe um aviso assim que o Pix cair.`} />
                <View style={st.bloco}>
                  <Text style={st.rotulo}>Pedido em análise</Text>
                  <Resumo pede={aberto.valor_cent} taxa={aberto.taxa_cent} recebe={aberto.recebe_cent} gratis={aberto.gratuidade} />
                </View>
                <TouchableOpacity style={st.botaoDesistir} activeOpacity={0.85} onPress={desistir} disabled={cancelando}>
                  {cancelando ? <ActivityIndicator color={T.alerta} /> : <Text style={st.botaoDesistirTx}>Desistir do pedido</Text>}
                </TouchableOpacity>
                <Text style={st.rodape}>Dá para desistir enquanto a central não começou a pagar. Desistindo, você pode pedir de novo na hora.</Text>
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
                        accessibilityRole="switch"
                        accessibilityState={{ checked: usarGratuidade }}
                        accessibilityLabel="Usar a gratuidade neste saque"
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
                      accessibilityLabel="Valor que você quer antecipar"
                    />
                  </View>

                  {!!info.taxa_descricao && (
                    <Text style={st.ajuda}>{`Taxa da central: ${info.taxa_descricao}. A taxa é descontada do valor.`}</Text>
                  )}

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
                    <>
                      <Resumo pede={sim.valor_cent} taxa={sim.taxa_cent} recebe={sim.recebe_cent} gratis={sim.gratuidade} />
                      <Text style={st.ajuda}>{`Saem ${reais(sim.valor_cent)} do seu saldo quando o Pix cair.`}</Text>
                    </>
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
                    : <Text style={st.botaoTx}>{sim && sim.pode ? `Solicitar · recebo ${reais(sim.recebe_cent)}` : 'Solicitar'}</Text>}
                </TouchableOpacity>

                <Text style={st.rodape}>
                  {`Mínimo ${reais(info.minimo_cent)} por pedido`}
                  {info.pedidos_restantes_dia > 0 ? ` · ${info.pedidos_restantes_dia === 1 ? 'resta 1 pedido' : `restam ${info.pedidos_restantes_dia} pedidos`} hoje` : ''}
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
              {historico.map((h) => {
                const selo = SELO[h.status] || { tx: h.status, st: 'seloNeutro' };
                const taxaTx = h.gratuidade ? 'sem taxa (gratuidade)' : (h.taxa_cent ? 'taxa ' + reais(h.taxa_cent) : 'sem taxa');
                return (
                  <View key={h.id} style={st.item}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.itemValor}>{reais(h.valor_cent)}</Text>
                      <Text style={st.itemQuando}>
                        {`${dataHora(h.criado_em)} · ${h.status === 'cancelada' ? 'você desistiu' : taxaTx}`}
                      </Text>
                      {h.status === 'paga' && (
                        <Text style={st.itemOk}>{`Caiu ${reais(h.recebe_cent)} no Pix · saíram ${reais(h.valor_cent)} do saldo`}</Text>
                      )}
                      {h.status === 'recusada' && !!h.motivo_recusa && <Text style={st.itemMotivo}>{h.motivo_recusa}</Text>}
                      {h.status === 'devolvida' && (
                        <Text style={st.itemMotivo}>{h.erro_pagamento || 'O banco devolveu o Pix. O valor voltou para o seu saldo — confira sua chave.'}</Text>
                      )}
                      {h.status === 'estornada' && <Text style={st.itemNeutro}>O valor voltou para o seu saldo.</Text>}
                    </View>
                    <Text style={[st.selo, st[selo.st]]}>{selo.tx}</Text>
                  </View>
                );
              })}
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

// Pede, taxa, recebe — os três sempre juntos. Com gratuidade, a taxa aparece como
// "grátis": ele vê que está economizando, não só que está de graça.
function Resumo({ pede, taxa, recebe, gratis, rotuloRecebe = 'Você recebe' }) {
  return (
    <View style={st.resumo}>
      <View style={st.resumoLinha}>
        <Text style={st.resumoRot}>Você pede</Text>
        <Text style={st.resumoVal}>{reais(pede)}</Text>
      </View>
      <View style={[st.resumoLinha, st.resumoBorda]}>
        <Text style={st.resumoRot}>{gratis ? 'Taxa (gratuidade)' : 'Taxa'}</Text>
        <Text style={[st.resumoVal, gratis || !taxa ? st.resumoGratis : st.resumoTaxa]}>
          {gratis || !taxa ? 'grátis' : `− ${reais(taxa)}`}
        </Text>
      </View>
      <View style={[st.resumoLinha, st.resumoBorda, st.resumoRecebe]}>
        <Text style={st.resumoRot}>{rotuloRecebe}</Text>
        <Text style={st.resumoRecebeVal}>{reais(recebe)}</Text>
      </View>
    </View>
  );
}

function Passo({ feito, atual, numero, titulo, sub }) {
  return (
    <View style={st.passo}>
      <View style={[st.bola, feito ? st.bolaFeita : atual ? st.bolaAtual : null]}>
        <Text style={st.bolaTx}>{feito ? '✓' : numero}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.passoTitulo, atual && { color: T.primario }]}>{titulo}</Text>
        {!!sub && <Text style={st.passoSub}>{sub}</Text>}
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
        <Text style={st.resumoMesRot}>Antecipado no mês</Text>
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
    info: { bg: T.suave, bd: T.linha, tx: T.primario },
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
  botaoDesistir: { marginHorizontal: 14, marginTop: 16, borderRadius: 15, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: '#e4b4ae', backgroundColor: T.sup },
  botaoDesistirTx: { color: T.alerta, fontSize: 15, fontWeight: '800' },
  rodape: { fontSize: 11.5, color: T.tinta3, textAlign: 'center', marginTop: 9, marginHorizontal: 18, lineHeight: 17 },
  ajuda: { fontSize: 11.5, color: T.tinta3, marginTop: 12, lineHeight: 17 },
  erro: { fontSize: 13, color: T.alertaTx, fontWeight: '700', marginTop: 12 },

  passo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bola: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: T.linha },
  bolaFeita: { backgroundColor: T.ganho },
  bolaAtual: { backgroundColor: T.primario },
  bolaTx: { color: '#fff', fontSize: 12, fontWeight: '800' },
  passoTitulo: { fontSize: 14, fontWeight: '800', color: T.tinta },
  passoSub: { fontSize: 12, color: T.tinta3, marginTop: 1 },

  faixa: { marginHorizontal: 14, marginTop: 14, borderRadius: 14, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 13 },
  faixaTitulo: { fontSize: 13.5, fontWeight: '800' },
  faixaTexto: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },

  linkAba: { marginTop: 18, alignItems: 'center', paddingVertical: 8 },
  linkAbaTx: { color: T.primario, fontSize: 14, fontWeight: '700' },

  resumoMes: { flexDirection: 'row', gap: 9, marginHorizontal: 14, marginTop: 14 },
  resumoMesCard: { flex: 1, backgroundColor: T.sup, borderRadius: 15, padding: 13, alignItems: 'center' },
  resumoMesRot: { fontSize: 11, color: T.tinta3, fontWeight: '700', textAlign: 'center' },
  resumoMesVal: { fontSize: 17, fontWeight: '800', marginTop: 3, color: T.tinta },

  item: { backgroundColor: T.sup, borderRadius: 15, padding: 14, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemValor: { fontSize: 15, fontWeight: '800', color: T.tinta },
  itemQuando: { fontSize: 11.5, color: T.tinta3, fontWeight: '600', marginTop: 2 },
  itemOk: { fontSize: 12, color: T.ganhoEsc, marginTop: 4, lineHeight: 17, fontWeight: '600' },
  itemMotivo: { fontSize: 12, color: T.alertaTx, marginTop: 4, lineHeight: 17 },
  itemNeutro: { fontSize: 12, color: T.tinta2, marginTop: 4, lineHeight: 17 },
  selo: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  seloOk: { backgroundColor: T.ganhoBg, color: T.ganhoEsc },
  seloEspera: { backgroundColor: T.atencaoBg, color: T.atencaoTx },
  seloInfo: { backgroundColor: T.suave, color: T.primario },
  seloErro: { backgroundColor: T.alertaBg, color: T.alertaTx },
  seloNeutro: { backgroundColor: T.linha, color: T.tinta2 },
  vazio: { fontSize: 13, color: T.tinta3, textAlign: 'center', paddingVertical: 30 },
});
