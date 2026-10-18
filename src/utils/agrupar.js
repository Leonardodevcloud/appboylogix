// Paradas no mesmo lugar (ADR-053, mockup aprovado em 18/10/2026). Duas entregas a até
// ~30 m uma da outra viram UM grupo: no mapa, um pino só com os números juntos ("1·2");
// na lista, um quadro "Mesmo local". A ordem das paradas não muda.
//
//   agruparPorLocal(paradas) → [{ lat, lng, itens: [{ parada, indice }] }]   (na ordem)
//   rotuloGrupo(grupo)       → "1·2" | "3"

const RAIO_M = 30;

export function distM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function agruparPorLocal(paradas, raioM = RAIO_M) {
  const grupos = [];
  (paradas || []).forEach((parada, indice) => {
    const lat = Number(parada?.lat), lng = Number(parada?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { grupos.push({ lat: null, lng: null, itens: [{ parada, indice }] }); return; }
    const g = grupos.find((x) => x.lat != null && distM(x, { lat, lng }) <= raioM);
    if (g) g.itens.push({ parada, indice });
    else grupos.push({ lat, lng, itens: [{ parada, indice }] });
  });
  return grupos;
}

export function rotuloGrupo(grupo) {
  const nums = grupo.itens.map((i) => i.indice + 1);
  if (nums.length <= 3) return nums.join('·');
  return `${nums[0]}…${nums[nums.length - 1]}`;
}
