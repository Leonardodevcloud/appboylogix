// Mapa de demanda da Início em RAIOS (pedido do Tutts em 24/10/2026). Antes era uma "nuvem"
// (Heatmap) desenhada em pixels: com zoom ela virava um pontinho. Agora cada região com
// coletas recentes é um círculo medido em METROS no chão — até 3 km — que cresce junto com
// o zoom e continua mostrando a região inteira.
//
// Entrada: as células de GET /regioes/app/calor ({ lat, lng, qtd, peso }).
// Saída: zonas { lat, lng, qtd, rel (0–1), raio (m), nivel: 'alta'|'media'|'baixa' }, da mais
// cheia para a menos cheia. Células a menos de JUNTAR_M do centro de uma zona entram nela
// (regiões vizinhas viram um raio só, em vez de vários borrões sobrepostos).
export const RAIO_MIN_M = 1000;
export const RAIO_MAX_M = 3000;
const JUNTAR_M = 1800;
const MAX_ZONAS = 12;

function distM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function zonasDeDemanda(celulas) {
  const validas = (celulas || [])
    .map((c) => ({ lat: Number(c.lat), lng: Number(c.lng), qtd: Math.max(0, Number(c.qtd) || 0) }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.qtd > 0)
    .sort((a, b) => b.qtd - a.qtd);
  const zonas = [];
  for (const c of validas) {
    const z = zonas.find((x) => distM(x, c) <= JUNTAR_M);
    if (z) {
      const q = z.qtd + c.qtd;
      z.lat = (z.lat * z.qtd + c.lat * c.qtd) / q;
      z.lng = (z.lng * z.qtd + c.lng * c.qtd) / q;
      z.qtd = q;
    } else zonas.push({ ...c });
  }
  zonas.sort((a, b) => b.qtd - a.qtd);
  const max = zonas.length ? zonas[0].qtd : 0;
  return zonas.slice(0, MAX_ZONAS).map((z) => {
    const rel = max ? z.qtd / max : 0;
    const raio = Math.round(RAIO_MIN_M + (RAIO_MAX_M - RAIO_MIN_M) * rel);
    return { lat: +z.lat.toFixed(5), lng: +z.lng.toFixed(5), qtd: z.qtd, rel: +rel.toFixed(3), raio, nivel: rel >= 0.6 ? 'alta' : rel >= 0.3 ? 'media' : 'baixa' };
  });
}
