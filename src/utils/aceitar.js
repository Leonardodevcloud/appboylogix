import { api } from '../api';

// Aceitar corrida à prova de resposta perdida (18/10/2026). O aceite no servidor é
// idempotente, mas quando a resposta não chegava (servidor lento, troca de rede) o app
// dizia "sem conexão" com a corrida JÁ aceita. Agora, em erro de rede, confere na fila
// do motoboy se a corrida dele está lá; se estiver, conta como aceita.
//
//   const r = await aceitarCorrida(oferta)   → { ok: true } | lança o erro original
export async function aceitarCorrida({ oferta_id, entrega_id }) {
  try {
    await api.aceitarOferta(oferta_id);
    return { ok: true };
  } catch (e) {
    const rede = !e?.status || e.status >= 500 || /sem conex|network|tempo|timeout/i.test(e?.message || '');
    if (rede && entrega_id) {
      try {
        const fila = await api.get('/motoboys/app/fila');
        if ((fila || []).some((x) => String(x.id) === String(entrega_id))) return { ok: true, confirmadaDepois: true };
      } catch { /* sem como confirmar: segue o erro */ }
    }
    throw e;
  }
}

export const ehErroDeRede = (e) => !e?.status || e.status >= 500 || /sem conex|network|tempo|timeout/i.test(e?.message || '');

// Depois de aceitar (02/11/2026): abre a corrida que é a 1ª da ordem da rota — não
// necessariamente a que ele acabou de aceitar. A /app/fila já vem na ordem em que ele vai
// fazer (`ordem_rota`). Sem resposta, abre a que aceitou.
const ATIVAS = new Set(['aguardando_coleta', 'em_coleta', 'em_rota']);
export async function corridaDaVez(aceitaId) {
  try {
    const fila = (await api.get('/motoboys/app/fila')) || [];
    const ativas = fila.filter((e) => ATIVAS.has(e.status));
    const ordenadas = ativas.every((e) => e.ordem_rota != null) ? [...ativas].sort((a, b) => a.ordem_rota - b.ordem_rota) : ativas;
    if (ordenadas[0]) return ordenadas[0].id;
  } catch { /* sem rede: abre a que aceitou */ }
  return aceitaId || null;
}
