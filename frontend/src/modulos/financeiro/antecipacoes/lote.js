// "Pagar selecionados": um lote só no banco e UMA aprovação (ADR-033/036).
//
// Antes de confirmar, a tela diz se vai pedir código (regra da conta) — a surpresa do
// e-mail chegando sem aviso é o que faz o operador clicar duas vezes. Depois: quem
// passou, quem ficou de fora e por quê; e, se a conta pediu código, o campo para ele.
import { el, esc } from '../../../core/ui.js';
import { get, post } from '../../../core/api.js';
import { reais, toast, chavePix, botao, modal } from './comum.js';
import { abrirAprovacao } from '../aprovacao.js';

const linhaItem = (l) => el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 20px;border-top:1px solid var(--lx-linha);font-size:13px' },
  el('div', { style: 'min-width:0' }, el('b', {}, esc(l.nome)),
    el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);font-family:ui-monospace,monospace' }, esc(chavePix(l.pix_tipo, l.pix_chave)))),
  el('div', { style: 'text-align:right' }, el('b', {}, reais(l.recebe_cent)),
    el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2)' }, l.gratuidade ? 'sem taxa · vale' : (l.abatido_no_pedido ? 'já saiu ' : 'abate ') + reais(l.valor_cent))));

export async function abrirPagarVarios(linhas, aoConcluir) {
  if (!linhas.length) return;
  const pagar = linhas.reduce((s, l) => s + l.recebe_cent, 0);
  // Pedido novo já saiu do saldo no pedido (ADR-034): só o antigo ainda vai abater.
  const saldo = linhas.reduce((s, l) => s + (l.abatido_no_pedido ? 0 : l.valor_cent), 0);

  // A regra de aprovação vem da conta; sem acesso a ela, a tela só não antecipa o aviso.
  let conta = null;
  try { conta = await get('/pagamentos/conta'); } catch { conta = null; }
  const pedeCodigo = conta && (conta.aprovacao === 'sempre' || pagar > Number(conta.teto_lote_cent || Infinity));

  const corpo = el('div', {},
    el('div', { style: 'max-height:300px;overflow:auto' }, ...linhas.map(linhaItem)),
    el('div', { style: 'display:flex;justify-content:space-between;padding:11px 20px;border-top:1px solid var(--lx-linha);background:var(--lx-superficie-2);font-size:13px' }, el('b', {}, 'Total do Pix'), el('b', { style: 'font-size:16px;color:var(--lx-ok)' }, reais(pagar))),
    el('div', { style: 'display:flex;justify-content:space-between;padding:11px 20px;border-top:1px solid var(--lx-linha);background:var(--lx-superficie-2);font-size:13px' }, el('span', { style: 'color:var(--lx-tinta-2)' }, 'Ainda sai dos saldos'), el('b', {}, reais(saldo))),
    el('div', { style: 'padding:16px 20px;border-top:1px solid var(--lx-linha);display:flex;flex-direction:column;gap:10px' },
      pedeCodigo ? el('div', { style: 'background:var(--lx-info-bg);color:var(--lx-info);border-radius:var(--lx-raio-sm);padding:11px 12px;font-size:12.5px;line-height:1.5' },
        'A conta exige aprovação para este lote: o código vai por e-mail ao aprovador, que confirma com a senha dele. Os pedidos ficam em "Pagando" até a aprovação.') : '',
      el('div', { style: 'background:var(--lx-atencao-bg);color:var(--lx-atencao);border-radius:var(--lx-raio-sm);padding:11px 12px;font-size:12.5px;line-height:1.5' },
        'O sistema confere o saldo de cada um de novo. Quem não passar fica de fora, volta para a fila com o motivo e não trava os outros.')));

  const confirmar = botao(pedeCodigo ? 'Confirmar e pedir aprovação' : `Pagar ${reais(pagar)}`, { tipo: 'ok', onClick: async () => {
    confirmar.disabled = true; confirmar.textContent = 'Enviando…';
    let r;
    try { r = await post('/antecipacoes/pagar-varios', { ids: linhas.map((l) => l.id) }); }
    catch (e) { confirmar.disabled = false; confirmar.textContent = 'Tentar de novo'; toast(e.message, 'erro'); return; }
    m.fechar();
    if (aoConcluir) aoConcluir();
    resultado(r, aoConcluir);
  } });
  const m = modal(`Pagar ${linhas.length} antecipaç${linhas.length === 1 ? 'ão' : 'ões'}`, 'Um lote só no banco — e um código só para aprovar.', corpo,
    [botao('Voltar', { onClick: () => m.fechar() }), confirmar]);
}

// Depois do envio: o que aconteceu com cada um, e o código se a conta pediu.
function resultado(r, aoConcluir) {
  const falhas = r.falhas || [];
  const partes = [];
  if (r.pagas) partes.push(`${r.pagas} paga${r.pagas > 1 ? 's' : ''}`);
  if (r.processando) partes.push(`${r.processando} aguardando ${r.aprovacao ? 'o código' : 'o banco'}`);
  if (falhas.length) partes.push(`${falhas.length} de fora`);

  const corpo = el('div', { style: 'padding:16px 20px;display:flex;flex-direction:column;gap:12px' },
    el('div', { style: 'font-size:13.5px;font-weight:700' }, partes.join(' · ') || 'Nada foi enviado.'));
  if (falhas.length) {
    corpo.append(el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm)' },
      ...falhas.map((f) => el('div', { style: 'padding:9px 12px;border-bottom:1px solid var(--lx-linha);font-size:12.5px' }, el('b', {}, esc(f.nome || '')), ' — ', el('span', { style: 'color:var(--lx-erro)' }, esc(f.motivo))))));
  }

  const acoes = [];
  if (r.aprovacao && r.lote_id) {
    corpo.append(el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);line-height:1.5' },
      `Lote ${r.referencia}: falta a aprovação (código por e-mail + senha do aprovador).`));
    acoes.push(botao('Aprovar depois', { onClick: () => m.fechar() }), botao('Aprovar agora', { tipo: 'pri', onClick: () => {
      m.fechar();
      abrirAprovacao({ loteId: r.lote_id, envio: r.aprovacao, titulo: `Aprovar lote ${r.referencia}`, aoAprovar: () => { if (aoConcluir) aoConcluir(); } });
    } }));
  } else {
    acoes.push(botao('Fechar', { tipo: 'pri', onClick: () => m.fechar() }));
  }
  const m = modal(r.aprovacao ? 'Falta a aprovação' : 'Lote enviado', null, corpo, acoes, { largura: 520 });
}
