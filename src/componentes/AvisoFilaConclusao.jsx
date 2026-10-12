import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { T } from '../tema';
import Icone from './Icone';
import { assinarFila, enviarFila, descartarConclusao, reabrirConclusao } from '../state/filaConclusao';
import { Alerta } from '../utils/avisar';

// Aviso na Início das entregas concluídas sem sinal (mockup aprovado em 12/10/2026):
// "1 entrega guardada, esperando o sinal" — é enviada sozinha. Se o servidor recusou uma
// (ex.: fora do raio), o aviso fica vermelho e o toque mostra o motivo e o que fazer.
const horaDe = (iso) => { try { return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function AvisoFilaConclusao() {
  const [itens, setItens] = useState([]);
  const giro = useRef(new Animated.Value(0)).current;
  useEffect(() => assinarFila(setItens), []);
  const pendentes = itens.filter((i) => i.estado !== 'erro');
  const comErro = itens.filter((i) => i.estado === 'erro');

  useEffect(() => {
    if (!pendentes.length) return undefined;
    const a = Animated.loop(Animated.timing(giro, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [pendentes.length]);

  if (!itens.length) return null;
  const rot = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  function verErro(item) {
    Alerta.alert('Entrega não aceita', `${item.protocolo ? 'Corrida ' + item.protocolo + ': ' : ''}${item.erro || 'A central não aceitou esta conclusão.'}`, [
      { text: 'Tentar de novo', onPress: () => reabrirConclusao(item.id) },
      { text: 'Descartar', style: 'destructive', onPress: () => descartarConclusao(item.id) },
      { text: 'Voltar', style: 'cancel' },
    ], { tom: 'atencao' });
  }

  return (
    <View style={{ gap: 8, marginTop: 8 }}>
      {pendentes.length > 0 && (
        <TouchableOpacity style={st.pend} activeOpacity={0.85} onPress={() => enviarFila()} accessibilityRole="button"
          accessibilityLabel={`${pendentes.length} entrega guardada esperando o sinal. Toque para tentar enviar agora.`}>
          <Animated.View style={{ transform: [{ rotate: rot }] }}><Icone nome="sincronizar" tam={18} cor={T.atencaoTx} /></Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={st.pendTit}>{pendentes.length === 1 ? '1 entrega guardada, esperando o sinal' : `${pendentes.length} entregas guardadas, esperando o sinal`}</Text>
            <Text style={st.pendSub} numberOfLines={1}>
              {pendentes.length === 1
                ? `${pendentes[0].protocolo || 'Corrida'} · concluída às ${horaDe(pendentes[0].corpo?.concluido_em)} · é enviada sozinha`
                : 'São enviadas sozinhas quando o sinal voltar · toque para tentar agora'}
            </Text>
          </View>
        </TouchableOpacity>
      )}
      {comErro.map((i) => (
        <TouchableOpacity key={i.id} style={st.erro} activeOpacity={0.85} onPress={() => verErro(i)} accessibilityRole="button">
          <Icone nome="alerta" tam={18} cor={T.alertaTx} />
          <View style={{ flex: 1 }}>
            <Text style={st.erroTit}>Entrega {i.protocolo || ''} não foi aceita</Text>
            <Text style={st.erroSub} numberOfLines={1}>{i.erro || 'Toque para ver o motivo'}</Text>
          </View>
          <Icone nome="seta" tam={16} cor={T.alertaTx} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  pend: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.atencaoBg, borderRadius: 14, padding: 12 },
  pendTit: { color: T.atencaoTx, fontSize: 13, fontWeight: '800' },
  pendSub: { color: T.atencaoTx, fontSize: 11.5, fontWeight: '600', opacity: 0.85, marginTop: 1 },
  erro: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.alertaBg, borderRadius: 14, padding: 12 },
  erroTit: { color: T.alertaTx, fontSize: 13, fontWeight: '800' },
  erroSub: { color: T.alertaTx, fontSize: 11.5, fontWeight: '600', marginTop: 1 },
});
