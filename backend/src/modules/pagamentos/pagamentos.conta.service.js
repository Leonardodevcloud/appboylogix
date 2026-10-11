// Conta bancária da empresa: credenciais e tetos. Quem aprova mora em
// pagamentos.aprovadores.service (ADR-036).
//
// Segredo entra, nunca sai. O que a tela recebe é máscara; o valor em claro só é
// decifrado dentro do adaptador, na hora de falar com o banco.
//
// O que AFROUXA a trava (trocar credencial ou ambiente, subir teto, dispensar código até
// o teto, ativar a conta) pede a senha de um aprovador ativo. Apertar (baixar
// teto, exigir sempre o código, desativar a conta) é livre.
const { query } = require('../../shared/db');
const AppError = require('../../shared/AppError');
const { pagamentos: cofre } = require('../../shared/cripto');
const { registrarAuditoria } = require('../../shared/auditLogger');
const { adaptador, PROVEDORES } = require('./pagamentos.bancos');
const { montarBrCode } = require('./pagamentos.brcode');
const QRCode = require('qrcode');
const log = require('../../shared/logger');
const aprov = require('./pagamentos.aprovadores.service');
const { evento, nomeUsuario, avisar } = require('./pagamentos.aprovadores.avisos');

// Validação e cifragem saem da DECLARAÇÃO do adaptador, não de uma lista fixa aqui.
// Acrescentar banco novo não deve exigir tocar neste arquivo.
function campoSecreto(campo) { return campo.segredo || campo.tipo === 'senha' || campo.tipo === 'arquivo'; }

async function obterBruta(empresaId) {
  const { rows: [r] } = await query(`SELECT * FROM pagamento_contas WHERE empresa_id = $1`, [empresaId]);
  return r || null;
}

// Conta pronta para operar. Quem chama isto vai mexer em dinheiro: se algo essencial
// falta, é melhor parar aqui com um motivo claro do que descobrir no meio do lote.
async function contaOperacional(empresaId) {
  const c = await obterBruta(empresaId);
  if (!c || !c.provedor) throw AppError.validacao('Nenhum banco liberado para esta empresa. Fale com o suporte da plataforma.');
  if (!c.ativo) throw AppError.validacao('Conta bancária não configurada ou inativa');
  const banco = adaptador(c.provedor);
  const faltando = (banco.campos || []).filter((f) => f.obrigatorio && !(c.credenciais || {})[f.codigo]);
  if (faltando.length) throw AppError.validacao('Faltam credenciais do banco: ' + faltando.map((f) => f.rotulo).join(', '));
  return c;
}

// O que a tela recebe: NUNCA o segredo. Campo secreto vira máscara; campo comum vai
// em claro porque não é segredo (número de conta, chave Pix do pagador).
function credenciaisParaTela(banco, credenciais) {
  const arquivos = (credenciais || {}).__arquivos || {};
  const saida = {};
  for (const f of banco.campos || []) {
    const bruto = (credenciais || {})[f.codigo];
    if (!bruto) { saida[f.codigo] = null; continue; }
    if (f.tipo === 'arquivo') saida[f.codigo] = arquivos[f.codigo] || 'arquivo enviado';
    else if (campoSecreto(f)) saida[f.codigo] = cofre.mascarar(bruto);
    else saida[f.codigo] = decifrarSeguro(bruto);
  }
  return saida;
}

// Campo não secreto foi gravado em claro; tolera valor legado cifrado.
function decifrarSeguro(v) { try { return cofre.decifrar(v); } catch { return v; } }

function paraTela(c, banco) {
  const base = banco ? { campos: banco.campos || [], capacidades: banco.capacidades || {}, provedor_nome: banco.nome } : { campos: [], capacidades: {}, provedor_nome: null };
  if (!c) {
    return {
      ...base, configurada: false, provedor: null, ambiente: 'hml', ativo: false,
      credenciais: {}, teto_item_cent: 200000, teto_lote_cent: 5000000, teto_dia_cent: 12000000, aprovacao: 'sempre',
    };
  }
  return {
    ...base,
    configurada: true,
    // O provedor é informação: quem escolhe é o master, em liberarProvedor().
    provedor: c.provedor, provedor_liberado_em: c.provedor_liberado_em,
    ambiente: c.ambiente, ativo: c.ativo,
    credenciais: banco ? credenciaisParaTela(banco, c.credenciais) : {},
    teto_item_cent: Number(c.teto_item_cent), teto_lote_cent: Number(c.teto_lote_cent), teto_dia_cent: Number(c.teto_dia_cent),
    aprovacao: c.aprovacao,
    atualizado_em: c.atualizado_em,
  };
}

async function obter(empresaId) {
  const c = await obterBruta(empresaId);
  // `cofre_pronto` avisa a tela ANTES de o operador digitar um segredo que não
  // conseguiríamos ler de volta (PAGAMENTOS_CRYPTO_KEY ausente).
  return { ...paraTela(c, c && c.provedor ? adaptador(c.provedor) : null), cofre_pronto: cofre.pronto() };
}

async function salvar({ empresaId, dados, usuarioId }) {
  // O provedor NÃO vem do corpo: é o que o master liberou. Aceitar aqui deixaria a
  // central apontar para outro banco só mandando outro campo.
  const atual = await obterBruta(empresaId);
  if (!atual || !atual.provedor) {
    throw AppError.validacao('Nenhum banco liberado para esta empresa. A liberação é feita pela plataforma.');
  }
  const banco = adaptador(atual.provedor);
  // Falha alto e cedo: guardar credencial que não poderá ser decifrada é pior que
  // recusar o salvamento.
  if (!cofre.pronto()) throw AppError.validacao('A plataforma não está pronta para guardar credenciais bancárias (PAGAMENTOS_CRYPTO_KEY ausente). Fale com o suporte.');
  if (!['hml', 'prod'].includes(dados.ambiente)) throw AppError.validacao('Ambiente inválido');
  if (!['sempre', 'acima_teto'].includes(dados.aprovacao)) throw AppError.validacao('Regra de aprovação inválida');
  if (dados.ativo && !(await aprov.ativos(empresaId)).length) {
    throw AppError.validacao('Cadastre um aprovador (e espere ele criar a senha) antes de ativar a conta');
  }

  for (const t of ['teto_item_cent', 'teto_lote_cent', 'teto_dia_cent']) {
    const v = Number(dados[t]);
    if (!Number.isInteger(v) || v <= 0) throw AppError.validacao('Os tetos precisam ser valores positivos');
  }
  if (Number(dados.teto_item_cent) > Number(dados.teto_lote_cent)) throw AppError.validacao('O teto por entregador não pode ser maior que o teto por lote');
  if (Number(dados.teto_lote_cent) > Number(dados.teto_dia_cent)) throw AppError.validacao('O teto por lote não pode ser maior que o teto por dia');

  // Credenciais: só os campos que o adaptador declarou. Campo fora da lista é ignorado
  // — o formulário não decide o que o banco aceita.
  const entrada = dados.credenciais || {};
  const arquivos = { ...((atual.credenciais || {}).__arquivos || {}) };
  const credenciais = { ...(atual.credenciais || {}) };
  delete credenciais.__arquivos;

  for (const f of banco.campos || []) {
    const valor = entrada[f.codigo];
    // Vazio = manter o que já está gravado (a tela nunca recebe o segredo de volta).
    if (valor == null || valor === '') continue;
    credenciais[f.codigo] = campoSecreto(f) ? cofre.cifrar(String(valor)) : String(valor);
    if (f.tipo === 'arquivo' && entrada[f.codigo + '_nome']) arquivos[f.codigo] = String(entrada[f.codigo + '_nome']).slice(0, 160);
  }
  // Só exige campo obrigatório quando a conta vai ficar ATIVA: dá para salvar em partes.
  if (dados.ativo) {
    const faltando = (banco.campos || []).filter((f) => f.obrigatorio && !credenciais[f.codigo]);
    if (faltando.length) throw AppError.validacao('Preencha antes de ativar: ' + faltando.map((f) => f.rotulo).join(', '));
  }
  if (Object.keys(arquivos).length) credenciais.__arquivos = arquivos;

  const mudancas = afrouxamentos(atual, dados, banco);
  const autorizador = mudancas.length
    ? await aprov.autorizar({ empresaId, autorizacao: dados.autorizacao, motivo: mudancas.join('; ') })
    : null;

  await query(`
    INSERT INTO pagamento_contas (empresa_id, provedor, ambiente, credenciais,
      teto_item_cent, teto_lote_cent, teto_dia_cent, aprovacao, ativo, atualizado_em)
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9, now())
    ON CONFLICT (empresa_id) DO UPDATE SET ambiente = EXCLUDED.ambiente, credenciais = EXCLUDED.credenciais,
      teto_item_cent = EXCLUDED.teto_item_cent, teto_lote_cent = EXCLUDED.teto_lote_cent,
      teto_dia_cent = EXCLUDED.teto_dia_cent, aprovacao = EXCLUDED.aprovacao,
      ativo = EXCLUDED.ativo, atualizado_em = now()`,
  [empresaId, atual.provedor, dados.ambiente, JSON.stringify(credenciais),
    dados.teto_item_cent, dados.teto_lote_cent, dados.teto_dia_cent, dados.aprovacao, !!dados.ativo]);

  // Auditoria SEM segredo: registra QUAIS campos foram tocados, nunca o valor.
  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_conta_salvar',
    entidade: { tipo: 'pagamento_conta', id: empresaId },
    depois: { provedor: atual.provedor, ambiente: dados.ambiente, ativo: !!dados.ativo,
      campos_alterados: Object.keys(entrada).filter((k) => entrada[k] !== '' && entrada[k] != null),
      tetos: { item: dados.teto_item_cent, lote: dados.teto_lote_cent, dia: dados.teto_dia_cent },
      aprovacao: dados.aprovacao, afrouxou: mudancas, autorizado_por: autorizador && autorizador.id } });

  const quem = await nomeUsuario(usuarioId);
  await evento(empresaId, 'conta_salva', { quem, mudancas, ativo: !!dados.ativo, autorizado_por: autorizador ? autorizador.nome : null });
  if (mudancas.length && autorizador) {
    await avisar(empresaId, {
      titulo: 'Trava de pagamentos alterada',
      texto: 'Uma mudança que afrouxa a trava dos pagamentos foi autorizada com senha de aprovador.',
      linhas: [...mudancas.map((m) => ['Mudança', m]), ['Feita por', quem || '—'], ['Autorizada por', autorizador.nome]],
    });
  }
  return obter(empresaId);
}

// O que afrouxa a trava, em texto (vai para o aviso e para o histórico). Conta nova, sem
// nada gravado ainda, não tem trava a afrouxar — mas a autorização só é exigida quando já
// existe aprovador ativo, então a primeira configuração passa sem senha.
function afrouxamentos(atual, dados, banco) {
  const m = [];
  const entrada = dados.credenciais || {};
  // Só conta o que MUDOU: campo comum vem preenchido na tela e volta igual a cada salvar.
  const gravadas = atual.credenciais || {};
  const tocadas = (banco.campos || []).filter((f) => entrada[f.codigo] != null && entrada[f.codigo] !== ''
    && (gravadas[f.codigo] == null || decifrarSeguro(gravadas[f.codigo]) !== String(entrada[f.codigo])));
  if (tocadas.length) m.push('credenciais do banco trocadas: ' + tocadas.map((f) => f.rotulo).join(', '));
  if (atual.ambiente && dados.ambiente !== atual.ambiente) m.push(`ambiente: ${atual.ambiente} → ${dados.ambiente}`);
  const reais = (c) => 'R$ ' + (Number(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  for (const [k, rotulo] of [['teto_item_cent', 'teto por entregador'], ['teto_lote_cent', 'teto por lote'], ['teto_dia_cent', 'teto por dia']]) {
    if (Number(dados[k]) > Number(atual[k])) m.push(`${rotulo}: ${reais(atual[k])} → ${reais(dados[k])}`);
  }
  if (dados.aprovacao === 'acima_teto' && atual.aprovacao !== 'acima_teto') m.push('código dispensado até o teto por lote');
  // Ativar é afrouxar: desativar a conta é o "botão de pânico" de quem aprova, e não pode
  // ser desfeito por qualquer um.
  if (dados.ativo && !atual.ativo) m.push('conta ativada');
  return m;
}

async function testar(empresaId) {
  const c = await contaOperacional(empresaId);
  const banco = adaptador(c.provedor);
  const { saldo_cent: saldo } = await banco.saldo(c);
  await query(`INSERT INTO pagamento_eventos (empresa_id, tipo, detalhe) VALUES ($1,'conta_testada',$2::jsonb)`,
    [empresaId, JSON.stringify({ provedor: c.provedor, ambiente: c.ambiente })]);
  return { ok: true, saldo_cent: saldo };
}

async function saldo(empresaId) {
  const c = await contaOperacional(empresaId);
  return adaptador(c.provedor).saldo(c);
}

async function extrato({ empresaId, de, ate }) {
  const c = await contaOperacional(empresaId);
  const linhas = await adaptador(c.provedor).extrato(c, { de, ate });
  return { linhas };
}

// Liberação do banco — AÇÃO DO MASTER. Cria a linha da conta se ainda não existir,
// para o cliente já encontrar a tela pronta para preencher as credenciais dele.
async function liberarProvedor({ empresaId, provedor, usuarioId }) {
  if (provedor && !PROVEDORES[provedor]) throw AppError.validacao('Banco não suportado');
  const antes = await obterBruta(empresaId);

  if (!provedor) {
    // Retirar a liberação desativa a conta: sem banco, nada pode ser enviado.
    await query(`UPDATE pagamento_contas SET provedor = NULL, ativo = FALSE,
                 provedor_liberado_por = NULL, provedor_liberado_em = NULL, atualizado_em = now()
                  WHERE empresa_id = $1`, [empresaId]);
  } else {
    await query(`
      INSERT INTO pagamento_contas (empresa_id, provedor, provedor_liberado_por, provedor_liberado_em, atualizado_em)
      VALUES ($1,$2,$3, now(), now())
      ON CONFLICT (empresa_id) DO UPDATE SET provedor = EXCLUDED.provedor,
        provedor_liberado_por = EXCLUDED.provedor_liberado_por, provedor_liberado_em = now(), atualizado_em = now()`,
    [empresaId, provedor, usuarioId]);
  }

  await registrarAuditoria({ empresaId, usuarioId, categoria: 'financeiro', acao: 'pagamento_provedor_liberar',
    entidade: { tipo: 'pagamento_conta', id: empresaId },
    antes: { provedor: (antes && antes.provedor) || null }, depois: { provedor: provedor || null } });
  return obter(empresaId);
}

// Catálogo de bancos suportados — lista do master, não do cliente.
function provedoresDisponiveis() {
  return Object.entries(PROVEDORES).map(([codigo, a]) => ({
    codigo, nome: a.nome,
    campos: (a.campos || []).map((f) => ({ codigo: f.codigo, rotulo: f.rotulo, obrigatorio: !!f.obrigatorio })),
    capacidades: a.capacidades || {},
  }));
}

// Código Pix copia e cola para pagamento POR FORA — sem API, sem banco. Nome e cidade
// saem do cadastro da empresa, que é quem aparece como pagador no app do operador.
async function brcode({ empresaId, chave, valorCent, txid }) {
  if (!chave) throw AppError.validacao('Informe a chave Pix de destino');
  const { rows: [e] } = await query(
    `SELECT nome_fantasia, cidade FROM empresas WHERE id = $1`, [empresaId]);
  const payload = montarBrCode({
    chave, valorCent,
    nome: (e && e.nome_fantasia) || 'RECEBEDOR',
    cidade: (e && e.cidade) || 'BRASIL',
    txid,
  });

  // A imagem é gerada AQUI, no servidor, e não no navegador: o painel não tem build,
  // e assim nenhuma biblioteca externa é carregada na tela do operador. Vai como SVG
  // porque escala sem borrar quando a câmera de outro aparelho tenta ler.
  // Correção de erro 'M': aguenta o quadrado sujo ou parcialmente coberto.
  let svg = null;
  try {
    svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 240 });
  } catch (err) {
    // Sem imagem ainda dá para pagar: o copia e cola é o que o banco realmente lê.
    log.warn({ erro: err.message }, 'pagamentos: falha ao desenhar o QR; segue só o copia e cola');
  }
  return { payload, svg };
}

module.exports = { _util: { afrouxamentos }, obter, obterBruta, contaOperacional, salvar, testar, saldo, extrato, liberarProvedor, provedoresDisponiveis, brcode };
