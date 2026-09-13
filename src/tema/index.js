// Tema compartilhado das telas da corrida (mockup-app-motoboy-v1, aprovado em 13/09/2026).
// Paleta = marca.config.js (IG) + verde de ganho que o app já usava. Um lugar só: as telas
// novas importam daqui; as antigas ainda carregam o `C` local delas e migram aos poucos.
export const T = {
  profundo: '#042C53', primario: '#185FA5', vivo: '#378ADD', claro: '#B5D4F4',
  ganho: '#1f9d6b', ganhoEsc: '#0f6e56', ganhoBg: '#e7f6ef', ganhoBd: '#b6e3ce',
  alerta: '#c9352b', alertaBg: '#fbe8e6', alertaTx: '#a23c34',
  atencaoBg: '#fbf2df', atencaoTx: '#7a5300',
  papel: '#f4f7fb', sup: '#ffffff', linha: '#dbe5f1', suave: '#eef4fb',
  tinta: '#0e2138', tinta2: '#46637f', tinta3: '#8ba5bc',
  r: 18,
};

export function reais(cent) {
  if (cent == null) return '—';
  return 'R$ ' + (Number(cent) / 100).toFixed(2).replace('.', ',');
}
export function hora(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
export function km(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1).replace('.', ',') + ' km' : null;
}
// Endereço curto para lista: corta CEP e "Brasil".
export function curto(end) {
  return String(end || '').replace(/,?\s*\d{5}-?\d{3}.*$/, '').replace(/,\s*Brasil$/i, '').trim();
}
