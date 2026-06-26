import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { GPS_TASK, setEntregaAtiva } from '../tasks/gpsTask';
import { api } from '../api';

// Ativa o rastreamento GPS enquanto houver uma entrega ativa (entregaId != null).
// Tenta usar BACKGROUND (envia mesmo com app fechado). Se não houver suporte
// (ex.: Expo Go), cai para um modo FOREGROUND com setInterval.
export function useGPS(entregaId) {
  const fgInterval = useRef(null);
  const modoBg = useRef(false);

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
      if (!entregaId) { await parar(); return; }

      // Permissão de primeiro plano (obrigatória)
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') { console.warn('[GPS] permissão foreground negada'); return; }

      // Guarda a entrega ativa para a task de background saber o que reportar
      await setEntregaAtiva(entregaId);

      // Tenta permissão de fundo
      let bgOk = false;
      try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        bgOk = bg.status === 'granted';
      } catch { bgOk = false; }

      // Tenta iniciar updates em background (precisa de dev build; falha no Expo Go)
      if (bgOk) {
        try {
          const jaRodando = await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false);
          if (!jaRodando) {
            await Location.startLocationUpdatesAsync(GPS_TASK, {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 15000,        // a cada 15s
              distanceInterval: 30,       // ou a cada 30m
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: 'Logix — corrida ativa',
                notificationBody: 'Compartilhando sua localização durante a entrega.',
                notificationColor: '#185FA5',
              },
            });
          }
          modoBg.current = true;
          if (!cancelado) console.log('[GPS] background ativo');
          return;
        } catch (e) {
          console.log('[GPS] background indisponível, usando foreground:', e?.message);
        }
      }

      // Fallback: foreground com setInterval (funciona no Expo Go)
      modoBg.current = false;
      const reportar = async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = loc.coords;
          await api.post('/motoboys/app/posicao', { lat: latitude, lng: longitude, entrega_id: entregaId || undefined });
          console.log('[GPS fg] enviado', latitude, longitude);
        } catch (e) { console.log('[GPS fg] erro:', e?.message); }
      };
      reportar();
      fgInterval.current = setInterval(reportar, 15000);
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
  }, [entregaId]);
}
