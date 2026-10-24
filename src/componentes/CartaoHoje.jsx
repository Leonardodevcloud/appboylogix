import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { irPara } from '../navegacao/abas';
import { api } from '../api';
import { T, reais } from '../tema';
import Icone from './Icone';

// Card "Hoje" no topo da Início (mockup aprovado em 12/10/2026): o que entrou hoje e
// quantas corridas — os mesmos números de Ganhos › Hoje — e a missão PRINCIPAL do Score
// (a primeira da lista, que já vem por prioridade). Sem missão ativa, o bloco some.
// Tocar abre Ganhos. `atualizar` muda quando a Início recarrega (foco, conclusão).

// Dia da Bahia (UTC-3 fixo, sem horário de verão) — sem depender do Intl do aparelho.
const agoraBahia = () => new Date(Date.now() - 3 * 3600 * 1000);
const dois = (n) => String(n).padStart(2, '0');
const hojeBahia = () => { const d = agoraBahia(); return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`; };
const rotuloDia = () => {
  const d = agoraBahia();
  return `HOJE · ${['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][d.getUTCDay()]} ${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}`;
};

export default function CartaoHoje({ atualizar }) {
  const [hoje, setHoje] = useState(null);
  const [missao, setMissao] = useState(null);

  const carregar = useCallback(async () => {
    const dia = hojeBahia();
    try {
      const h = await api.get(`/motoboys/app/historico?de=${dia}&ate=${dia}`);
      setHoje({ total_cent: h?.total_cent || 0, quantidade: h?.quantidade || 0 });
    } catch { /* mantém o último */ }
    // Gamificação é módulo do plano: sem ele (403) ou sem missão, não mostra nada.
    try { const r = await api.get('/score/app/missoes'); setMissao((r?.missoes || [])[0] || null); } catch { setMissao(null); }
  }, []);

  useEffect(() => { carregar(); }, [carregar, atualizar]);

  if (!hoje) return null;
  const falta = missao ? Math.max(0, (missao.meta || 0) - (missao.feitas || 0)) : 0;
  return (
    <TouchableOpacity style={st.card} activeOpacity={0.9} onPress={() => irPara('/ganhos')}
      accessibilityRole="button" accessibilityLabel={`Hoje: ${reais(hoje.total_cent)}, ${hoje.quantidade} corridas. Ver ganhos.`}>
      <View style={st.topo}>
        <Text style={st.dia}>{rotuloDia()}</Text>
        <View style={st.ver}><Text style={st.dia}>Ver ganhos</Text><Icone nome="seta" tam={13} cor="rgba(255,255,255,0.8)" traco={2.4} /></View>
      </View>
      <Text style={st.valor}>{reais(hoje.total_cent)}</Text>
      <Text style={st.linha}>{hoje.quantidade === 1 ? '1 corrida hoje' : `${hoje.quantidade} corridas hoje`}</Text>
      {!!missao && (
        <View style={st.meta}>
          <View style={st.metaTopo}>
            <Text style={st.metaTxt} numberOfLines={1}>Missão: {missao.nome}</Text>
            <Text style={st.metaTxt}>{Math.min(missao.feitas, missao.meta)}/{missao.meta}</Text>
          </View>
          <View style={st.barra}><View style={[st.barraFill, { width: `${missao.progresso || 0}%` }, missao.completo && { backgroundColor: T.ganho }]} /></View>
          <Text style={st.metaSub}>
            {missao.jaPago ? 'Bônus liberado' : missao.completo ? 'Meta batida! Aguarde a liberação do bônus'
              : `Faltam ${falta} para o bônus${missao.premio_cent ? ' de ' + reais(missao.premio_cent) : ''}`}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: T.profundo, borderRadius: 18, padding: 16, marginTop: 8, marginBottom: 4 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dia: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  ver: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  valor: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 4 },
  linha: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  meta: { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 11 },
  metaTopo: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  metaTxt: { color: '#fff', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  barra: { height: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 7, overflow: 'hidden' },
  barraFill: { height: '100%', borderRadius: 99, backgroundColor: T.vivo },
  metaSub: { color: 'rgba(255,255,255,0.8)', fontSize: 11.5, marginTop: 6 },
});
