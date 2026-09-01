import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { GPS_TASK, setEntregaAtiva } from '../tasks/gpsTask';
import { api } from '../api';
import { garantirDisclosureLocalizacao } from '../utils/disclosure';

// Ativa o rastreamento GPS quando o motoboy está ONLINE (esperando corrida) ou
// com uma ENTREGA ativa. Sem isso, o backend não tem a posição e o motoboy não
// recebe ofertas. Tenta BACKGROUND (app fechado); se não houver suporte (Expo Go),
// cai para FOREGROUND com setInterval.
// Parâmetros: entregaId (string|null) e ativoExtra (bool) — rastrear mesmo sem entrega.
export function useGPS(entregaId, ativoExtra = false) {
  const fgInterval = useRef(null);
  const modoBg = useRef(false);
  const ativo = !!entregaId || !!ativoExtra;

  useEffect(() => {
    let cancelado = false;

    async function parar() {
      // Para foreground
      if (fgInterval.current) { clearInterval(fgInterval.current); fgInterval.current = null; }
      // Para background
      try {
        if (modoBg.current) {
          const rodando = await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false);
          if (rodando) await Location.stopLocationUpdatesAsync(GPS_TASK);
        }
      } catch {}
      await setEntregaAtiva(null);
    }

    async function iniciar() {
      if (!ativo) { await parar(); return; }

      // Permissão de primeiro plano (obrigatória)
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') { console.warn('[GPS] permissão foreground negada'); return; }

      // Guarda a entrega ativa para a task de background saber o que reportar
      await setEntregaAtiva(entregaId);

      // Permissão de fundo — precedida do AVISO CLARO exigido pela Google Play
      // (o que é coletado, que roda com o app fechado e pra quê). Só pedimos a
      // permissão de sistema se o motoboy aceitar o aviso.
      let bgOk = false;
      try {
        const consentiu = await garantirDisclosureLocalizacao();
        if (consentiu) {
          const bg = await Location.requestBackgroundPermissionsAsync();
          bgOk = bg.status === 'granted';
        }
      } catch { bgOk = false; }

      // Tenta iniciar updates em BACKGROUND (só funciona em dev/prod build; no Expo Go
      // não envia nada). É um COMPLEMENTO para quando o app está fechado — não substitui
      // o foreground, que roda sempre que o app está aberto (garante envio no Expo Go).
      if (bgOk) {
        try {
          const jaRodando = await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false);
          if (!jaRodando) {
            await Location.startLocationUpdatesAsync(GPS_TASK, {
              accuracy: Location.Accuracy.High,   // GPS real: mais confiável em 2º plano que Balanced
              timeInterval: 30000,        // a cada 30s
              distanceInterval: 0,        // reporta por TEMPO mesmo parado (não depende de mover)
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: 'Logix — você está online',
                notificationBody: 'Compartilhando sua localização para receber corridas.',
                notificationColor: '#185FA5',
              },
            });
          }
          modoBg.current = true;
          if (!cancelado) console.log('[GPS] background ativo (complemento)');
        } catch (e) {
          console.log('[GPS] background indisponível:', e?.message);
        }
      }

      // FOREGROUND: só roda quando o BACKGROUND não está ativo. Em build real com
      // permissão de fundo, o background já reporta em foreground+fechado — rodar os
      // dois duplicaria o /posicao. O foreground vira fallback (Expo Go ou bg negado).
      if (modoBg.current) {
        if (!cancelado) console.log('[GPS] usando só background (sem duplicar foreground)');
        return;
      }
      const reportar = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const { latitude, longitude } = loc.coords;
          await api.post('/motoboys/app/posicao', { lat: latitude, lng: longitude, entrega_id: entregaId || undefined });
          console.log('[GPS fg] enviado', latitude.toFixed(5), longitude.toFixed(5));
        } catch (e) { console.log('[GPS fg] erro:', e?.message); }
      };
      reportar();
      if (fgInterval.current) clearInterval(fgInterval.current);
      fgInterval.current = setInterval(reportar, 30000);
    }

    iniciar();
    // No cleanup, NÃO paramos o background — ele deve sobreviver à navegação entre
    // telas (home → aceitar → concluir). O background só é parado quando entregaId
    // vira null (corrida encerrada), tratado dentro de iniciar()/parar().
    return () => {
      cancelado = true;
      // Para apenas o foreground (preso a esta montagem). O background persiste.
      if (fgInterval.current) { clearInterval(fgInterval.current); fgInterval.current = null; }
    };
  }, [entregaId, ativo]);
}
