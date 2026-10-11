// Pagamento avulso: a trava de saldo e o abatimento.
//
// Regra do negócio que este arquivo existe para proteger: **nunca pagar ao entregador
// mais do que ele tem em saldo aberto**, e todo avulso confirmado sair do saldo dele na
// mesma hora. Sem o abatimento, ele receberia o adiantamento hoje e o mesmo valor de
// novo no fechamento — dinheiro infinito.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'module';
import { TEM_BANCO, subirApp, criarCenario, criarMotoboy, ligarModulo, db, criarAprovador } from './setup.js';
const require = createRequire(import.meta.url);
const request = require('supertest');

const suite = TEM_BANCO ? describe : describe.skip;

suite('pagamento avulso', () => {
  let app, query, token, tokenMaster, empresaId, mb, aprovador;

  const api = (m, c) => request(app)[m]('/api/v1' + c).set('Authorization', `Bearer ${token}`);

  // Corrida entregue e não fechada = saldo aberto do entregador.
  async function corrida(motoboyId, valorCent) {
    await query(`
      INSERT INTO entregas (empresa_id, motoboy_id, protocolo, status, coleta_nome, coleta_endereco,
                            valor_motoboy_cent, valor_cliente_cent, concluida_em, criado_em)
      VALUES ($1,$2,$3,'entregue','C','Rua X',$4,$4, now(), now())`,
    [empresaId, motoboyId, 'AV' + Date.now() + Math.floor(Math.random() * 999), valorCent]);
  }

  beforeAll(async () => {
    app = await subirApp();
    ({ query } = db());
    const c = await criarCenario(app, request, 'avulso' + Date.now());
    empresaId = c.empresaId; token = c.tokenDono; tokenMaster = c.tokenSuper;
    for (const cod of ['financeiro', 'financeiro.pagamento_automatico']) await ligarModulo(empresaId, cod).catch(() => {});

    await request(app).put('/api/v1/pagamentos/provedor')
      .set('Authorization', `Bearer ${tokenMaster}`).set('X-Empresa-Id', empresaId).send({ provedor: 'simulado' });
    aprovador = await criarAprovador(empresaId);
    await api('put', '/pagamentos/conta').send({
      ambiente: 'hml', credenciais: { conta: '1' },
      teto_item_cent: 500000, teto_lote_cent: 500000, teto_dia_cent: 1000000,
      aprovacao: 'acima_teto', ativo: true, autorizacao: aprovador.autorizacao,
    });

    const email = require('../../src/modules/email').service;
    vi.spyOn(email, 'enviar').mockResolvedValue({ id: 'e' });

    mb = await criarMotoboy(empresaId, { nome: 'Avulso Teste' });
    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = 'chave-avulso-ok', codigo = 4321 WHERE id = $1`, [mb.id]);
    await corrida(mb.id, 30000);   // saldo: R$ 300,00
  }, 60_000);

  it('a lista de entregadores mostra o saldo aberto de cada um', async () => {
    const r = await api('get', '/pagamentos/entregadores?busca=Avulso');
    expect(r.status).toBe(200);
    const achado = r.body.linhas.find((l) => l.id === mb.id);
    expect(achado.saldo_cent).toBe(30000);
  });

  it('busca também encontra pelo código do entregador', async () => {
    const r = await api('get', '/pagamentos/entregadores?busca=4321');
    expect(r.body.linhas.some((l) => l.id === mb.id)).toBe(true);
  });

  it('conferir mostra o favorecido do banco e o saldo que sobra', async () => {
    const r = await api('post', '/pagamentos/avulso/conferir').send({ motoboy_id: mb.id, valor_cent: 10000 });
    expect(r.status).toBe(200);
    expect(r.body.saldo_cent).toBe(30000);
    expect(r.body.saldo_apos_cent).toBe(20000);
    expect(r.body.favorecido).toBeTruthy();
  });

  it('ACIMA DO SALDO é recusado, e a mensagem diz quanto ele tem', async () => {
    const r = await api('post', '/pagamentos/avulso/conferir').send({ motoboy_id: mb.id, valor_cent: 45000 });
    expect(r.status).toBe(422);
    expect(r.body.mensagem || r.body.erro).toMatch(/300,00/);
  });

  it('pagar debita o saldo na mesma hora, via abatimento', async () => {
    const r = await api('post', '/pagamentos/avulso').send({ motoboy_id: mb.id, valor_cent: 10000, descricao: 'Adiantamento' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('confirmado');
    expect(r.body.saldo_cent).toBe(20000);          // 300 − 100

    const { rows } = await query(
      `SELECT tipo, valor_cent, origem_id FROM financeiro_lancamentos WHERE empresa_id = $1 AND motoboy_id = $2`,
      [empresaId, mb.id]);
    expect(rows.length).toBe(1);
    expect(rows[0].tipo).toBe('abatimento');
    expect(Number(rows[0].valor_cent)).toBe(10000);
    expect(rows[0].origem_id).toBeTruthy();          // ligado ao item, para poder estornar
  });

  it('o saldo já debitado limita o próximo avulso', async () => {
    // Sobraram R$ 200; pedir R$ 250 tem de ser recusado.
    const r = await api('post', '/pagamentos/avulso').send({ motoboy_id: mb.id, valor_cent: 25000 });
    expect(r.status).toBe(422);
    const ok = await api('post', '/pagamentos/avulso').send({ motoboy_id: mb.id, valor_cent: 20000 });
    expect(ok.status).toBe(200);
    expect(ok.body.saldo_cent).toBe(0);
  });

  it('com saldo zerado, nenhum valor passa', async () => {
    const r = await api('post', '/pagamentos/avulso').send({ motoboy_id: mb.id, valor_cent: 100 });
    expect(r.status).toBe(422);
  });

  it('copia e cola é recusado em banco que não declara a capacidade', async () => {
    const outro = await criarMotoboy(empresaId, { nome: 'Avulso Cola' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-cola-ok' WHERE id = $1`, [outro.id]);
    await corrida(outro.id, 20000);
    const r = await api('post', '/pagamentos/avulso')
      .send({ motoboy_id: outro.id, valor_cent: 5000, qrcode: '00020126580014BR.GOV.BCB.PIX...' });
    expect(r.status).toBe(422);
    expect(r.body.mensagem || r.body.erro).toMatch(/copia e cola/i);
  });

  it('quando a conta exige código, o avulso NÃO sai sozinho', async () => {
    // Troca a regra para "sempre exigir": o pagamento passa a esperar aprovação.
    await api('put', '/pagamentos/conta').send({
      ambiente: 'hml', credenciais: {},
      teto_item_cent: 500000, teto_lote_cent: 500000, teto_dia_cent: 1000000,
      aprovacao: 'sempre', ativo: true, autorizacao: aprovador.autorizacao,
    });
    const novo = await criarMotoboy(empresaId, { nome: 'Avulso Codigo' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-codigo-ok' WHERE id = $1`, [novo.id]);
    await corrida(novo.id, 20000);

    const r = await api('post', '/pagamentos/avulso').send({ motoboy_id: novo.id, valor_cent: 5000 });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('aguardando_aprovacao');

    // Nada foi pago e nada foi abatido: o saldo continua inteiro.
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM financeiro_lancamentos WHERE motoboy_id = $1`, [novo.id]);
    expect(rows[0].n).toBe(0);
    const { rows: itens } = await query(
      `SELECT status FROM pagamento_itens WHERE motoboy_id = $1`, [novo.id]);
    expect(itens[0].status).toBe('pendente');

    // volta a regra para o resto da suíte
    await api('put', '/pagamentos/conta').send({
      ambiente: 'hml', credenciais: {},
      teto_item_cent: 500000, teto_lote_cent: 500000, teto_dia_cent: 1000000,
      aprovacao: 'acima_teto', ativo: true, autorizacao: aprovador.autorizacao,
    });
  });

  it('pix que falha não gera abatimento — saldo intacto', async () => {
    const outro = await criarMotoboy(empresaId, { nome: 'Avulso Falha' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-que-da-erro' WHERE id = $1`, [outro.id]);
    await corrida(outro.id, 15000);

    const r = await api('post', '/pagamentos/avulso').send({ motoboy_id: outro.id, valor_cent: 5000 });
    expect(r.status).toBe(422);                       // o simulado recusa chave terminada em "erro"

    const { rows } = await query(
      `SELECT count(*)::int AS n FROM financeiro_lancamentos WHERE empresa_id = $1 AND motoboy_id = $2`, [empresaId, outro.id]);
    expect(rows[0].n).toBe(0);
    const lista = await api('get', '/pagamentos/entregadores?busca=Avulso Falha');
    expect(lista.body.linhas[0].saldo_cent).toBe(15000);   // nada foi debitado
  });
});
