// Comunicados — histórico do que a central enviou para este entregador (últimos 90 dias).
// Os pendentes abrem de novo para confirmar; os já confirmados abrem só para ler.
import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, StatusBar, RefreshControl, Modal } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { T } from '../src/tema';
import Icone from '../src/componentes/Icone';
import Comunicado from '../src/componentes/Comunicado';
import { conferirComunicados, reabrirComunicado } from '../src/state/comunicados';

const dataHora = (d) => { try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function Comunicados() {
  const insets = useSafeAreaInsets();
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [puxando, setPux] = useState(false);
  const [lendo, setLendo] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.get('/comunicados/app/historico');
      setItens((r && r.comunicados) || []); setErro('');
    } catch (e) {
      if (e?.status === 401) { await api.logout(); router.replace('/'); return; }
      // Central sem o módulo: a tela existe, mas não há o que mostrar.
      if (e?.status === 403) { setItens([]); setErro(''); return; }
      setErro(e?.message || 'Não foi possível carregar.');
    }
  }, []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  function abrir(c) {
    const pendente = c.situacao === 'no_ar' && !c.ok_em;
    // Pendente: volta para a fila e o modal de confirmação abre por cima desta tela.
    if (pendente) { reabrirComunicado(c.id); conferirComunicados(); return; }
    setLendo(c);
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.profundo} />
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Voltar"><Icone nome="voltar" tam={24} cor="#fff" traco={2.4} /></TouchableOpacity>
        <Text style={s.htitle}>Comunicados</Text>
      </View>
      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={puxando} onRefresh={async () => { setPux(true); await carregar(); await conferirComunicados(); setPux(false); }} />}>
        {!!erro && (
          <View style={s.aviso}>
            <Text style={s.avisoTxt}>{erro}</Text>
            <TouchableOpacity onPress={carregar}><Text style={s.avisoBtn}>Tentar de novo</Text></TouchableOpacity>
          </View>
        )}
        {itens && !itens.length && !erro && (
          <View style={s.vazio}>
            <Icone nome="megafone" tam={30} cor={T.tinta3} />
            <Text style={s.vazioTt}>Nenhum comunicado</Text>
            <Text style={s.vazioSub}>Quando a central enviar um aviso, ele aparece aqui.</Text>
          </View>
        )}
        {(itens || []).map((c) => {
          const pendente = c.situacao === 'no_ar' && !c.ok_em;
          return (
            <TouchableOpacity key={c.id} style={s.item} activeOpacity={0.8} onPress={() => abrir(c)}>
              <View style={{ flex: 1 }}>
                <Text style={s.itTt}>{c.titulo}</Text>
                {!!c.texto && <Text style={s.itTxt} numberOfLines={2}>{c.texto}</Text>}
                <View style={s.itPe}>
                  <Text style={[s.tag, c.ok_em ? s.tagOk : pendente ? s.tagPend : s.tagNeutra]}>
                    {c.ok_em ? `Confirmado em ${dataHora(c.ok_em)}` : pendente ? 'Falta confirmar' : 'Encerrado'}
                  </Text>
                  <Text style={s.itData}>{dataHora(c.enviado_em)}</Text>
                </View>
              </View>
              <Icone nome="seta" tam={18} cor={T.tinta3} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={!!lendo} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setLendo(null)}>
        <View style={[s.fundo, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <View style={s.caixa}>
            <ScrollView contentContainerStyle={{ padding: 18 }}>
              {!!lendo && <Comunicado c={lendo} soLeitura aoFechar={() => setLendo(null)} />}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.suave },
  header: { backgroundColor: T.profundo, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  htitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.sup, borderWidth: 1, borderColor: T.linha, borderRadius: 16, padding: 14, marginBottom: 10 },
  itTt: { fontSize: 14.5, fontWeight: '800', color: T.tinta },
  itTxt: { fontSize: 12.5, color: T.tinta2, marginTop: 4, lineHeight: 18 },
  itPe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  itData: { fontSize: 11, color: T.tinta3 },
  tag: { fontSize: 11, fontWeight: '800', borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9, overflow: 'hidden' },
  tagOk: { backgroundColor: T.ganhoBg, color: T.ganhoEsc },
  tagPend: { backgroundColor: T.atencaoBg, color: T.atencaoTx },
  tagNeutra: { backgroundColor: T.suave, color: T.tinta2 },
  vazio: { alignItems: 'center', gap: 6, paddingVertical: 60, paddingHorizontal: 24 },
  vazioTt: { fontSize: 15, fontWeight: '800', color: T.tinta, marginTop: 6 },
  vazioSub: { fontSize: 12.5, color: T.tinta2, textAlign: 'center' },
  aviso: { backgroundColor: T.alertaBg, borderRadius: 14, padding: 14, marginBottom: 12, gap: 8 },
  avisoTxt: { color: T.alertaTx, fontSize: 13, fontWeight: '600' },
  avisoBtn: { color: T.primario, fontSize: 13, fontWeight: '800' },
  fundo: { flex: 1, backgroundColor: 'rgba(4,32,61,0.62)', justifyContent: 'center', paddingHorizontal: 16 },
  caixa: { backgroundColor: T.sup, borderRadius: 22, maxHeight: '100%', overflow: 'hidden' },
});
