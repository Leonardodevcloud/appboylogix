// Modal dos comunicados da central — montado uma vez no _layout.
//
// Abre sozinho quando há comunicado pendente E o entregador está numa tela calma (as abas ou o
// histórico de comunicados). Nunca por cima de uma corrida, da oferta ou do login: quem está
// entregando não é interrompido; o aviso espera ele voltar para o início.
// Obrigatório ("Li e entendi") não fecha pelo botão voltar; os outros têm "Ver depois".
import { useEffect, useState } from 'react';
import { Modal, View, ScrollView, StyleSheet, AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { assinarComunicados, conferirComunicados, adiarComunicado, registrarComunicado, estado } from '../state/comunicados';
import Comunicado from './Comunicado';
import { T } from '../tema';

const TELAS_CALMAS = ['/home', '/ganhos', '/historico', '/perfil', '/comunicados'];
const INTERVALO_MS = 5 * 60 * 1000;

export default function ComunicadoHost() {
  const insets = useSafeAreaInsets();
  const caminho = usePathname();
  const [fila, setFila] = useState([]);
  const [total, setTotal] = useState(0);   // tamanho da fila quando a sequência começou ("1 de 2")
  const [feitos, setFeitos] = useState(0);

  useEffect(() => assinarComunicados((e) => setFila(e.fila)), []);
  // Confere ao voltar para o app e de tempos em tempos (comunicado enviado com o app aberto).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') conferirComunicados(); });
    const t = setInterval(() => { if (AppState.currentState === 'active') conferirComunicados(); }, INTERVALO_MS);
    return () => { try { sub.remove(); } catch {} clearInterval(t); };
  }, []);

  const calma = TELAS_CALMAS.some((t) => caminho === t || caminho.startsWith(t + '?'));
  const atual = calma ? fila[0] : null;
  const id = atual ? atual.id : null;

  // Sequência: começa quando aparece o primeiro e zera quando a fila esvazia.
  useEffect(() => {
    if (!fila.length) { setTotal(0); setFeitos(0); return; }
    setTotal((t) => Math.max(t, feitos + fila.length));
  }, [fila.length]);
  // "Viu": registrado quando o aviso aparece na tela.
  useEffect(() => { if (id) registrarComunicado(id, 'visto').catch(() => {}); }, [id]);

  if (!atual) return null;
  const avancar = () => setFeitos((n) => n + 1);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent
      onRequestClose={() => { if (!atual.exige_ok) { adiarComunicado(atual.id); avancar(); } }}>
      <View style={[s.fundo, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={s.caixa}>
          <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Comunicado key={atual.id} c={atual}
              posicao={total > 1 ? `${Math.min(feitos + 1, total)} de ${total}` : null}
              aoFimDaMidia={() => registrarComunicado(atual.id, 'midia-fim')}
              aoOk={async () => {
                try { await registrarComunicado(atual.id, 'ok'); avancar(); }
                catch (e) {
                  // Saiu do ar com o aviso aberto: confere de novo e não prende ninguém.
                  if (e?.status === 404 || e?.status === 409) {
                    await conferirComunicados();
                    if (!estado().pendentes.some((x) => x.id === atual.id)) return;
                  }
                  throw e;
                }
              }}
              aoDepois={() => { adiarComunicado(atual.id); avancar(); }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(4,32,61,0.62)', justifyContent: 'center', paddingHorizontal: 16 },
  caixa: { backgroundColor: T.sup, borderRadius: 22, maxHeight: '100%', overflow: 'hidden' },
});
