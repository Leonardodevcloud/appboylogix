import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api';
import { T, reais } from '../tema';
import Icone from './Icone';
import IconeAntecipar from './IconeAntecipar';

// Saldo no topo da Início (ADR-053; barra fina aprovada em 18/10/2026, opção C).
// Uma linha só: saldo disponível (o mesmo do Antecipar, GET /app/antecipacoes), o olho
// para esconder os valores (o app lembra), o "hoje" pequeno (corridas entregues no dia da
// Bahia) e o Antecipar como botão de ícone. Tocar na barra abre os Ganhos.
// Sem o módulo de antecipação (403), mostra o "hoje" no lugar do saldo e some o Antecipar.

const CHAVE_OCULTO = 'lx_saldo_oculto';
const agoraBahia = () => new Date(Date.now() - 3 * 3600 * 1000);
const dois = (n) => String(n).padStart(2, '0');
const hojeBahia = () => { const d = agoraBahia(); return `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`; };

export default function CartaoSaldo({ atualizar }) {
  const [saldo, setSaldo] = useState(undefined);  // undefined = carregando; null = sem módulo
  const [hoje, setHoje] = useState(null);
  const [oculto, setOculto] = useState(false);

  useEffect(() => { SecureStore.getItemAsync(CHAVE_OCULTO).then((v) => setOculto(v === '1')).catch(() => {}); }, []);
  const alternar = () => {
    const v = !oculto; setOculto(v);
    SecureStore.setItemAsync(CHAVE_OCULTO, v ? '1' : '0').catch(() => {});
  };

  const carregar = useCallback(async () => {
    try { const r = await api.get('/app/antecipacoes'); setSaldo(Number(r?.saldo_cent) || 0); }
    catch (e) { if (e?.status === 403 || e?.status === 404) setSaldo(null); }
    try {
      const dia = hojeBahia();
      const h = await api.get(`/motoboys/app/historico?de=${dia}&ate=${dia}`);
      setHoje({ total_cent: h?.total_cent || 0, quantidade: h?.quantidade || 0 });
    } catch { /* mantém o último */ }
  }, []);
  useEffect(() => { carregar(); }, [carregar, atualizar]);

  const mostra = (c) => (c == null ? '—' : oculto ? 'R$ •••' : reais(c));
  const temSaldo = saldo != null;

  return (
    <TouchableOpacity style={st.barra} activeOpacity={0.9} onPress={() => router.push('/ganhos')}
      accessibilityRole="button" accessibilityLabel="Ver ganhos">
      <View>
        <Text style={st.rot}>{temSaldo ? 'Saldo' : 'Hoje'}</Text>
        <Text style={st.valor}>{mostra(temSaldo ? saldo : hoje?.total_cent)}</Text>
      </View>
      <TouchableOpacity onPress={alternar} hitSlop={12} style={st.olho}
        accessibilityRole="button" accessibilityLabel={oculto ? 'Mostrar valores' : 'Esconder valores'}>
        <Icone nome={oculto ? 'olhoFechado' : 'olho'} tam={17} cor={T.claro} />
      </TouchableOpacity>
      <View style={st.hoje}>
        <Text style={st.rot}>Hoje</Text>
        <Text style={st.hojeV} numberOfLines={1}>
          {temSaldo ? `${mostra(hoje?.total_cent)} · ${hoje?.quantidade ?? 0}` : `${hoje?.quantidade ?? 0} ${hoje?.quantidade === 1 ? 'corrida' : 'corridas'}`}
        </Text>
      </View>
      {temSaldo && (
        <TouchableOpacity style={st.ant} onPress={() => router.push('/antecipar')} activeOpacity={0.85} hitSlop={6}
          accessibilityRole="button" accessibilityLabel="Antecipar">
          <IconeAntecipar tam={22} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  barra: { height: 54, backgroundColor: T.profundo, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 8, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },
  rot: { color: T.claro, fontSize: 9.5, fontWeight: '700', lineHeight: 11 },
  valor: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  olho: { paddingVertical: 4 },
  hoje: { marginLeft: 'auto', paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.18)', flexShrink: 1 },
  hojeV: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  ant: { width: 38, height: 38, borderRadius: 11, backgroundColor: T.ganho, alignItems: 'center', justifyContent: 'center' },
});
