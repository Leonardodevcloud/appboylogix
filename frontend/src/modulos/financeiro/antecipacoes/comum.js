// Peças comuns da tela de Antecipações: formatação, selos de situação, ícones de traço
// e o modal. Sem regra de negócio — quem decide é o servidor.
import { el } from '../../../core/ui.js';
export { toast } from '../util.js';

// R$ com separador de milhar ("R$ 1.070,00") — valores de fila e de período passam de mil.
export const reais = (cent) => 'R$ ' + (Number(cent || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ENTRADA = 'font:inherit;font-size:13px;color:var(--lx-tinta);background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);padding:9px 11px;width:100%;box-sizing:border-box';

// "1.234,56" / "1234,56" / "R$ 10" → centavos.
export const centavos = (t) => {
  const n = Math.round(Number(String(t ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) * 100);
  return Number.isFinite(n) ? n : 0;
};
export const paraCampo = (c) => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
export const iniciais = (n) => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const minutosDesde = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
export const hojeISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bahia' });
export const inicioMesISO = () => hojeISO().slice(0, 8) + '01';

export function dataHora(iso, { segundos = false } = {}) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' }) + ' '
    + d.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', ...(segundos ? { second: '2-digit' } : {}) });
}
export function duracao(min) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

const ROTULO_PIX = { cpf: 'CPF', cnpj: 'CNPJ', telefone: 'Cel.', email: 'E-mail', aleatoria: 'Aleatória' };
export const chavePix = (tipo, chave) => (chave ? `${ROTULO_PIX[tipo] || 'Chave'} ${chave}` : '—');

// Ícones de traço (regra 18: nada de emoji no painel).
const SVG = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  copiar: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  busca: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
  alerta: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  atualizar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  carta: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  escudo: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
};
export function icone(nome, tam = 15) {
  return el('span', {
    'aria-hidden': 'true', style: 'display:inline-flex;flex:none',
    html: `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG[nome] || ''}</svg>`,
  });
}

const CORES = {
  ok: 'background:var(--lx-ok-bg);color:var(--lx-ok)',
  at: 'background:var(--lx-atencao-bg);color:var(--lx-atencao)',
  er: 'background:var(--lx-erro-bg);color:var(--lx-erro)',
  in: 'background:var(--lx-info-bg);color:var(--lx-info)',
  '': 'background:var(--lx-superficie-2);color:var(--lx-tinta-2)',
};
export function tag(texto, tipo, titulo) {
  return el('span', { ...(titulo ? { title: titulo } : {}), style: `display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap;${CORES[tipo] || CORES['']}` }, texto);
}

// Situação do pedido em palavras de operador.
export const SITUACAO = {
  aguardando: { rotulo: 'Aguardando', tipo: 'at' },
  processando: { rotulo: 'Pagando', tipo: 'in' },
  paga: { rotulo: 'Paga', tipo: 'ok' },
  recusada: { rotulo: 'Recusada', tipo: 'er' },
  devolvida: { rotulo: 'Devolvida pelo banco', tipo: 'er' },
  estornada: { rotulo: 'Estornada', tipo: '' },
  cancelada: { rotulo: 'Cancelada pelo profissional', tipo: '' },
};
export function seloSituacao(l, slaMin) {
  const s = SITUACAO[l.status] || { rotulo: l.status, tipo: '' };
  if (l.status === 'aguardando') {
    const min = minutosDesde(l.criado_em);
    const atrasado = l.atrasado || (slaMin && min > slaMin);
    return tag(`${atrasado ? 'Atrasado' : 'Aguardando'} · ${duracao(min)}`, atrasado ? 'er' : 'at');
  }
  if (l.status === 'processando') return tag(l.aguardando_codigo ? 'Pagando · aguarda código' : 'Pagando · no banco', 'in');
  return tag(s.rotulo, s.tipo);
}

export const CARD = 'background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio)';
export const ROTULO = 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);text-transform:uppercase;letter-spacing:.05em';

export function botao(texto, { tipo = 'sec', ico = null, onClick, titulo, estilo = '' } = {}) {
  const base = tipo === 'pri' ? 'lx-btn lx-btn-primario' : 'lx-btn lx-btn-secundario';
  const cor = tipo === 'ok' ? 'background:var(--lx-ok);border-color:var(--lx-ok);color:#fff;' : tipo === 'perigo' ? 'color:var(--lx-erro);' : '';
  return el('button', { type: 'button', class: tipo === 'ok' ? 'lx-btn lx-btn-primario' : base, style: `display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;${cor}${estilo}`, ...(titulo ? { title: titulo } : {}), onClick }, ico ? icone(ico) : '', texto);
}

// Modal centralizado. Fecha no X, no Esc e clicando fora; devolve o foco a quem abriu.
// `aoFechar` roda em qualquer fechamento (X, Esc, clique fora ou pelo código).
export function modal(titulo, sub, corpo, rodape, { largura = 560, aoFechar = null } = {}) {
  const antes = document.activeElement;
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.5);z-index:2600;display:grid;place-items:center;padding:20px;overflow:auto' });
  let aberto = true;
  const fechar = () => {
    if (!aberto) return;
    aberto = false;
    ov.remove(); document.removeEventListener('keydown', esc); try { antes && antes.focus(); } catch { /* sem foco */ }
    if (aoFechar) aoFechar();
  };
  const esc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
  const caixa = el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo, style: `${CARD};width:100%;max-width:${largura}px;box-shadow:var(--lx-sombra-lg);overflow:hidden` },
    el('div', { style: 'padding:18px 20px;border-bottom:1px solid var(--lx-linha)' },
      el('div', { style: 'font-size:16px;font-weight:800' }, titulo),
      sub ? el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-top:4px' }, sub) : ''),
    corpo,
    rodape ? el('div', { style: 'padding:14px 20px;border-top:1px solid var(--lx-linha);display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap' }, rodape) : '');
  ov.append(caixa);
  document.body.append(ov);
  const foco = caixa.querySelector('input,button'); if (foco) setTimeout(() => foco.focus(), 30);
  return { fechar, caixa };
}

export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}
