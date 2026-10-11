// ─────────────────────────────────────────────────────────────────────────────
//  aprovador.js: página do APROVADOR DE PAGAMENTOS, no domínio da central (ADR-036).
//
//  https://<domínio da central>/aprovador?t=TOKEN   → criar a senha de aprovação
//                                                     (convite ou nova senha)
//  https://<domínio da central>/aprovador?a=TOKEN   → "Revisar e aprovar" do e-mail do
//                                                     código: o lote e a senha, no
//                                                     aparelho do aprovador
//  https://<domínio da central>/aprovador?c=TOKEN   → "não reconheço": cancelar a troca
//                                                     de aprovador sem senha
//
//  Por que fora do painel: o aprovador pode nem ter login. E a senha dele precisa ser
//  criada num lugar onde quem o convidou não esteja olhando — o link chega só no e-mail
//  dele.
//
//  Mesmo desenho de /conta/excluir: HTML pronto no servidor, sem nenhum script,
//  formulários comuns (POST para esta mesma página) que chamam a API daqui do servidor.
//  A CSP fecha todo o resto. Cores, nome e logo são da central.
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND = process.env.BRANDING_API || 'https://logix-production-61ae.up.railway.app/api/v1';
const SENHA_MIN = 10;

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const dataHora = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' })} às ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' })}`;
};

async function api(caminho, corpo) {
  const r = await fetch(`${BACKEND}${caminho}`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(corpo),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(dados.mensagem || dados.erro || 'Não foi possível concluir agora. Tente de novo em alguns minutos.');
    e.status = r.status;
    throw e;
  }
  return dados;
}

function pagina({ marca, titulo, conteudo }) {
  const cor = /^#[0-9a-f]{6}$/i.test(marca.cor_primaria || '') ? marca.cor_primaria : '#185FA5';
  const destaque = /^#[0-9a-f]{6}$/i.test(marca.cor_destaque || '') ? marca.cor_destaque : cor;
  const nome = marca.nome_exibicao || marca.nome_fantasia || 'Central de entregas';
  const logo = marca.logo_url && /^https:\/\//.test(marca.logo_url)
    ? `<img src="${esc(marca.logo_url)}" alt="${esc(nome)}" height="40">` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)} · ${esc(nome)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#13233a}
  .faixa{height:5px;background:${esc(destaque)}}
  main{max-width:520px;margin:32px auto;padding:0 16px}
  .cartao{background:#fff;border:1px solid #dfe5ec;border-radius:12px;overflow:hidden}
  .topo{display:flex;align-items:center;gap:12px;padding:18px 24px;border-bottom:1px solid #edf1f5;font-weight:800;color:${esc(cor)}}
  .corpo{padding:24px}
  h1{font-size:20px;margin:0 0 12px;line-height:1.3}
  p{font-size:14.5px;line-height:1.6;color:#3d4d61;margin:0 0 14px}
  label{display:block;font-size:13px;font-weight:700;margin:14px 0 6px}
  input[type=password]{width:100%;font-size:16px;padding:12px;border:1.5px solid #cfd9e6;border-radius:10px}
  input[type=password]:focus{outline:2px solid ${esc(cor)};outline-offset:1px}
  button{width:100%;margin-top:16px;background:${esc(destaque)};color:#fff;border:0;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer}
  button:focus-visible{outline:3px solid ${esc(cor)};outline-offset:2px}
  ul{margin:8px 0 0;padding-left:18px;font-size:13px;color:#4c5c70;line-height:1.6}
  table{width:100%;border-collapse:collapse;margin:0 0 16px;font-size:13.5px}
  td{padding:9px 0;border-bottom:1px solid #edf1f5;color:#62748a;vertical-align:top}td+td{text-align:right;color:#13233a}
  .aviso{background:#fbf1dc;color:#7a5410;border-radius:10px;padding:12px;font-size:13.5px;line-height:1.55}
  .erro{background:#fdecea;color:#b42318;border-radius:10px;padding:12px;font-size:13.5px;line-height:1.55}
  .ok{background:#e3f4ec;color:#1f6b48;border-radius:10px;padding:12px;font-size:13.5px;line-height:1.55}
  small{display:block;color:#7d8ca0;font-size:12px;line-height:1.55;margin-top:14px}
</style>
</head>
<body>
<div class="faixa"></div>
<main><div class="cartao">
  <div class="topo">${logo}<span>${esc(nome)}</span></div>
  <div class="corpo">${conteudo}</div>
</div></main>
</body></html>`;
}

function formSenha({ token, info, erro = '' }) {
  const novo = info.tipo !== 'nova_senha';
  const primeiro = String(info.nome || '').trim().split(/\s+/)[0];
  return `
    <h1>${esc(primeiro)}, ${novo ? 'crie sua senha de aprovação' : 'crie uma nova senha de aprovação'}</h1>
    <p>${novo ? `Você foi indicado para aprovar os pagamentos aos entregadores da ${esc(info.empresa)}. Cada pagamento vai pedir o código que chega no seu e-mail (${esc(info.email)}) e esta senha.`
    : 'A senha antiga continua valendo até você criar a nova.'}</p>
    <p class="aviso">Guarde bem: esta senha não aparece para ninguém, nem para quem convidou você, e não pode ser recuperada pelo painel. Se esquecer, peça um link novo e crie outra.</p>
    ${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ''}
    <form method="post" action="/aprovador">
      <input type="hidden" name="t" value="${esc(token)}">
      <label for="senha">Senha de aprovação</label>
      <input id="senha" name="senha" type="password" required minlength="${SENHA_MIN}" autocomplete="new-password">
      <ul>
        <li>Pelo menos ${SENHA_MIN} caracteres</li>
        <li>Diferente da sua senha de login do painel</li>
        <li>Nada óbvio (1234567890, nome da empresa)</li>
      </ul>
      <label for="repetir">Repita a senha</label>
      <input id="repetir" name="repetir" type="password" required minlength="${SENHA_MIN}" autocomplete="new-password">
      <button type="submit">${novo ? 'Criar senha e ativar' : 'Salvar nova senha'}</button>
    </form>
    <small>Link válido até ${esc(dataHora(info.expira_em))}. Não esperava este e-mail? Feche a página e avise o administrador da central.</small>`;
}

function formAprovar({ token, info, erro = '' }) {
  const linhas = (info.destinos || []).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${esc(v)}</td></tr>`).join('');
  return `
    <h1>${esc(String(info.aprovador || '').split(/\s+/)[0])}, confira antes de aprovar</h1>
    <p>${info.pedido_por ? `<b>${esc(info.pedido_por)}</b> pediu` : 'Foi pedido'} um pagamento da ${esc(info.empresa)}.</p>
    <table>
      <tr><td>Tipo</td><td>${esc(info.tipo)}</td></tr>
      <tr><td>Lote</td><td>${esc(info.referencia)}</td></tr>
      <tr><td>Entregadores</td><td>${esc(info.quantidade)}</td></tr>
      <tr><td>Total</td><td><b>${esc(info.total)}</b></td></tr>
    </table>
    ${linhas ? `<p style="margin-bottom:6px"><b>Para quem vai</b></p><table>${linhas}</table>${info.mais ? `<p>e mais ${esc(info.mais)}.</p>` : ''}` : ''}
    ${erro ? `<p class="erro" role="alert">${esc(erro)}</p>` : ''}
    <form method="post" action="/aprovador">
      <input type="hidden" name="a" value="${esc(token)}">
      <label for="senha">Sua senha de aprovação</label>
      <input id="senha" name="senha" type="password" required autocomplete="current-password">
      <button type="submit">Aprovar e enviar ao banco</button>
    </form>
    <small>Vale até ${esc(dataHora(info.expira_em))}. Não reconhece? Feche esta página e avise o administrador da central: sem a sua senha, nada é pago.</small>`;
}

export default async function handler(req, res) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  let marca = {};
  try {
    const r = await fetch(`${BACKEND}/branding?host=${encodeURIComponent(host)}`, { headers: { accept: 'application/json' } });
    if (r.ok) marca = await r.json();
  } catch { /* segue com o neutro */ }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer'); // o token do link não vaza para a logo
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  const enviar = (status, titulo, conteudo) => res.status(status).send(pagina({ marca, titulo, conteudo }));

  const corpo = (req.body && typeof req.body === 'object') ? req.body : {};
  const pega = (k) => String((req.method === 'POST' ? corpo[k] : req.query && req.query[k]) || '').trim();
  const t = pega('t');
  const c = pega('c');
  const a = pega('a');

  // ── Aprovar um lote pelo botão do e-mail ──
  if (a) {
    let info;
    try { info = await api('/pagamentos/aprovador/lote/conferir', { token: a }); }
    catch (e) { return enviar(e.status === 422 ? 410 : 502, 'Aprovar pagamento', `<h1>Este link não vale mais</h1><p class="aviso">${esc(e.message)}</p>`); }
    if (req.method !== 'POST') return enviar(200, 'Aprovar pagamento', formAprovar({ token: a, info }));
    try {
      const r = await api('/pagamentos/aprovador/lote/aprovar', { token: a, senha: String(corpo.senha || '') });
      return enviar(200, 'Pagamento aprovado', `
        <h1>Pagamento aprovado</h1>
        <p class="ok">O lote ${esc(r.referencia)} (${esc(r.total)}) foi enviado ao banco.</p>
        <p>A equipe acompanha o resultado de cada Pix na tela de pagamentos. Pode fechar esta página.</p>`);
    } catch (e) {
      return enviar(e.status === 429 ? 429 : 422, 'Aprovar pagamento', formAprovar({ token: a, info, erro: e.message }));
    }
  }

  // ── Convite / nova senha ──
  if (t) {
    let info;
    try { info = await api('/pagamentos/aprovador/convite/conferir', { token: t }); }
    catch (e) { return enviar(e.status === 422 ? 410 : 502, 'Link inválido', `<h1>Este link não vale mais</h1><p class="erro">${esc(e.message)}</p>`); }

    if (req.method !== 'POST') return enviar(200, 'Senha de aprovação', formSenha({ token: t, info }));

    const senha = String(corpo.senha || '');
    if (senha.length < SENHA_MIN) return enviar(422, 'Senha de aprovação', formSenha({ token: t, info, erro: `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.` }));
    if (senha !== String(corpo.repetir || '')) return enviar(422, 'Senha de aprovação', formSenha({ token: t, info, erro: 'As duas senhas não são iguais.' }));
    try {
      const r = await api('/pagamentos/aprovador/convite/aceitar', { token: t, senha });
      return enviar(200, 'Senha criada', `
        <h1>Pronto, ${esc(String(r.nome || '').split(/\s+/)[0])}</h1>
        <p class="ok">${r.tipo === 'convite' ? `Você agora aprova os pagamentos da ${esc(r.empresa)}.` : 'Sua nova senha de aprovação já vale.'}</p>
        <p>Quando um pagamento precisar de você, chega um código por e-mail. Digite o código e esta senha na tela de pagamento.</p>
        <small>Pode fechar esta página.</small>`);
    } catch (e) {
      return enviar(e.status === 429 ? 429 : 422, 'Senha de aprovação', formSenha({ token: t, info, erro: e.message }));
    }
  }

  // ── "Não reconheço": cancelar a troca sem senha ──
  if (c) {
    try {
      if (req.method === 'POST') {
        const r = await api('/pagamentos/aprovador/pedido/cancelar', { token: c });
        return enviar(200, 'Pedido cancelado', `
          <h1>Pedido cancelado</h1>
          <p class="ok">A troca de aprovador foi cancelada e os pagamentos da ${esc(r.empresa)} voltaram ao normal.</p>
          <p>Todos os aprovadores e a equipe que paga recebem um aviso. Vale conversar com o administrador sobre quem fez o pedido.</p>`);
      }
      const p = await api('/pagamentos/aprovador/pedido/conferir', { token: c });
      return enviar(200, 'Troca de aprovador', `
        <h1>Pedido de troca de aprovador</h1>
        <p>Alguém pediu para mudar quem aprova os pagamentos da ${esc(p.empresa)} <b>sem a senha de nenhum aprovador</b>. Se ninguém cancelar, a troca vale em ${esc(dataHora(p.libera_em))}.</p>
        <table>
          <tr><td>Pedido por</td><td>${esc(p.pedido_por || '—')}</td></tr>
          <tr><td>Entra</td><td>${esc(p.nome)} (${esc(p.email)})</td></tr>
          ${p.remover_nome ? `<tr><td>Sai</td><td>${esc(p.remover_nome)}</td></tr>` : ''}
          <tr><td>Motivo</td><td>${esc(p.motivo)}</td></tr>
        </table>
        <form method="post" action="/aprovador">
          <input type="hidden" name="c" value="${esc(c)}">
          <button type="submit">Não reconheço: cancelar pedido</button>
        </form>
        <small>Se o pedido é legítimo, não faça nada: a troca acontece no prazo.</small>`);
    } catch (e) {
      return enviar(e.status === 422 ? 410 : 502, 'Troca de aprovador', `<h1>Nada a cancelar</h1><p class="aviso">${esc(e.message)}</p>`);
    }
  }

  return enviar(404, 'Link inválido', '<h1>Link inválido</h1><p>Abra o link exatamente como chegou no seu e-mail.</p>');
}
