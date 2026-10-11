// Cenário comum das suítes de antecipação: empresa com o módulo de pagamento, banco
// simulado, conta configurada e helpers para criar profissional com saldo e falar com
// o app pelo token dele. Sem regra de negócio aqui — só montagem.
import { createRequire } from 'module';
import { vi } from 'vitest';
import { subirApp, criarCenario, criarMotoboy, ligarModulo, db, criarAprovador } from './setup.js';
const require = createRequire(import.meta.url);
const request = require('supertest');

export const CONFIG = Object.freeze({
  ativo: true, modo: 'revisar', automatico_ate_cent: 10000,
  taxa_tipo: 'percentual', taxa_percentual: 2, taxa_fixa_cent: 0, taxa_min_cent: 200, taxa_max_cent: 1500,
  gratuidade_tipo: 'nenhuma', gratuidade_qtd: 0, gratuidade_max_cent: 30000,
  valor_min_cent: 2000, valor_max_cent: 30000, maximo_dia_cent: 30000,
  pedidos_dia: 5, percentual_saldo: 100, hora_inicio: null, hora_fim: null,
});

export const CONTA = Object.freeze({
  ambiente: 'hml', credenciais: { conta: '1' },
  teto_item_cent: 500000, teto_lote_cent: 500000, teto_dia_cent: 5000000,
  aprovacao: 'acima_teto', ativo: true,
});

export async function montarCenario(sufixo) {
  const app = await subirApp();
  const { query } = db();
  const c = await criarCenario(app, request, sufixo + Date.now());
  const empresaId = c.empresaId;
  for (const cod of ['financeiro', 'financeiro.pagamento_automatico']) await ligarModulo(empresaId, cod).catch(() => {});

  const api = (m, caminho) => request(app)[m]('/api/v1' + caminho).set('Authorization', `Bearer ${c.tokenDono}`);
  await request(app).put('/api/v1/pagamentos/provedor')
    .set('Authorization', `Bearer ${c.tokenSuper}`).set('X-Empresa-Id', empresaId).send({ provedor: 'simulado' });

  // O código de aprovação vai por e-mail: o espião guarda o último para o teste digitar.
  const codigos = [];
  const email = require('../../src/modules/email').service;
  vi.spyOn(email, 'enviar').mockImplementation(async ({ dados }) => { if (dados && dados.codigo) codigos.push(dados.codigo); return { id: 'e' }; });

  // Aprovador ativo (ADR-036): sem ele a conta não ativa. A autorização vai sempre junto —
  // o servidor só a confere quando a mudança afrouxa a trava (ex.: voltar a acima_teto).
  const aprovador = await criarAprovador(empresaId);
  const conta = (extra = {}) => api('put', '/pagamentos/conta').send({ ...CONTA, ...extra, autorizacao: aprovador.autorizacao });
  const configurar = (extra = {}) => api('put', '/antecipacoes/config').send({ ...CONFIG, ...extra });
  await conta();
  await configurar();

  async function corrida(motoboyId, valorCent) {
    await query(`
      INSERT INTO entregas (empresa_id, motoboy_id, protocolo, status, coleta_nome, coleta_endereco,
                            valor_motoboy_cent, valor_cliente_cent, concluida_em, criado_em)
      VALUES ($1,$2,$3,'entregue','C','Rua X',$4,$4, now(), now())`,
    [empresaId, motoboyId, 'AT' + Date.now() + Math.floor(Math.random() * 99999), valorCent]);
  }

  // Token do PRÓPRIO profissional, assinado com o payload do login real (o limitador de
  // tentativas de login barraria uma suíte que cria muitos profissionais).
  async function tokenDoApp(motoboyId) {
    const { rows: [m] } = await query(`SELECT id, empresa_id, nome_completo, token_versao FROM motoboys WHERE id = $1`, [motoboyId]);
    return require('../../src/shared/jwt').assinar(
      { id: m.id, perfil: 'motoboy', empresaId: m.empresa_id, nome: m.nome_completo, tv: Number(m.token_versao) || 0 },
      { expiresIn: '1h' });
  }

  async function profissional(nome, saldoCent, chave) {
    const mb = await criarMotoboy(empresaId, { nome });
    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = $2 WHERE id = $1`,
      [mb.id, chave || ('chave-' + mb.id.slice(0, 8))]);
    if (saldoCent) await corrida(mb.id, saldoCent);
    const token = await tokenDoApp(mb.id);
    const app2 = (m, caminho) => request(app)[m]('/api/v1/app/antecipacoes' + caminho).set('Authorization', `Bearer ${token}`);
    return { id: mb.id, app: app2 };
  }

  const saldo = async (motoboyId) => require('../../src/modules/pagamentos').service.saldoAberto(empresaId, motoboyId);
  const pedido = async (motoboyId) => (await query(
    `SELECT * FROM antecipacoes WHERE motoboy_id = $1 ORDER BY criado_em DESC LIMIT 1`, [motoboyId])).rows[0];

  return { app, request, query, empresaId, api, conta, configurar, profissional, saldo, pedido, codigos, corrida, aprovador };
}
