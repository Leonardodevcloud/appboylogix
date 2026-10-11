// Aprovação de pagamento e autorização de mudanças (ADR-036): as duas janelas que pedem a
// senha de um aprovador. Usadas por Pagamentos (lote e avulso), Antecipações e
// Configurações de pagamento — uma janela só, para o operador aprender um jeito.
//
//   abrirAprovacao   código do e-mail + senha de quem recebeu o código. Com vários
//                    aprovadores, escolhe para quem mandar antes.
//   comAutorizacao   executa uma ação; se o servidor responder que ela precisa da senha
//                    de um aprovador (AUTORIZACAO_APROVADOR), pede e repete.
import { el } from '../../core/ui.js';
import { get, post } from '../../core/api.js';
import { ENTRADA, botao, modal, icone, toast } from './antecipacoes/comum.js';

const ERRO = 'font-size:12px;color:var(--lx-erro);font-weight:700;min-height:16px';
const NOTA = 'font-size:11.5px;color:var(--lx-tinta-2);line-height:1.5;margin-top:5px';
const ROT = 'font-size:12px;font-weight:700;display:block;margin-bottom:6px';

function campoSenha(id, rotulo, nota) {
  const inp = el('input', { id, type: 'password', autocomplete: 'off', style: ENTRADA });
  return { inp, no: el('div', {}, el('label', { for: id, style: ROT }, rotulo), inp, nota ? el('div', { style: NOTA }, nota) : '') };
}

function seletor(id, aprovadores, rotulo) {
  const sel = el('select', { id, style: ENTRADA });
  for (const a of aprovadores) sel.append(el('option', { value: a.id }, `${a.nome} · ${a.email}`));
  return { sel, no: el('div', {}, el('label', { for: id, style: ROT }, rotulo), sel) };
}

const resumoNo = (linhas) => el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);overflow:hidden' },
  ...linhas.map(([k, v]) => el('div', { style: 'display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-bottom:1px solid var(--lx-linha);font-size:13px' },
    el('span', { style: 'color:var(--lx-tinta-2)' }, k), el('b', { style: 'font-variant-numeric:tabular-nums' }, v))));

// ── Aprovar um lote ──────────────────────────────────────────────────────────
// `envio` é o que o servidor devolveu ao criar o lote (ou ao pedir o código): ou já diz
// para quem foi o código, ou pede para escolher. Sem `envio`, a janela começa escolhendo.
export function abrirAprovacao({ loteId, envio = null, titulo = 'Aprovar pagamento', resumo = [], aoAprovar }) {
  const area = el('div', { style: 'padding:18px 20px;display:flex;flex-direction:column;gap:14px' });
  const erro = el('div', { role: 'alert', style: ERRO });
  let atual = envio;
  const rodape = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end' });

  async function pedirCodigo(aprovadorId) {
    erro.textContent = '';
    try {
      atual = await post(`/pagamentos/lotes/${loteId}/token`, aprovadorId ? { aprovador_id: aprovadorId } : {});
      pintar();
    } catch (e) { erro.textContent = e.message; }
  }

  function pintar() {
    area.innerHTML = ''; rodape.innerHTML = '';
    if (resumo.length) area.append(resumoNo(resumo));

    // Ainda não há código: escolher o aprovador (ou pedir, se a lista não veio).
    if (!atual || atual.escolher) {
      const lista = (atual && atual.aprovadores) || [];
      if (!lista.length) {
        area.append(el('div', { style: 'font-size:13px;color:var(--lx-tinta-2)' }, 'Carregando aprovadores…'), erro);
        pedirCodigo(null);
        return;
      }
      const s = seletor('aprov-destino', lista, 'Mandar o código para');
      area.append(s.no, el('div', { style: NOTA }, 'Só a pessoa escolhida consegue aprovar: o código chega no e-mail dela e a senha é dela.'), erro);
      const enviar = botao('Enviar código', { tipo: 'pri', ico: 'cadeado', onClick: async () => { enviar.disabled = true; await pedirCodigo(s.sel.value); enviar.disabled = false; } });
      rodape.append(botao('Aprovar depois', { onClick: () => m.fechar() }), enviar);
      return;
    }

    const cod = el('input', { id: 'aprov-codigo', type: 'text', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: '000000',
      style: `${ENTRADA};font-size:24px;font-weight:800;letter-spacing:.35em;text-align:center;font-family:ui-monospace,monospace` });
    const senha = campoSenha('aprov-senha', `Senha de aprovação de ${atual.aprovador ? atual.aprovador.nome : 'quem recebeu o código'}`,
      'Só o aprovador sabe. Se a tela não é dele, o jeito seguro é o botão "Revisar e aprovar" do e-mail, no aparelho dele: esta tela atualiza sozinha.');
    area.append(
      el('div', {}, el('label', { for: 'aprov-codigo', style: ROT }, `Código enviado para ${atual.enviado_para}`), cod,
        el('div', { style: NOTA }, `Vale por ${atual.minutos || 10} minutos e serve só para este lote.`)),
      senha.no, erro);

    const aprovar = botao('Aprovar e enviar ao banco', { tipo: 'ok', onClick: async () => {
      if (!/^\d{6}$/.test(cod.value.trim())) { erro.textContent = 'Digite os 6 números do código.'; cod.focus(); return; }
      if (!senha.inp.value) { erro.textContent = 'Digite a senha de aprovação.'; senha.inp.focus(); return; }
      aprovar.disabled = true; aprovar.textContent = 'Enviando…';
      try {
        const r = await post(`/pagamentos/lotes/${loteId}/aprovar`, { codigo: cod.value.trim(), senha: senha.inp.value });
        m.fechar(); toast('Aprovado. Pix enviado ao banco');
        if (aoAprovar) aoAprovar(r);
      } catch (e) {
        aprovar.disabled = false; aprovar.textContent = 'Aprovar e enviar ao banco';
        erro.textContent = e.message; senha.inp.value = '';
      }
    } });
    const outro = botao('Mandar para outro aprovador', { onClick: () => { atual = null; pintar(); } });
    const reenviar = botao('Reenviar código', { onClick: async () => {
      reenviar.disabled = true;
      await pedirCodigo(atual.aprovador && atual.aprovador.id);
      toast('Código reenviado');
    } });
    for (const i of [cod, senha.inp]) {
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') aprovar.click(); });
      i.addEventListener('input', () => { erro.textContent = ''; });
    }
    rodape.append(outro, reenviar, aprovar);
    setTimeout(() => cod.focus(), 30);
  }

  // Aprovado pelo botão do e-mail (no aparelho do aprovador): a janela percebe sozinha.
  let fechado = false;
  const vigia = setInterval(async () => {
    if (fechado || !atual || atual.escolher) return;
    try {
      const l = await get(`/pagamentos/lotes/${loteId}`);
      if (l.status !== 'aguardando_aprovacao' && !fechado) {
        m.fechar();
        if (l.status === 'cancelado') toast('Este lote foi cancelado', 'erro');
        else toast('Aprovado pelo aprovador. Pix enviado ao banco');
        if (aoAprovar) aoAprovar(l);
      }
    } catch { /* tenta de novo na próxima volta */ }
  }, 5000);
  const m = modal(titulo, 'Código por e-mail e senha do aprovador.', area, rodape,
    { largura: 500, aoFechar: () => { fechado = true; clearInterval(vigia); } });
  pintar();
  return m;
}

// ── Autorizar uma mudança ────────────────────────────────────────────────────
// `acao(autorizacao)` é a chamada ao servidor. Primeiro vai sem autorização; se o servidor
// disser que precisa, a janela pede a senha de um aprovador e repete. Senha errada fica
// na janela, com a mensagem do servidor ("Restam 3 tentativas").
export async function comAutorizacao(acao) {
  try {
    return await acao(null);
  } catch (e) {
    const d = e.dados || {};
    if (d.codigo !== 'AUTORIZACAO_APROVADOR') throw e;
    return pedirAutorizacao({ motivo: (d.detalhe && d.detalhe.motivo) || '', aprovadores: (d.detalhe && d.detalhe.aprovadores) || [], acao });
  }
}

function pedirAutorizacao({ motivo, aprovadores, acao }) {
  return new Promise((resolve, reject) => {
    const erro = el('div', { role: 'alert', style: ERRO });
    const s = seletor('aut-aprovador', aprovadores, 'Aprovador que autoriza');
    const senha = campoSenha('aut-senha', 'Senha de aprovação', 'A pessoa digita aqui, na sua tela, ou faz a mudança pelo acesso dela.');
    const corpo = el('div', { style: 'padding:18px 20px;display:flex;flex-direction:column;gap:14px' },
      el('div', { style: 'display:flex;gap:10px;background:var(--lx-info-bg);color:var(--lx-info);border-radius:var(--lx-raio-sm);padding:11px 12px;font-size:12.5px;line-height:1.5' },
        icone('cadeado'), el('div', {}, 'Esta mudança afrouxa a trava dos pagamentos e precisa da senha de um aprovador: ', el('b', {}, motivo), '. Os aprovadores recebem um aviso por e-mail.')),
      s.no, senha.no, erro);
    let feito = false;
    const confirmar = botao('Autorizar', { tipo: 'pri', ico: 'cadeado', onClick: async () => {
      if (!senha.inp.value) { erro.textContent = 'Digite a senha de aprovação.'; senha.inp.focus(); return; }
      confirmar.disabled = true;
      try {
        const r = await acao({ aprovador_id: s.sel.value, senha: senha.inp.value });
        feito = true; m.fechar(); resolve(r);
      } catch (e) { confirmar.disabled = false; senha.inp.value = ''; erro.textContent = e.message; }
    } });
    senha.inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar.click(); });
    // Fechar sem autorizar (Esc, clique fora, Cancelar) devolve um erro marcado como
    // `cancelado`: quem chamou só reabilita o botão, sem mostrar falha.
    const m = modal('Autorização do aprovador', null, corpo,
      [botao('Cancelar', { onClick: () => m.fechar() }), confirmar],
      { largura: 480, aoFechar: () => { if (!feito) reject(Object.assign(new Error('Mudança não autorizada'), { cancelado: true })); } });
    setTimeout(() => senha.inp.focus(), 30);
  });
}
