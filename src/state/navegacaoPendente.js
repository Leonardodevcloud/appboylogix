// Destino guardado enquanto o app ainda está subindo (Onda 11c).
//
// Problema: o app aberto pelo toque na notificação navegava para a oferta 600 ms depois
// do boot, e o index.jsx, ao confirmar o login, fazia `router.replace('/home')` POR CIMA —
// a tela da corrida piscava (ou nem chegava) e o motoboy caía na Home. Agora quem recebe
// a notificação só ANOTA o destino; quem termina o boot (index → home) o consome.
let pendente = null;

export function anotarDestino(rota) { pendente = rota; }
export function consumirDestino() { const r = pendente; pendente = null; return r; }
export function temDestino() { return !!pendente; }

// Oferta aberta em tela cheia por último — evita empilhar a mesma corrida duas vezes
// quando chegam WS + push do mesmo disparo.
let ultimaOfertaAberta = null;
export function marcarOfertaAberta(id) { ultimaOfertaAberta = id; }
export function ofertaJaAberta(id) { return !!id && ultimaOfertaAberta === id; }
