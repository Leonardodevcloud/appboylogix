import { el, icones } from './ui.js';
import { navegar } from './router.js';
import * as auth from './auth.js';
import { reaplicarTema } from './tema.js';
import { get as apiGet, demoAtivo } from './api.js';

const iconeWhitelabel = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22a10 10 0 1 1 0-20 8 8 0 0 1 0 16h-1.5a2.5 2.5 0 0 0 0 4z"/></svg>';
const iconeApi = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function gruposNav() {
  const a = auth.acessoAtual();

  if (a.perfil === 'super_admin') {
    return [
      { titulo: 'Operação', itens: [
        { rota: '/', rotulo: 'Dashboard', icone: 'painel' },
      ]},
      { titulo: 'Cadastros', itens: [
        { rota: '/clientes', rotulo: 'Clientes', icone: 'clientes' },
      ]},
      { titulo: 'Sistema', itens: [
        { rota: '/marca', rotulo: 'White-label', icone: '__whitelabel__' },
        { rota: '/custos-api', rotulo: 'Custos de API', icone: '__api__' },
        { rota: '/saude', rotulo: 'Saúde do sistema', icone: '__saude__' },
        { rota: '/auditoria', rotulo: 'Auditoria', icone: '__auditoria__' },
        { rota: '/faturamento', rotulo: 'Faturamento', icone: 'financeiro' },
        { rota: '/catalogo-comercial', rotulo: 'Catálogo comercial', icone: '__api__' },
      ]},
    ];
  }

  const central = a.perfil === 'central_admin';
  const operacao = [{ rota: '/', rotulo: 'Dashboard', icone: 'painel' }];
  // Solicitar corrida (lançar entrega) logo abaixo do Dashboard.
  if (auth.temModulo('entregas') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/entregas', rotulo: 'Solicitar corrida', icone: 'entregas' });
  // Central tem a tela de Acompanhamento (visão de todas as lojas).
  if (central && auth.temModulo('entregas') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/acompanhamento', rotulo: 'Acompanhamento', icone: 'acompanhamento' });
  else if (a.perfil === 'loja' && auth.temModulo('entregas') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/acompanhamento-loja', rotulo: 'Acompanhamento', icone: 'acompanhamento' });
  // Rastreio logo abaixo de Acompanhamento.
  if (auth.temModulo('rastreamento') && auth.pode('rastreamento.ver'))
    operacao.push({ rota: '/rastreio', rotulo: 'Rastreio', icone: 'rastreio' });
  // Mapa em tempo real logo abaixo do Rastreio (abre em aba dedicada).
  if (central && auth.temModulo('rastreamento') && auth.pode('rastreamento.ver'))
    operacao.push({ rota: '/mapa', rotulo: 'Mapa em tempo real', icone: 'mapa', novaAba: true });
  // Radar operacional: motoboys parados/sem sinal em corridas em rota.
  // Central vê tudo (+ configura); loja vê só os alertas das entregas dela.
  // S11: Radar é módulo vendável.
  if ((central || a.perfil === 'loja') && auth.temModulo('radar') && auth.pode('radar.ver'))
    operacao.push({ rota: '/radar', rotulo: 'Radar', icone: 'acompanhamento' });
  // Relatórios: módulo vendável 'bi' (definido pelo super_admin por cliente) + permissão.
  // Antes só checava entregas.ver → aparecia mesmo com o módulo desmarcado no plano.
  if (auth.temModulo('bi') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/relatorios', rotulo: 'Relatórios', icone: 'relatorios' });
  // Painel BI: módulo vendável próprio ('bi_painel'), com liberação por loja (loja_modulos),
  // igual ao chat. A loja abre a mesma tela, travada na própria operação.
  if (auth.temModulo('bi_painel') && auth.pode('entregas.ver'))
    operacao.push({ rota: '/bi', rotulo: 'Painel BI', icone: '__bi__' });
  // Lojas (clientes): gestão da central, quem tem permissão de lojas.
  if (central && auth.temModulo('lojas') && auth.pode('lojas.ver'))
    operacao.push({ rota: '/lojas', rotulo: 'Lojas', icone: 'clientes' });
  if (auth.temModulo('motoboys') && auth.pode('motoboys.ver'))
    operacao.push({ rotulo: 'Entregadores', icone: 'motoboys', filhos: [
      { rota: '/motoboys', rotulo: 'Cadastro de entregadores' },
      { rota: '/rotas', rotulo: 'Rotas traçadas' },
      ...(auth.temModulo('gamificacao') ? [{ rota: '/gamificacao', rotulo: 'Gamificação' }] : []),   // S11: vendável
    ] });
  // Financeiro: módulo vendável (plano do cliente) + permissão do papel.
  // Submenu como o de Entregadores — três áreas distintas, cada uma com sua rota:
  // o que a central RECEBE, o que cada profissional TEM A RECEBER, e o acerto/pagamento.
  if (central && auth.temModulo('financeiro') && auth.pode('financeiro.ver'))
    operacao.push({ rotulo: 'Financeiro', icone: 'financeiro', filhos: [
      { rota: '/financeiro/cliente', rotulo: 'Faturamento cliente' },
      { rota: '/financeiro/saldo', rotulo: 'Saldo dos profissionais' },
      { rota: '/financeiro/fechamento', rotulo: 'Fechamento do profissional' },
      // Antecipação depende do módulo de pagamento e da permissão de pagar: decidir
      // saque é mexer em dinheiro, não é leitura de financeiro.
      ...(auth.temModulo('financeiro.pagamento_automatico') && auth.pode('financeiro.pagar')
        ? [{ rota: '/financeiro/antecipacoes', rotulo: 'Antecipações' },
          { rota: '/financeiro/pagamento-config', rotulo: 'Configurações de pagamento' }] : []),
    ] });

  // Chat interno — módulo vendável. Central: "Suporte"; Loja: "Mensagens".
  if (central && auth.temModulo('chat') && auth.pode('chat.ver'))
    operacao.push({ rota: '/chat', rotulo: 'Suporte', icone: 'chat' });
  else if (a.perfil === 'loja' && auth.temModulo('chat'))
    operacao.push({ rota: '/chat', rotulo: 'Mensagens', icone: 'chat' });

  const config = [];
  if (central) config.push({ rota: '/modulos', rotulo: 'Módulos', icone: 'config' });
  if (auth.pode('usuarios.gerenciar'))
    config.push({ rota: '/equipe', rotulo: 'Equipe', icone: 'equipe' });
  // Integrações (API): ferramenta da central — aparece por permissão.
  if (central && auth.temModulo('integracoes') && auth.pode('integracoes.ver'))   // S11: vendável
    config.push({ rota: '/integracoes', rotulo: 'Integrações', icone: '__api__' });
  // Seguro IZA: conector vendável — central com permissão, se o módulo estiver no plano.
  if (central && auth.temModulo('seguro_iza') && auth.pode('seguro_iza.ver'))
    config.push({ rota: '/seguro-iza', rotulo: 'Seguro IZA', icone: '__api__' });
  // Configurações da operação — administradores da central (gerência de usuários).
  if (central && auth.pode('usuarios.gerenciar'))
    config.push({ rota: '/configuracoes', rotulo: 'Configurações', icone: 'config' });
  // S13: "Meu plano e faturas" é item próprio; Auditoria é exclusiva do master da Logix.
  if (central && auth.pode('usuarios.gerenciar'))
    config.push({ rota: '/plano', rotulo: 'Meu plano e faturas', icone: 'financeiro' });

  const grupos = [{ titulo: 'Operação', itens: operacao }];
  if (config.length) grupos.push({ titulo: 'Configuração', itens: config });
  return grupos;
}

// Rotas que o usuário ATUAL pode abrir = exatamente as que aparecem no menu dele, mais as
// sub-rotas dos itens permitidos. Usado pela guarda do router: digitar #/motoboys sendo
// super_admin (ou #/financeiro sendo loja) não pode nem montar a tela — a API já barrava
// (403/tenant), mas a casca renderizava com erro, o que parecia "acesso".
export function rotaPermitida(caminho) {
  const base = '/' + (caminho.split('/')[1] || '');
  if (base === '/' || base === '/login') return true;
  const permitidas = new Set();
  const add = (it) => {
    if (it.rota) permitidas.add('/' + (it.rota.split('/')[1] || ''));
    if (Array.isArray(it.filhos)) it.filhos.forEach(add);   // itens com submenu (ex.: Entregadores) não têm rota própria
  };
  for (const g of gruposNav()) g.itens.forEach(add);
  return permitidas.has(base);
}

const iconeBi = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3.5-4 3 3L20 6"/><circle cx="20" cy="6" r="1.4"/></svg>';
const iconeSaude = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>';
function iconeNav(key) {
  if (key === '__whitelabel__') return iconeWhitelabel;
  if (key === '__saude__') return iconeSaude;
  if (key === '__auditoria__') return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>';
  if (key === '__api__') return iconeApi;
  if (key === '__bi__') return iconeBi;
  return icones[key] || '';
}

function iniciais(nome) {
  const p = (nome || '').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || 'U';
}
function perfilRotulo(p) {
  return { super_admin: 'Administrador master', central_admin: 'Administrador da central', loja: 'Loja', cliente: 'Cliente', motoboy: 'Motoboy' }[p] || '';
}

// Banner de impersonação — aparece quando o master está dentro de um cliente
function bannerImpersonacao(u) {
  if (!auth.estaImpersonando()) return null;
  return el('div', { style: `
    background:var(--lx-azul-profundo);color:#fff;
    padding:10px 24px;display:flex;align-items:center;gap:14px;
    font-size:13px;font-weight:600;
  ` },
    el('span', { style: 'flex:1' },
      '👁 Você está visualizando como ',
      el('b', {}, u.empresa_nome || u.nome || 'cliente'),
      ' — suas ações são reais.'),
    el('button', {
      style: `
        background:#fff;color:var(--lx-azul-profundo);
        border:none;border-radius:8px;padding:7px 16px;
        font-size:12px;font-weight:800;cursor:pointer
      `,
      onClick: async () => {
        await auth.encerrarImpersonacao();
        navegar('/clientes');
      }
    }, '← Voltar ao master')
  );
}

// Sidebar montada à parte para poder ser RECONSTRUÍDA sem trocar de tela — é o que
// faz um módulo recém-adquirido aparecer no menu na hora, sem F5 (ver atualizarMenu).
function construirSidebar(u) {
  const ativo = location.hash.slice(1) || '/';

  const grupos = gruposNav().map((g) => el('div', {},
    el('div', { class: 'lx-nav-lbl' }, g.titulo),
    ...g.itens.map((n) => {
      if (n.filhos) {
        const aberto = n.filhos.some((f) => ativo === f.rota);
        const sub = el('div', { style: aberto ? '' : 'display:none' },
          ...n.filhos.map((f) => el('button', {
            class: 'lx-nav-i' + (ativo === f.rota ? ' on' : ''),
            style: 'padding-left:46px;font-size:13px',
            onClick: () => navegar(f.rota),
          }, f.rotulo)));
        const cab = el('button', { class: 'lx-nav-i',
          onClick: () => { sub.style.display = sub.style.display === 'none' ? '' : 'none'; } },
          el('span', { html: iconeNav(n.icone) }), n.rotulo,
          el('span', { style: 'margin-left:auto;font-size:10px;opacity:.65' }, '\u25be'));
        return el('div', {}, cab, sub);
      }
      return el('button', {
        class: 'lx-nav-i' + (ativo === n.rota ? ' on' : ''),
        ...(n.rota === '/chat' ? { 'data-chatnav': '1' } : {}),
        onClick: () => n.novaAba
          ? window.open(location.pathname + '#' + n.rota, '_blank')
          : navegar(n.rota),
      }, el('span', { html: iconeNav(n.icone) }), n.rotulo,
        n.rota === '/chat' ? el('span', { 'data-chatbadge': '', style: 'margin-left:auto;display:none;background:var(--lx-erro);color:#fff;font-size:9px;font-weight:800;border-radius:99px;min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 4px' }) : '');
    }),
  ));

  const side = el('aside', { class: 'lx-side' },
    el('div', { class: 'lx-side-logo' },
      el('div', { class: 'lx-mono', 'data-lx-logo': '' }, 'LX'),
      el('div', { class: 'wm' },
        el('b', { 'data-lx-nome': '' }, 'logix'),
        el('span', {}, 'Inteligência em cada rota'))),
    ...grupos,
    el('div', { class: 'lx-side-user' },
      el('div', { class: 'av' }, iniciais(u.nome)),
      el('div', { style: 'min-width:0' },
        el('b', {}, u.nome || '—'),
        el('small', {}, u.empresa_nome || perfilRotulo(u.perfil))),
      el('button', { class: 'lx-sair', onClick: async () => { await auth.logout(); navegar('/login'); } }, 'Sair')));
  return side;
}

export function casca(titulo, conteudo, subtitulo) {
  const u = auth.usuarioAtual() || {};
  // Modo demonstração (S12): a tela real do módulo é montada DENTRO da Central de módulos —
  // sem sidebar nem topbar da casca, só o título compacto e o conteúdo.
  if (demoAtivo()) {
    return el('div', { class: 'lx-demo-casca' },
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px' },
        el('div', {}, el('h1', { style: 'margin:0;font-size:16px;font-weight:800' }, titulo), subtitulo ? el('div', { class: 'lx-muted', style: 'font-size:12px' }, subtitulo) : ''),
        el('span', { class: 'lx-role-pill' }, perfilRotulo(u.perfil))),
      conteudo);
  }
  const side = construirSidebar(u);

  const sub = subtitulo || (u.empresa_nome ? u.empresa_nome : perfilRotulo(u.perfil));
  // Badge de não lidas no item de chat do menu (poll leve; só se o item existe).
  try {
    if (auth.temModulo('chat') && (u.perfil === 'central_admin' || u.perfil === 'loja')) {
      clearInterval(window.__lxChatBadge);
      const atualizar = async () => {
        const alvo = side.querySelector('[data-chatbadge]');
        if (!alvo) { clearInterval(window.__lxChatBadge); return; }
        try { const r = await apiGet('/chat/nao-lidas'); const t = (r && r.total) || 0; alvo.textContent = t > 9 ? '9+' : String(t); alvo.style.display = t > 0 ? '' : 'none'; } catch {}
      };
      atualizar();
      window.__lxChatBadge = setInterval(atualizar, 15000);
    }
  } catch {}
  const main = el('div', { class: 'lx-main' },
    bannerImpersonacao(u),  // banner só aparece quando impersonando
    el('div', { class: 'lx-topbar' },
      el('div', {}, el('h1', {}, titulo), sub ? el('div', { class: 'sub' }, sub) : el('span', {})),
      el('span', { class: 'lx-role-pill' }, perfilRotulo(u.perfil))),
    el('div', { class: 'lx-content' }, conteudo));

  // A sidebar acabou de ser (re)criada; reaplica o tema do tenant (logo/nome/cores)
  // no próximo tick, quando este elemento já estiver na DOM.
  setTimeout(reaplicarTema, 0);
  return el('div', { class: 'lx-app' }, side, main);
}

// Reconstrói a barra lateral que já está na tela. Chamado quando o conjunto de módulos
// da empresa muda (aquisição/cancelamento): sem isso o item novo só aparecia depois de
// recarregar a página, e o cliente pagava sem ver o módulo.
export function atualizarMenu() {
  const antiga = document.querySelector('.lx-app > .lx-side');
  if (!antiga) return;
  antiga.replaceWith(construirSidebar(auth.usuarioAtual() || {}));
  setTimeout(reaplicarTema, 0);
}
