// Gaveta lateral de um pedido de antecipação: a história inteira e a próxima ação.
//
// O que ela mostra depende do estado (mockup aprovado em 10/10/2026):
//   aguardando   → valores, saldo (no pedido / agora / depois), chave, últimos 30 dias;
//                  ações: pagar pelo banco, Pix copia e cola (+ marcar pago), recusar.
//   processando  → se o lote espera aprovação: abre a janela de código + senha;
//                  senão: consultar o banco agora. Sempre: cancelar o lote.
//   paga         → o ABATIMENTO lançado (e o fechamento em que caiu), o Pix, a linha do
//                  tempo; estornar só quando foi pago por fora.
import { el, esc } from '../../../core/ui.js';
import { get, post } from '../../../core/api.js';
import {
  ENTRADA, ROTULO, reais, toast, iniciais, chavePix, seloSituacao, icone, botao, copiar, dataHora, minutosDesde,
} from './comum.js';
import { abrirAprovacao } from '../aprovacao.js';

const secao = (titulo, ...filhos) => el('section', { style: 'display:flex;flex-direction:column' },
  el('h3', { style: `${ROTULO};margin:0 0 8px;font-size:10.5px` }, titulo), ...filhos);
const linha = (k, v, extra = '') => el('div', { style: `display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--lx-linha);font-size:13px;${extra}` },
  el('span', { style: 'color:var(--lx-tinta-2)' }, k), typeof v === 'string' ? el('b', {}, v) : v);
const caixa = (rot, valor) => el('div', { style: 'background:var(--lx-superficie-2);border-radius:var(--lx-raio-sm);padding:10px;min-width:0' },
  el('div', { style: 'font-size:11px;color:var(--lx-tinta-2);font-weight:700' }, rot), el('div', { style: 'font-weight:800;margin-top:3px' }, valor));
const aviso = (tipo, ...conteudo) => el('div', { style: `border-radius:var(--lx-raio-sm);padding:10px 12px;font-size:12.5px;line-height:1.5;background:var(--lx-${tipo}-bg);color:var(--lx-${tipo})` }, ...conteudo);

const COR_EVENTO = { pedido: 'var(--lx-tinta-3)', pix_confirmado: 'var(--lx-ok)', pix_erro: 'var(--lx-erro)', pix_devolvido: 'var(--lx-erro)', lancamento_abatimento: 'var(--lx-tinta)', recusada: 'var(--lx-erro)', estornada: 'var(--lx-atencao)' };

export function abrirGaveta(id, aoMudar) {
  const antes = document.activeElement;
  const ov = el('div', { style: 'position:fixed;inset:0;background:rgba(4,44,83,.35);z-index:2500;display:flex;justify-content:flex-end' });
  const painel = el('aside', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Detalhe da antecipação', style: 'width:480px;max-width:100vw;height:100%;background:var(--lx-superficie);box-shadow:-12px 0 32px rgba(4,44,83,.14);display:flex;flex-direction:column' });
  ov.append(painel);
  const fechar = () => { ov.remove(); document.removeEventListener('keydown', tecla); try { antes && antes.focus(); } catch { /* sem foco */ } };
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', tecla);
  ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
  document.body.append(ov);

  // Depois de qualquer ação: recarrega a gaveta e avisa a fila.
  const mudou = async () => { if (aoMudar) aoMudar(); await carregar(); };

  async function carregar() {
    painel.innerHTML = '';
    painel.append(el('div', { style: 'padding:24px;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));
    let d;
    try { d = await get(`/antecipacoes/${id}`); }
    catch (e) { painel.innerHTML = ''; painel.append(el('div', { style: 'padding:24px;color:var(--lx-erro)' }, e.message), el('div', { style: 'padding:0 24px' }, botao('Fechar', { onClick: fechar }))); return; }
    desenhar(d);
  }

  function desenhar(d) {
    painel.innerHTML = '';
    const p = d.profissional;
    const btnX = el('button', { type: 'button', 'aria-label': 'Fechar', style: 'width:34px;height:34px;border-radius:var(--lx-raio-sm);border:1px solid var(--lx-linha);background:var(--lx-superficie);cursor:pointer;display:grid;place-items:center;color:var(--lx-tinta-2)', onClick: fechar }, icone('fechar', 16));
    painel.append(el('div', { style: 'padding:18px 20px;border-bottom:1px solid var(--lx-linha);display:flex;gap:12px;align-items:center' },
      el('span', { style: 'width:40px;height:40px;border-radius:50%;background:var(--lx-azul-50);color:var(--lx-azul-primario);display:grid;place-items:center;font-weight:800;font-size:14px;flex:none' }, iniciais(p.nome)),
      el('div', { style: 'flex:1;min-width:0' },
        el('div', { style: 'font-size:15px;font-weight:800' }, esc(p.nome)),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);font-weight:600' }, [p.codigo != null ? 'cód. ' + p.codigo : null, p.telefone].filter(Boolean).join(' · '))),
      btnX));

    // Faixa do topo: o número que importa neste estado.
    const atrasado = d.status === 'aguardando' && minutosDesde(d.criado_em) > (d.sla_minutos || 60);
    const faixa = {
      aguardando: ['Solicitado', reais(d.valor_cent), atrasado ? 'erro' : 'atencao'],
      processando: ['Vai receber', reais(d.recebe_cent), 'info'],
      paga: ['Recebeu', reais(d.recebe_cent), 'ok'],
    }[d.status] || ['Solicitado', reais(d.valor_cent), 'erro'];
    const selo = seloSituacao({ ...d, aguardando_codigo: d.pagamento && d.pagamento.aguardando_codigo }, d.sla_minutos);
    selo.style.background = 'var(--lx-superficie)';   // a faixa já tem a cor do estado
    painel.append(el('div', { style: `padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--lx-${faixa[2]}-bg);border-bottom:1px solid var(--lx-linha)` },
      el('div', {}, el('div', { style: 'font-size:11px;font-weight:700;color:var(--lx-tinta-2)' }, faixa[0]), el('div', { style: 'font-size:24px;font-weight:800' }, faixa[1])),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end' }, selo,
        d.status === 'paga' ? el('span', { style: 'font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;background:var(--lx-superficie);color:var(--lx-tinta-2)' }, d.via === 'manual' ? 'por fora' + (d.decidido_por ? ' · ' + d.decidido_por : '') : d.automatica ? 'banco · automático' : 'banco') : '')));

    const corpo = el('div', { style: 'flex:1;overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:20px' });
    painel.append(corpo);

    // ── Pagamento esperando código: a ação é do operador ──
    if (d.status === 'processando' && d.pagamento) {
      if (d.pagamento.aguardando_codigo) corpo.append(blocoCodigo(d, mudou));
      else corpo.append(aviso('info', 'O banco está processando o Pix. Quando confirmar, o pedido vira "paga" e o profissional é avisado — sem ninguém precisar clicar.'));
      corpo.append(el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);line-height:1.5;background:var(--lx-superficie-2);border-radius:var(--lx-raio-sm);padding:10px 12px' },
        'Com o pagamento em andamento ', el('b', {}, 'não dá para pagar de novo nem recusar'), '. Para desistir, cancele o lote — o pedido volta para a fila com o motivo.'));
    }
    if (d.status === 'aguardando' && d.erro_pagamento) corpo.append(aviso('erro', el('b', {}, 'A última tentativa falhou: '), d.erro_pagamento));
    if (d.status === 'devolvida') corpo.append(aviso('erro', 'O banco devolveu o Pix. O abatimento foi desfeito sozinho e o saldo voltou para o profissional. Ele já foi avisado e pode pedir de novo.'));
    if (d.status === 'recusada' && d.motivo_recusa) corpo.append(aviso('erro', el('b', {}, 'Motivo da recusa: '), d.motivo_recusa));
    if (d.saldo_devolvido && ['recusada', 'cancelada'].includes(d.status)) {
      corpo.append(aviso('info', `${reais(d.valor_cent)} voltaram para o saldo dele — crédito lançado na hora ${d.status === 'recusada' ? 'da recusa' : 'da desistência'}.`));
    }
    if (d.status === 'estornada') corpo.append(aviso('atencao', el('b', {}, 'Estornado: '), d.estorno_motivo || '', d.estornada_por ? ` — ${d.estornada_por}` : ''));

    // ── Abatimento (o que saiu do saldo) ──
    const abat = d.lancamentos.filter((l) => l.tipo === 'abatimento');
    const cred = d.lancamentos.filter((l) => l.tipo === 'credito');
    if (abat.length || cred.length) {
      corpo.append(secao('Abatimento no saldo', ...d.lancamentos.map((l) => el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:14px;margin-bottom:8px' },
        el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;gap:10px' },
          el('b', { style: 'font-size:14px' }, l.tipo === 'abatimento' ? (d.abatido_no_pedido ? 'Abatimento lançado no pedido' : 'Abatimento lançado') : 'Crédito de devolução'),
          el('b', { style: `font-size:16px;color:${l.tipo === 'abatimento' ? 'var(--lx-tinta)' : 'var(--lx-ok)'}` }, (l.tipo === 'abatimento' ? '− ' : '+ ') + reais(l.valor_cent))),
        el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-top:6px' }, `${dataHora(l.criado_em)} · "${esc(l.descricao || '')}"`),
        el('div', { style: 'margin-top:9px' }, el('span', { style: `font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;${l.fechamento_id ? 'background:var(--lx-ok-bg);color:var(--lx-ok)' : 'background:var(--lx-atencao-bg);color:var(--lx-atencao)'}` },
          l.fechamento_id ? `Descontado no fechamento de ${new Date(l.periodo_de).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${new Date(l.periodo_ate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : 'Em aberto — entra no próximo fechamento')),
        el('div', { style: 'display:flex;gap:6px;align-items:center;font-size:11.5px;color:var(--lx-tinta-3);margin-top:9px' }, icone('cadeado', 13), 'Travado: não pode ser apagado em Lançamentos.')))));
    }

    // ── Valores e saldo ──
    corpo.append(secao('Valores',
      linha('Solicitado', reais(d.valor_cent)),
      linha(d.gratuidade ? 'Taxa (gratuidade)' : 'Taxa', d.gratuidade ? el('b', { style: 'color:var(--lx-ok)' }, 'sem taxa') : el('b', { style: 'color:var(--lx-erro)' }, '− ' + reais(d.taxa_cent))),
      d.taxa_regra && !d.gratuidade ? el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin:-2px 0 6px' }, 'Conta: ' + d.taxa_regra) : '',
      el('div', { style: 'display:flex;justify-content:space-between;padding:10px;border-radius:var(--lx-raio-sm);background:var(--lx-ok-bg);margin-top:6px' },
        el('span', { style: 'color:var(--lx-ok);font-weight:700;font-size:13px' }, d.status === 'paga' ? 'Pix enviado' : 'Ele recebe'), el('b', { style: 'color:var(--lx-ok);font-size:15px' }, reais(d.recebe_cent))),
      linha(d.status === 'paga' || d.abatido_no_pedido ? 'Saiu do saldo dele' : 'Sai do saldo dele', reais(d.valor_cent)),
      d.vale ? linha('Vale usado', `até ${reais(d.vale.valor_max_cent)} · ${esc(d.vale.motivo || 'gratuidade')}`) : ''));

    if (['aguardando', 'processando'].includes(d.status) && d.abatido_no_pedido) {
      corpo.append(secao('Saldo do profissional',
        el('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px' },
          caixa('No pedido', reais(d.saldo_no_pedido_cent)), caixa('Saiu no pedido', '− ' + reais(d.valor_cent)), caixa('Agora', reais(d.saldo_atual_cent))),
        el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin-top:8px' }, 'O valor já saiu do saldo quando ele pediu. Pagar não abate de novo; recusar devolve na hora.')));
    } else if (['aguardando', 'processando'].includes(d.status)) {
      corpo.append(secao('Saldo do profissional',
        el('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px' },
          caixa('No pedido', reais(d.saldo_no_pedido_cent)), caixa('Agora', reais(d.saldo_atual_cent)), caixa('Depois', reais(d.saldo_atual_cent - d.valor_cent))),
        el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin-top:8px' }, 'O sistema confere o saldo de novo na hora de pagar — nada passa do que ele já ganhou.')));
    } else if (d.status === 'paga') {
      corpo.append(el('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px' },
        caixa('Saldo no pedido', reais(d.saldo_no_pedido_cent)), caixa('Abatido', '− ' + reais(d.valor_cent)), caixa('Saldo agora', reais(d.saldo_atual_cent))));
    }

    // ── Pix ──
    const pix = [
      d.chave_mudou && d.status === 'aguardando' ? aviso('atencao', el('b', {}, 'Ele trocou a chave depois do pedido. '), `O Pix vai para a chave do pedido. A atual é ${esc(d.pix_chave_atual || '—')}.`) : '',
      d.status === 'aguardando' ? aviso('atencao', 'Confira a chave antes de pagar. Chave errada é dinheiro que não volta.') : '',
      linha('Chave do pedido', el('b', { style: 'font-family:ui-monospace,monospace;font-size:12.5px' }, esc(chavePix(d.pix_tipo, d.pix_chave)))),
    ];
    if (d.pagamento) {
      pix.push(linha('Lote', d.pagamento.referencia || '—'));
      pix.push(linha('Situação no banco', ({ pendente: 'pendente', enviado: 'enviado', confirmado: 'confirmado', erro: 'erro', devolvido: 'devolvido', cancelado: 'cancelado' })[d.pagamento.status] || d.pagamento.status));
      if (d.pagamento.e2e) pix.push(linha('Identificador (E2E)', el('b', { style: 'font-family:ui-monospace,monospace;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;max-width:240px' }, d.pagamento.e2e)));
      if (d.pagamento.erro) pix.push(linha('Erro do banco', el('b', { style: 'color:var(--lx-erro);white-space:normal;text-align:right' }, d.pagamento.erro)));
    }
    corpo.append(secao('Pix', el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, ...pix.filter(Boolean))));

    // ── Histórico do profissional ──
    const u = d.ultimos_30_dias;
    corpo.append(secao('Últimos 30 dias',
      el('div', { style: 'font-size:13px;color:var(--lx-tinta-2);margin-bottom:6px' },
        u.pagas ? `${u.pagas} antecipaç${u.pagas === 1 ? 'ão paga' : 'ões pagas'} · ${reais(u.valor_cent)} · ${reais(u.taxa_cent)} em taxas` : 'Nenhuma antecipação paga.'),
      ...d.historico.map((h) => linha(`${new Date(h.criado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit' })} · ${h.status}`, reais(h.valor_cent)))));

    // ── Linha do tempo ──
    corpo.append(secao('Linha do tempo', el('ol', { style: 'list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px' },
      ...d.linha_do_tempo.map((e) => el('li', { style: 'display:flex;gap:10px' },
        el('span', { 'aria-hidden': 'true', style: `width:9px;height:9px;border-radius:50%;background:${COR_EVENTO[e.tipo] || 'var(--lx-azul-primario)'};margin-top:5px;flex:none` }),
        el('div', {}, el('div', { style: 'font-size:13px;font-weight:700' }, e.titulo),
          el('div', { style: 'font-size:12px;color:var(--lx-tinta-2)' }, dataHora(e.em, { segundos: true }) + (e.detalhe ? ' · ' + e.detalhe : ''))))))));

    painel.append(rodape(d, mudou, fechar));
  }

  carregar();
}

// Lote esperando aprovação: código por e-mail + senha do aprovador, na janela comum a
// todo o Financeiro (ADR-036).
function blocoCodigo(d, mudou) {
  const aprovar = botao('Aprovar pagamento', { tipo: 'pri', ico: 'cadeado', estilo: 'flex:1', onClick: () => abrirAprovacao({
    loteId: d.pagamento.lote_id, titulo: 'Aprovar antecipação',
    resumo: [['Lote', d.pagamento.referencia], ['Pix', reais(d.recebe_cent)]], aoAprovar: () => mudou(),
  }) });
  return el('div', { style: 'border:1px solid var(--lx-azul-100);background:var(--lx-superficie-2);border-radius:var(--lx-raio);padding:16px' },
    el('div', { style: 'font-size:14px;font-weight:800' }, 'Aprovar o pagamento'),
    el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);line-height:1.5;margin-top:4px' }, 'A conta exige aprovação para este valor: o código vai por e-mail ao aprovador, que confirma com a senha dele.'),
    el('div', { style: 'display:flex;gap:8px;margin-top:12px' }, aprovar),
    el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);margin-top:10px' }, `Lote ${d.pagamento.referencia} · ${reais(d.recebe_cent)}`));
}

// Ações do rodapé, conforme o estado.
function rodape(d, mudou, fechar) {
  const caixaR = el('div', { style: 'padding:16px 20px;border-top:1px solid var(--lx-linha);display:flex;flex-direction:column;gap:10px' });
  const erro = el('div', { role: 'alert', style: 'font-size:12px;color:var(--lx-erro);font-weight:700' });
  const executar = async (btn, fn, ok) => {
    const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Aguarde…'; erro.textContent = '';
    try { await fn(); toast(ok); await mudou(); }
    catch (e) { btn.disabled = false; btn.textContent = txt; erro.textContent = e.message; }
  };
  // Campo de motivo que abre no lugar, para recusar ou estornar.
  const comMotivo = (rotulo, placeholder, acao, okMsg) => {
    const area = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    const abrir = botao(rotulo + '…', { tipo: 'perigo', estilo: 'flex:1', onClick: () => {
      const inp = el('input', { type: 'text', 'aria-label': 'Motivo', placeholder, style: ENTRADA });
      const confirmar = botao('Confirmar ' + rotulo.toLowerCase(), { tipo: 'perigo', onClick: () => {
        if (inp.value.trim().length < 3) { erro.textContent = 'Escreva o motivo.'; inp.focus(); return; }
        executar(confirmar, () => acao(inp.value.trim()), okMsg);
      } });
      area.innerHTML = ''; area.append(inp, el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, botao('Voltar', { onClick: () => { area.innerHTML = ''; area.append(abrir); } }), confirmar));
      inp.focus();
    } });
    area.append(abrir);
    return area;
  };

  if (d.status === 'aguardando') {
    const pagar = botao(`Pagar ${reais(d.recebe_cent)} pelo banco`, { tipo: 'ok', estilo: 'font-size:14px;padding:13px', onClick: () => executar(pagar, async () => {
      const r = await post(`/antecipacoes/${d.id}/pagar`, {});
      if (r.status === 'processando') toast('Pagamento iniciado — falta o código de aprovação');
    }, 'Pagamento enviado') });
    const areaPix = el('div', {});
    const copiaCola = botao('Pix copia e cola', { estilo: 'flex:1', onClick: () => gerarPix(d, areaPix, mudou, erro) });
    const recusar = comMotivo('Recusar', 'Motivo — o profissional vê esta mensagem', (motivo) => post(`/antecipacoes/${d.id}/recusar`, { motivo }),
      d.abatido_no_pedido ? `Recusado — ${reais(d.valor_cent)} devolvidos ao saldo` : 'Recusado');
    recusar.style.flex = '1';
    caixaR.append(pagar, el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, copiaCola, recusar), areaPix,
      el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);text-align:center' }, d.abatido_no_pedido ? 'Pagando por fora? Gere o copia e cola e marque como pago. O saldo já foi abatido no pedido.' : 'Pagando por fora? Gere o copia e cola e marque como pago — é o que abate o saldo.'));
  } else if (d.status === 'processando') {
    const consultar = botao('Consultar o banco agora', { ico: 'atualizar', estilo: 'flex:1', onClick: () => executar(consultar, () => post(`/antecipacoes/${d.id}/sincronizar`, {}), 'Consultado') });
    const cancelar = botao('Cancelar lote', { tipo: 'perigo', estilo: 'flex:1', onClick: () => {
      if (!confirm('Cancelar o lote? Nada será pago e o pedido volta para a fila.')) return;
      executar(cancelar, () => post(`/pagamentos/lotes/${d.pagamento.lote_id}/cancelar`, {}), 'Lote cancelado — pedido de volta à fila');
    } });
    caixaR.append(el('div', { style: 'display:flex;gap:8px' }, consultar, d.pagamento && d.pagamento.lote_status === 'aguardando_aprovacao' ? cancelar : ''));
  } else if (d.status === 'paga') {
    const comprovante = botao('Copiar comprovante', { ico: 'copiar', estilo: 'flex:1', onClick: async () => {
      const t = [`Antecipação paga — ${d.profissional.nome} (cód. ${d.profissional.codigo ?? '—'})`, `Pediu ${reais(d.valor_cent)} · taxa ${reais(d.taxa_cent)} · recebeu ${reais(d.recebe_cent)}`,
        `Chave: ${chavePix(d.pix_tipo, d.pix_chave)}`, `Pago em ${dataHora(d.pago_em)}${d.pagamento && d.pagamento.e2e ? ' · E2E ' + d.pagamento.e2e : ' · pago por fora'}`].join('\n');
      toast(await copiar(t) ? 'Comprovante copiado' : 'Não deu para copiar');
    } });
    if (d.via === 'manual') {
      const estornar = comMotivo('Estornar', 'Ex.: marquei o pedido errado, o Pix não saiu', (motivo) => post(`/antecipacoes/${d.id}/estornar`, { motivo }), 'Estornado — crédito lançado no saldo');
      estornar.style.flex = '1';
      caixaR.append(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, comprovante, estornar),
        el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);text-align:center;line-height:1.5' }, 'Estornar lança um crédito do mesmo valor no saldo dele — o abatimento continua no extrato.'));
    } else {
      caixaR.append(comprovante, el('div', { style: 'font-size:11.5px;color:var(--lx-tinta-2);text-align:center;line-height:1.5' },
        'Pago pelo banco não se estorna aqui — o Pix saiu de fato. Se o banco devolver, o sistema desfaz o abatimento sozinho.'));
    }
  } else {
    caixaR.append(botao('Fechar', { onClick: fechar }));
  }
  caixaR.append(erro);
  return caixaR;
}

// Pix copia e cola gerado no servidor (ADR-031) + "já paguei", que é o que abate o saldo.
async function gerarPix(d, area, mudou, erro) {
  erro.textContent = '';
  let r;
  try { r = await post('/pagamentos/brcode', { chave: d.pix_chave, valor_cent: d.recebe_cent, txid: null }); }
  catch (e) { erro.textContent = e.message; return; }
  const cod = el('textarea', { readonly: '', 'aria-label': 'Código Pix copia e cola', style: `${ENTRADA};font-family:ui-monospace,monospace;font-size:11px;min-height:80px` });
  cod.value = r.payload;
  const btnCopiar = botao('Copiar código', { ico: 'copiar', onClick: async () => toast(await copiar(r.payload) ? 'Código copiado' : 'Não deu para copiar') });
  const btnPago = botao('Já paguei · marcar como pago', { tipo: 'pri', onClick: async () => {
    if (!confirm(d.abatido_no_pedido
      ? `Confirma que o Pix de ${reais(d.recebe_cent)} foi feito por fora? Os ${reais(d.valor_cent)} já saíram do saldo dele no pedido.`
      : `Confirma que o Pix de ${reais(d.recebe_cent)} foi feito por fora? Isso abate ${reais(d.valor_cent)} do saldo do profissional.`)) return;
    btnPago.disabled = true;
    try { await post(`/antecipacoes/${d.id}/pagar-manual`, {}); toast(d.abatido_no_pedido ? 'Marcado como pago' : 'Marcado como pago — abatimento lançado'); await mudou(); }
    catch (e) { btnPago.disabled = false; erro.textContent = e.message; }
  } });
  area.innerHTML = '';
  area.append(el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio);padding:12px;display:flex;flex-direction:column;gap:10px' },
    el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);line-height:1.5' }, 'Escaneie com o app do banco da empresa ou cole em Pix Copia e Cola — chave e valor já vão no código.'),
    r.svg ? el('div', { style: 'display:flex;justify-content:center', html: r.svg }) : '',
    cod, el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btnCopiar, btnPago)));
}

