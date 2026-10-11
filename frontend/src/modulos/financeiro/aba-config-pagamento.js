// Financeiro › Configurações de pagamento (ADR-036, mockup aprovado em 11/10/2026).
//
// Tudo o que define COMO o dinheiro sai, separado de onde ele sai (Pagamentos):
//   Conta bancária · Aprovadores · Limites · Histórico
//
// A regra que a tela inteira serve: quem tem acesso ao painel não aprova sozinho. O
// aprovador é uma pessoa com e-mail confirmado e senha própria; trocar aprovador, subir
// limite ou mexer na credencial do banco pede a senha de um aprovador (comAutorizacao).
import { el } from '../../core/ui.js';
import { get, post, put } from '../../core/api.js';
import { reais, dataBR, toast } from './util.js';
import { tag, campo, bloco, ENTRADA, centavos } from './aba-pagamentos.js';
import { comAutorizacao } from './aprovacao.js';
import { botao, modal, icone, iniciais } from './antecipacoes/comum.js';

const AVISO = 'border-radius:var(--lx-raio-sm);padding:11px 14px;font-size:12.5px;line-height:1.55;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start';
const aviso = (tipo, ...filhos) => el('div', { style: `${AVISO};background:var(--lx-${tipo}-bg);color:var(--lx-${tipo})` }, ...filhos);
const NOTA = 'font-size:11.5px;color:var(--lx-tinta-2);line-height:1.55';

// Erro de "fechou a janela da senha" não é falha: só não salvou.
const falhou = (e) => { if (!e.cancelado) toast(e.message, 'erro'); };

// O PUT da conta leva tudo; cada aba muda só a sua parte.
function corpoConta(cfg, extra = {}) {
  return {
    ambiente: cfg.ambiente, credenciais: {}, ativo: !!cfg.ativo, aprovacao: cfg.aprovacao || 'sempre',
    teto_item_cent: cfg.teto_item_cent, teto_lote_cent: cfg.teto_lote_cent, teto_dia_cent: cfg.teto_dia_cent,
    ...extra,
  };
}
const salvarConta = (cfg, extra) => comAutorizacao((autorizacao) => put('/pagamentos/conta', { ...corpoConta(cfg, extra), autorizacao }));

// ── Conta bancária ──────────────────────────────────────────────────────────
// O formulário de credenciais é MONTADO a partir do que o banco declara (`cfg.campos`).
function secaoConta(cfg, aprov, recarregar) {
  const valores = {}; const nomes = {};

  function entradaDeCampo(f) {
    const jaTem = cfg.credenciais && cfg.credenciais[f.codigo];
    if (f.tipo === 'arquivo') {
      const inp = el('input', { type: 'file', accept: f.aceita || '', style: ENTRADA });
      let base64 = null;
      inp.addEventListener('change', () => {
        const arq = inp.files && inp.files[0];
        if (!arq) return;
        const leitor = new FileReader();
        leitor.onload = () => { base64 = String(leitor.result).split(',')[1]; nomes[f.codigo] = arq.name; };
        leitor.readAsDataURL(arq);
      });
      valores[f.codigo] = () => base64;
      return { node: inp, nota: jaTem ? `enviado: ${String(jaTem)}` : f.ajuda };
    }
    const secreto = f.segredo || f.tipo === 'senha';
    // Campo secreto nunca é pré-preenchido: a tela não recebe o valor, só a máscara.
    const inp = el('input', { type: secreto ? 'password' : 'text', style: ENTRADA, value: secreto ? '' : (jaTem || ''), placeholder: secreto && jaTem ? String(jaTem) : '' });
    valores[f.codigo] = () => inp.value.trim();
    return { node: inp, nota: secreto && jaTem ? 'gravado: deixe em branco para manter' : f.ajuda };
  }

  const selAmbiente = el('select', { style: ENTRADA });
  for (const [v, t] of [['hml', 'Homologação'], ['prod', 'Produção']]) selAmbiente.append(el('option', { value: v, ...(cfg.ambiente === v ? { selected: '' } : {}) }, t));
  const temAprovador = aprov.aprovadores.some((a) => a.status === 'ativo');
  const chkAtivo = el('input', { id: 'conta-ativa', type: 'checkbox', style: 'width:auto', ...(cfg.ativo ? { checked: '' } : {}), ...(!temAprovador && !cfg.ativo ? { disabled: '' } : {}) });

  const gradeCampos = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:14px' });
  for (const f of cfg.campos || []) {
    const { node, nota } = entradaDeCampo(f);
    gradeCampos.append(campo(f.rotulo + (f.obrigatorio ? ' *' : ''), node, nota));
  }
  if (!(cfg.campos || []).length) gradeCampos.append(el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2)' }, 'Este banco não exige credenciais adicionais.'));

  const btnSalvar = el('button', { class: 'lx-btn lx-btn-primario', ...(cfg.provedor ? {} : { disabled: '' }) }, 'Salvar conta');
  btnSalvar.onclick = async () => {
    btnSalvar.disabled = true;
    const credenciais = {};
    for (const f of cfg.campos || []) {
      const v = valores[f.codigo] && valores[f.codigo]();
      if (v) { credenciais[f.codigo] = v; if (nomes[f.codigo]) credenciais[f.codigo + '_nome'] = nomes[f.codigo]; }
    }
    try {
      await salvarConta(cfg, { ambiente: selAmbiente.value, credenciais, ativo: chkAtivo.checked });
      toast('Conta salva');
      await recarregar();
    } catch (e) { btnSalvar.disabled = false; falhou(e); }
  };

  const btnTestar = el('button', { class: 'lx-btn lx-btn-secundario' }, 'Testar conexão');
  const saldoTeste = el('span', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2)' });
  btnTestar.disabled = !(cfg.capacidades && cfg.capacidades.saldo);
  btnTestar.onclick = async () => {
    btnTestar.disabled = true; btnTestar.textContent = 'Testando…';
    try { const r = await post('/pagamentos/conta/testar', {}); saldoTeste.textContent = 'saldo lido: ' + reais(r.saldo_cent); }
    catch (e) { saldoTeste.textContent = ''; toast(e.message, 'erro'); }
    btnTestar.disabled = false; btnTestar.textContent = 'Testar conexão';
  };

  const infoProvedor = el('div', { style: ENTRADA + ';background:var(--lx-superficie-2);display:flex;align-items:center;gap:8px;font-weight:700' },
    cfg.provedor_nome || 'nenhum banco liberado', cfg.provedor ? tag('liberado pela plataforma', 'ok') : tag('fale com o suporte', 'at'));

  return bloco('Conta de pagamento',
    cfg.configurada ? tag(cfg.ativo ? 'ativa' : 'inativa', cfg.ativo ? 'ok' : 'at') : tag('não configurada', ''),
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:14px' },
      campo('Banco', infoProvedor), campo('Ambiente', selAmbiente)),
    el('div', { style: 'margin-top:16px;padding-top:14px;border-top:1px solid var(--lx-linha)' },
      el('div', { style: 'font-size:12px;font-weight:700;color:var(--lx-tinta-2);margin-bottom:12px' }, 'Credenciais exigidas por este banco'),
      gradeCampos),
    el('div', { style: 'margin-top:14px;display:flex;gap:9px;flex-wrap:wrap;align-items:center' },
      el('label', { for: 'conta-ativa', style: 'display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:var(--lx-tinta-2)' }, chkAtivo, 'Conta ativa para pagar'),
      btnSalvar, btnTestar, saldoTeste),
    el('div', { style: NOTA + ';margin-top:12px' },
      temAprovador ? 'Trocar credencial ou ambiente pede a senha de um aprovador. Desativar a conta é livre.'
        : 'A conta só ativa depois que um aprovador criar a senha (aba Aprovadores).'));
}

// ── Aprovadores ─────────────────────────────────────────────────────────────
const ROT_STATUS = { ativo: ['ativo', 'ok'], convidado: ['convite enviado', 'at'] };

function cartaoAprovador(a, aprov, recarregar) {
  const bloqueado = a.bloqueado_ate && new Date(a.bloqueado_ate) > new Date();
  const [rot, cor] = bloqueado ? ['bloqueado', 'er'] : (ROT_STATUS[a.status] || [a.status, '']);
  const detalhe = a.status === 'ativo'
    ? (bloqueado ? `Senha bloqueada até ${dataBR(a.bloqueado_ate)} por tentativas erradas` : `Senha criada em ${dataBR(a.senha_definida_em)}`)
    : `Convite válido até ${dataBR(a.convite_expira_em)}`;

  const acoes = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-left:auto' });
  if (a.status === 'convidado') {
    const reenviar = botao('Reenviar convite', { onClick: async () => {
      reenviar.disabled = true;
      try { await post(`/pagamentos/aprovadores/${a.id}/reenviar`, {}); toast('Convite reenviado'); await recarregar(); }
      catch (e) { reenviar.disabled = false; toast(e.message, 'erro'); }
    } });
    acoes.append(reenviar);
  } else {
    const novaSenha = botao('Esqueci a senha', { onClick: async () => {
      novaSenha.disabled = true;
      try { const r = await post(`/pagamentos/aprovadores/${a.id}/nova-senha`, {}); toast(`Link de nova senha enviado para ${r.enviado_para}`); }
      catch (e) { toast(e.message, 'erro'); }
      novaSenha.disabled = false;
    } });
    acoes.append(novaSenha);
  }
  const unicoAtivo = a.status === 'ativo' && aprov.aprovadores.filter((x) => x.status === 'ativo').length === 1;
  const remover = botao(a.status === 'convidado' ? 'Cancelar convite' : 'Remover', { tipo: 'perigo', onClick: async () => {
    remover.disabled = true;
    try {
      await comAutorizacao((autorizacao) => post(`/pagamentos/aprovadores/${a.id}/remover`, { autorizacao }));
      toast(`${a.nome} saiu dos aprovadores`); await recarregar();
    } catch (e) { remover.disabled = false; falhou(e); }
  } });
  if (unicoAtivo) { remover.disabled = true; remover.title = 'É o único aprovador ativo. Inclua outro antes, ou use a troca sem senha.'; }
  acoes.append(remover);

  return el('div', { style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding:14px 16px;border-top:1px solid var(--lx-linha)' },
    el('div', { style: 'width:42px;height:42px;border-radius:50%;background:var(--lx-azul-50);color:var(--lx-azul-primario);display:grid;place-items:center;font-weight:800;flex:none' }, iniciais(a.nome)),
    el('div', { style: 'min-width:0' },
      el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, el('b', { style: 'font-size:14px' }, a.nome), tag(rot, cor)),
      el('div', { style: 'font-size:12.5px;color:var(--lx-tinta-2);margin-top:2px' }, `${a.email} · ${detalhe}`)),
    acoes);
}

function abrirIncluir(aprov, recarregar) {
  const nome = el('input', { id: 'novo-nome', type: 'text', style: ENTRADA, autocomplete: 'off' });
  const email = el('input', { id: 'novo-email', type: 'email', style: ENTRADA, autocomplete: 'off' });
  const erro = el('div', { role: 'alert', style: 'font-size:12px;color:var(--lx-erro);font-weight:700;min-height:16px' });
  const primeiro = !aprov.aprovadores.some((a) => a.status === 'ativo');
  const corpo = el('div', { style: 'padding:18px 20px;display:flex;flex-direction:column;gap:14px' },
    campo('Nome completo', nome),
    campo('E-mail', email, 'Vai um link para este e-mail. Só quem abre o link cria a senha de aprovação. Você não vê nem escolhe a senha.'),
    primeiro ? aviso('atencao', icone('alerta'), el('div', {}, 'É o primeiro aprovador: entra sem autorização. Toda a equipe com permissão de pagar recebe um aviso por e-mail.'))
      : aviso('info', icone('cadeado'), el('div', {}, 'Incluir aprovador pede a senha de um aprovador ativo.')),
    erro);
  const enviar = botao('Enviar convite', { tipo: 'pri', onClick: async () => {
    if (nome.value.trim().length < 3) { erro.textContent = 'Informe o nome completo.'; nome.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.value.trim())) { erro.textContent = 'E-mail inválido.'; email.focus(); return; }
    enviar.disabled = true;
    try {
      await comAutorizacao((autorizacao) => post('/pagamentos/aprovadores', { nome: nome.value.trim(), email: email.value.trim(), autorizacao }));
      m.fechar(); toast('Convite enviado'); await recarregar();
    } catch (e) { enviar.disabled = false; if (!e.cancelado) erro.textContent = e.message; }
  } });
  const m = modal('Incluir aprovador', `Até ${aprov.maximo} aprovadores por central.`, corpo, [botao('Cancelar', { onClick: () => m.fechar() }), enviar], { largura: 500 });
}

// Troca sem a senha de ninguém: 72 h de espera, pagamentos pausados, todos avisados.
function abrirTrocaSemSenha(aprov, recarregar) {
  const nome = el('input', { id: 'troca-nome', type: 'text', style: ENTRADA, autocomplete: 'off' });
  const email = el('input', { id: 'troca-email', type: 'email', style: ENTRADA, autocomplete: 'off' });
  const sai = el('select', { id: 'troca-sai', style: ENTRADA });
  sai.append(el('option', { value: '' }, 'Ninguém sai, só incluir'));
  for (const a of aprov.aprovadores) sai.append(el('option', { value: a.id }, a.nome));
  const motivo = el('textarea', { id: 'troca-motivo', rows: '2', style: ENTRADA, placeholder: 'Ex.: Carlos saiu da empresa em 30/09' });
  const senha = el('input', { id: 'troca-senha', type: 'password', style: ENTRADA, autocomplete: 'current-password' });
  const erro = el('div', { role: 'alert', style: 'font-size:12px;color:var(--lx-erro);font-weight:700;min-height:16px' });
  const corpo = el('div', { style: 'padding:18px 20px;display:flex;flex-direction:column;gap:14px' },
    el('div', { style: 'font-size:13px;color:var(--lx-tinta-2);line-height:1.55' }, 'Use quando nenhum aprovador pode autorizar (saiu da empresa, perdeu a senha). Para não virar atalho:'),
    el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);overflow:hidden' },
      ...[['Pagamentos', 'pausados por 72 horas'], ['Aprovadores', 'recebem e-mail e podem cancelar'], ['Equipe que paga', 'recebe aviso por e-mail'], ['Depois de 72 horas', 'o novo aprovador recebe o convite']]
        .map(([k, v]) => el('div', { style: 'display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border-bottom:1px solid var(--lx-linha);font-size:13px' }, el('span', { style: 'color:var(--lx-tinta-2)' }, k), el('b', {}, v)))),
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px' }, campo('Novo aprovador', nome), campo('E-mail dele', email)),
    campo('Quem sai', sai),
    campo('Motivo', motivo, 'Vai no aviso para todos os aprovadores.'),
    campo('Sua senha de login', senha, 'Confirma que é você quem está pedindo. Fica registrado.'),
    erro);
  const pedir = botao('Pedir troca e pausar pagamentos', { tipo: 'perigo', onClick: async () => {
    pedir.disabled = true;
    try {
      await post('/pagamentos/aprovadores/pedido', { nome: nome.value.trim(), email: email.value.trim(), remover_id: sai.value || null, motivo: motivo.value.trim(), senha_login: senha.value });
      m.fechar(); toast('Pedido registrado. Pagamentos pausados por 72 horas'); await recarregar();
    } catch (e) { pedir.disabled = false; erro.textContent = e.message; senha.value = ''; }
  } });
  const m = modal('Trocar sem a senha de um aprovador', null, corpo, [botao('Voltar', { onClick: () => m.fechar() }), pedir], { largura: 540 });
}

function faixaPausa(aprov, recarregar) {
  const p = aprov.pausa && aprov.pausa.pedido;
  if (!p) return '';
  const cancelar = botao('Cancelar pedido', { onClick: async () => {
    cancelar.disabled = true;
    try { await post(`/pagamentos/aprovadores/pedido/${p.id}/cancelar`, {}); toast('Pedido cancelado. Pagamentos liberados'); await recarregar(); }
    catch (e) { cancelar.disabled = false; toast(e.message, 'erro'); }
  } });
  return el('div', { style: `${AVISO};background:var(--lx-erro-bg);color:var(--lx-erro);align-items:center;flex-wrap:wrap` },
    icone('alerta'),
    el('div', { style: 'flex:1;min-width:220px' },
      el('b', {}, `Pagamentos pausados até ${dataBR(aprov.pausa.ate)}. `),
      `${p.pedido_por || 'Alguém'} pediu, sem senha de aprovador, para incluir ${p.nome}${p.remover_nome ? ` no lugar de ${p.remover_nome}` : ''}. Motivo: ${p.motivo}.`),
    cancelar);
}

function secaoAprovadores(aprov, recarregar) {
  const lista = aprov.aprovadores;
  const cheio = lista.length >= aprov.maximo;
  const incluir = botao('Incluir aprovador', { tipo: 'pri', onClick: () => abrirIncluir(aprov, recarregar) });
  if (cheio) { incluir.disabled = true; incluir.title = `Limite de ${aprov.maximo} aprovadores`; }
  const semSenha = botao('Trocar sem senha (72 h)', { onClick: () => abrirTrocaSemSenha(aprov, recarregar) });
  if (!lista.some((a) => a.status === 'ativo') || (aprov.pausa && aprov.pausa.pedido)) semSenha.disabled = true;

  const fator = (ico, titulo, texto) => el('div', { style: 'border:1px solid var(--lx-linha);border-radius:var(--lx-raio-sm);padding:12px 14px;display:flex;gap:11px;background:var(--lx-superficie-2);min-width:0' },
    el('span', { style: 'color:var(--lx-azul-primario)' }, icone(ico, 18)),
    el('div', {}, el('b', { style: 'display:block;font-size:13px' }, titulo), el('span', { style: 'font-size:12px;color:var(--lx-tinta-2);line-height:1.45' }, texto)));

  const cartao = el('div', { class: 'lx-card', style: 'margin-bottom:16px' },
    el('div', { style: 'padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      el('div', {}, el('b', { style: 'font-size:14px;font-weight:800' }, 'Aprovadores dos pagamentos'),
        el('div', { style: 'font-size:12px;color:var(--lx-tinta-2);margin-top:2px' }, `${lista.length} de ${aprov.maximo}`)),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, semSenha, incluir)),
    ...(lista.length ? lista.map((a) => cartaoAprovador(a, aprov, recarregar))
      : [el('div', { style: 'padding:22px 16px;border-top:1px solid var(--lx-linha);font-size:13px;color:var(--lx-tinta-2)' },
        'Nenhum aprovador ainda. Sem aprovador, a conta não ativa e nenhum pagamento é aprovado. Comece por "Incluir aprovador".')]));

  return el('div', {},
    faixaPausa(aprov, recarregar),
    cartao,
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px' },
      fator('carta', 'Código por e-mail', '6 números, vale 10 minutos, um por lote, para o aprovador escolhido.'),
      fator('cadeado', 'Senha de aprovação', 'Criada pela própria pessoa. Ninguém do painel vê, nem o suporte.'),
      fator('escudo', 'Trava das mudanças', 'Incluir ou remover aprovador e afrouxar limites pedem essa senha.')),
    el('div', { style: NOTA + ';margin-top:12px' }, 'Cinco senhas erradas bloqueiam aquele aprovador por 30 minutos e avisam a pessoa por e-mail.'));
}

// ── Limites ─────────────────────────────────────────────────────────────────
function secaoLimites(cfg, recarregar) {
  const campos = {};
  const entrada = (chave) => {
    campos[chave] = el('input', { id: 'lim-' + chave, type: 'text', inputmode: 'decimal', style: ENTRADA + ';font-variant-numeric:tabular-nums', value: (cfg[chave] / 100).toFixed(2).replace('.', ',') });
    return campos[chave];
  };
  const selAprov = el('select', { id: 'lim-aprovacao', style: ENTRADA });
  for (const [v, t] of [['sempre', 'Sempre pedir código e senha'], ['acima_teto', 'Dispensar até o teto por lote']]) selAprov.append(el('option', { value: v, ...(cfg.aprovacao === v ? { selected: '' } : {}) }, t));

  const btn = el('button', { class: 'lx-btn lx-btn-primario' }, 'Salvar limites');
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await salvarConta(cfg, { teto_item_cent: centavos(campos.teto_item_cent.value), teto_lote_cent: centavos(campos.teto_lote_cent.value), teto_dia_cent: centavos(campos.teto_dia_cent.value), aprovacao: selAprov.value });
      toast('Limites salvos'); await recarregar();
    } catch (e) { btn.disabled = false; falhou(e); }
  };
  return bloco('Limites', tag('valem mesmo com código válido', 'at'),
    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px' },
      campo('Teto por entregador', entrada('teto_item_cent')),
      campo('Teto por lote', entrada('teto_lote_cent')),
      campo('Teto por dia', entrada('teto_dia_cent')),
      campo('Aprovação', selAprov, 'Dispensar o código é o que permite a antecipação automática.')),
    el('div', { style: `${AVISO};background:var(--lx-info-bg);color:var(--lx-info);margin:14px 0 0` }, icone('cadeado'),
      el('div', {}, 'Baixar um limite ou passar a pedir sempre o código vale na hora. Subir um limite ou dispensar o código pede a senha de um aprovador, e os aprovadores são avisados. Lote que passa de qualquer teto não sai, nem com código.')),
    el('div', { style: 'margin-top:14px' }, btn));
}

// ── Histórico ───────────────────────────────────────────────────────────────
function textoEvento(t, d) {
  const lote = d.referencia ? `lote ${d.referencia}` : 'lote';
  switch (t) {
    case 'aprovador_convidado': return [`${d.aprovador} convidado como aprovador`, d.quem, d.autorizado_por ? ['senha de ' + d.autorizado_por, 'ok'] : ['primeiro aprovador', 'at']];
    case 'aprovador_convite_reenviado': return [`Convite reenviado para ${d.aprovador}`, d.quem, ['painel', '']];
    case 'aprovador_ativado': return [`${d.aprovador} confirmou o e-mail e criou a senha`, d.aprovador, ['link do e-mail', 'in']];
    case 'aprovador_senha_trocada': return [`${d.aprovador} criou uma nova senha de aprovação`, d.aprovador, ['link do e-mail', 'in']];
    case 'aprovador_nova_senha_pedida': return [`Link de nova senha enviado para ${d.aprovador}`, d.quem, ['painel', '']];
    case 'aprovador_removido': return [`${d.aprovador} removido dos aprovadores`, d.quem, d.autorizado_por ? ['senha de ' + d.autorizado_por, 'ok'] : ['sem aprovador ativo', 'at']];
    case 'aprovador_senha_errada': return [`Senha de aprovação de ${d.aprovador} errada (${d.tentativa} de 5)${d.motivo ? ' · ' + d.motivo : ''}`, null, ['tentativa', 'at']];
    case 'aprovador_bloqueado': return [`Senha de ${d.aprovador} bloqueada por 30 minutos`, null, ['bloqueio', 'er']];
    case 'aprovador_pedido_sem_senha': return [`Troca sem senha pedida: entra ${d.aprovador}${d.remover ? ', sai ' + d.remover : ''}`, d.quem, ['senha de login · 72 h', 'er']];
    case 'aprovador_pedido_cancelado': return [`Troca sem senha cancelada (${d.aprovador})`, d.quem, ['cancelado', '']];
    case 'aprovador_pedido_concluido': return [`Troca sem senha concluída: convite para ${d.aprovador}`, null, ['72 h sem cancelamento', 'at']];
    case 'conta_salva': return [`Conta salva${(d.mudancas || []).length ? ': ' + d.mudancas.join('; ') : ''}`, d.quem, d.autorizado_por ? ['senha de ' + d.autorizado_por, 'ok'] : ['painel', '']];
    case 'lote_aprovado': return [`${lote[0].toUpperCase() + lote.slice(1)} aprovado · ${reais(d.total_cent)} · ${d.quantidade} entregador(es)`, d.aprovador, ['código + senha', 'ok']];
    case 'token_enviado': return [`Código do ${lote} enviado para ${d.aprovador || d.para}`, d.quem, ['e-mail', 'in']];
    case 'token_errado': return [`Código errado no ${lote} (tentativa ${d.tentativa})`, null, ['tentativa', 'at']];
    default: return [t, null, ['', '']];
  }
}

async function secaoHistorico() {
  const caixa = el('div', { class: 'lx-card' }, el('div', { style: 'padding:20px;font-size:13px;color:var(--lx-tinta-2)' }, 'Carregando…'));
  try {
    const { linhas } = await get('/pagamentos/historico');
    const th = (t) => el('th', { style: 'text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--lx-tinta-3);font-weight:700;padding:0 12px 10px;white-space:nowrap' }, t);
    const td = (c, s = '') => el('td', { style: `padding:10px 12px;border-top:1px solid var(--lx-linha);font-size:12.5px;vertical-align:top;${s}` }, c);
    const corpo = el('tbody', {});
    for (const l of linhas) {
      const [texto, quem, [como, cor]] = textoEvento(l.tipo, l.detalhe || {});
      corpo.append(el('tr', {}, td(dataBR(l.criado_em), 'white-space:nowrap;color:var(--lx-tinta-2);font-variant-numeric:tabular-nums'), td(texto), td(quem || '—'), td(como ? tag(como, cor) : '')));
    }
    if (!linhas.length) corpo.append(el('tr', {}, el('td', { colspan: 4, style: 'padding:24px;text-align:center;color:var(--lx-tinta-2);font-size:13px' }, 'Nada registrado ainda.')));
    caixa.innerHTML = '';
    caixa.append(
      el('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--lx-linha);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap' },
        el('b', { style: 'font-size:14px' }, 'Histórico'), tag('não pode ser apagado', '')),
      el('div', { style: 'overflow-x:auto;max-width:100%;padding-top:12px' },
        el('table', { style: 'width:100%;border-collapse:collapse' }, el('thead', {}, el('tr', {}, th('Quando'), th('O que'), th('Quem'), th('Como'))), corpo)));
  } catch (e) {
    caixa.innerHTML = '';
    caixa.append(el('div', { style: 'padding:20px;color:var(--lx-erro);font-size:13px' }, e.message));
  }
  return caixa;
}

// ── Aba ─────────────────────────────────────────────────────────────────────
export function abaConfigPagamento() {
  const raiz = el('div', {});
  let vista = 'aprovadores';

  async function render() {
    raiz.innerHTML = '';
    raiz.append(el('div', { style: 'padding:22px;color:var(--lx-tinta-2);font-size:13px' }, 'Carregando…'));
    let cfg; let aprov;
    try { [cfg, aprov] = await Promise.all([get('/pagamentos/conta'), get('/pagamentos/aprovadores')]); }
    catch (e) {
      raiz.innerHTML = '';
      raiz.append(el('div', { class: 'lx-card lx-card-pad', style: 'color:var(--lx-erro)' },
        e.status === 403 ? 'Você não tem permissão para pagar entregadores, ou o módulo não está contratado.' : e.message));
      return;
    }

    const sub = el('div', { role: 'tablist', style: 'display:flex;gap:2px;border-bottom:1px solid var(--lx-linha);margin-bottom:16px;flex-wrap:wrap' });
    for (const [id, rot] of [['conta', 'Conta bancária'], ['aprovadores', 'Aprovadores'], ['limites', 'Limites'], ['historico', 'Histórico']]) {
      const on = vista === id;
      sub.append(el('button', {
        role: 'tab', 'aria-selected': String(on),
        style: `background:none;border:0;padding:10px 15px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:-1px;border-bottom:2px solid ${on ? 'var(--lx-azul-primario)' : 'transparent'};color:${on ? 'var(--lx-azul-primario)' : 'var(--lx-tinta-2)'}`,
        onClick: () => { vista = id; render(); },
      }, rot));
    }
    const corpo = el('div', {});
    raiz.innerHTML = '';
    raiz.append(sub, corpo);

    if (!cfg.provedor) {
      corpo.append(aviso('atencao', icone('alerta'), el('div', {}, 'Nenhum banco foi liberado para a sua empresa ainda. A habilitação depende de contrato e homologação com o banco, e é feita pela plataforma. Fale com o suporte.')));
    }
    if (vista !== 'aprovadores' && aprov.pausa && aprov.pausa.pedido) corpo.append(faixaPausa(aprov, render));

    if (vista === 'conta') corpo.append(secaoConta(cfg, aprov, render));
    else if (vista === 'limites') corpo.append(secaoLimites(cfg, render));
    else if (vista === 'historico') corpo.append(await secaoHistorico());
    else corpo.append(secaoAprovadores(aprov, render));
  }

  render();
  return raiz;
}
