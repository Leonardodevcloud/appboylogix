// Canal do banner animado in-app. Qualquer parte do app chama mostrarBanner(cfg)
// e o <BannerHost/> (montado no root) exibe. cfg = { tipo, titulo, sub, rota }.
const _subs = new Set();

export function assinarBanner(fn) { _subs.add(fn); return () => _subs.delete(fn); }

export function mostrarBanner(cfg) {
  const item = { ...cfg, _id: Date.now() };
  _subs.forEach((f) => { try { f(item); } catch {} });
}
