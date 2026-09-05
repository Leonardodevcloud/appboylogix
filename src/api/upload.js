// Upload DIRETO ao storage (R2) por URL assinada — mecanismo único para fotos de
// protocolo, documentos e chat.
//
//   1) pede a URL assinada à API      (POST /uploads/app/url  ou  /uploads/publico/:slug/url)
//   2) faz PUT do arquivo direto no R2 (a API nunca recebe os bytes)
//   3) devolve a storage_key para a tela mandar na rota de negócio
//
// Se QUALQUER etapa falhar (sem rede, storage indisponível, 4G ruim), devolve null e
// a tela cai no fluxo antigo (base64) — o servidor aceita os dois. Nunca bloqueia o
// motoboy por causa do upload direto.
import { api, API_URL } from './index';

const TIMEOUT_PUT_MS = 45_000;

// `fonte`: URI de arquivo (file://...) OU data URI (data:image/jpeg;base64,...).
async function lerBlob(fonte) {
  const r = await fetch(fonte);
  return r.blob();
}

export async function uploadDireto({ fonte, mime = 'image/jpeg', finalidade, publicoSlug = null }) {
  try {
    const blob = await lerBlob(fonte);
    const tamanho = blob?.size || undefined;

    // 1) URL assinada
    let pedido;
    if (publicoSlug) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12_000);
      const r = await fetch(`${API_URL}/uploads/publico/${encodeURIComponent(publicoSlug)}/url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finalidade, mime, tamanho }), signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) throw new Error('url publica ' + r.status);
      pedido = await r.json();
    } else {
      pedido = await api.post('/uploads/app/url', { finalidade, mime, tamanho });
    }
    if (!pedido?.url || !pedido?.key) throw new Error('resposta sem url/key');

    // 2) PUT direto no storage. O Content-Type TEM que ser o mesmo pedido (está na assinatura).
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_PUT_MS);
    const put = await fetch(pedido.url, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob, signal: ctrl.signal });
    clearTimeout(t);
    if (!put.ok) throw new Error('PUT ' + put.status);

    return pedido.key;
  } catch (e) {
    console.log('[upload direto] falhou, caindo para base64:', e?.message);
    return null;
  }
}

// Vários arquivos em paralelo. Devolve array alinhado com a entrada (null onde falhou).
export async function uploadDiretoVarios(itens) {
  return Promise.all(itens.map((i) => uploadDireto(i)));
}
