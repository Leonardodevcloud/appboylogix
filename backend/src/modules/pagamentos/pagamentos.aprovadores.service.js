// Aprovadores de pagamento (ADR-036).
//
// O aprovador é uma PESSOA, não um campo de e-mail: confirma o e-mail pelo convite e cria
// uma senha de aprovação que só ela conhece. A regra que fecha a fraude "troco o e-mail
// pelo meu e aprovo sozinho":
//
//   · incluir ou remover aprovador pede a senha de um aprovador ATIVO;
//   · aprovar um lote pede o código do e-mail E a senha de quem recebeu o código;
//   · sem a senha de ninguém (aprovador saiu, perdeu a senha), só pelo pedido de 72 h
//     com pagamentos pausados (pagamentos.aprovadores.pedidos.service);
//   · até 5 aprovadores; toda mudança avisa aprovadores e equipe por e-mail.
//
// A única janela sem trava é a PRIMEIRA configuração (a central nunca teve aprovador
// ativo). Ela é avisada à equipe inteira, e nada pode ser aprovado antes de alguém criar a
// senha. Depois disso, ficar sem aprovador ativo não reabre a janela: só a troca de 72 h.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query, pool } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { evento, mascarar, nomeUsuario, dataHora, avisar } = require('./pagamentos.aprovadores.avisos');
const emailService = () => require('../email').service;

const MAX_APROVADORES = 5;
const HORAS_CONVITE = 48;
const HORAS_NOVA_SENHA = 2;
const MAX_ERROS = 5;            // a cada 5 erros seguidos: bloqueio de 30 min
const ERROS_DIA = 15;           // 15 erros sem um acerto: bloqueio de 24 h
const MINUTOS_BLOQUEIO = 30;
const SENHA_MIN = 10;
const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
// As que aparecem primeiro em qualquer lista de vazamento. A regra de tamanho já tira a
// maioria; esta lista pega as compridas e óbvias.
const COMUNS = new Set(['1234567890', '0123456789', '12345678910', 'qwertyuiop', 'senha12345', 'senhasenha',
  'aprovador123', 'pagamento123', 'administrador', 'admin12345', 'password123', '1q2w3e4r5t', 'abcdefghij']);

const hashLink = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const AUTORIZACAO = 'AUTORIZACAO_APROVADOR';

function paraTela(a) {
  const bloqueado = a.bloqueado_ate && new Date(a.bloqueado_ate) > new Date();
  return {
    id: a.id, nome: a.nome, email: mascarar(a.email), status: a.status,
    senha_definida_em: a.senha_definida_em,
    bloqueado_ate: bloqueado ? a.bloqueado_ate : null,
    convite_expira_em: a.status === 'convidado' ? a.link_expira_em : null,
    criado_em: a.criado_em,
  };
}

async function obter(empresaId, id) {
  const { rows: [a] } = await query(
    `SELECT * FROM pagamento_aprovadores WHERE id = $1 AND empresa_id = $2 AND status <> 'removido'`, [id, empresaId]);
  if (!a) throw AppError.naoEncontrado('Aprovador não encontrado');
  return a;
}

async function ativos(empresaId) {
  const { rows } = await query(
    `SELECT * FROM pagamento_aprovadores WHERE empresa_id = $1 AND status = 'ativo' ORDER BY criado_em`, [empresaId]);
  return rows;
}

async function vivos(empresaId) {
  const { rows } = await query(
    `SELECT * FROM pagamento_aprovadores WHERE empresa_id = $1 AND status <> 'removido' ORDER BY criado_em`, [empresaId]);
  return rows;
}

// ── Senha de aprovação ───────────────────────────────────────────────────────
// A conferência é SERIALIZADA por aprovador (SELECT … FOR UPDATE na transação): tentativas
// em paralelo esperam a anterior, então o contador não é furado por rajada. A cada 5 erros
// seguidos o aprovador fica 30 min bloqueado; com 15 erros sem um acerto, 24 h. O contador
// só zera num acerto — o bloqueio não devolve tentativas. A pessoa é avisada a cada bloqueio.
async function conferirSenha({ empresaId, aprovadorId, senha, motivo }) {
  const cx = await pool.connect();
  let resultado;
  try {
    await cx.query('BEGIN');
    const { rows: [a] } = await cx.query(
      `SELECT * FROM pagamento_aprovadores WHERE id = $1 AND empresa_id = $2 AND status <> 'removido' FOR UPDATE`, [aprovadorId, empresaId]);
    if (!a) throw AppError.naoEncontrado('Aprovador não encontrado');
    if (a.status !== 'ativo' || !a.senha_hash) throw AppError.validacao(`${a.nome} ainda não criou a senha de aprovação`);
    if (a.bloqueado_ate && new Date(a.bloqueado_ate) > new Date()) {
      throw AppError.validacao(`A senha de aprovação de ${a.nome} está bloqueada até ${dataHora(a.bloqueado_ate)} por excesso de tentativas`);
    }
    if (await bcrypt.compare(String(senha || ''), a.senha_hash)) {
      if (a.tentativas_erradas) await cx.query(`UPDATE pagamento_aprovadores SET tentativas_erradas = 0 WHERE id = $1`, [a.id]);
      await cx.query('COMMIT');
      return a;
    }
    const erros = Number(a.tentativas_erradas) + 1;
    const minutos = erros >= ERROS_DIA ? 24 * 60 : (erros % MAX_ERROS === 0 ? MINUTOS_BLOQUEIO : 0);
    await cx.query(`UPDATE pagamento_aprovadores SET tentativas_erradas = $2,
                    bloqueado_ate = CASE WHEN $3::int > 0 THEN now() + ($3::int || ' minutes')::interval ELSE bloqueado_ate END
                    WHERE id = $1`, [a.id, erros, minutos]);
    await cx.query('COMMIT');
    resultado = { a, erros, minutos };
  } catch (e) {
    await cx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { cx.release(); }

  const { a, erros, minutos } = resultado;
  await evento(empresaId, 'aprovador_senha_errada', { aprovador: a.nome, tentativa: erros, motivo });
  if (!minutos) throw AppError.validacao(`Senha de aprovação incorreta. Restam ${MAX_ERROS - (erros % MAX_ERROS)} tentativa(s) antes do bloqueio.`);
  const prazo = minutos >= 60 ? '24 horas' : `${minutos} minutos`;
  await evento(empresaId, 'aprovador_bloqueado', { aprovador: a.nome, motivo, prazo });
  await avisar(empresaId, { so: [{ nome: a.nome, email: a.email }],
    titulo: 'Sua senha de aprovação foi bloqueada',
    texto: `Alguém errou a sua senha de aprovação ${erros} vezes. Por segurança, ela fica bloqueada por ${prazo}.`,
    linhas: [['Quando', dataHora(new Date())], ['Tentando', motivo || 'aprovar pagamento']] });
  throw AppError.validacao(`Senha de aprovação incorreta. A senha de ${a.nome} ficou bloqueada por ${prazo}.`);
}

// A central já teve aprovador com senha? Então ficar sem nenhum ativo NÃO libera mudança
// sem senha (seria o atalho: removo o convite pendente e me convido).
async function jaTeveAprovador(empresaId) {
  const { rows: [r] } = await query(
    `SELECT EXISTS (SELECT 1 FROM pagamento_aprovadores WHERE empresa_id = $1 AND senha_definida_em IS NOT NULL) AS teve`, [empresaId]);
  return !!(r && r.teve);
}

// Exige a senha de QUALQUER aprovador ativo — para o que afrouxa a trava (incluir ou
// remover aprovador, subir limite, trocar credencial). Sem aprovador ativo:
//   · central que nunca teve um (primeira configuração) → devolve null, segue sem senha;
//   · central que já teve → recusa: o caminho é a troca sem senha de 72 h.
// O código de erro diz à tela que basta pedir a senha e repetir o pedido.
async function autorizar({ empresaId, autorizacao, motivo }) {
  const lista = await ativos(empresaId);
  if (!lista.length) {
    if (!(await jaTeveAprovador(empresaId))) return null;
    throw new AppError('Não há aprovador ativo para autorizar esta mudança. Use "Trocar sem senha (72 h)".', 422, 'SEM_APROVADOR_ATIVO');
  }
  if (!autorizacao || !autorizacao.aprovador_id || !autorizacao.senha) {
    throw new AppError('Esta mudança precisa da senha de um aprovador.', 422, AUTORIZACAO,
      { motivo, aprovadores: lista.map(paraTela) });
  }
  return conferirSenha({ empresaId, aprovadorId: autorizacao.aprovador_id, senha: autorizacao.senha, motivo });
}

// ── Link do e-mail (convite e nova senha) ────────────────────────────────────
async function exigirEnvio(empresaId) {
  if (!(await emailService().podeEnviar(empresaId))) {
    throw AppError.validacao('O e-mail da central ainda não está pronto (domínio verificado e remetente). Sem ele o convite não chega.');
  }
  const base = await emailService().baseDaEmpresa(empresaId);
  if (!base) throw AppError.validacao('A central ainda não tem endereço do painel configurado (Identidade visual › domínio). O link do convite sai por ele.');
  return base;
}

async function mandarLink({ empresaId, a, tipo, convidadoPor = null }) {
  const base = await exigirEnvio(empresaId);
  const token = crypto.randomBytes(32).toString('base64url');
  const horas = tipo === 'convite' ? HORAS_CONVITE : HORAS_NOVA_SENHA;
  await query(`UPDATE pagamento_aprovadores SET link_hash = $2, link_tipo = $3, link_expira_em = now() + ($4 || ' hours')::interval,
               atualizado_em = now() WHERE id = $1`, [a.id, hashLink(token), tipo, String(horas)]);
  await emailService().enviar({ empresaId, para: a.email, modelo: 'aprovador_convite',
    dados: { nome: a.nome, link: `${base}/aprovador?t=${token}`, horas, convidadoPor, tipo } });
}

// ── Painel ───────────────────────────────────────────────────────────────────
async function listar(empresaId) {
  return { aprovadores: (await vivos(empresaId)).map(paraTela), maximo: MAX_APROVADORES };
}

function validarPessoa({ nome, email }) {
  const n = String(nome || '').trim();
  const e = String(email || '').trim().toLowerCase();
  if (n.length < 3) throw AppError.validacao('Informe o nome completo do aprovador');
  if (!RE_EMAIL.test(e)) throw AppError.validacao('E-mail do aprovador inválido');
  return { nome: n.slice(0, 120), email: e.slice(0, 160) };
}

async function conferirVaga(empresaId, email, liberando = 0) {
  const lista = await vivos(empresaId);
  if (lista.some((a) => a.email.toLowerCase() === email)) throw AppError.conflito('Este e-mail já é aprovador (ou já foi convidado)');
  if (lista.length - liberando >= MAX_APROVADORES) {
    throw AppError.validacao(`Limite de ${MAX_APROVADORES} aprovadores. Remova um antes de incluir outro.`);
  }
}

// Mudança na lista de aprovadores roda numa transação com trava da empresa (advisory
// lock): duas inclusões ao mesmo tempo não passam juntas do limite de 5, e duas remoções
// ao mesmo tempo não deixam a central sem aprovador ativo.
async function comTrava(empresaId, fn) {
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');
    await cx.query(`SELECT pg_advisory_xact_lock(hashtext('pagamento_aprovadores:' || $1))`, [empresaId]);
    const r = await fn(cx);
    await cx.query('COMMIT');
    return r;
  } catch (e) {
    await cx.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { cx.release(); }
}

async function conferirVagaCx(cx, empresaId, email, liberando = 0) {
  const { rows } = await cx.query(`SELECT email FROM pagamento_aprovadores WHERE empresa_id = $1 AND status <> 'removido'`, [empresaId]);
  if (rows.some((a) => a.email.toLowerCase() === email)) throw AppError.conflito('Este e-mail já é aprovador (ou já foi convidado)');
  if (rows.length - liberando >= MAX_APROVADORES) {
    throw AppError.validacao(`Limite de ${MAX_APROVADORES} aprovadores. Remova um antes de incluir outro.`);
  }
}

// Insere o convidado (dentro da trava) e manda o convite. Usado aqui e pelo pedido de 72 h.
async function criarConvidado({ empresaId, nome, email, convidadoPor, autorizadoPor = null }) {
  const a = await comTrava(empresaId, async (cx) => {
    await conferirVagaCx(cx, empresaId, email);
    const { rows: [novo] } = await cx.query(`
      INSERT INTO pagamento_aprovadores (empresa_id, nome, email, status, convidado_por, autorizado_por)
      VALUES ($1,$2,$3,'convidado',$4,$5) RETURNING *`, [empresaId, nome, email, convidadoPor, autorizadoPor]);
    return novo;
  });
  await mandarLink({ empresaId, a, tipo: 'convite', convidadoPor: await nomeUsuario(convidadoPor) });
  return a;
}

async function convidar({ empresaId, nome, email, autorizacao, usuarioId }) {
  const p = validarPessoa({ nome, email });
  await conferirVaga(empresaId, p.email);
  await exigirEnvio(empresaId);
  const autorizador = await autorizar({ empresaId, autorizacao, motivo: `incluir ${p.nome} como aprovador` });

  const a = await criarConvidado({ empresaId, ...p, convidadoPor: usuarioId, autorizadoPor: autorizador && autorizador.id });
  const quem = await nomeUsuario(usuarioId);
  await evento(empresaId, 'aprovador_convidado', { aprovador: p.nome, email: mascarar(p.email), quem, autorizado_por: autorizador ? autorizador.nome : null });
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_aprovador_convidar',
    entidade: { tipo: 'pagamento_aprovador', id: a.id }, depois: { nome: p.nome, email: p.email, autorizado_por: autorizador && autorizador.id } });
  await avisar(empresaId, {
    titulo: 'Novo aprovador de pagamentos',
    texto: `${p.nome} foi convidado para aprovar os pagamentos aos entregadores.`,
    linhas: [['Convidado por', quem || '—'], ['Autorizado por', autorizador ? autorizador.nome : 'primeiro aprovador da central'], ['Quando', dataHora(new Date())]],
  });
  return listar(empresaId);
}

async function reenviarConvite({ empresaId, id, usuarioId }) {
  const a = await obter(empresaId, id);
  if (a.status !== 'convidado') throw AppError.validacao('Este aprovador já criou a senha');
  await mandarLink({ empresaId, a, tipo: 'convite', convidadoPor: await nomeUsuario(a.convidado_por) });
  await evento(empresaId, 'aprovador_convite_reenviado', { aprovador: a.nome, quem: await nomeUsuario(usuarioId) });
  return listar(empresaId);
}

// "Esqueci a senha de aprovação": o link vai SÓ para o e-mail do próprio aprovador, e a
// senha antiga vale até ele criar a nova. Ninguém do painel consegue usar isto.
async function pedirNovaSenha({ empresaId, id, usuarioId }) {
  const a = await obter(empresaId, id);
  if (a.status !== 'ativo') throw AppError.validacao('Este aprovador ainda não criou a senha. Reenvie o convite.');
  await mandarLink({ empresaId, a, tipo: 'nova_senha' });
  await evento(empresaId, 'aprovador_nova_senha_pedida', { aprovador: a.nome, quem: await nomeUsuario(usuarioId) });
  return { ok: true, enviado_para: mascarar(a.email), horas: HORAS_NOVA_SENHA };
}

async function remover({ empresaId, id, autorizacao, usuarioId }) {
  const a = await obter(empresaId, id);
  const unico = (lista) => a.status === 'ativo' && lista.length === 1;
  if (unico(await ativos(empresaId))) {
    throw AppError.validacao(`${a.nome} é o único aprovador ativo. Inclua outro antes de remover, ou peça a troca sem senha.`);
  }
  // Convite pendente também só sai com senha: senão daria para sumir com o convite de um
  // aprovador legítimo em silêncio.
  const autorizador = await autorizar({ empresaId, autorizacao,
    motivo: a.status === 'ativo' ? `remover ${a.nome} dos aprovadores` : `cancelar o convite de ${a.nome}` });
  await comTrava(empresaId, async (cx) => {
    // Reconferido dentro da trava: outra remoção pode ter acabado de passar.
    const { rows } = await cx.query(`SELECT id FROM pagamento_aprovadores WHERE empresa_id = $1 AND status = 'ativo'`, [empresaId]);
    if (unico(rows)) throw AppError.validacao(`${a.nome} é o único aprovador ativo.`);
    const { rowCount } = await cx.query(`UPDATE pagamento_aprovadores SET status = 'removido', removido_em = now(), link_hash = NULL,
                 link_expira_em = NULL, atualizado_em = now() WHERE id = $1 AND empresa_id = $2 AND status <> 'removido'`, [a.id, empresaId]);
    if (!rowCount) throw AppError.naoEncontrado('Aprovador não encontrado');
  });
  const quem = await nomeUsuario(usuarioId);
  await evento(empresaId, 'aprovador_removido', { aprovador: a.nome, quem, autorizado_por: autorizador ? autorizador.nome : null });
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_aprovador_remover',
    entidade: { tipo: 'pagamento_aprovador', id: a.id }, antes: { nome: a.nome, email: a.email, status: a.status },
    depois: { autorizado_por: autorizador && autorizador.id } });
  await avisar(empresaId, {
    extras: [{ nome: a.nome, email: a.email, aprovador: false }],
    titulo: 'Aprovador de pagamentos removido',
    texto: `${a.nome} deixou de aprovar os pagamentos aos entregadores.`,
    linhas: [['Removido por', quem || '—'], ['Autorizado por', autorizador ? autorizador.nome : '—'], ['Quando', dataHora(new Date())]],
  });
  return listar(empresaId);
}

// ── Página pública do link (convite / nova senha) ────────────────────────────
async function porLink(token) {
  if (!token || String(token).length < 20) throw AppError.validacao('Link inválido. Peça um novo à central.');
  const { rows: [a] } = await query(`
    SELECT a.*, coalesce(b.nome_exibicao, e.nome_fantasia) AS empresa_nome
      FROM pagamento_aprovadores a
      JOIN empresas e ON e.id = a.empresa_id
      LEFT JOIN empresa_branding b ON b.empresa_id = a.empresa_id
     WHERE a.link_hash = $1 AND a.status <> 'removido'`, [hashLink(token)]);
  if (!a || !a.link_expira_em || new Date(a.link_expira_em) < new Date()) {
    throw AppError.validacao('Este link venceu ou já foi usado. Peça um novo à central.');
  }
  return a;
}

async function conferirLink({ token }) {
  const a = await porLink(token);
  return { nome: a.nome, email: mascarar(a.email), tipo: a.link_tipo, empresa: a.empresa_nome, expira_em: a.link_expira_em, senha_min: SENHA_MIN };
}

// Regras da senha: tamanho, não ser óbvia, e não ser a mesma do login no painel (se a
// pessoa também tiver login) — senão quem descobrir uma, tem as duas.
async function validarSenha(a, senha) {
  const s = String(senha || '');
  if (s.length < SENHA_MIN) throw AppError.validacao(`A senha de aprovação precisa ter pelo menos ${SENHA_MIN} caracteres`);
  if (s.length > 128) throw AppError.validacao('Senha longa demais');
  if (COMUNS.has(s.toLowerCase()) || /^(.)\1+$/.test(s)) throw AppError.validacao('Essa senha é fácil de adivinhar. Escolha outra.');
  const { rows: [u] } = await query(
    `SELECT senha_hash FROM usuarios WHERE empresa_id = $1 AND lower(email) = lower($2) AND ativo = TRUE`, [a.empresa_id, a.email]);
  if (u && u.senha_hash && (await bcrypt.compare(s, u.senha_hash))) {
    throw AppError.validacao('Use uma senha diferente da sua senha de login do painel');
  }
}

async function definirSenha({ token, senha, ip }) {
  const a = await porLink(token);
  await validarSenha(a, senha);
  const hash = await bcrypt.hash(String(senha), 12);
  // Condicionado ao mesmo link: dois cliques no botão não gravam duas vezes.
  const { rowCount } = await query(`
    UPDATE pagamento_aprovadores SET status = 'ativo', senha_hash = $2, senha_definida_em = now(), link_hash = NULL,
           link_tipo = NULL, link_expira_em = NULL, tentativas_erradas = 0, bloqueado_ate = NULL, atualizado_em = now()
     WHERE id = $1 AND link_hash = $3`, [a.id, hash, hashLink(token)]);
  if (!rowCount) throw AppError.validacao('Este link já foi usado.');

  const novo = a.link_tipo === 'convite';
  await evento(a.empresa_id, novo ? 'aprovador_ativado' : 'aprovador_senha_trocada', { aprovador: a.nome, ip: ip || null });
  await registrarAuditoria({ empresaId: a.empresa_id, usuarioId: null, categoria: 'financeiro',
    acao: novo ? 'pagamento_aprovador_ativar' : 'pagamento_aprovador_nova_senha',
    entidade: { tipo: 'pagamento_aprovador', id: a.id }, depois: { nome: a.nome } });
  await avisar(a.empresa_id, {
    titulo: novo ? 'Aprovador ativado' : 'Senha de aprovação trocada',
    texto: novo ? `${a.nome} confirmou o e-mail e criou a senha de aprovação. A partir de agora pode aprovar pagamentos.`
      : `${a.nome} criou uma nova senha de aprovação pelo link enviado ao e-mail dele.`,
    linhas: [['Quando', dataHora(new Date())]],
  });
  return { ok: true, nome: a.nome, empresa: a.empresa_nome, tipo: novo ? 'convite' : 'nova_senha' };
}

module.exports = {
  MAX_APROVADORES, AUTORIZACAO, MAX_ERROS,
  paraTela, obter, ativos, vivos, listar, conferirSenha, autorizar,
  convidar, reenviarConvite, pedirNovaSenha, remover, conferirLink, definirSenha,
  validarPessoa, conferirVaga, criarConvidado, exigirEnvio, jaTeveAprovador, comTrava, conferirVagaCx,
  _util: { validarSenha, hashLink },
};
