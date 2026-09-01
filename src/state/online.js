// Fonte única do status ONLINE do motoboy, compartilhada entre as telas.
//
// Antes, home e perfil guardavam cada um o seu 'online'. Ligar no perfil não
// refletia na home até um refresh (o famoso "só apareceu online depois que
// forcei a atualização"). Agora as duas telas assinam o mesmo valor: mexeu em
// uma, muda na outra na hora.

let _online = null;        // null = ainda não sabemos
const _subs = new Set();

export function getOnline() { return _online; }

export function setOnline(v) {
  const nv = !!v;
  if (_online === nv) return;
  _online = nv;
  _subs.forEach((fn) => { try { fn(nv); } catch {} });
}

export function assinarOnline(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}
