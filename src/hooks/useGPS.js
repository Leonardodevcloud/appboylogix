import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { api } from '../api';

export function useGPS(entregaId) {
  const intervalRef = useRef(null);

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[GPS] Permissão negada');
        return;
      }
      console.log('[GPS] Permissão OK, iniciando rastreio...');

      const reportar = async () => {
        if (!ativo) return;
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
          });
          const { latitude, longitude } = loc.coords;
          console.log('[GPS] Reportando:', latitude, longitude);
          await api.post('/motoboys/app/posicao', {
            lat: latitude,
            lng: longitude,
            entrega_id: entregaId || undefined,
          });
          console.log('[GPS] Posição enviada OK');
        } catch (e) {
          console.error('[GPS] Erro ao reportar:', e.message);
        }
      };

      // Reportar imediatamente e depois a cada 15s
      reportar();
      intervalRef.current = setInterval(reportar, 15_000);
    }

    iniciar();
    return () => {
      ativo = false;
      clearInterval(intervalRef.current);
      console.log('[GPS] Rastreio encerrado');
    };
  }, [entregaId]);
}
