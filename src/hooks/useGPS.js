import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { setEntregaAtiva, garantirUpdatesBackground, pararUpdatesBackground, registrarPontoForeground, descarregarBuffer } from '../tasks/gpsTask';
import { garantirDisclosureLocalizacao } from '../utils/disclosure';

// Ativa o rastreamento GPS quando o motoboy está ONLINE (esperando corrida) ou
// com uma ENTREGA ativa. Prioriza BACKGROUND (funciona com o app fechado / tela
// apagada via foreground service); se o fundo não estiver disponível (Expo Go ou
// permissão negada), cai para FOREGROUND com setInterval.
export function useGPS(entregaId, ativoExtra = false) {
  const fgInterval = useRef(null);
  const modoBg = useRef(false);
  const ativo = !!entregaId || !!ativoExtra;

  useEffect(() => {
    let cancelado = false;

    async function parar() {
      if (fgInterval.current) { clearInterval(fgInterval.current); fgInterval.current = null; }
      if (modoBg.current) await pararUpdatesBackground();
      modoBg.current = false;
      await setEntregaAtiva(null);
    }

    async function iniciar() {
      if (!ativo) { await parar(); return; }

      // Permissão de primeiro plano (obrigatória).
      let fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') { console.warn('[GPS] permissão foreground negada'); return; }

      // Guarda a entrega ativa para a task de background saber o que reportar.
      await setEntregaAtiva(entregaId);

      // Permissão de fundo — só pede (com o aviso da Play) se ainda não tiver.
      let bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        try {
          const consentiu = await garantirDisclosureLocalizacao();
          if (consentiu) bg = await Location.requestBackgroundPermissionsAsync();
        } catch {}
      }

      // (Re)inicia o background SEMPRE que possível — nunca confia num
      // "hasStarted" antigo, que fica true mesmo com o serviço morto.
      if (bg.status === 'granted') {
        modoBg.current = await garantirUpdatesBackground(!!entregaId);
      }

      // Se o background está de pé, ele já cobre foreground + tela apagada +
      // app fechado. Não roda o foreground em paralelo (duplicaria o /posicao).
      if (modoBg.current) {
        if (!cancelado) console.log('[GPS] background ativo');
        return;
      }

      // FOREGROUND (fallback): só vale com o app aberto. Usa o MESMO buffer/lote
      // da task de background — nunca 1 request por ponto.
      const reportar = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude, accuracy } = loc.coords;
          await registrarPontoForeground(latitude, longitude, accuracy, !!entregaId);
        } catch (e) { console.log('[GPS fg] erro:', e?.message); }
      };
      reportar();
      if (fgInterval.current) clearInterval(fgInterval.current);
      fgInterval.current = setInterval(reportar, 30000);
    }

    iniciar();

    // Ao voltar o app para o primeiro plano, re-afirma o rastreamento — se o SO
    // tiver matado o serviço em segundo plano, isto o revive na hora.
    // Também descarrega o buffer: se ficou sem rede, os pontos guardados vão agora.
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active' && ativo) { iniciar(); descarregarBuffer().catch(() => {}); }
    });

    // No cleanup NÃO paramos o background (ele deve sobreviver à navegação entre
    // telas). Só paramos o foreground preso a esta montagem.
    return () => {
      cancelado = true;
      if (fgInterval.current) { clearInterval(fgInterval.current); fgInterval.current = null; }
      try { sub.remove(); } catch {}
    };
  }, [entregaId, ativo]);
}
