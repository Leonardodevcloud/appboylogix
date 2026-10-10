// Canal "a antecipação mudou" — o WebSocket global (alertas.js) avisa, a tela de
// antecipação ouve e recarrega. Sem isso o motoboy só via "paga" puxando a tela.
const _subs = new Set();

export function ouvirAntecipacao(fn) { _subs.add(fn); return () => _subs.delete(fn); }

export function avisarAntecipacao(dados) {
  _subs.forEach((f) => { try { f(dados || {}); } catch {} });
}
