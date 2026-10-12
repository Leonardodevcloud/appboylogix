// Extrato financeiro do profissional (Ganhos › Extrato, mockup aprovado em 11/10/2026).
//
// Toda entrada e saída do saldo, com os mesmos números do painel da central: corridas do
// dia, créditos e bônus, débitos, cada saque (com taxa e status), saque devolvido e cada
// acerto. Em cima: o saldo de hoje e quanto entrou e saiu no período. Tocar num item abre o
// detalhe. Fonte: GET /app/financeiro/extrato (backend, ADR-042).
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { api } from '../api';
import { T, reais } from '../tema';
import { Alerta } from '../utils/avisar';
import { mascararPix } from '../utils/pix';
import Icone from '../src/componentes/Icone';

const FILTROS = [['tudo', 'Tudo'], ['entradas', 'Entradas'], ['saidas', 'Saídas'], ['saques', 'Saques'], ['acertos', 'Acertos']];
const STATUS = {
  aguardando: ['em análise', 'at'], processando: ['a caminho', 'at'], paga: ['pago', 'ok'], recusada: ['recusado', 'er'],
  devolvida: ['devolvido', 'er'], cancelada: ['cancelado', 'neutro'], estornada: ['estornado', 'neutro'],
  pago: ['pago', 'ok'], a_pagar: ['a pagar', 'at'],
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ROTULO_PIX = { cpf: 'CPF', cnpj: 'CNPJ', telefone: 'Cel.', email: 'E-mail', aleatoria: 'Chave' };

const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
const ontemISO = () => new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
function rotuloDia(dia) {
  const [a, m, d] = String(dia).split('-');
  if (dia === hojeISO()) return `Hoje · ${d}/${m}`;
  if (dia === ontemISO()) return `Ontem · ${d}/${m}`;
  return `${DIAS[new Date(Number(a), Number(m) - 1, Number(d)).getDay()]} · ${d}/${m}`;
}
const hora = (iso) => { try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const dataHora = (iso) => { try { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' })} às ${hora(iso)}`; } catch { return ''; } };
const sinal = (c) => (c > 0 ? `+ ${reais(c)}` : c < 0 ? `− ${reais(-c)}` : reais(0));
const chave = (tipo, ch) => { if (!ch) return null; let m = ch; try { m = mascararPix(tipo, ch); } catch {} return `${ROTULO_PIX[tipo] || 'Chave'} ${m}`; };

function passa(item, filtro) {
  if (filtro === 'entradas') return item.valor_cent > 0;
  if (filtro === 'saidas') return item.valor_cent < 0;
  if (filtro === 'saques') return item.tipo === 'saque' || item.tipo === 'saque_devolvido';
  if (filtro === 'acertos') return item.tipo === 'acerto';
  return true;
}

// O detalhe de cada tipo, na folha do app.
function abrirDetalhe(i) {
  const d = i.detalhe || {};
  if (i.tipo === 'saque' || i.tipo === 'saque_devolvido') {
    const [rot] = STATUS[d.status] || [d.status];
    const cobra = !d.gratuidade && d.taxa_cent;
    Alerta.alert(i.tipo === 'saque' ? 'Saque (antecipação)' : 'Saque devolvido', '', [{ text: 'Fechar' }], {
      tom: i.tipo === 'saque' ? (d.status === 'paga' ? 'ok' : d.status === 'recusada' || d.status === 'devolvida' ? 'perigo' : 'info') : 'ok',
      sub: d.status === 'paga' && d.pago_em ? `Pago · ${dataHora(d.pago_em)}` : rot ? `Situação: ${rot}` : null,
      linhas: [
        { rot: 'Pedido', val: dataHora(d.pedido_em) },
        { rot: 'Você pediu', val: reais(d.valor_cent) },
        { rot: d.gratuidade ? 'Taxa (gratuidade)' : 'Taxa', val: cobra ? `− ${reais(d.taxa_cent)}` : 'grátis', cor: cobra ? 'perigo' : 'ok' },
        { rot: d.status === 'paga' ? 'Caiu no Pix' : 'Vai cair no Pix', val: reais(d.recebe_cent), cor: 'ok' },
        ...(chave(d.pix_tipo, d.pix_chave) ? [{ rot: 'Chave', val: chave(d.pix_tipo, d.pix_chave) }] : []),
        ...(d.via ? [{ rot: 'Pago por', val: d.via }] : []),
        ...(d.motivo ? [{ rot: 'Motivo', val: d.motivo }] : []),
        ...(i.tipo === 'saque_devolvido' ? [{ rot: 'Voltou para o saldo', val: sinal(i.valor_cent), cor: 'ok', forte: true }] : []),
      ],
    });
    return;
  }
  if (i.tipo === 'acerto') {
    // Pago: o comprovante completo (com o PDF para compartilhar) fica a um toque.
    const botoes = i.status === 'pago' ? [{ text: 'Ver comprovante', onPress: () => router.push('/comprovante?id=' + i.id) }, { text: 'Fechar', style: 'cancel' }] : [{ text: 'Fechar' }];
    Alerta.alert(i.titulo, '', botoes, {
      tom: i.status === 'pago' ? 'ok' : 'info',
      sub: i.status === 'pago' ? `Pago${d.forma ? ` por ${d.forma}` : ''}${d.pago_em ? ` · ${dataHora(d.pago_em)}` : ''}` : 'A central vai pagar este acerto',
      lead: 'O acerto junta o que estava no seu saldo e é pago pela central — por isso aparece como saída do saldo.',
      linhas: [
        { rot: 'Corridas', val: `${d.periodo_de} a ${d.periodo_ate}` },
        { rot: `Corridas entregues (${d.qtd_corridas || 0})`, val: reais(d.corridas_cent) },
        { rot: 'Créditos', val: `+ ${reais(d.creditos_cent)}`, cor: 'ok' },
        { rot: 'Débitos (saques e descontos)', val: `− ${reais(d.debitos_cent)}`, cor: 'perigo' },
        { rot: 'Valor do acerto', val: reais(d.valor_cent), forte: true },
      ],
    });
    return;
  }
  Alerta.alert(i.titulo, i.sub, [{ text: 'Fechar' }], {
    tom: i.valor_cent >= 0 ? 'ok' : 'atencao',
    linhas: [{ rot: dataHora(i.em), val: sinal(i.valor_cent), cor: i.valor_cent >= 0 ? 'ok' : 'perigo', forte: true }],
  });
}

const COR_LINHA = { entra: T.ganhoEsc, sai: T.alerta, acerto: T.primario, neutro: T.tinta2 };
function IconeLinha({ tipo, valor }) {
  const cfg = tipo === 'corridas' ? ['neutro', 'moto'] : tipo === 'acerto' ? ['acerto', 'lista'] : valor >= 0 ? ['entra', 'entrada'] : ['sai', 'saida'];
  return <View style={[st.ico, st['ico_' + cfg[0]]]}><Icone nome={cfg[1]} tam={17} cor={COR_LINHA[cfg[0]]} traco={2.4} /></View>;
}

export default function ExtratoFinanceiro({ filtro: periodo, recarregarToken }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState('tudo');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const qs = periodo.tipo === 'custom' ? `de=${periodo.de}&ate=${periodo.ate}` : `periodo=${periodo.tipo === 'hoje' ? 'hoje' : periodo.tipo}`;
      setDados(await api.get(`/app/financeiro/extrato?${qs}`));
    } catch (e) { setErro(e.message || 'Não foi possível carregar o extrato.'); }
  }, [periodo.tipo, periodo.de, periodo.ate]);

  useEffect(() => { setDados(null); carregar(); }, [carregar, recarregarToken]);

  if (erro) return <Text style={st.erro}>{erro}</Text>;
  if (!dados) return <ActivityIndicator color={T.primario} style={{ marginTop: 30 }} />;

  const itens = dados.itens.filter((i) => passa(i, tipo));
  const dias = [];
  for (const i of itens) {
    const ult = dias[dias.length - 1];
    if (ult && ult.dia === i.dia) ult.itens.push(i); else dias.push({ dia: i.dia, itens: [i] });
  }

  return (
    <View>
      <View style={st.saldo}>
        <Text style={st.saldoRot}>Saldo disponível hoje</Text>
        <Text style={st.saldoVal}>{reais(dados.saldo_cent)}</Text>
      </View>
      <View style={st.res}>
        <View style={st.resCard}><Text style={st.resRot}>Entrou</Text><Text style={[st.resVal, { color: T.ganhoEsc }]}>{`+ ${reais(dados.entradas_cent)}`}</Text></View>
        <View style={st.resCard}><Text style={st.resRot}>Saiu</Text><Text style={[st.resVal, { color: T.alerta }]}>{`− ${reais(dados.saidas_cent)}`}</Text></View>
      </View>

      <View style={st.chips}>
        {FILTROS.map(([id, rot]) => (
          <TouchableOpacity key={id} style={[st.chip, tipo === id && st.chipOn]} onPress={() => setTipo(id)} accessibilityRole="button" accessibilityState={{ selected: tipo === id }}>
            <Text style={[st.chipTx, tipo === id && st.chipTxOn]}>{rot}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {dias.length === 0 && <Text style={st.vazio}>Nada neste período.</Text>}
      {dias.map((g) => {
        const total = g.itens.reduce((s, i) => s + i.valor_cent, 0);
        return (
          <View key={g.dia}>
            <View style={st.dg}><Text style={st.dgTx}>{rotuloDia(g.dia)}</Text><Text style={st.dgTx}>{sinal(total)}</Text></View>
            {g.itens.map((i) => {
              const s = STATUS[i.status];
              return (
                <TouchableOpacity key={i.id} style={st.mv} activeOpacity={0.8} onPress={() => abrirDetalhe(i)} accessibilityRole="button"
                  accessibilityLabel={`${i.titulo}, ${sinal(i.valor_cent)}`}>
                  <IconeLinha tipo={i.tipo} valor={i.valor_cent} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={st.mvTit} numberOfLines={1}>{i.titulo}</Text>
                      {!!s && <Text style={[st.selo, st['selo_' + s[1]]]}>{s[0]}</Text>}
                    </View>
                    <Text style={st.mvSub} numberOfLines={1}>{(i.tipo === 'corridas' ? '' : hora(i.em) + ' · ') + (i.sub || '')}</Text>
                  </View>
                  <Text style={[st.mvVal, { color: i.valor_cent >= 0 ? T.ganhoEsc : T.alerta }]}>{sinal(i.valor_cent)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
      <Text style={st.nota}>Os valores são os mesmos que a central vê. Entradas menos saídas de todo o histórico dão o seu saldo de hoje.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  saldo: { backgroundColor: T.profundo, borderRadius: 16, padding: 16 },
  saldoRot: { color: T.claro, fontSize: 12, fontWeight: '700' },
  saldoVal: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 4 },
  res: { flexDirection: 'row', gap: 10, marginTop: 10 },
  resCard: { flex: 1, backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 14, padding: 12 },
  resRot: { fontSize: 10.5, fontWeight: '800', color: T.tinta3, textTransform: 'uppercase', letterSpacing: 0.4 },
  resVal: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  chip: { borderWidth: 1, borderColor: T.linha, backgroundColor: T.sup, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: T.profundo, borderColor: T.profundo },
  chipTx: { fontSize: 12, fontWeight: '700', color: T.tinta2 },
  chipTxOn: { color: '#fff' },
  dg: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 },
  dgTx: { fontSize: 11, fontWeight: '800', color: T.tinta3, textTransform: 'uppercase', letterSpacing: 0.4 },
  mv: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 13, padding: 12, marginBottom: 7 },
  ico: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  ico_entra: { backgroundColor: T.ganhoBg }, ico_sai: { backgroundColor: T.alertaBg }, ico_acerto: { backgroundColor: T.suave }, ico_neutro: { backgroundColor: T.suave },
  mvTit: { fontSize: 13.5, fontWeight: '800', color: T.tinta, flexShrink: 1 },
  mvSub: { fontSize: 11.5, color: T.tinta2, marginTop: 2 },
  mvVal: { fontSize: 14, fontWeight: '800' },
  selo: { fontSize: 9.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  selo_ok: { backgroundColor: T.ganhoBg, color: T.ganhoEsc }, selo_at: { backgroundColor: T.atencaoBg, color: T.atencaoTx },
  selo_er: { backgroundColor: T.alertaBg, color: T.alertaTx }, selo_neutro: { backgroundColor: T.linha, color: T.tinta2 },
  vazio: { fontSize: 13, color: T.tinta3, textAlign: 'center', paddingVertical: 30 },
  erro: { fontSize: 13, color: T.alertaTx, textAlign: 'center', paddingVertical: 30 },
  nota: { fontSize: 11, color: T.tinta3, textAlign: 'center', marginTop: 12, lineHeight: 16 },
});
