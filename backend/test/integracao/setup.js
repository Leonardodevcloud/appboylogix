// Helpers dos testes de integração. Exigem DATABASE_URL_TEST (Postgres real).
// Sem a variável, os testes de integração são PULADOS (unitários continuam rodando).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Cofre de pagamentos: credencial de banco tem chave própria (ADR-028). Sem ela o
// módulo se recusa a guardar segredo — inclusive nos testes, de propósito.
process.env.PAGAMENTOS_CRYPTO_KEY = process.env.PAGAMENTOS_CRYPTO_KEY || 'chave-de-teste-pagamentos';

export const TEM_BANCO = !!process.env.DATABASE_URL_TEST;

export function prepararAmbiente() {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.DB_SSL = 'false';
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'segredo-teste-integracao';
  process.env.ORS_API_KEY = process.env.ORS_API_KEY || 'x';
  process.env.CORS_ORIGIN = 'http://painel.teste';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.WORKER_EMBUTIDO = 'false';
}

export async function subirApp() {
  prepararAmbiente();
  const { montarApp, migrar } = require('../../src/app');
  await migrar();
  return montarApp();
}

export function db() { return require('../../src/shared/db'); }

// Cria super admin + empresa (com central_admin) e devolve tokens prontos.
export async function criarCenario(app, request, sufixo) {
  const { query } = db();
  const sh = require('../../src/modules/auth/auth.shared');
  const emailAdmin = `super-${sufixo}@teste.local`;
  const hash = await sh.hashSenha('Senha123!');
  await query(`INSERT INTO usuarios (perfil, nome, email, senha_hash) VALUES ('super_admin', 'Super', $1, $2) ON CONFLICT (email) DO UPDATE SET senha_hash = $2`, [emailAdmin, hash]);
  const login = await request(app).post('/api/v1/auth/login').send({ email: emailAdmin, senha: 'Senha123!' });
  const tokenSuper = login.body.accessToken;

  const cnpj = String(Date.now() + Math.floor(Math.random() * 1000)).padStart(14, '0').slice(-14);
  const emp = await request(app).post('/api/v1/empresas').set('Authorization', `Bearer ${tokenSuper}`).send({
    razao_social: `Empresa ${sufixo} LTDA`, nome_fantasia: `Empresa ${sufixo}`, cnpj,
    email: `dono-${sufixo}@teste.local`, senha: 'Senha123!', responsavel: 'Dono',
  });
  if (emp.status >= 300) throw new Error('criar empresa falhou: ' + JSON.stringify(emp.body));
  const empresaId = emp.body.empresa.id;
  const loginDono = await request(app).post('/api/v1/auth/login').send({ email: `dono-${sufixo}@teste.local`, senha: 'Senha123!' });
  return { tokenSuper, empresaId, tokenDono: loginDono.body.accessToken, corpoEmpresa: emp.body };
}

// ── Helpers da Onda 7 (rede de testes dos módulos sem cobertura) ──────────────
// Pequenos e sem regra de negócio: só montam o cenário no banco para o teste
// afirmar a regra pelo caminho real (HTTP ou service).

// Liga um módulo vendável para a empresa (empresa nova nasce só com o núcleo).
export async function ligarModulo(empresaId, codigo) {
  const { query } = db();
  await query(`INSERT INTO empresa_modulos (empresa_id, modulo_codigo, ativo) VALUES ($1, $2, TRUE)
               ON CONFLICT (empresa_id, modulo_codigo) DO UPDATE SET ativo = TRUE`, [empresaId, codigo]);
}

export async function criarLoja(empresaId, nome = 'Loja ' + Date.now()) {
  const { query } = db();
  const { rows } = await query(`INSERT INTO lojas (empresa_id, nome_fantasia) VALUES ($1, $2) RETURNING id`, [empresaId, nome]);
  return rows[0].id;
}

// Motoboy aprovado e ativo (opcionalmente online e posicionado), com PIN 4826.
let _seqMotoboy = 0;
export async function criarMotoboy(empresaId, { online = false, lat = null, lng = null, nome = 'Moto' } = {}) {
  const { query } = db();
  const bcrypt = require('bcryptjs');
  _seqMotoboy += 1;
  const tel = String(Date.now() + _seqMotoboy * 7919).slice(-11);
  const { rows } = await query(
    `INSERT INTO motoboys (empresa_id, nome_completo, cpf, telefone_principal, status, situacao_cadastro, pin_hash, online)
     VALUES ($1, $2, $3, $4, 'ativo', 'aprovado', $5, $6) RETURNING id`,
    [empresaId, nome, tel, tel, await bcrypt.hash('4826', 10), online]);
  const id = rows[0].id;
  if (lat != null && lng != null) {
    await query(`INSERT INTO motoboy_posicao_atual (motoboy_id, empresa_id, lat, lng, capturado_em) VALUES ($1,$2,$3,$4, now())
                 ON CONFLICT (motoboy_id) DO UPDATE SET lat = $3, lng = $4, capturado_em = now()`, [id, empresaId, lat, lng]);
  }
  return { id, telefone: tel };
}

// Entrega direto no banco (sem geocoding/ORS), no status pedido.
let _seqEntrega = 0;
export async function criarEntrega(empresaId, { status = 'aguardando_atribuicao', lojaId = null, motoboyId = null, lat = -12.97, lng = -38.51, valorMotoboyCent = 1000, concluidaEm = null } = {}) {
  const { query } = db();
  _seqEntrega += 1;
  const { rows } = await query(
    `INSERT INTO entregas (empresa_id, loja_id, motoboy_id, protocolo, status, coleta_nome, coleta_endereco, coleta_lat, coleta_lng, valor_motoboy_cent, concluida_em)
     VALUES ($1,$2,$3,$4,$5,'Coleta','Rua X, 1',$6,$7,$8,$9) RETURNING id, protocolo`,
    [empresaId, lojaId, motoboyId, `T7-${Date.now()}-${_seqEntrega}`, status, lat, lng, valorMotoboyCent, concluidaEm]);
  await query(`INSERT INTO entregas_pontos (entrega_id, ordem, nome, endereco, status) VALUES ($1, 1, 'Ponto 1', 'Rua Y, 2', 'pendente')`, [rows[0].id]);
  return rows[0];
}

// Aprovador de pagamento já ativo (ADR-036), direto no banco: o convite por e-mail tem a
// própria suíte (aprovadores.integracao). Custo do bcrypt baixo só para o teste.
export const SENHA_APROVADOR = 'senha-aprovador-teste-1';
export async function criarAprovador(empresaId, { nome = 'Aprovador Teste', email = null, senha = SENHA_APROVADOR } = {}) {
  const bcrypt = require('bcryptjs');
  const { query } = db();
  const endereco = email || `aprov${Date.now()}${Math.random().toString(36).slice(2, 7)}@teste.local`;
  const { rows: [a] } = await query(`
    INSERT INTO pagamento_aprovadores (empresa_id, nome, email, status, senha_hash, senha_definida_em)
    VALUES ($1,$2,$3,'ativo',$4, now()) RETURNING id`, [empresaId, nome, endereco, await bcrypt.hash(senha, 4)]);
  return { id: a.id, email: endereco, senha, autorizacao: { aprovador_id: a.id, senha } };
}
