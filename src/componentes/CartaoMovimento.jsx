import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { api } from '../api';
import { T } from '../tema';
import Icone from './Icone';

// Card "Onde tem corrida agora" na Início (só online e sem corrida ativa). Abre o mapa.
// Sem regiões cadastradas na central (ou sem acesso), não aparece.
export default function CartaoMovimento({ atualizar }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.get('/regioes/app/movimento').then((r) => { if (vivo) setDados(r); }).catch(() => { if (vivo) setDados(null); });
    return () => { vivo = false; };
  }, [atualizar]);

  const regioes = dados?.regioes || [];
  if (!regioes.length) return null;
  const top = regioes.find((r) => r.quantidade > 0);
  return (
    <TouchableOpacity style={st.card} activeOpacity={0.85} onPress={() => router.push('/movimento')} accessibilityRole="button">
      <View style={st.ico}><Icone nome="mapa" tam={20} cor={T.primario} /></View>
      <View style={{ flex: 1 }}>
        <Text style={st.tit}>Onde tem corrida agora</Text>
        <Text style={st.sub} numberOfLines={1}>{top ? `${top.nome} está com mais movimento (${top.quantidade}/h)` : 'Movimento por região na última hora'}</Text>
      </View>
      <Icone nome="seta" tam={18} cor={T.tinta3} />
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 16, padding: 13, marginBottom: 12 },
  ico: { width: 40, height: 40, borderRadius: 12, backgroundColor: T.suave, alignItems: 'center', justifyContent: 'center' },
  tit: { fontSize: 14, fontWeight: '800', color: T.tinta },
  sub: { fontSize: 12, color: T.tinta3, fontWeight: '600', marginTop: 1 },
});
