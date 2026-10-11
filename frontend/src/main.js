// Bootstrap da aplicação: tema, sessão, rotas.
import * as api from './core/api.js';
import * as auth from './core/auth.js';
import { rotaPermitida, atualizarMenu } from './core/layout.js';
import * as router from './core/router.js';
import { carregarTema, aplicarTema } from './core/tema.js';

const BASE = window.LOGIX_API || '/api/v1';

// Tema padrão Logix — aplicado para super_admin e tela de login
const TEMA_PADRAO = {
  cor_primaria:   '#185FA5',
  cor_secundaria: '#042C53',
  cor_destaque:   '#378ADD',
  cor_clara:      '#B5D4F4',
  nome_exibicao:  'logix',
};

function restaurarTemaPadrao() {
  aplicarTema(TEMA_PADRAO);
  document.title = 'logix';
}

// Tela de "carregando" instantânea (overlay). Evita a tela branca enquanto a
// sessão é restaurada — importante quando o backend está "frio" (cold start).
function mostrarCarregando() {
  if (document.getElementById('lx-boot')) return;
  const ov = document.createElement('div');
  ov.id = 'lx-boot';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:var(--lx-fundo,#eef4fb)';
  ov.innerHTML =
    '<div style="width:48px;height:48px;border-radius:13px;background:var(--lx-azul-primario,#185FA5);color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px;box-shadow:0 8px 24px -8px rgba(4,44,83,.4)">LX</div>' +
    '<div style="width:26px;height:26px;border:3px solid #cddcec;border-top-color:var(--lx-azul-primario,#185FA5);border-radius:50%;animation:lxspin .8s linear infinite"></div>' +
    '<style>@keyframes lxspin{to{transform:rotate(360deg)}}</style>';
  document.body.append(ov);
}
function esconderCarregando() {
  const ov = document.getElementById('lx-boot');
  if (!ov) return;
  ov.style.transition = 'opacity .2s ease';
  ov.style.opacity = '0';
  setTimeout(() => ov.remove(), 220);
}

// Resolve a marca pelo domínio atual (ex.: painel.ig-express.com → IG).
// Em domínios sem cliente (logix-ochre.vercel.app) cai no tema padrão.
async function aplicarTemaDoHost() {
  try {
    const resp = await fetch(`${BASE}/branding?host=${encodeURIComponent(window.location.hostname)}`);
    const temaHost = await resp.json();
    if (temaHost && temaHost.empresa_id) { aplicarTema(temaHost); return true; }
  } catch { /* ignora */ }
  restaurarTemaPadrao();
  return false;
}

async function aplicarTemaDoUsuario() {
  const u = auth.usuarioAtual();
  if (!u) { restaurarTemaPadrao(); return; }

  // Super admin vê sempre o tema padrão Logix (exceto quando impersonando)
  if (u.perfil === 'super_admin' && !auth.estaImpersonando()) {
    restaurarTemaPadrao();
    return;
  }

  // Cliente ou impersonação: carrega o branding do tenant com o token atual
  try {
    const token = api.getToken();
    if (token) await carregarTema({ base: BASE, token });
  } catch { /* silencioso */ }
}

async function boot() {
  const app = document.getElementById('app');
  if (window.LOGIX_API) api.setBase(window.LOGIX_API);
  router.definirSaida(app);

  // Tema padrão na hora + tela de "carregando" (acaba com a tela branca no cold start).
  restaurarTemaPadrao();
  mostrarCarregando();
  // Branding do domínio em segundo plano — NÃO trava o primeiro render.
  aplicarTemaDoHost();

  router.rota('/login',                () => import('./modulos/login.js'));
  router.rota('/redefinir-senha',      () => import('./modulos/redefinir-senha.js'));   // link do e-mail (sem login)
  router.rota('/',                     () => import('./modulos/dashboard.js'));
  router.rota('/acompanhamento',       () => import('./modulos/acompanhamento.js'));
  router.rota('/acompanhamento-loja',  () => import('./modulos/acompanhamento-loja.js'));
  router.rota('/clientes',             () => import('./modulos/clientes.js'));
  router.rota('/clientes/:id/modulos', () => import('./modulos/cliente-modulos.js'));
  router.rota('/lojas',                () => import('./modulos/lojas.js'));
  router.rota('/entregas',             () => import('./modulos/entregas.js'));
  router.rota('/relatorios',           () => import('./modulos/relatorios.js'));
  router.rota('/bi',                   () => import('./modulos/bi/index.js'));
  router.rota('/rotas',                () => import('./modulos/rotas.js'));
  router.rota('/motoboys',             () => import('./modulos/motoboys.js'));
  router.rota('/gamificacao',          () => import('./modulos/gamificacao.js'));
  router.rota('/chat',                 () => import('./modulos/chat.js'));
  router.rota('/modulos',              () => import('./modulos/modulos.js'));
  router.rota('/rastreio',             () => import('./modulos/rastreio.js'));
  router.rota('/mapa',                 () => import('./modulos/mapa.js'));
  router.rota('/financeiro',           () => import('./modulos/financeiro.js'));
  // Uma rota por área do Financeiro (submenu, como Entregadores). A tela é a mesma —
  // ela lê a rota para saber qual área abrir.
  router.rota('/financeiro/cliente',    () => import('./modulos/financeiro.js'));
  router.rota('/financeiro/saldo',      () => import('./modulos/financeiro.js'));
  router.rota('/financeiro/fechamento', () => import('./modulos/financeiro.js'));
  router.rota('/financeiro/antecipacoes', () => import('./modulos/financeiro.js'));
  router.rota('/financeiro/pagamento-config', () => import('./modulos/financeiro.js'));
  router.rota('/radar',                () => import('./modulos/radar.js'));
  router.rota('/marca',                () => import('./modulos/branding.js'));
  router.rota('/custos-api',           () => import('./modulos/custos-api.js'));  // estava no menu mas sem rota registrada
  router.rota('/saude',                () => import('./modulos/saude.js'));
  router.rota('/integracoes',          () => import('./modulos/integracoes.js'));
  router.rota('/seguro-iza',           () => import('./modulos/seguro-iza.js'));
  router.rota('/equipe',               () => import('./modulos/equipe.js'));
  router.rota('/auditoria',            () => import('./modulos/auditoria.js'));
  router.rota('/faturamento',          () => import('./modulos/faturamento.js'));
  router.rota('/plano',                () => import('./modulos/plano.js'));
  router.rota('/catalogo-comercial',   () => import('./modulos/catalogo-comercial.js'));
  router.rota('/configuracoes',        () => import('./modulos/configuracoes.js'));

  router.definirGuarda((caminho) => {
    const base = caminho.split('?')[0];
    // Telas sem login: entrar e criar nova senha pelo link do e-mail.
    if (base === '/redefinir-senha') return null;
    if (base !== '/login' && !auth.estaLogado()) return '/login';
    if (base === '/login' && auth.estaLogado()) return '/';
    // Autorização de rota no cliente (S7): só o que está no menu do perfil/permissões abre.
    if (!rotaPermitida(caminho)) return '/';
    return null;
  });

  // Restaurar sessão (a guarda de rota precisa saber se está logado).
  let logado = false;
  try { logado = await auth.restaurar(); } catch { logado = false; }
  // Tema do usuário em segundo plano — não trava a tela.
  if (logado) aplicarTemaDoUsuario();

  router.iniciar();
  esconderCarregando();

  // Eventos de mudança de sessão
  document.addEventListener('logix:login',      () => aplicarTemaDoUsuario());
  document.addEventListener('logix:logout',     () => aplicarTemaDoHost());
  // Sessão expirada (refresh falhou): limpa e leva ao login SOZINHO, em vez de deixar
  // a tela travada disparando 401 em loop (antes precisava recarregar a página na mão).
  document.addEventListener('logix:sessao-expirada', async () => {
    try { await auth.logout(); } catch { /* ignora */ }
    aplicarTemaDoHost();
    if ((location.hash.slice(1) || '/') !== '/login') location.hash = '#/login';
  });
  // Ao entrar/sair de impersonação o PERFIL muda (master ↔ central), então o menu
  // precisa ser reconstruído — senão ficam visíveis telas de master durante a
  // impersonação (e um clique nelas toma 401). Recarrega no painel do novo contexto.
  document.addEventListener('logix:impersonar', () => { aplicarTemaDoUsuario(); location.hash = '#/'; setTimeout(() => location.reload(), 40); });
  document.addEventListener('logix:voltar',     () => { aplicarTemaDoHost();    location.hash = '#/'; setTimeout(() => location.reload(), 40); });

  // Aquisição ou cancelamento de módulo muda o que o usuário pode abrir. `recarregarAcesso`
  // já busca a lista nova em /permissoes/eu e dispara este evento — faltava alguém ouvir:
  // sem isto, o módulo comprado só aparecia no menu depois de recarregar a página.
  document.addEventListener('logix:acesso', () => { try { atualizarMenu(); } catch { /* menu ainda não montado */ } });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
