// White-label › E-mail: de qual endereço saem os avisos de cada cliente.
//
// Tela do MASTER. O cliente não vê nem edita — quem cria o domínio no provedor e
// define o remetente é a Logix. Nenhum e-mail sai com identidade da plataforma:
// logo, cor e nome vêm do branding do próprio cliente (aba Identidade visual).
import { el, esc } from '../core/ui.js';
import { get, post, put, del } from '../core/api.js';

const ENTRADA = 'font-size:13px;color:var(--lx-tinta);background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);padding:9px 11px;width:100%';

const ROTULO = { nao_configurado: 'não configurado', pendente: 'aguardando DNS', parcial: 'parcialmente verificado', verificado: 'verificado', falhou: 'falhou' };
const COR = { nao_configurado: '', pendente: 'at', parcial: 'at', verificado: 'ok', falhou: 'er' };
// Status de cada registro como o provedor manda. Com o domínio verificado, todos valem.
const REGISTRO = { verified: ['publicado', 'ok'], pending: ['conferindo', 'at'], not_started: ['faltando', 'at'], failed: ['falhou', 'er'], temporary_failure: ['falhou', 'er'] };

function tag(texto, tipo) {
  const cores = {
    ok: 'background:var(--lx-ok-bg);color:var(--lx-ok)',
    at: 'background:var(--lx-atencao-bg);color:var(--lx-atencao)',
    er: 'background:var(--lx-erro-bg);color:var(--lx-erro)',
    '': 'background:var(--lx-superficie-2);color:var(--lx-tinta-2)',
  };
  return el('span', { style: `font-size:11px;font-weight:700;padding:4px 11px;border-radius:999px;${cores[tipo] || cores['']}` }, texto);
}

function campo(rotulo, node, nota) {
  return el('div', { style: 'min-width:0' },
    el('label', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);display:block;margin-bottom:6px' }, rotulo),
    node,
    nota ? el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);line-height:1.5;margin-top:7px' }, nota) : '');
}

function bloco(titulo, direita, ...conteudo) {
  return el('div', { class: 'lx-card', style: 'margin-bottom:16px' },
    el('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      el('b', { style: 'font-size:14px;font-weight:800' }, titulo), direita || el('span', {})),
    el('div', { style: 'padding:16px' }, ...conteudo));
}

function aviso(texto) {
  return el('div', { style: 'background:var(--lx-atencao-bg);border:1px solid #e8d3a2;color:#7A5410;border-radius:var(--lx-raio-sm);padding:11px 14px;font-size:12.5px;line-height:1.55;margin-bottom:16px', html: texto });
}

function copiar(texto, botao) {
  navigator.clipboard.writeText(texto).then(() => {
    const antes = botao.textContent;
    botao.textContent = 'copiado';
    setTimeout(() => { botao.textContent = antes; }, 1400);
  }).catch(() => {});
}

export async function montarEmail(container, empresaId, toast) {
  container.innerHTML = '';
  const carregando = el('div', { style: 'padding:26px;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…');
  container.append(carregando);

  let cfg;
  try { cfg = await get('/email/config', { empresaId }); }
  catch (e) {
    container.innerHTML = '';
    container.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-erro)' }, e.message));
    return;
  }

  const recarregar = async () => montarEmail(container, empresaId, toast);
  container.innerHTML = '';

  if (!cfg.provedor_configurado) {
    container.append(aviso('<b>Provedor de e-mail não configurado na plataforma.</b> Defina <span style="font-family:monospace">RESEND_API_KEY</span> nas variáveis de ambiente do backend — sem ela nenhum cliente consegue enviar.'));
  }

  const pendente = cfg.status === 'pendente' || cfg.status === 'parcial';
  const verificado = cfg.status === 'verificado';

  if (cfg.status === 'nao_configurado') {
    container.append(aviso('Enquanto o domínio não estiver verificado, <b>nenhum e-mail sai em nome deste cliente</b> — inclusive recuperação de senha e o código de aprovação de pagamentos. A verificação depende de quem administra o DNS dele.'));
  } else if (pendente) {
    container.append(aviso(`Registros gerados para <b>${esc(cfg.dominio)}</b>. Agora alguém com acesso ao DNS do cliente precisa publicá-los — copie a lista e repasse. A verificação costuma sair em poucos minutos depois disso.`));
  } else if (cfg.status === 'falhou') {
    container.append(aviso('A verificação falhou. Confira se os registros abaixo estão publicados exatamente como mostrados e tente de novo.'));
  }

  // ── Domínio ──────────────────────────────────────────────────────────────
  const inpDominio = el('input', { type: 'text', style: ENTRADA, value: cfg.dominio || '', placeholder: 'avisos.clienteexemplo.com.br' });
  const selRegiao = el('select', { style: ENTRADA });
  for (const [v, t] of [['sa-east-1', 'América do Sul (São Paulo)'], ['us-east-1', 'Estados Unidos'], ['eu-west-1', 'Europa']]) {
    selRegiao.append(el('option', { value: v, ...(cfg.regiao === v ? { selected: '' } : {}) }, t));
  }
  inpDominio.disabled = cfg.status !== 'nao_configurado';
  selRegiao.disabled = cfg.status !== 'nao_configurado';

  const btnCriar = el('button', { class: 'lx-btn lx-btn-primario' }, 'Gerar registros');
  btnCriar.onclick = async () => {
    btnCriar.disabled = true;
    try {
      await post('/email/dominio', { dominio: inpDominio.value.trim(), regiao: selRegiao.value }, { empresaId });
      await recarregar();
    } catch (e) { btnCriar.disabled = false; toast(e.message, 'erro'); }
  };

  const btnRemover = el('button', { class: 'lx-btn lx-btn-secundario' }, 'Remover domínio');
  btnRemover.onclick = async () => {
    if (!confirm(`Remover ${cfg.dominio}? O cliente deixa de enviar e-mail até configurar de novo.`)) return;
    btnRemover.disabled = true;
    try { await del('/email/dominio', { empresaId }); await recarregar(); }
    catch (e) { btnRemover.disabled = false; toast(e.message, 'erro'); }
  };

  container.append(bloco('Domínio de envio', tag(ROTULO[cfg.status], COR[cfg.status]),
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px' },
      campo('Subdomínio de envio', inpDominio,
        'Use um subdomínio (avisos., nao-responda.). O domínio principal do cliente não é tocado, e um problema de reputação aqui não afeta o e-mail corporativo dele.'),
      campo('Região de envio', selRegiao, 'Mais perto do destinatário, entrega mais rápida.')),
    el('div', { style: 'margin-top:14px;display:flex;gap:9px;flex-wrap:wrap' },
      cfg.status === 'nao_configurado' ? btnCriar : btnRemover)));

  // ── Registros DNS ────────────────────────────────────────────────────────
  if (cfg.status !== 'nao_configurado') {
    // Só LÊ o status no provedor (ele reinicia a verificação apenas se a anterior falhou):
    // clicar várias vezes não atrasa mais nada.
    const btnVerificar = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:11.5px' }, 'Atualizar status');
    btnVerificar.onclick = async () => {
      btnVerificar.disabled = true; btnVerificar.textContent = 'Consultando…';
      try { await post('/email/dominio/verificar', {}, { empresaId }); await recarregar(); }
      catch (e) { btnVerificar.disabled = false; btnVerificar.textContent = 'Atualizar status'; toast(e.message, 'erro'); }
    };

    const th = (t) => el('th', { style: 'text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--lx-tinta-3);font-weight:700;padding:0 12px 10px' }, t);
    const corpo = el('tbody', {});
    for (const r of (cfg.registros || [])) {
      const valor = r.prioridade ? `${r.valor} (prioridade ${r.prioridade})` : r.valor;
      const btnCopia = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:4px 9px;font-size:11px' }, 'copiar');
      btnCopia.onclick = () => copiar(r.valor, btnCopia);
      corpo.append(el('tr', {},
        el('td', { style: 'padding:10px 12px;border-top:1px solid var(--lx-linha)' },
          tag(...(verificado ? REGISTRO.verified : (REGISTRO[r.status] || REGISTRO.not_started)))),
        el('td', { style: 'padding:10px 12px;border-top:1px solid var(--lx-linha);font-weight:800;font-size:12.5px' }, r.tipo),
        el('td', { style: 'padding:10px 12px;border-top:1px solid var(--lx-linha);font-family:ui-monospace,monospace;font-size:11.5px' }, r.nome),
        el('td', { style: 'padding:10px 12px;border-top:1px solid var(--lx-linha);font-family:ui-monospace,monospace;font-size:11.5px;word-break:break-all;max-width:360px' }, valor),
        el('td', { style: 'padding:10px 12px;border-top:1px solid var(--lx-linha)' }, btnCopia)));
    }

    const texto = (cfg.registros || []).map((r) => `${r.tipo}\t${r.nome}\t${r.valor}${r.prioridade ? ' (prioridade ' + r.prioridade + ')' : ''}`).join('\n');
    const btnTudo = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:11.5px' }, 'Copiar todos');
    btnTudo.onclick = () => copiar(texto, btnTudo);
    const btnTxt = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:11.5px' }, 'Baixar .txt');
    btnTxt.onclick = () => {
      const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
      const a = el('a', { href: url, download: `dns-${cfg.dominio}.txt` });
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    container.append(bloco('Publique estes registros no DNS',
      el('div', { style: 'display:flex;gap:9px;align-items:center;flex-wrap:wrap' },
        tag(verificado ? 'verificado' : 'aguardando', verificado ? 'ok' : 'at'), btnVerificar),
      el('div', { style: 'overflow-x:auto;max-width:100%' },
        el('table', { style: 'width:100%;border-collapse:collapse' },
          el('thead', {}, el('tr', {}, th('Status'), th('Tipo'), th('Nome'), th('Valor'), th(''))), corpo)),
      el('div', { style: 'margin-top:14px;font-size:12px;color:var(--lx-tinta-2);line-height:1.55' },
        'Nada é enviado por e-mail daqui: o domínio do cliente ainda não envia, e nenhuma mensagem sai com identidade da plataforma. Copie e repasse pelo canal que você já usa com ele.'),
      el('div', { style: 'margin-top:10px;display:flex;gap:9px;flex-wrap:wrap' }, btnTudo, btnTxt)));
  }

  // ── Remetente ────────────────────────────────────────────────────────────
  const inpNome = el('input', { type: 'text', style: ENTRADA, value: cfg.remetente_nome || '', placeholder: 'Nome da empresa do cliente' });
  const inpEmail = el('input', { type: 'text', style: ENTRADA, value: cfg.remetente_email || '', placeholder: cfg.dominio ? `nao-responda@${cfg.dominio}` : '' });
  const inpResp = el('input', { type: 'text', style: ENTRADA, value: cfg.responder_para || '', placeholder: 'financeiro@clienteexemplo.com.br' });
  const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario' }, 'Salvar remetente');
  btnSalvar.disabled = cfg.status === 'nao_configurado';
  btnSalvar.onclick = async () => {
    btnSalvar.disabled = true;
    try {
      await put('/email/remetente', { nome: inpNome.value.trim(), email: inpEmail.value.trim(), responder_para: inpResp.value.trim() || null }, { empresaId });
      toast('Remetente salvo');
      await recarregar();
    } catch (e) { btnSalvar.disabled = false; toast(e.message, 'erro'); }
  };

  const inpTeste = el('input', { type: 'text', style: ENTRADA + ';max-width:260px', placeholder: 'seu@email.com' });
  const btnTeste = el('button', { class: 'lx-btn lx-btn-secundario' }, 'Enviar e-mail de teste');
  btnTeste.disabled = !verificado;
  btnTeste.onclick = async () => {
    btnTeste.disabled = true; btnTeste.textContent = 'Enviando…';
    try { await post('/email/teste', { para: inpTeste.value.trim() }, { empresaId }); toast('Enviado — confira a caixa de entrada'); await recarregar(); }
    catch (e) { toast(e.message, 'erro'); }
    btnTeste.disabled = false; btnTeste.textContent = 'Enviar e-mail de teste';
  };

  container.append(bloco('Remetente', tag(verificado ? 'ativo' : 'bloqueado até verificar', verificado ? 'ok' : 'at'),
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px' },
      campo('Nome que aparece na caixa de entrada', inpNome),
      campo('Endereço de envio', inpEmail, cfg.dominio ? `Precisa terminar em @${cfg.dominio}.` : 'Configure o domínio primeiro.'),
      campo('Responder para', inpResp, 'Para onde vai a resposta de quem apertar "responder".')),
    el('div', { style: 'margin-top:14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center' },
      btnSalvar, inpTeste, btnTeste,
      verificado ? '' : el('span', { style: 'font-size:12px;color:var(--lx-tinta-3)' }, 'Teste disponível depois da verificação.'))));

  // ── Logo dos e-mails ─────────────────────────────────────────────────────
  // Fica no banco e sai por uma URL pública e permanente no domínio do cliente — a logo
  // da Identidade visual tem link que expira, e e-mail é lido semanas depois. A prévia
  // abaixo usa a mesma imagem (pela API do próprio painel, sem host novo na CSP).
  const baseApi = (window.LOGIX_API || '/bff/v1').replace(/\/$/, '');
  const fonteLogo = (v) => `${baseApi}/email/logo/${empresaId}.png?v=${v || Date.now()}`;
  const imgPrevia = el('img', { alt: 'Logo dos e-mails', style: 'display:block;height:40px;width:auto;max-width:160px' });
  const semLogo = el('div', { style: 'width:40px;height:40px;border-radius:10px;background:var(--lx-azul-primario);color:#fff;font:800 14px/40px Arial,sans-serif;text-align:center' }, 'AB');
  const temLogo = !!cfg.tem_logo;
  if (temLogo) imgPrevia.src = fonteLogo(cfg.logo_atualizado_em && new Date(cfg.logo_atualizado_em).getTime());
  const previa = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:10px;overflow:hidden;background:#fff;max-width:420px' },
    el('div', { style: 'height:5px;background:var(--lx-azul-primario)' }),
    el('div', { style: 'display:flex;align-items:center;gap:12px;padding:16px 18px' },
      temLogo ? imgPrevia : semLogo,
      el('b', { style: 'font:800 15px Arial,sans-serif;color:#13233a' }, cfg.remetente_nome || 'Nome da central')));

  const inpArquivo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', id: 'email-logo-arquivo', style: 'font-size:12.5px' });
  const btnRemoverLogo = el('button', { class: 'lx-btn lx-btn-secundario' }, 'Remover logo');
  btnRemoverLogo.disabled = !temLogo;
  inpArquivo.disabled = cfg.status === 'nao_configurado';
  inpArquivo.onchange = () => {
    const f = inpArquivo.files && inpArquivo.files[0];
    if (!f) return;
    if (f.size > 300 * 1024) { toast('A logo passa de 300 KB. Reduza o tamanho (uns 400 px de largura bastam).', 'erro'); inpArquivo.value = ''; return; }
    const leitor = new FileReader();
    leitor.onload = async () => {
      inpArquivo.disabled = true;
      try { await put('/email/logo', { logo: leitor.result }, { empresaId }); toast('Logo dos e-mails salva'); await recarregar(); }
      catch (e) { inpArquivo.disabled = false; inpArquivo.value = ''; toast(e.message, 'erro'); }
    };
    leitor.readAsDataURL(f);
  };
  btnRemoverLogo.onclick = async () => {
    if (!confirm('Remover a logo dos e-mails? Eles passam a sair com as iniciais da central.')) return;
    btnRemoverLogo.disabled = true;
    try { await del('/email/logo', { empresaId }); toast('Logo removida'); await recarregar(); }
    catch (e) { btnRemoverLogo.disabled = false; toast(e.message, 'erro'); }
  };

  const urlInfo = cfg.logo_url
    ? el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);line-height:1.55;margin-top:10px;word-break:break-all' },
      'Endereço público usado nos e-mails: ', el('span', { style: 'font-family:ui-monospace,monospace' }, cfg.logo_url))
    : '';
  const semPainel = !cfg.painel
    ? aviso('Este cliente não tem domínio do painel (Identidade visual › domínio ou subdomínio). Sem ele, os links dos e-mails (nova senha, exclusão de conta) não são enviados, e a logo sai pelo endereço da API.')
    : '';

  container.append(bloco('Logo dos e-mails', tag(temLogo ? 'definida' : 'sem logo', temLogo ? 'ok' : 'at'),
    semPainel,
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;align-items:start' },
      el('div', {},
        el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:8px' }, 'Prévia do cabeçalho'),
        previa),
      campo('Arquivo da logo', inpArquivo,
        'PNG, JPG ou WEBP, até 300 KB. Desenhada para fundo branco, uns 400 px de largura. Sem logo, os e-mails saem com as iniciais da central.')),
    urlInfo,
    el('div', { style: 'margin-top:14px;display:flex;gap:9px;flex-wrap:wrap' }, btnRemoverLogo)));

  // ── Últimos envios ───────────────────────────────────────────────────────
  let envios = [];
  try { const r = await get('/email/envios', { empresaId }); envios = r.linhas || []; } catch { envios = []; }
  const thE = (t) => el('th', { style: 'text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--lx-tinta-3);font-weight:700;padding:0 12px 10px' }, t);
  const corpoE = el('tbody', {});
  for (const e of envios) {
    const td = (c) => el('td', { style: 'padding:10px 12px;border-top:1px solid var(--lx-linha);font-size:12.5px' }, c);
    corpoE.append(el('tr', {},
      td(new Date(e.criado_em).toLocaleString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })),
      td(e.para), td(e.assunto), td(tag(e.modelo, '')),
      td(tag(e.status, e.status === 'erro' || e.status === 'falhou' ? 'er' : 'ok'))));
  }
  if (!envios.length) {
    corpoE.append(el('tr', {}, el('td', { colspan: 5, style: 'padding:26px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Nenhum e-mail enviado ainda')));
  }
  container.append(bloco('Últimos envios', tag(`${envios.length}`, ''),
    el('div', { style: 'overflow-x:auto;max-width:100%' },
      el('table', { style: 'width:100%;border-collapse:collapse' },
        el('thead', {}, el('tr', {}, thE('Quando'), thE('Para'), thE('Assunto'), thE('Modelo'), thE('Status'))), corpoE))));
}
