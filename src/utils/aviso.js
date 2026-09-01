// Fila simples de AVISOS nativos do app (modal com a cara do Logix).
//
// Substitui os Alert.alert crus do sistema. Pode ser chamado de QUALQUER lugar —
// inclusive de módulos que não são componentes React (ex.: disclosure.js) — e
// devolve uma Promise que resolve com a chave do botão tocado:
//   'primario'  -> botão de ação principal
//   'ghost'     -> botão secundário / "agora não"
//   'fechar'    -> tocou fora / voltou (quando permitido)
//
// Quem renderiza de fato é o <AvisoHost/> montado no _layout (uma vez só).

let _atual = null;        // config do aviso em exibição (ou null)
let _resolver = null;     // resolve da Promise pendente
const _subs = new Set();  // assinantes (o AvisoHost)

function _notificar() { _subs.forEach((fn) => { try { fn(_atual); } catch {} }); }

// O host assina aqui. Recebe o estado atual na hora de assinar.
export function assinarAviso(fn) {
  _subs.add(fn);
  try { fn(_atual); } catch {}
  return () => _subs.delete(fn);
}

// Mostra um aviso e resolve quando o usuário escolher.
// config: { icone, titulo, chip, lead, itens:[{ico,txt}], destaque, destaqueIco,
//           botaoPrimario, botaoGhost, fecharPorFora }
export function mostrarAviso(config) {
  // Se já houver um aberto, resolve o anterior como 'fechar' para não travar a fila.
  if (_resolver) { const r = _resolver; _resolver = null; try { r('fechar'); } catch {} }
  return new Promise((resolve) => {
    _resolver = resolve;
    _atual = config || {};
    _notificar();
  });
}

// Chamado pelo host quando um botão é tocado (ou fechou por fora).
export function responderAviso(chave) {
  const r = _resolver;
  _resolver = null;
  _atual = null;
  _notificar();
  if (r) { try { r(chave); } catch {} }
}
