import { casca } from '../core/layout.js';
import { el } from '../core/ui.js';
import { get } from '../core/api.js';
import { reais, periodoPadrao, LS_PERIODO } from './financeiro/util.js';
import { abaCliente } from './financeiro/aba-cliente.js';
import { abaMotoboy } from './financeiro/aba-motoboy.js';
import { abaFechamentoAuto, abaFechamentos } from './financeiro/aba-fechamentos.js';
import { abaCategorias } from './financeiro/aba-categorias.js';
import { abaPagamentos } from './financeiro/aba-pagamentos.js';
import { abaAntecipacoes } from './financeiro/antecipacoes/index.js';
import { abaConfigPagamento } from './financeiro/aba-config-pagamento.js';
import * as auth from '../core/auth.js';

// Financeiro em TRÊS ÁREAS, navegadas pelo submenu da barra lateral (como Entregadores):
//   /financeiro/cliente     → o que a central recebe
//   /financeiro/saldo       → quanto cada profissional tem a receber (saldo, categorias)
//   /financeiro/fechamento  → acerto e pagamento (fechamentos, automático, pagamentos)
//   /financeiro/pagamento-config → banco, aprovadores, limites e histórico (ADR-036)
// Dentro de cada área, as telas ficam em abas. Abas e utilitários em ./financeiro/.


export async function montar(container) {
  // Vindo de outra área por um atalho (ex.: Fechamentos → Pagamentos), a tela reabre
  // já na aba certa. Consome e limpa: é dica de uma navegação, não estado guardado.
  const _abaPedida = sessionStorage.getItem('lx_fin_aba');
  sessionStorage.removeItem('lx_fin_aba');
  let _aba = _abaPedida || 'cliente';
  const periodo = periodoPadrao();

  // ── Barra de período ────────────────────────────────────────────
  const inpDe = el('input', { class: 'lx-input', type: 'date', value: periodo.de, style: 'width:160px' });
  const inpAte = el('input', { class: 'lx-input', type: 'date', value: periodo.ate, style: 'width:160px' });
  const btnAplicar = el('button', { class: 'lx-btn lx-btn-primario', style: 'font-size:13px', onClick: aplicar }, 'Aplicar');

  const atalho = (rotulo, calc) => el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12.5px;padding:7px 12px', onClick: () => { const [d, a] = calc(); inpDe.value = d; inpAte.value = a; aplicar(); } }, rotulo);
  const fmt = d => d.toISOString().slice(0, 10);
  const hoje = () => new Date();
  const atalhos = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
    atalho('Hoje', () => { const d = fmt(hoje()); return [d, d]; }),
    atalho('7 dias', () => { const a = hoje(); const d = new Date(a); d.setDate(d.getDate() - 6); return [fmt(d), fmt(a)]; }),
    atalho('Este mês', () => { const a = hoje(); return [fmt(new Date(a.getFullYear(), a.getMonth(), 1)), fmt(a)]; }),
    atalho('Mês passado', () => { const a = hoje(); const ini = new Date(a.getFullYear(), a.getMonth() - 1, 1); const fim = new Date(a.getFullYear(), a.getMonth(), 0); return [fmt(ini), fmt(fim)]; }));

  const barraPeriodo = el('div', { style: 'display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;padding:16px;background:var(--lx-superficie-2);border-radius:var(--lx-raio-lg);margin-bottom:16px' },
    el('div', { class: 'lx-field' }, el('label', {}, 'De'), inpDe),
    el('div', { class: 'lx-field' }, el('label', {}, 'Até'), inpAte),
    btnAplicar,
    el('div', { style: 'flex:1' }),
    atalhos);

  // ── Navegação em duas camadas ───────────────────────────────────
  // Cinco abas soltas viraram três ÁREAS, cada uma com suas telas. O critério é o
  // assunto, não a tabela: quem entra para ver saldo não quer tropeçar em fechamento,
  // e quem vai pagar quer fechamento, automático e pagamento no mesmo lugar.
  const AREAS = [
    { id: 'cliente', rotulo: 'Faturamento cliente', desc: 'o que a central recebe',
      telas: [{ id: 'cliente', rotulo: 'Faturamento' }] },
    { id: 'saldo', rotulo: 'Saldo dos profissionais', desc: 'quanto cada um tem a receber',
      telas: [{ id: 'motoboy', rotulo: 'Saldo' }, { id: 'categorias', rotulo: 'Categorias' }] },
    { id: 'fech', rotulo: 'Fechamento do profissional', desc: 'acerto e pagamento',
      telas: [{ id: 'fechamentos', rotulo: 'Fechamentos' }, { id: 'auto', rotulo: 'Fechamento automático' }] },
    { id: 'antec', rotulo: 'Antecipações', desc: 'saque pedido pelo profissional',
      telas: [{ id: 'antecipacoes', rotulo: 'Solicitações' }] },
  ];
  // Pagamentos só aparece para quem tem o módulo contratado E a permissão de pagar —
  // não adianta mostrar uma tela que responde 403 ao abrir. Idem a configuração dele.
  if (auth.temModulo('financeiro.pagamento_automatico') && auth.pode('financeiro.pagar')) {
    AREAS[2].telas.push({ id: 'pagamentos', rotulo: 'Pagamentos' });
    AREAS.push({ id: 'cfgpag', rotulo: 'Configurações de pagamento', desc: 'banco, aprovadores e limites',
      telas: [{ id: 'configpag', rotulo: 'Configurações' }] });
  }

  const areaDe = (tela) => (AREAS.find((a) => a.telas.some((t) => t.id === tela)) || AREAS[0]);

  // A área vem da ROTA — o submenu da barra lateral é quem navega entre elas, como em
  // Entregadores. Dentro da área, as telas continuam em abas.
  const porRota = { '/financeiro/cliente': 'cliente', '/financeiro/saldo': 'saldo', '/financeiro/fechamento': 'fech', '/financeiro/antecipacoes': 'antec', '/financeiro/pagamento-config': 'cfgpag' };
  const rota = (location.hash.slice(1) || '/financeiro').split('?')[0];
  let _area = porRota[rota] || areaDe(_aba).id;
  {
    const def = AREAS.find((a) => a.id === _area) || AREAS[0];
    if (!def.telas.some((t) => t.id === _aba)) _aba = def.telas[0].id;
  }

  const nav2 = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:18px;flex-wrap:wrap' });
  const nav = el('div', {}, nav2);
  const painel = el('div', {});

  function renderNav() {
    const def = AREAS.find((a) => a.id === _area) || AREAS[0];
    if (!def.telas.some((t) => t.id === _aba)) _aba = def.telas[0].id;

    // Configurações não dependem do período: sem a barra de datas e os números do topo.
    const semPeriodo = _area === 'cfgpag';
    barraPeriodo.style.display = semPeriodo ? 'none' : 'flex';
    kpiBar.style.display = semPeriodo ? 'none' : 'grid';

    // Só a segunda camada vive na página. Área com uma tela só não mostra aba nenhuma.
    nav2.innerHTML = '';
    nav2.style.display = def.telas.length > 1 ? '' : 'none';
    for (const t of def.telas) {
      const on = t.id === _aba;
      nav2.append(el('button', {
        style: `background:none;border:none;padding:11px 15px;font-size:13px;font-weight:700;cursor:pointer;border-bottom:2px solid ${on ? 'var(--lx-azul-primario)' : 'transparent'};color:${on ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'};margin-bottom:-1px`,
        onClick: () => { _aba = t.id; renderNav(); render(); },
      }, t.rotulo));
    }
  }

  // Usado pelas telas para navegar entre áreas levando contexto (ex.: da tela de
  // Fechamentos para Pagamentos, com os fechamentos já selecionados).
  function irPara(tela, contexto) {
    _contexto = contexto || null;
    const destino = areaDe(tela).id;
    _aba = tela;
    if (destino !== _area) {
      // Outra área = outra rota. Guarda o destino para a tela reabrir já na aba certa.
      _area = destino;
      sessionStorage.setItem('lx_fin_aba', tela);
      const caminho = Object.keys(porRota).find((k) => porRota[k] === destino);
      if (caminho) { location.hash = '#' + caminho; return; }
    }
    renderNav(); render();
  }
  let _contexto = null;

  function aplicar() {
    periodo.de = inpDe.value; periodo.ate = inpAte.value;
    localStorage.setItem(LS_PERIODO, JSON.stringify(periodo));
    render();
    carregarKpis();
  }
  function render() {
    painel.innerHTML = '';
    if (_aba === 'cliente') painel.append(abaCliente(periodo));
    else if (_aba === 'motoboy') painel.append(abaMotoboy(periodo));
    else if (_aba === 'fechamentos') painel.append(abaFechamentos(periodo, irPara));
    else if (_aba === 'auto') painel.append(abaFechamentoAuto());
    else if (_aba === 'pagamentos') painel.append(abaPagamentos(periodo, _contexto));
    else if (_aba === 'antecipacoes') painel.append(abaAntecipacoes());
    else if (_aba === 'configpag') painel.append(abaConfigPagamento());
    else painel.append(abaCategorias());
  }

  const kpiBar = el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px' });
  async function carregarKpis() {
    try {
      const r = await get(`/financeiro/resumo?de=${periodo.de}&ate=${periodo.ate}`);
      const cards = [
        { v: reais(r.faturado_cliente_cent), l: 'Faturado (clientes) no período' },
        { v: reais(r.a_repassar_cent), l: 'A repassar (motoboys)' },
        { v: reais(r.pago_cent), l: 'Já pago (fechamentos)' },
        { v: (r.motoboys_com_saldo || 0) + ' / ' + (r.motoboys_total || 0), l: 'Motoboys com saldo aberto' },
      ];
      kpiBar.innerHTML = '';
      cards.forEach(c => kpiBar.append(el('div', { class: 'lx-card', style: 'padding:13px 15px' },
        el('div', { style: 'font-size:21px;font-weight:900;color:var(--lx-navy,#042C53)' }, c.v),
        el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);font-weight:600;margin-top:2px' }, c.l))));
    } catch (e) {}
  }
  const conteudo = el('div', {}, barraPeriodo, kpiBar, nav, painel);
  container.append(casca('Financeiro', conteudo, 'Faturamento de clientes e motoboys — corridas concluídas no período.'));
  renderNav();
  render();
  carregarKpis();
}
