// Modelos de e-mail. Um layout só, pintado com a marca de cada central — logo dos
// e-mails, cores e nome de exibição (mockup aprovado em 10/10/2026).
//
// Regra de produto: NADA aqui menciona o Logix. Para quem recebe, o e-mail é da
// central, ponto: remetente no domínio dela, logo dela (servida pelo domínio dela),
// rodapé em nome dela.
//
// HTML de e-mail não é HTML de página: nada de CSS externo, flexbox ou grid — cliente
// de e-mail antigo ignora. Tabela e estilo em linha, como manda o ofício. E a logo vai
// num cabeçalho BRANCO: logo de cliente costuma ser desenhada para fundo claro, e sobre
// a cor da marca ela some (o "M" laranja da Motty num fundo laranja).
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COR_PADRAO = '#185FA5';
const corOk = (c, padrao) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : padrao);

function iniciais(nome) {
  const p = String(nome || '').trim().split(/\s+/);
  return ((p[0] || '')[0] || '?').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase();
}

// Tons derivados: a casca nunca depende de a central ter preenchido todas as cores.
function paleta(marca) {
  const primaria = corOk(marca.cor, COR_PADRAO);
  return {
    primaria,
    destaque: corOk(marca.destaque, primaria),
    clara: corOk(marca.clara, '#eef3f9'),
  };
}

const P = 'margin:0 0 14px;font:14px/1.6 Arial,Helvetica,sans-serif;color:#3d4d61';
const H = 'margin:0 0 12px;font:bold 19px/1.3 Arial,Helvetica,sans-serif;color:#13233a';
const MUDO = 'margin:0;font:12px/1.55 Arial,Helvetica,sans-serif;color:#7d8ca0';

function cabecalho(marca, cor) {
  const nome = esc(marca.nome || 'Central de entregas');
  const visual = marca.logo
    ? `<img src="${esc(marca.logo)}" alt="${nome}" height="40" style="display:block;height:40px;width:auto;max-width:160px;border:0">`
    : `<div style="width:40px;height:40px;border-radius:10px;background:${cor.primaria};color:#ffffff;font:800 14px/40px Arial,sans-serif;text-align:center">${esc(iniciais(marca.nome))}</div>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle">${visual}</td>
    <td style="padding-left:12px;vertical-align:middle;font:800 16px Arial,Helvetica,sans-serif;color:${cor.primaria}">${nome}</td>
  </tr></table>`;
}

// Casca comum: faixa na cor de destaque, cabeçalho branco com a logo, faixa opcional de
// assunto, corpo e rodapé em nome da central.
function casca({ marca, faixa = null, conteudo }) {
  const cor = paleta(marca);
  const nome = esc(marca.nome || 'Central de entregas');
  const local = marca.cidade ? ` · ${esc(marca.cidade)}` : '';
  const contato = marca.resposta
    ? `Mensagem automática. Dúvidas: <a href="mailto:${esc(marca.resposta)}" style="color:${cor.primaria}">${esc(marca.resposta)}</a>`
    : 'Mensagem automática. Por favor, não responda.';
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:24px 12px;background:#eef2f6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #dfe5ec">
    <tr><td style="height:5px;line-height:5px;font-size:0;background:${cor.destaque}">&nbsp;</td></tr>
    <tr><td style="background:#ffffff;padding:20px 26px;border-bottom:1px solid #edf1f5">${cabecalho(marca, cor)}</td></tr>
    ${faixa ? `<tr><td style="background:${cor.clara};padding:10px 26px;font:bold 12px Arial,sans-serif;color:${cor.primaria};letter-spacing:.3px">${esc(faixa)}</td></tr>` : ''}
    <tr><td style="padding:26px">${conteudo}</td></tr>
    <tr><td style="border-top:1px solid #e7ecf2;padding:16px 26px;background:#fafbfd">
      <p style="${MUDO}"><b style="color:#4c5c70">${nome}</b>${local}</p>
      <p style="${MUDO};margin-top:6px">${contato}</p>
    </td></tr>
  </table>
</body></html>`;
}

function botao(marca, texto, link) {
  const { destaque } = paleta(marca);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${destaque};border-radius:10px;text-align:center">
    <a href="${esc(link)}" style="display:block;padding:14px;font:bold 15px Arial,sans-serif;color:#ffffff;text-decoration:none">${esc(texto)}</a></td></tr></table>`;
}

function caixaCodigo(marca, codigo) {
  const { primaria, clara } = paleta(marca);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:${clara};border:1px dashed ${primaria};border-radius:12px;padding:16px;text-align:center;font:bold 32px 'Courier New',monospace;letter-spacing:10px;color:${primaria}">${esc(codigo)}</td></tr></table>`;
}

function tabela(linhas) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${linhas.map(([r, v, forte]) =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #edf1f5;font:13px Arial,sans-serif;color:#62748a">${esc(r)}</td>`
    + `<td style="padding:9px 0;border-bottom:1px solid #edf1f5;font:${forte ? 'bold ' : ''}13px Arial,sans-serif;color:#13233a;text-align:right">${esc(v)}</td></tr>`).join('')}</table>`;
}

const espacado = (c) => String(c).split('').join(' ');
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const ola = (n) => (primeiroNome(n) ? `Olá, ${esc(primeiroNome(n))}.` : 'Olá.');

// ── Código de aprovação de pagamento (lote, avulso, antecipações) ──────────
function tokenPagamento({ marca, codigo, valor, quantidade, solicitante, minutos = 10, tipo = null, referencia = null, destinos = [], link = null }) {
  const linhas = [];
  if (tipo) linhas.push(['Tipo', tipo]);
  linhas.push(['Entregadores', String(quantidade)]);
  linhas.push(['Total a pagar', valor, true]);
  if (referencia) linhas.push(['Lote', referencia]);
  // Para quem vai o dinheiro (ADR-036): o aprovador vê nome, valor e o começo e fim da chave.
  const para = destinos.length ? `<p style="${P};margin:0 0 6px"><b>Para quem vai</b></p>${tabela(destinos)}` : '';
  return {
    assunto: `Código de aprovação: ${espacado(codigo)}`,
    html: casca({ marca, faixa: 'APROVAÇÃO DE PAGAMENTO', conteudo: `
      <h1 style="${H}">Confirme este pagamento</h1>
      <p style="${P}"><b>${esc(solicitante)}</b> pediu para enviar um lote de Pix. Confira antes de aprovar.</p>
      ${tabela(linhas)}
      ${para}
      ${link ? `${botao(marca, 'Revisar e aprovar', link)}
      <p style="${P};margin-top:12px">O botão abre a página da ${esc(marca.nome)} no seu aparelho: você confere o lote e digita só a sua senha de aprovação. É o jeito mais seguro.</p>
      <p style="${P};margin:18px 0 8px">Ou, se estiver na tela de pagamento, use o código com a sua senha:</p>` : ''}
      ${caixaCodigo(marca, codigo)}
      <p style="${P};margin-top:16px">Vale por <b>${esc(minutos)} minutos</b> e só serve para este lote. Nunca passe sua senha de aprovação para outra pessoa.</p>
      <p style="${MUDO}">Não reconhece este pedido? Não aprove e avise o administrador da central.</p>` }),
    texto: `Código de aprovação: ${codigo}. ${tipo ? tipo + ' · ' : ''}${quantidade} entregador(es), total ${valor}${referencia ? ', lote ' + referencia : ''}. Pedido por ${solicitante}. Vale ${minutos} minutos.${link ? ' Revisar e aprovar: ' + link : ''}`,
  };
}

// ── Recuperar senha do PAINEL (link) ───────────────────────────────────────
function recuperarSenha({ marca, nome, link, painel, minutos = 30, quando = null, origem = null }) {
  const pedido = [quando ? `Pedido feito em ${esc(quando)}` : null, origem ? `de ${esc(origem)}` : null].filter(Boolean).join(', ');
  return {
    assunto: 'Redefinir sua senha',
    html: casca({ marca, conteudo: `
      <h1 style="${H}">Redefinir sua senha</h1>
      <p style="${P}">${ola(nome)} Recebemos um pedido para redefinir a senha do seu acesso ao painel${painel ? ` <b>${esc(painel)}</b>` : ''}.</p>
      ${botao(marca, 'Criar nova senha', link)}
      <p style="${P};margin-top:16px">O link vale por <b>${esc(minutos)} minutos</b> e só pode ser usado uma vez. Ao trocar a senha, os outros acessos abertos com a senha antiga são encerrados.</p>
      <p style="${MUDO}">${pedido ? pedido + '.<br>' : ''}Se não foi você, ignore este e-mail. Sua senha continua a mesma.</p>` }),
    texto: `${ola(nome)} Para criar uma nova senha do painel, abra: ${link} (vale ${minutos} minutos, uma vez só). Se não foi você, ignore este e-mail.`,
  };
}

// ── Recuperar senha do APP (código digitado no próprio app) ─────────────────
function recuperarSenhaApp({ marca, nome, codigo, app, minutos = 15 }) {
  return {
    assunto: `Seu código para criar uma nova senha: ${espacado(codigo)}`,
    html: casca({ marca, conteudo: `
      <h1 style="${H}">Seu código para entrar no app</h1>
      <p style="${P}">${ola(nome)} Use o código abaixo no app <b>${esc(app || marca.nome)}</b> para criar uma nova senha.</p>
      ${caixaCodigo(marca, codigo)}
      <p style="${P};margin-top:16px">O código vale por <b>${esc(minutos)} minutos</b>. Depois de criar a nova senha, você entra normalmente e suas corridas continuam onde estavam.</p>
      <p style="${MUDO}">Não pediu? Ignore este e-mail. Ninguém entra na sua conta sem este código.</p>` }),
    texto: `${ola(nome)} Seu código para criar uma nova senha no app: ${codigo} (vale ${minutos} minutos). Não pediu? Ignore este e-mail.`,
  };
}

// ── Exclusão de conta: confirmar o pedido ───────────────────────────────────
function exclusaoConfirmar({ marca, nome, link, saldo = null, horas = 48, diasApagar = 15 }) {
  const linhas = [['Seu acesso ao app', 'encerrado na confirmação']];
  if (saldo) linhas.push([`Saldo a receber (${saldo})`, 'pago no próximo fechamento']);
  linhas.push(['Dados pessoais', `apagados em até ${diasApagar} dias`]);
  linhas.push(['Notas e repasses', 'guardados pelo prazo da lei']);
  return {
    assunto: 'Confirme a exclusão da sua conta',
    html: casca({ marca, faixa: 'PEDIDO DE EXCLUSÃO DE CONTA', conteudo: `
      <h1 style="${H}">Você pediu para excluir sua conta</h1>
      <p style="${P}">${ola(nome)} Recebemos o pedido para excluir sua conta de entregador na <b>${esc(marca.nome)}</b>. Para confirmar que foi você, use o botão abaixo.</p>
      ${botao(marca, 'Confirmar exclusão', link)}
      <p style="${P};margin-top:18px"><b>O que acontece depois:</b></p>
      ${tabela(linhas)}
      <p style="${MUDO}">O link vale por ${esc(horas)} horas. Mudou de ideia? É só ignorar este e-mail: nada será excluído.</p>` }),
    texto: `${ola(nome)} Para confirmar a exclusão da sua conta na ${marca.nome}, abra: ${link} (vale ${horas} horas). Mudou de ideia? Ignore este e-mail.`,
  };
}

// ── Exclusão de conta: concluída ────────────────────────────────────────────
function exclusaoConcluida({ marca, nome, pedidoEm, apagadoEm, ultimoRepasse = null }) {
  const linhas = [['Acesso ao app', 'encerrado'], ['Dados pessoais', `apagados em ${apagadoEm}`]];
  if (ultimoRepasse) linhas.push(['Último repasse', ultimoRepasse, true]);
  return {
    assunto: 'Sua conta foi excluída',
    html: casca({ marca, conteudo: `
      <h1 style="${H}">Sua conta foi excluída</h1>
      <p style="${P}">${ola(nome)} Conforme pedido em ${esc(pedidoEm)}, sua conta de entregador na <b>${esc(marca.nome)}</b> foi excluída.</p>
      ${tabela(linhas)}
      <p style="${P}">Guardamos só o que a lei exige (notas e comprovantes de repasse), sem uso para nenhuma outra finalidade.</p>
      <p style="${MUDO}">Quer voltar a entregar com a gente? Faça um novo cadastro pelo app quando quiser.</p>` }),
    texto: `${ola(nome)} Sua conta de entregador na ${marca.nome} foi excluída (pedido em ${pedidoEm}). Dados pessoais apagados em ${apagadoEm}.`,
  };
}

// ── Aprovador de pagamentos: convite ou nova senha de aprovação (ADR-036) ──
// O link abre a página da central onde a PRÓPRIA pessoa cria a senha. Quem convidou não
// vê nem escolhe essa senha — é isso que impede alguém do painel de aprovar sozinho.
function aprovadorConvite({ marca, nome, link, horas = 48, convidadoPor = null, tipo = 'convite' }) {
  const novaSenha = tipo === 'nova_senha';
  return {
    assunto: novaSenha ? 'Criar nova senha de aprovação' : 'Você foi indicado para aprovar pagamentos',
    html: casca({ marca, faixa: novaSenha ? 'SENHA DE APROVAÇÃO' : 'APROVADOR DE PAGAMENTOS', conteudo: novaSenha ? `
      <h1 style="${H}">Criar nova senha de aprovação</h1>
      <p style="${P}">${ola(nome)} Foi pedida uma nova senha de aprovação de pagamentos da <b>${esc(marca.nome)}</b> para você.</p>
      ${botao(marca, 'Criar nova senha', link)}
      <p style="${P};margin-top:16px">O link vale por <b>${esc(horas)} hora(s)</b> e só pode ser usado uma vez. Até você criar a nova senha, a antiga continua valendo.</p>
      <p style="${MUDO}">Não pediu? Ignore este e-mail e avise o administrador da central: sem este link, ninguém troca a sua senha.</p>` : `
      <h1 style="${H}">Você vai aprovar os pagamentos</h1>
      <p style="${P}">${ola(nome)} ${convidadoPor ? `<b>${esc(convidadoPor)}</b> indicou você` : 'Você foi indicado'} para aprovar os pagamentos aos entregadores da <b>${esc(marca.nome)}</b>.</p>
      ${tabela([['Para aprovar um pagamento', 'código por e-mail + sua senha'], ['Quem vê a sua senha', 'só você']])}
      ${botao(marca, 'Criar minha senha de aprovação', link)}
      <p style="${P};margin-top:16px">O link vale por <b>${esc(horas)} horas</b> e só pode ser usado uma vez.</p>
      <p style="${MUDO}">Não esperava este convite? Não abra o link e avise o administrador da central.</p>` }),
    texto: novaSenha
      ? `${ola(nome)} Para criar uma nova senha de aprovação de pagamentos da ${marca.nome}, abra: ${link} (vale ${horas} hora(s), uma vez só).`
      : `${ola(nome)} Você foi indicado para aprovar os pagamentos da ${marca.nome}. Crie sua senha de aprovação em: ${link} (vale ${horas} horas).`,
  };
}

// ── Aviso de segurança sobre aprovadores e limites (ADR-036) ────────────────
// Um modelo para todos os avisos: quem aprova fica sabendo de toda mudança que mexe na
// trava. `link` é opcional (ex.: "cancelar este pedido" na troca sem senha).
function aprovadorAviso({ marca, nome = null, titulo, texto, linhas = [], link = null, rotuloLink = null, rodape = null }) {
  return {
    assunto: titulo,
    html: casca({ marca, faixa: 'SEGURANÇA DOS PAGAMENTOS', conteudo: `
      <h1 style="${H}">${esc(titulo)}</h1>
      <p style="${P}">${nome ? ola(nome) + ' ' : ''}${esc(texto)}</p>
      ${linhas.length ? tabela(linhas) : ''}
      ${link ? botao(marca, rotuloLink || 'Abrir', link) : ''}
      <p style="${MUDO};${link ? 'margin-top:16px' : ''}">${esc(rodape || 'Não reconhece esta mudança? Avise o administrador da central agora.')}</p>` }),
    texto: `${titulo}. ${texto}${linhas.length ? ' ' + linhas.map(([r, v]) => `${r}: ${v}`).join('; ') + '.' : ''}${link ? ' ' + link : ''}`,
  };
}

// ── Teste da configuração (tela do master) ──────────────────────────────────
function teste({ marca, remetente }) {
  return {
    assunto: 'Teste de envio de e-mail',
    html: casca({ marca, conteudo: `
      <h1 style="${H}">Está funcionando</h1>
      <p style="${P}">Este e-mail saiu de <b>${esc(remetente)}</b>. Se chegou na caixa de entrada (e não no spam), o domínio está verificado e pronto para os avisos da operação.</p>
      <p style="${MUDO}">Nenhuma ação é necessária.</p>` }),
    texto: `Teste de configuração. Este e-mail saiu de ${remetente}.`,
  };
}

const MODELOS = {
  token_pagamento: tokenPagamento,
  recuperar_senha: recuperarSenha,
  recuperar_senha_app: recuperarSenhaApp,
  exclusao_confirmar: exclusaoConfirmar,
  exclusao_concluida: exclusaoConcluida,
  aprovador_convite: aprovadorConvite,
  aprovador_aviso: aprovadorAviso,
  teste,
};

function montar(modelo, dados) {
  const f = MODELOS[modelo];
  if (!f) throw new Error(`modelo de e-mail desconhecido: ${modelo}`);
  return f(dados);
}

module.exports = { montar, MODELOS: Object.keys(MODELOS), _util: { paleta, casca } };
