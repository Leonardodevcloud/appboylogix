// Financeiro › Pagamentos: montagem do lote, aprovação (código + senha do aprovador,
// ADR-036) e acompanhamento item a item. Conta, aprovadores e limites ficam em
// Configurações de pagamento (aba-config-pagamento.js).
//
// A tela é deliberadamente chata no lugar certo: nada sai daqui sem passar por uma
// conferência visível e por um código que chega em outra pessoa. Duas decisões de
// produto que estão no código:
//   · entregador com pendência SAI do lote, não trava o lote;
//   · o saldo da conta aparece ao lado do total, porque descobrir que faltou dinheiro
//     depois de mandar é péssimo.
import { el, esc } from '../../core/ui.js';
import { get, post } from '../../core/api.js';
import { reais, dataBR, toast } from './util.js';
import { abrirAprovacao } from './aprovacao.js';

export const ENTRADA = 'font-size:13px;color:var(--lx-tinta);background:var(--lx-superficie);border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);padding:9px 11px;width:100%';
export const centavos = (texto) => Math.round(Number(String(texto).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) * 100);
const ini = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function tag(texto, tipo) {
  const cores = {
    ok: 'background:var(--lx-ok-bg);color:var(--lx-ok)',
    at: 'background:var(--lx-atencao-bg);color:var(--lx-atencao)',
    er: 'background:var(--lx-erro-bg);color:var(--lx-erro)',
    in: 'background:var(--lx-azul-50);color:var(--lx-azul-primario)',
    '': 'background:var(--lx-superficie-2);color:var(--lx-tinta-2)',
  };
  return el('span', { style: `font-size:11px;font-weight:700;padding:4px 11px;border-radius:999px;white-space:nowrap;${cores[tipo] || cores['']}` }, texto);
}

export function campo(rotulo, node, nota) {
  return el('div', { style: 'min-width:0' },
    el('label', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2);display:block;margin-bottom:6px' }, rotulo),
    node,
    nota ? el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);line-height:1.5;margin-top:6px' }, nota) : '');
}

export function bloco(titulo, direita, ...conteudo) {
  return el('div', { class: 'lx-card', style: 'margin-bottom:16px' },
    el('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      el('b', { style: 'font-size:14px;font-weight:800' }, titulo), direita || el('span', {})),
    el('div', { style: 'padding:16px' }, ...conteudo));
}

function kpi(rotulo, valor, nota, cor) {
  return el('div', { class: 'lx-card', style: `padding:15px 17px;min-width:0;border-left:3px solid ${cor || 'var(--lx-azul-vivo)'}` },
    el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2)' }, rotulo),
    el('div', { style: `font-size:25px;font-weight:800;line-height:1.15;margin-top:7px;letter-spacing:-.02em${cor ? ';color:' + cor : ''}` }, valor),
    el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);font-weight:600;margin-top:4px' }, nota || ''));
}

const grade = (...f) => el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:16px;max-width:100%' }, ...f);
const th = (t, dir) => el('th', { style: `text-align:${dir || 'left'};font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--lx-tinta-3);font-weight:700;padding:0 12px 10px;white-space:nowrap` }, t);
const td = (c, dir, fundo) => el('td', { style: `padding:11px 12px;border-top:1px solid var(--lx-linha);font-size:13px;text-align:${dir || 'left'}${fundo ? ';background:' + fundo : ''}` }, c);

// ── Novo lote ───────────────────────────────────────────────────────────────
function secaoNovoLote({ periodo, cfg, fechamentoIds, aoCriar }) {
  const area = el('div', {});
  const inpMinimo = el('input', { type: 'text', style: ENTRADA, value: '20,00' });
  const btnPrevia = el('button', { class: 'lx-btn lx-btn-secundario' }, 'Recalcular');
  const marcados = new Set();

  async function carregar() {
    area.innerHTML = '';
    area.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px' }, 'Calculando…'));
    let p; let saldo = null;
    try {
      p = fechamentoIds
        ? { itens: (await post('/pagamentos/previa-fechamentos', { fechamento_ids: fechamentoIds })).linhas || [], total_cent: 0, quantidade: 0, fora: 0 }
        : await get(`/pagamentos/previa?de=${periodo.de}&ate=${periodo.ate}&minimo_cent=${centavos(inpMinimo.value) || 0}`);
      if (fechamentoIds) {
        const ok = p.itens.filter((i) => i.elegivel);
        p.quantidade = ok.length;
        p.total_cent = ok.reduce((sm, i) => sm + i.valor_cent, 0);
        p.fora = p.itens.length - ok.length;
      }
    } catch (e) { area.innerHTML = ''; area.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-erro)' }, e.message)); return; }
    // O saldo é informativo: se o banco não responder, o lote continua possível.
    try { saldo = (await get('/pagamentos/saldo')).saldo_cent; } catch { saldo = null; }

    marcados.clear();
    for (const i of p.itens) if (i.elegivel) marcados.add(i.motoboy_id);

    const totalSel = () => p.itens.filter((i) => marcados.has(i.motoboy_id)).reduce((s, i) => s + i.valor_cent, 0);
    const rotuloTotal = el('div', { style: 'font-size:25px;font-weight:800;color:var(--lx-ok);line-height:1.15;margin-top:7px' }, reais(p.total_cent));
    const btnEnviar = el('button', { class: 'lx-btn lx-btn-primario' }, 'Enviar para aprovação');
    btnEnviar.disabled = !p.quantidade;
    btnEnviar.onclick = async () => {
      btnEnviar.disabled = true;
      try {
        const lote = fechamentoIds
          ? await post('/pagamentos/lotes', { fechamento_ids: fechamentoIds })
          : await post('/pagamentos/lotes', {
            de: periodo.de, ate: periodo.ate,
            minimo_cent: centavos(inpMinimo.value) || 0,
            motoboy_ids: [...marcados],
          });
        aoCriar(lote.id);
      } catch (e) { btnEnviar.disabled = false; toast(e.message, 'erro'); }
    };

    const corpo = el('tbody', {});
    for (const i of p.itens) {
      const cx = el('input', { type: 'checkbox', style: 'width:auto', ...(i.elegivel ? { checked: '' } : { disabled: '' }) });
      cx.addEventListener('change', () => {
        if (cx.checked) marcados.add(i.motoboy_id); else marcados.delete(i.motoboy_id);
        rotuloTotal.textContent = reais(totalSel());
      });
      const fundo = i.elegivel ? null : 'rgba(201,138,26,.07)';
      corpo.append(el('tr', {},
        td(cx, 'left', fundo),
        td(el('span', {}, el('span', {
          style: 'width:26px;height:26px;border-radius:50%;background:var(--lx-azul-50);color:var(--lx-azul-primario);display:inline-grid;place-items:center;font-size:10.5px;font-weight:800;margin-right:8px;vertical-align:middle',
        }, ini(i.nome)), esc(i.nome)), 'left', fundo),
        td(String(i.qtd_corridas || 0), 'right', fundo),
        td(el('b', {}, reais(i.valor_cent)), 'right', fundo),
        td(el('span', { class: 'lx-muted', style: 'font-family:ui-monospace,monospace;font-size:11.5px' }, i.pix_chave ? esc(i.pix_chave) : '—'), 'left', fundo),
        td(i.elegivel ? tag('pronto', 'ok') : tag(i.motivo, 'at'), 'left', fundo)));
    }

    area.innerHTML = '';
    area.append(
      grade(
        kpi('Entregadores', String(p.quantidade), p.fora ? `${p.fora} fora do lote` : 'todos elegíveis'),
        el('div', { class: 'lx-card', style: 'padding:15px 17px;min-width:0;border-left:3px solid var(--lx-ok)' },
          el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2)' }, 'Total a pagar'),
          rotuloTotal,
          el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);font-weight:600;margin-top:4px' }, p.quantidade ? 'média ' + reais(Math.round(p.total_cent / p.quantidade)) : '—')),
        kpi('Saldo na conta', saldo == null ? '—' : reais(saldo), saldo == null ? 'não foi possível consultar' : 'consultado agora', 'var(--lx-roxo,#6B4FC9)'),
        kpi('Teto por lote', reais(cfg.teto_lote_cent), 'limite do sistema', 'var(--lx-atencao)')),

      p.fora ? el('div', { style: 'background:var(--lx-atencao-bg);border:1px solid #e8d3a2;color:#7A5410;border-radius:var(--lx-raio-sm);padding:11px 14px;font-size:12.5px;line-height:1.55;margin-bottom:16px' },
        `${p.fora} entregador(es) ficam de fora por pendência no cadastro ou por ultrapassar o teto. Eles não bloqueiam o lote — saem dele, e você resolve depois sem segurar o pagamento dos outros.`) : '',

      el('div', { class: 'lx-card' },
        el('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
          el('b', { style: 'font-size:14px' }, 'Conferência'),
          el('div', { style: 'display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap' },
            campo('Só acima de', inpMinimo), btnPrevia)),
        el('div', { style: 'overflow-x:auto;max-width:100%' },
          el('table', { style: 'width:100%;border-collapse:collapse' },
            el('thead', {}, el('tr', {}, th(''), th('Entregador'), th('Corridas', 'right'), th('A pagar', 'right'), th('Chave Pix'), th('Situação'))),
            corpo)),
        el('div', { style: 'padding:14px 16px;border-top:1px solid var(--lx-linha);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap' },
          el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'Nada é enviado ainda. O próximo passo congela o valor e pede o código e a senha do aprovador.'),
          btnEnviar)));
  }

  btnPrevia.onclick = carregar;
  carregar();
  return area;
}

// ── Avulso ──────────────────────────────────────────────────────────────────
// Fora do fechamento, mas NUNCA fora do saldo. O entregador é obrigatório porque a
// regra é não pagar acima do que ele tem em aberto — sem entregador não há saldo para
// conferir nem para abater. A chave ou o copia-e-cola são só o destino do dinheiro.
function secaoAvulso({ cfg, aoPagar, aoAguardarCodigo }) {
  const raiz = el('div', {});
  let escolhido = null;
  let conferido = null;

  const busca = el('input', { type: 'text', style: ENTRADA, placeholder: 'Digite o nome ou o código do entregador' });
  const lista = el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);max-height:190px;overflow-y:auto;margin-top:6px;display:none' });
  const escolhidoBox = el('div', {});
  const podeCola = !!(cfg.capacidades && cfg.capacidades.pix_qrcode);
  let modo = 'chave';
  const inpChave = el('input', { type: 'text', style: ENTRADA, placeholder: 'em branco usa a chave cadastrada dele' });
  const inpCola = el('textarea', { style: ENTRADA + ';min-height:84px;font-family:ui-monospace,monospace;font-size:11.5px', placeholder: '00020126580014BR.GOV.BCB.PIX...' });
  const campoChave = el('div', {});
  const campoCola = el('div', { style: 'display:none' });

  // O seletor só existe se o banco liberado aceitar copia e cola — o backend recusa de
  // qualquer forma, mas oferecer um caminho que sempre erra é pior que não oferecer.
  const seletorModo = podeCola ? el('div', { style: 'display:inline-flex;background:var(--lx-superficie-2);border-radius:999px;padding:3px;gap:3px;margin-bottom:14px' }) : '';
  if (podeCola) {
    for (const [id, rot] of [['chave', 'Chave Pix'], ['cola', 'Copia e cola']]) {
      seletorModo.append(el('button', {
        style: `border:0;font-family:inherit;font-size:12.5px;font-weight:700;padding:8px 16px;border-radius:999px;cursor:pointer;background:${modo === id ? 'var(--lx-azul-primario)' : 'transparent'};color:${modo === id ? '#fff' : 'var(--lx-tinta-2)'}`,
        onClick: (ev) => {
          modo = id; conferido = null; areaConfere.innerHTML = '';
          for (const b of seletorModo.children) {
            const on = b === ev.currentTarget;
            b.style.background = on ? 'var(--lx-azul-primario)' : 'transparent';
            b.style.color = on ? '#fff' : 'var(--lx-tinta-2)';
          }
          campoChave.style.display = id === 'chave' ? '' : 'none';
          campoCola.style.display = id === 'cola' ? '' : 'none';
        },
      }, rot));
    }
  }
  const inpValor = el('input', { type: 'text', style: ENTRADA, placeholder: '0,00' });
  const inpDesc = el('input', { type: 'text', style: ENTRADA, value: 'Pagamento avulso' });
  const areaConfere = el('div', {});

  function pintarEscolhido() {
    escolhidoBox.innerHTML = '';
    if (!escolhido) return;
    escolhidoBox.append(el('div', { class: 'lx-card', style: 'padding:13px 15px;margin-top:10px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center' },
      el('div', {},
        el('b', { style: 'font-size:13.5px' }, esc(escolhido.nome)),
        el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-3);margin-top:2px' },
          (escolhido.codigo != null ? 'código ' + esc(String(escolhido.codigo)) + ' · ' : '') +
          (escolhido.pix_chave ? 'chave ' + esc(escolhido.pix_chave) : 'sem chave cadastrada'))),
      el('div', { style: 'text-align:right' },
        el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2)' }, 'Saldo em aberto'),
        el('div', { style: `font-size:20px;font-weight:800;color:${escolhido.saldo_cent > 0 ? 'var(--lx-ok)' : 'var(--lx-erro)'}` }, reais(escolhido.saldo_cent)),
        el('div', { style: 'font-size:11px;color:var(--lx-tinta-3);font-weight:600' }, 'é o teto deste pagamento'))));
  }

  let temporizador = null;
  busca.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      const termo = busca.value.trim();
      if (termo.length < 2) { lista.style.display = 'none'; return; }
      let linhas = [];
      try { linhas = (await get('/pagamentos/entregadores?busca=' + encodeURIComponent(termo))).linhas || []; } catch { linhas = []; }
      lista.innerHTML = '';
      if (!linhas.length) {
        lista.append(el('div', { style: 'padding:12px;font-size:12.5px;color:var(--lx-tinta-3)' }, 'Nenhum entregador encontrado'));
      }
      for (const l of linhas) {
        const item = el('div', {
          style: 'padding:10px 12px;border-bottom:1px solid var(--lx-linha);cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center',
          onClick: () => { escolhido = l; conferido = null; areaConfere.innerHTML = ''; busca.value = l.nome; lista.style.display = 'none'; pintarEscolhido(); },
        },
        el('div', {}, el('b', { style: 'font-size:13px' }, esc(l.nome)),
          el('div', { style: 'font-size:11px;color:var(--lx-tinta-3)' }, l.codigo != null ? 'código ' + esc(String(l.codigo)) : '')),
        el('b', { style: `font-size:13px;color:${l.saldo_cent > 0 ? 'var(--lx-ok)' : 'var(--lx-tinta-3)'}` }, reais(l.saldo_cent)));
        lista.append(item);
      }
      lista.style.display = '';
    }, 300);
  });

  const btnConferir = el('button', { class: 'lx-btn lx-btn-primario' }, 'Conferir favorecido');
  btnConferir.onclick = async () => {
    if (!escolhido) { toast('Escolha o entregador', 'erro'); return; }
    btnConferir.disabled = true;
    try {
      if (modo === 'cola') {
        // No copia e cola o favorecido está dentro do código e quem valida é o banco.
        // A trava de saldo é conferida do mesmo jeito, antes de enviar.
        conferido = { valor_cent: centavos(inpValor.value), qrcode: inpCola.value.trim(), saldo_cent: escolhido.saldo_cent,
          saldo_apos_cent: escolhido.saldo_cent - centavos(inpValor.value), favorecido: null, chave: null };
      } else {
        conferido = await post('/pagamentos/avulso/conferir', {
          motoboy_id: escolhido.id, chave: inpChave.value.trim() || null, valor_cent: centavos(inpValor.value),
        });
      }
      pintarConferencia();
    } catch (e) { toast(e.message, 'erro'); }
    btnConferir.disabled = false;
  };

  function pintarConferencia() {
    areaConfere.innerHTML = '';
    const linha = (k, v, destaque) => el('div', { style: `display:flex;justify-content:space-between;gap:12px;padding:11px 14px;border-top:1px solid var(--lx-linha)${destaque ? ';background:var(--lx-ok-bg)' : ''}` },
      el('span', { style: 'font-size:12.5px' }, k), el('b', { style: 'font-size:13px' }, v));
    const f = conferido.favorecido || {};

    const btnPagar = el('button', { class: 'lx-btn lx-btn-primario', style: 'background:var(--lx-ok);border-color:var(--lx-ok)' },
      'Pagar ' + reais(conferido.valor_cent));
    btnPagar.onclick = async () => {
      btnPagar.disabled = true; btnPagar.textContent = 'Pagando…';
      try {
        const r = await post('/pagamentos/avulso', {
          motoboy_id: escolhido.id, chave: conferido.chave || null, qrcode: conferido.qrcode || null,
          valor_cent: conferido.valor_cent, descricao: inpDesc.value.trim() || null,
        });
        if (r.status === 'aguardando_aprovacao') {
          aoAguardarCodigo(r.lote_id);
          abrirAprovacao({ loteId: r.lote_id, envio: r.aprovacao, titulo: 'Aprovar pagamento avulso',
            resumo: [['Para', escolhido.nome], ['Valor', reais(conferido.valor_cent)]], aoAprovar: () => aoAguardarCodigo(r.lote_id) });
          return;
        }
        toast('Pago · saldo agora ' + reais(r.saldo_cent));
        aoPagar();
      } catch (e) { btnPagar.disabled = false; btnPagar.textContent = 'Pagar ' + reais(conferido.valor_cent); toast(e.message, 'erro'); }
    };

    areaConfere.append(bloco('Confira antes de pagar', tag('favorecido encontrado', 'ok'),
      el('div', { style: 'background:var(--lx-atencao-bg);border:1px solid #e8d3a2;color:#7A5410;border-radius:var(--lx-raio-sm);padding:11px 14px;font-size:12.5px;line-height:1.55;margin-bottom:14px' },
        'O nome abaixo veio do banco, não do seu cadastro. Se não for quem você espera, pare aqui — chave errada é dinheiro que não volta.'),
      el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);overflow:hidden' },
        linha('Favorecido no banco', esc(f.nome || '—'), true),
        f.documento ? linha('Documento', esc(f.documento)) : '',
        linha('Chave de destino', esc(conferido.chave)),
        linha('Valor', reais(conferido.valor_cent)),
        linha('Saldo do entregador', `${reais(conferido.saldo_cent)} → ${reais(conferido.saldo_apos_cent)}`),
        linha('Teto de hoje', 'restam ' + reais(conferido.teto_dia_restante_cent))),
      el('div', { style: 'margin-top:14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center' },
        btnPagar,
        el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' },
          'O valor sai do saldo dele no app assim que o banco confirmar.'))));
  }

  raiz.append(
    el('div', { style: 'background:var(--lx-azul-50);border:1px solid #c5dbf2;color:#12456f;border-radius:var(--lx-raio-sm);padding:11px 14px;font-size:12.5px;line-height:1.55;margin-bottom:16px' },
      'Para o que não cabe no fechamento: adiantamento, acerto, entregador sem chave cadastrada. Sai da mesma conta, respeita os mesmos tetos e ',
      el('b', {}, 'nunca passa do saldo em aberto do entregador'), '.'),
    bloco('Para quem', cfg.provedor_nome ? tag(cfg.provedor_nome, 'in') : '',
      campo('Entregador', el('div', {}, busca, lista), 'Busque pelo nome ou pelo código.'),
      escolhidoBox,
      el('div', { style: 'margin-top:14px' }, seletorModo || ''),
      el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:14px' },
        (campoChave.append(campo('Chave Pix de destino', inpChave, 'Deixe em branco para usar a chave cadastrada dele.')), campoChave),
        (campoCola.append(campo('Código copia e cola', inpCola, 'O banco valida o código e o valor.')), campoCola),
        campo('Valor', inpValor),
        campo('Descrição', inpDesc, 'Aparece no extrato e no lançamento.')),
      el('div', { style: 'margin-top:14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center' },
        btnConferir,
        el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'Consulta a chave no banco. Nada é pago neste passo.'))),
    areaConfere);

  return raiz;
}

// ── Lote: aprovação e acompanhamento ────────────────────────────────────────
function secaoLote({ loteId, aoVoltar }) {
  const area = el('div', {});

  async function carregar() {
    area.innerHTML = '';
    area.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando lote…'));
    let l;
    try { l = await get('/pagamentos/lotes/' + loteId); }
    catch (e) { area.innerHTML = ''; area.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-erro)' }, e.message)); return; }

    const conta = (s) => l.itens.filter((i) => i.status === s).length;
    const voltar = el('button', { class: 'lx-btn lx-btn-secundario', style: 'font-size:12px;margin-bottom:12px', onClick: aoVoltar }, '‹ Voltar');

    const cabecalho = grade(
      kpi('Total do lote', reais(l.total_cent), `${l.quantidade} entregador(es)`),
      kpi('Confirmados', String(conta('confirmado')), reais(l.itens.filter((i) => i.status === 'confirmado').reduce((s, i) => s + i.valor_cent, 0)), 'var(--lx-ok)'),
      kpi('Em processamento', String(conta('enviado') + conta('pendente')), 'aguardando o banco'),
      kpi('Com erro', String(conta('erro')), conta('erro') ? 'reenvio disponível' : 'nenhum', conta('erro') ? 'var(--lx-erro)' : null));

    const corpo = el('tbody', {});
    const COR = { confirmado: 'ok', enviado: 'in', pendente: '', erro: 'er', devolvido: 'at' };
    for (const i of l.itens) {
      corpo.append(el('tr', {},
        td(el('span', {}, el('span', {
          style: 'width:26px;height:26px;border-radius:50%;background:var(--lx-azul-50);color:var(--lx-azul-primario);display:inline-grid;place-items:center;font-size:10.5px;font-weight:800;margin-right:8px;vertical-align:middle',
        }, ini(i.nome)), esc(i.nome))),
        td(el('b', {}, reais(i.valor_cent)), 'right'),
        td(el('span', { style: 'font-family:ui-monospace,monospace;font-size:11.5px' }, esc(i.pix_chave || '—'))),
        td(el('div', {}, tag(i.status, COR[i.status] || ''),
          i.erro ? el('div', { style: 'font-size:11px;color:var(--lx-erro);margin-top:3px' }, esc(i.erro)) : '')),
        td(el('span', { style: 'font-family:ui-monospace,monospace;font-size:11px' }, esc(i.provedor_id || '—'))),
        td(el('span', { style: 'color:var(--lx-tinta-3);font-size:12px' }, i.atualizado_em ? dataBR(i.atualizado_em) : '—'))));
    }

    const acoes = el('div', { style: 'padding:14px 16px;border-top:1px solid var(--lx-linha);display:flex;gap:9px;flex-wrap:wrap;align-items:center' });

    if (l.status === 'aguardando_aprovacao') {
      const btnCodigo = el('button', { class: 'lx-btn lx-btn-primario' }, 'Aprovar');
      btnCodigo.onclick = () => abrirAprovacao({ loteId, titulo: 'Aprovar lote ' + l.referencia,
        resumo: [['Total do lote', reais(l.total_cent)], ['Entregadores', String(l.quantidade)]], aoAprovar: () => carregar() });
      const btnCancelar = el('button', { class: 'lx-btn lx-btn-secundario' }, 'Cancelar lote');
      btnCancelar.onclick = async () => {
        if (!confirm('Cancelar este lote? Nada foi pago ainda.')) return;
        try { await post(`/pagamentos/lotes/${loteId}/cancelar`, {}); toast('Lote cancelado'); carregar(); }
        catch (e) { toast(e.message, 'erro'); }
      };
      acoes.append(btnCodigo, btnCancelar,
        el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'O lote está congelado: mexer nele invalida o código.'));
    } else if (conta('erro')) {
      const btnReenviar = el('button', { class: 'lx-btn lx-btn-primario' }, 'Reenviar só os com erro');
      btnReenviar.onclick = async () => {
        btnReenviar.disabled = true; btnReenviar.textContent = 'Reenviando…';
        try { await post(`/pagamentos/lotes/${loteId}/reenviar`, {}); toast('Reenvio concluído'); carregar(); }
        catch (e) { btnReenviar.disabled = false; btnReenviar.textContent = 'Reenviar só os com erro'; toast(e.message, 'erro'); }
      };
      acoes.append(btnReenviar, el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' },
        'Quem já foi pago não é tocado: cada item tem identificador próprio no banco.'));
    } else {
      acoes.append(el('span', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, 'Lote finalizado.'));
    }

    area.innerHTML = '';
    area.append(voltar, cabecalho,
      el('div', { class: 'lx-card' },
        el('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--lx-linha);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
          el('b', { style: 'font-size:14px' }, 'Lote ' + esc(l.referencia)),
          tag(l.status.replace(/_/g, ' '), l.status === 'concluido' ? 'ok' : (l.status === 'concluido_com_erro' ? 'er' : 'at'))),
        el('div', { style: 'overflow-x:auto;max-width:100%' },
          el('table', { style: 'width:100%;border-collapse:collapse' },
            el('thead', {}, el('tr', {}, th('Entregador'), th('Valor', 'right'), th('Chave Pix'), th('Situação'), th('Identificador no banco'), th('Quando'))),
            corpo)),
        acoes));
  }

  carregar();
  return area;
}

// ── Aba ─────────────────────────────────────────────────────────────────────
export function abaPagamentos(periodo, contexto) {
  const raiz = el('div', {});
  // Chegando de Fechamentos com a seleção pronta, abre direto na montagem do lote —
  // sem pedir de novo o que já foi escolhido lá.
  const fechamentosVindos = (contexto && contexto.fechamentoIds) || null;
  let vista = fechamentosVindos ? 'novo' : 'lotes';
  let loteAberto = null;

  async function render() {
    raiz.innerHTML = '';
    raiz.append(el('div', { style: 'padding:22px;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));

    let cfg;
    try { cfg = await get('/pagamentos/conta'); }
    catch (e) {
      raiz.innerHTML = '';
      raiz.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-erro)' },
        e.status === 403 ? 'Você não tem permissão para pagar entregadores, ou o módulo não está contratado.' : e.message));
      return;
    }

    const sub = el('div', { style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:16px;flex-wrap:wrap' });
    const ABAS = [['lotes', 'Lotes'], ['novo', 'Novo lote'], ['avulso', 'Avulso']];
    for (const [id, rot] of ABAS) {
      sub.append(el('button', {
        style: `background:none;border:0;padding:10px 15px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:-1px;border-bottom:2px solid ${vista === id ? 'var(--lx-azul-primario)' : 'transparent'};color:${vista === id ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'}`,
        onClick: () => { vista = id; loteAberto = null; render(); },
      }, rot));
    }

    const corpo = el('div', {});
    raiz.innerHTML = '';
    raiz.append(sub, corpo);

    if (!cfg.provedor) {
      corpo.append(el('div', { style: 'background:var(--lx-atencao-bg);border:1px solid #e8d3a2;color:#7A5410;border-radius:var(--lx-raio-sm);padding:11px 14px;font-size:12.5px;line-height:1.55;margin-bottom:16px' },
        'Nenhum banco foi liberado para a sua empresa ainda. A habilitação depende de contrato e homologação com o banco, e é feita pela plataforma — fale com o suporte.'));
    } else if (!cfg.configurada || !cfg.ativo) {
      corpo.append(el('div', { style: 'background:var(--lx-atencao-bg);border:1px solid #e8d3a2;color:#7A5410;border-radius:var(--lx-raio-sm);padding:11px 14px;font-size:12.5px;line-height:1.55;margin-bottom:16px' },
        'A conta bancária ainda não está ativa. Sem ela, nenhum lote pode ser criado ou enviado. Ative em Financeiro › Configurações de pagamento.'));
    }

    if (loteAberto) { corpo.append(secaoLote({ loteId: loteAberto, aoVoltar: () => { loteAberto = null; vista = 'lotes'; render(); } })); return; }
    if (vista === 'novo') { corpo.append(secaoNovoLote({ periodo, cfg, fechamentoIds: fechamentosVindos, aoCriar: (id) => { loteAberto = id; render(); } })); return; }
    if (vista === 'avulso') { corpo.append(secaoAvulso({ cfg, aoPagar: () => { vista = 'lotes'; render(); }, aoAguardarCodigo: (id) => { loteAberto = id; render(); } })); return; }

    // Lista de lotes
    let lotes = [];
    try { lotes = (await get('/pagamentos/lotes')).linhas || []; } catch { lotes = []; }
    const corpoTab = el('tbody', {});
    for (const l of lotes) {
      const abrir = el('button', { class: 'lx-btn lx-btn-secundario', style: 'padding:5px 10px;font-size:11.5px', onClick: () => { loteAberto = l.id; render(); } }, 'abrir');
      corpoTab.append(el('tr', {},
        td(el('b', {}, esc(l.referencia))),
        td(String(l.quantidade), 'right'),
        td(el('b', {}, reais(l.total_cent)), 'right'),
        td(tag(String(l.status).replace(/_/g, ' '), l.status === 'concluido' ? 'ok' : (l.status === 'concluido_com_erro' ? 'er' : 'at'))),
        td(el('span', { style: 'color:var(--lx-tinta-3);font-size:12px' }, dataBR(l.criado_em))),
        td(abrir, 'right')));
    }
    if (!lotes.length) {
      corpoTab.append(el('tr', {}, el('td', { colspan: 6, style: 'padding:28px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Nenhum lote ainda — comece por "Novo lote".')));
    }
    corpo.append(el('div', { class: 'lx-card' },
      el('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--lx-linha)' }, el('b', { style: 'font-size:14px' }, 'Lotes de pagamento')),
      el('div', { style: 'overflow-x:auto;max-width:100%' },
        el('table', { style: 'width:100%;border-collapse:collapse' },
          el('thead', {}, el('tr', {}, th('Referência'), th('Entregadores', 'right'), th('Total', 'right'), th('Situação'), th('Criado'), th(''))),
          corpoTab))));
  }

  render();
  return raiz;
}
