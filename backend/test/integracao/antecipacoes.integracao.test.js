// Antecipação (saque emergencial): o que o profissional pode pedir, quanto custa e o
// que acontece com o saldo dele.
//
// A regra que este arquivo existe para proteger: **nunca antecipar mais do que o saldo
// já ganho**, e o valor CHEIO sair do saldo mesmo quando ele recebe menos a taxa — senão
// a taxa viraria desconto em dobro ou desconto nenhum.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'module';
import { TEM_BANCO, subirApp, criarCenario, criarMotoboy, ligarModulo, db, criarAprovador } from './setup.js';
const require = createRequire(import.meta.url);
const request = require('supertest');

const suite = TEM_BANCO ? describe : describe.skip;

suite('antecipação (saque emergencial)', () => {
  let app, query, token, tokenMaster, empresaId, mb;

  const api = (m, c) => request(app)[m]('/api/v1' + c).set('Authorization', `Bearer ${token}`);

  const CONFIG = {
    ativo: true, modo: 'revisar', automatico_ate_cent: 10000,
    taxa_tipo: 'percentual', taxa_percentual: 2, taxa_fixa_cent: 0, taxa_min_cent: 200, taxa_max_cent: 1500,
    gratuidade_tipo: 'nenhuma', gratuidade_qtd: 0, gratuidade_max_cent: 30000,
    valor_min_cent: 2000, valor_max_cent: 30000, maximo_dia_cent: 30000,
    pedidos_dia: 2, percentual_saldo: 100, hora_inicio: null, hora_fim: null,
  };

  async function corrida(motoboyId, valorCent) {
    await query(`
      INSERT INTO entregas (empresa_id, motoboy_id, protocolo, status, coleta_nome, coleta_endereco,
                            valor_motoboy_cent, valor_cliente_cent, concluida_em, criado_em)
      VALUES ($1,$2,$3,'entregue','C','Rua X',$4,$4, now(), now())`,
    [empresaId, motoboyId, 'AN' + Date.now() + Math.floor(Math.random() * 9999), valorCent]);
  }

  // O app usa o token do PRÓPRIO profissional — o id nunca vem do corpo.
  //
  // O token é assinado aqui, com o mesmo payload do login real, em vez de bater em
  // /motoboys/auth/login: esta suíte cria muitos profissionais e o limitador de
  // tentativas de login (que existe por segurança e está certo) barraria a partir de
  // um certo ponto. O que importa testar aqui é a antecipação, não o login.
  const _tokens = new Map();
  async function tokenDoApp(motoboyId) {
    if (_tokens.has(motoboyId)) return _tokens.get(motoboyId);
    const { rows: [m] } = await query(
      `SELECT id, empresa_id, nome_completo, token_versao FROM motoboys WHERE id = $1`, [motoboyId]);
    const jwt = require('../../src/shared/jwt');
    const t = jwt.assinar(
      { id: m.id, perfil: 'motoboy', empresaId: m.empresa_id, nome: m.nome_completo, tv: Number(m.token_versao) || 0 },
      { expiresIn: '1h' },
    );
    _tokens.set(motoboyId, t);
    return t;
  }

  beforeAll(async () => {
    app = await subirApp();
    ({ query } = db());
    const c = await criarCenario(app, request, 'antec' + Date.now());
    empresaId = c.empresaId; token = c.tokenDono; tokenMaster = c.tokenSuper;
    for (const cod of ['financeiro', 'financeiro.pagamento_automatico']) await ligarModulo(empresaId, cod).catch(() => {});

    await request(app).put('/api/v1/pagamentos/provedor')
      .set('Authorization', `Bearer ${tokenMaster}`).set('X-Empresa-Id', empresaId).send({ provedor: 'simulado' });
    const aprovador = await criarAprovador(empresaId);
    await api('put', '/pagamentos/conta').send({
      ambiente: 'hml', credenciais: { conta: '1' },
      teto_item_cent: 500000, teto_lote_cent: 500000, teto_dia_cent: 1000000,
      aprovacao: 'acima_teto', ativo: true, autorizacao: aprovador.autorizacao,
    });
    const email = require('../../src/modules/email').service;
    vi.spyOn(email, 'enviar').mockResolvedValue({ id: 'e' });

    mb = await criarMotoboy(empresaId, { nome: 'Antecipa Teste' });
    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = 'chave-antec-ok' WHERE id = $1`, [mb.id]);
    await corrida(mb.id, 50000);          // saldo R$ 500
  }, 60_000);

  it('a central configura a antecipação', async () => {
    const r = await api('put', '/antecipacoes/config').send(CONFIG);
    expect(r.status).toBe(200);
    expect(r.body.ativo).toBe(true);
    expect(Number(r.body.taxa_percentual)).toBe(2);
  });

  it('o app mostra saldo, limites e o custo antes de pedir', async () => {
    const t = await tokenDoApp(mb.id);
    const r = await request(app).get('/api/v1/app/antecipacoes?valor_cent=20000').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(200);
    expect(r.body.saldo_cent).toBe(50000);
    expect(r.body.pode).toBe(true);
    expect(r.body.taxa_cent).toBe(400);           // 2% de R$ 200
    expect(r.body.recebe_cent).toBe(19600);
  });

  it('o máximo é o menor entre saldo, teto por pedido e o que resta do dia', async () => {
    // O botão "usar o máximo" não pode oferecer um valor que o servidor recusaria.
    const lim = await criarMotoboy(empresaId, { nome: 'Antecipa Limite' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-limite-ok' WHERE id = $1`, [lim.id]);
    await corrida(lim.id, 200000);                       // saldo R$ 2.000
    const t = await tokenDoApp(lim.id);

    // Teto por pedido de R$ 300 manda, mesmo com saldo de R$ 2.000.
    const a1 = await request(app).get('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`);
    expect(a1.body.maximo_cent).toBe(30000);
    expect(a1.body.limitado_por).toBe('limite por pedido');

    // Depois de sacar R$ 200 no dia (teto diário R$ 300), sobram R$ 100.
    await api('put', '/antecipacoes/config').send({ ...CONFIG, modo: 'automatico' });
    await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`).send({ valor_cent: 20000 });
    const a2 = await request(app).get('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`);
    expect(a2.body.maximo_cent).toBe(10000);
    expect(a2.body.limitado_por).toBe('limite do dia');
    expect(a2.body.pedidos_restantes_dia).toBe(1);
    await api('put', '/antecipacoes/config').send(CONFIG);
  });

  it('pedir acima do saldo é recusado, com o valor disponível na mensagem', async () => {
    // Profissional com saldo pequeno: o pedido cabe no teto do produto, mas não no saldo.
    const pobre = await criarMotoboy(empresaId, { nome: 'Antecipa Pouco' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-pouco-ok' WHERE id = $1`, [pobre.id]);
    await corrida(pobre.id, 10000);                 // saldo R$ 100
    const t = await tokenDoApp(pobre.id);
    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 20000 });                 // dentro do máximo (R$ 300), acima do saldo
    expect(r.status).toBe(422);
    expect(r.body.mensagem || r.body.erro).toMatch(/100,00/);
  });

  it('abaixo do mínimo também é recusado', async () => {
    const t = await tokenDoApp(mb.id);
    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 500 });
    expect(r.status).toBe(422);
    expect(r.body.mensagem || r.body.erro).toMatch(/mínimo/i);
  });

  it('pedido entra na fila sem pagar nada, no modo revisar — e o saldo já sai no pedido', async () => {
    const t = await tokenDoApp(mb.id);
    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 20000 });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('aguardando');

    const fila = await api('get', '/antecipacoes?status=pendentes');
    expect(fila.body.linhas.length).toBe(1);
    expect(fila.body.linhas[0].recebe_cent).toBe(19600);
    // ADR-034: o valor cheio sai do saldo no pedido, antes de qualquer pagamento.
    const lista = await api('get', '/pagamentos/entregadores?busca=Antecipa');
    expect(lista.body.linhas.find((l) => l.id === mb.id).saldo_cent).toBe(30000);
  });

  it('dois pedidos abertos ao mesmo tempo não existem', async () => {
    const t = await tokenDoApp(mb.id);
    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 3000 });
    expect(r.status).toBe(409);
  });

  it('toque duplo não vira dois saques', async () => {
    // O índice único cobre dois pedidos ABERTOS. No automático o primeiro vira 'paga'
    // em segundos e liberaria a vaga — a janela de idempotência é o que segura.
    const rapido = await criarMotoboy(empresaId, { nome: 'Antecipa Rapido' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-rapido-ok' WHERE id = $1`, [rapido.id]);
    await corrida(rapido.id, 50000);
    await api('put', '/antecipacoes/config').send({ ...CONFIG, modo: 'automatico' });
    const t = await tokenDoApp(rapido.id);

    const [a1, a2] = await Promise.all([
      request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`).send({ valor_cent: 5000 }),
      request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`).send({ valor_cent: 5000 }),
    ]);
    const ok = [a1, a2].filter((r) => r.status === 200);
    expect(ok.length, 'só um dos dois pedidos pode valer').toBe(1);

    const { rows } = await query(
      `SELECT count(*)::int AS n FROM antecipacoes WHERE motoboy_id = $1 AND status IN ('aguardando','paga')`, [rapido.id]);
    expect(rows[0].n).toBe(1);
    await api('put', '/antecipacoes/config').send(CONFIG);
  });

  it('pagar debita o valor CHEIO do saldo, não o líquido', async () => {
    const fila = await api('get', '/antecipacoes?status=pendentes');
    const id = fila.body.linhas[0].id;
    const r = await api('post', `/antecipacoes/${id}/pagar`).send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('paga');

    // Pagou R$ 196 e tirou R$ 200 do saldo: a taxa fica com a central. Os R$ 200 saíram
    // no pedido (ADR-034); o item do Pix grava abatimento 0 e não abate de novo.
    const lista = await api('get', '/pagamentos/entregadores?busca=Antecipa');
    expect(lista.body.linhas.find((l) => l.id === mb.id).saldo_cent).toBe(30000);
    const { rows } = await query(
      `SELECT valor_cent, abatimento_cent FROM pagamento_itens WHERE motoboy_id = $1 ORDER BY atualizado_em DESC LIMIT 1`, [mb.id]);
    expect(Number(rows[0].valor_cent)).toBe(19600);
    expect(Number(rows[0].abatimento_cent)).toBe(0);
    const { rows: ab } = await query(
      `SELECT count(*)::int AS n FROM financeiro_lancamentos WHERE motoboy_id = $1 AND tipo = 'abatimento'`, [mb.id]);
    expect(ab[0].n).toBe(1);
  });

  it('recusar exige motivo e o profissional vê a mensagem', async () => {
    const t = await tokenDoApp(mb.id);
    await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`).send({ valor_cent: 5000 });
    const fila = await api('get', '/antecipacoes?status=pendentes');
    const id = fila.body.linhas[0].id;

    const semMotivo = await api('post', `/antecipacoes/${id}/recusar`).send({ motivo: '' });
    expect(semMotivo.status).toBe(422);

    const ok = await api('post', `/antecipacoes/${id}/recusar`).send({ motivo: 'Chave Pix divergente do cadastro' });
    expect(ok.status).toBe(200);

    const hist = await request(app).get('/api/v1/app/antecipacoes/historico').set('Authorization', `Bearer ${t}`);
    const recusada = hist.body.linhas.find((l) => l.status === 'recusada');
    expect(recusada.motivo_recusa).toMatch(/divergente/);
  });

  it('modo automático paga na hora, e o saldo cai sozinho', async () => {
    await api('put', '/antecipacoes/config').send({ ...CONFIG, modo: 'automatico' });
    const t = await tokenDoApp(mb.id);
    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 10000 });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('paga');
    expect(r.body.automatica).toBe(true);

    const lista = await api('get', '/pagamentos/entregadores?busca=Antecipa');
    expect(lista.body.linhas.find((l) => l.id === mb.id).saldo_cent).toBe(20000);   // 300 − 100
  });

  it('gratuidade zera a taxa e é contada por mês', async () => {
    await api('put', '/antecipacoes/config').send({
      ...CONFIG, modo: 'automatico', gratuidade_tipo: 'mensal', gratuidade_qtd: 1,
    });
    // Profissional novo: os limites diários do outro já estariam no teto.
    const novo = await criarMotoboy(empresaId, { nome: 'Antecipa Gratis' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-gratis-ok' WHERE id = $1`, [novo.id]);
    await corrida(novo.id, 50000);
    const t = await tokenDoApp(novo.id);
    const primeira = await request(app).get('/api/v1/app/antecipacoes?valor_cent=5000').set('Authorization', `Bearer ${t}`);
    expect(primeira.body.gratuidade).toBe(true);
    expect(primeira.body.taxa_cent).toBe(0);

    await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`).send({ valor_cent: 5000 });

    // A segunda do mês já paga taxa.
    const segunda = await request(app).get('/api/v1/app/antecipacoes?valor_cent=5000').set('Authorization', `Bearer ${t}`);
    expect(segunda.body.gratuidade).toBe(false);
    expect(segunda.body.taxa_cent).toBeGreaterThan(0);
  });

  it('vale concedido isenta a taxa e se encerra no uso, mesmo sacando menos', async () => {
    // A regra do vale (ADR-030): vale de R$ 300, saldo de R$ 100 → saca 100 sem taxa e
    // o vale acaba. Os R$ 200 que sobraram não ficam guardados.
    await api('put', '/antecipacoes/config').send({ ...CONFIG, modo: 'automatico', gratuidade_tipo: 'manual' });
    const vale = await criarMotoboy(empresaId, { nome: 'Antecipa Vale' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-vale-ok' WHERE id = $1`, [vale.id]);
    await corrida(vale.id, 10000);                       // saldo R$ 100

    const c = await api('post', '/antecipacoes/gratuidades')
      .send({ motoboy_id: vale.id, quantidade: 1, valor_max_cent: 30000, motivo: 'Campanha de setembro' });
    expect(c.status).toBe(200);
    expect(c.body.criadas).toBe(1);

    const t = await tokenDoApp(vale.id);
    const sim = await request(app).get('/api/v1/app/antecipacoes?valor_cent=10000').set('Authorization', `Bearer ${t}`);
    expect(sim.body.gratuidade).toBe(true);
    expect(sim.body.taxa_cent).toBe(0);
    expect(sim.body.gratuidade_valor_max_cent).toBe(30000);

    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 10000 });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('paga');

    // O vale foi consumido inteiro, e o saldo caiu só os R$ 100 sacados.
    const gs = await api('get', '/antecipacoes/gratuidades?status=usada');
    expect(gs.body.linhas.some((g) => g.motoboy_id === vale.id)).toBe(true);
    const disp = await api('get', '/antecipacoes/gratuidades?status=disponivel');
    expect(disp.body.linhas.some((g) => g.motoboy_id === vale.id)).toBe(false);
    await api('put', '/antecipacoes/config').send(CONFIG);
  });

  it('o profissional pode guardar a gratuidade e pagar a taxa', async () => {
    // Escolha dele: o vale se encerra no uso, então às vezes vale guardar para um
    // saque maior. A tela precisa saber que o vale existe mesmo assim.
    await api('put', '/antecipacoes/config').send({ ...CONFIG, gratuidade_tipo: 'manual' });
    const guarda = await criarMotoboy(empresaId, { nome: 'Antecipa Guarda' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-guarda-ok' WHERE id = $1`, [guarda.id]);
    await corrida(guarda.id, 40000);
    await api('post', '/antecipacoes/gratuidades').send({ motoboy_id: guarda.id, valor_max_cent: 30000, motivo: 'Campanha' });

    const t = await tokenDoApp(guarda.id);
    const usando = await request(app).get('/api/v1/app/antecipacoes?valor_cent=5000').set('Authorization', `Bearer ${t}`);
    expect(usando.body.taxa_cent).toBe(0);

    const guardando = await request(app)
      .get('/api/v1/app/antecipacoes?valor_cent=5000&usar_gratuidade=false').set('Authorization', `Bearer ${t}`);
    expect(guardando.body.gratuidade).toBe(false);
    expect(guardando.body.taxa_cent).toBeGreaterThan(0);
    // Mesmo guardando, o app sabe que o vale existe — é o que desenha o interruptor.
    expect(guardando.body.gratuidade_disponivel).toBe(true);
    expect(guardando.body.gratuidade_disponivel_max_cent).toBe(30000);

    // Pedindo sem usar, o vale continua disponível depois.
    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 5000, usar_gratuidade: false });
    expect(r.status).toBe(200);
    const disp = await api('get', '/antecipacoes/gratuidades?status=disponivel');
    expect(disp.body.linhas.some((g) => g.motoboy_id === guarda.id)).toBe(true);
    await api('put', '/antecipacoes/config').send(CONFIG);
  });

  it('vale só vale até o teto: pedido acima cobra taxa normalmente', async () => {
    await api('put', '/antecipacoes/config').send({ ...CONFIG, gratuidade_tipo: 'manual' });
    const alto = await criarMotoboy(empresaId, { nome: 'Antecipa Teto' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-teto-ok' WHERE id = $1`, [alto.id]);
    await corrida(alto.id, 50000);
    await api('post', '/antecipacoes/gratuidades').send({ motoboy_id: alto.id, valor_max_cent: 5000, motivo: 'Vale pequeno' });

    const t = await tokenDoApp(alto.id);
    const dentro = await request(app).get('/api/v1/app/antecipacoes?valor_cent=5000').set('Authorization', `Bearer ${t}`);
    expect(dentro.body.gratuidade).toBe(true);
    const fora = await request(app).get('/api/v1/app/antecipacoes?valor_cent=20000').set('Authorization', `Bearer ${t}`);
    expect(fora.body.gratuidade).toBe(false);
    expect(fora.body.taxa_cent).toBeGreaterThan(0);
  });

  it('pedido recusado devolve o vale', async () => {
    await api('put', '/antecipacoes/config').send({ ...CONFIG, modo: 'revisar', gratuidade_tipo: 'manual' });
    const dev = await criarMotoboy(empresaId, { nome: 'Antecipa Devolve' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-dev-ok' WHERE id = $1`, [dev.id]);
    await corrida(dev.id, 30000);
    await api('post', '/antecipacoes/gratuidades').send({ motoboy_id: dev.id, valor_max_cent: 20000, motivo: 'Teste' });

    const t = await tokenDoApp(dev.id);
    await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`).send({ valor_cent: 10000 });
    const fila = await api('get', '/antecipacoes?status=pendentes');
    const pedido = fila.body.linhas.find((l) => l.motoboy_id === dev.id);
    await api('post', `/antecipacoes/${pedido.id}/recusar`).send({ motivo: 'Teste de devolução' });

    const disp = await api('get', '/antecipacoes/gratuidades?status=disponivel');
    expect(disp.body.linhas.some((g) => g.motoboy_id === dev.id), 'o vale precisa voltar a ficar disponível').toBe(true);
    await api('put', '/antecipacoes/config').send(CONFIG);
  });

  it('um profissional não pede em nome de outro', async () => {
    const outro = await criarMotoboy(empresaId, { nome: 'Antecipa Outro' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-outro-ok' WHERE id = $1`, [outro.id]);
    const t = await tokenDoApp(mb.id);
    // O corpo nem tem campo de motoboy: o id vem do token. Mandar o do outro é ignorado.
    const r = await request(app).post('/api/v1/app/antecipacoes').set('Authorization', `Bearer ${t}`)
      .send({ valor_cent: 3000, motoboy_id: outro.id });
    const { rows } = await query(`SELECT count(*)::int AS n FROM antecipacoes WHERE motoboy_id = $1`, [outro.id]);
    expect(rows[0].n).toBe(0);
    expect([200, 409, 422]).toContain(r.status);
  });
});
