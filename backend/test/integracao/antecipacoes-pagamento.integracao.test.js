// Antecipação × pagamento que NÃO resolve na hora.
//
// O furo que esta suíte fecha (achado em 10/10/2026): quando a conta exige código de
// aprovação — ou o banco responde "em processamento" — o pedido continuava
// 'aguardando'. Um segundo clique em Pagar criava OUTRO lote, e aprovar os dois pagava
// o profissional em dobro. E quando o lote era aprovado depois, nada avisava a
// antecipação: ela ficava em análise para sempre, com o dinheiro já na conta dele.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { TEM_BANCO } from './setup.js';
import { montarCenario } from './antecipacoes.helpers.js';

const suite = TEM_BANCO ? describe : describe.skip;
const esperarStatus = async (c, motoboyId, status) => {
  for (let i = 0; i < 40; i += 1) {
    const p = await c.pedido(motoboyId);
    if (p.status === status) return p;
    await new Promise((r) => setTimeout(r, 50));
  }
  return c.pedido(motoboyId);
};

suite('antecipação: pagamento pendente de código ou do banco', () => {
  let c;
  beforeAll(async () => { c = await montarCenario('antpag'); }, 60_000);

  it('conta que exige código: o pedido vai para "processando" e o saldo não sai DE NOVO', async () => {
    await c.conta({ aprovacao: 'sempre' });
    const p = await c.profissional('Proc Codigo', 50000);
    await p.app('post', '').send({ valor_cent: 20000 });
    const pedido = await c.pedido(p.id);

    const r = await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('processando');
    // Saiu no pedido (ADR-034) — iniciar o pagamento não tira outra vez.
    expect(await c.saldo(p.id)).toBe(30000);
  });

  it('segundo clique em Pagar com pagamento em andamento é recusado (sem lote em dobro)', async () => {
    const p = await c.profissional('Proc Duplo', 50000);
    await p.app('post', '').send({ valor_cent: 20000 });
    const pedido = await c.pedido(p.id);
    await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    const segundo = await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    expect(segundo.status).toBe(409);
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM pagamento_itens WHERE motoboy_id = $1`, [p.id]);
    expect(rows[0].n).toBe(1);
  });

  it('aprovar o lote com o código fecha a antecipação como paga e abate uma vez só', async () => {
    const p = await c.profissional('Proc Aprova', 50000);
    await p.app('post', '').send({ valor_cent: 20000 });
    const pedido = await c.pedido(p.id);
    const r = await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    const loteId = r.body.pagamento.lote_id;

    const ok = await c.api('post', `/pagamentos/lotes/${loteId}/aprovar`).send({ codigo: c.codigos.at(-1), senha: c.aprovador.senha });
    expect(ok.status).toBe(200);
    const final = await esperarStatus(c, p.id, 'paga');
    expect(final.status).toBe('paga');
    expect(final.pago_em).toBeTruthy();
    expect(await c.saldo(p.id)).toBe(30000);            // valor CHEIO saiu do saldo
    const { rows } = await c.query(
      `SELECT count(*)::int AS n FROM financeiro_lancamentos WHERE motoboy_id = $1 AND tipo = 'abatimento'`, [p.id]);
    expect(rows[0].n).toBe(1);
  });

  it('lote cancelado devolve o pedido para a fila, e dá para pagar de novo', async () => {
    const p = await c.profissional('Proc Cancela', 50000);
    await p.app('post', '').send({ valor_cent: 20000 });
    const pedido = await c.pedido(p.id);
    const r = await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    await c.api('post', `/pagamentos/lotes/${r.body.pagamento.lote_id}/cancelar`).send({});

    const volta = await esperarStatus(c, p.id, 'aguardando');
    expect(volta.status).toBe('aguardando');
    expect(volta.erro_pagamento).toMatch(/cancelado/i);

    await c.conta({ aprovacao: 'acima_teto' });
    const denovo = await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    expect(denovo.status).toBe(200);
    expect(denovo.body.status).toBe('paga');
    await c.conta({ aprovacao: 'sempre' });
  });

  it('Pix que falha no banco deixa o pedido na fila com o motivo, sem abater de novo e sem gastar o vale', async () => {
    await c.conta({ aprovacao: 'acima_teto' });
    await c.configurar({ gratuidade_tipo: 'manual' });
    const p = await c.profissional('Proc Falha', 50000, 'chave-que-da-erro');
    await c.api('post', '/antecipacoes/gratuidades').send({ motoboy_id: p.id, valor_max_cent: 30000, motivo: 'Teste' });
    await p.app('post', '').send({ valor_cent: 20000 });
    const pedido = await c.pedido(p.id);

    const r = await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    expect(r.status).toBe(422);
    const depois = await c.pedido(p.id);
    expect(depois.status).toBe('aguardando');
    expect(depois.erro_pagamento).toMatch(/chave/i);
    // O pedido continua aberto: o valor segue reservado (ADR-034) até pagar, recusar ou
    // ele desistir — nunca abatido duas vezes.
    expect(await c.saldo(p.id)).toBe(30000);
    const { rows } = await c.query(`SELECT status FROM antecipacao_gratuidades WHERE motoboy_id = $1`, [p.id]);
    expect(rows[0].status).toBe('disponivel');
    await c.configurar();
  });

  it('Pix devolvido depois de pago: pedido "devolvida", saldo volta e o vale é devolvido', async () => {
    await c.configurar({ gratuidade_tipo: 'manual' });
    const p = await c.profissional('Proc Devolve', 50000);
    await c.api('post', '/antecipacoes/gratuidades').send({ motoboy_id: p.id, valor_max_cent: 30000, motivo: 'Teste' });
    await p.app('post', '').send({ valor_cent: 20000 });
    const pedido = await c.pedido(p.id);
    const r = await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    expect(r.body.status).toBe('paga');
    expect(await c.saldo(p.id)).toBe(30000);

    const bancos = require('../../src/modules/pagamentos/pagamentos.bancos.js');
    const sim = bancos.adaptador('simulado');
    const espiao = vi.spyOn(sim, 'consultarPix').mockResolvedValue({ status: 'devolvido' });
    const { rows: [item] } = await c.query(`SELECT provedor_id FROM pagamento_itens WHERE motoboy_id = $1`, [p.id]);
    await c.request(c.app).post('/api/v1/pagamentos/webhook').send({ id: item.provedor_id });
    espiao.mockRestore();

    const final = await esperarStatus(c, p.id, 'devolvida');
    expect(final.status).toBe('devolvida');
    expect(await c.saldo(p.id)).toBe(50000);
    const { rows: g } = await c.query(`SELECT status FROM antecipacao_gratuidades WHERE motoboy_id = $1`, [p.id]);
    expect(g[0].status).toBe('disponivel');
    await c.configurar();
  });

  it('a varredura conserta o que o evento perdeu', async () => {
    await c.conta({ aprovacao: 'sempre' });
    const p = await c.profissional('Proc Varre', 50000);
    await p.app('post', '').send({ valor_cent: 20000 });
    const pedido = await c.pedido(p.id);
    await c.api('post', `/antecipacoes/${pedido.id}/pagar`).send({});
    // Simula um desfecho gravado sem que o evento chegasse (processo reiniciado no meio).
    await c.query(`UPDATE pagamento_itens SET status = 'confirmado' WHERE motoboy_id = $1`, [p.id]);
    await c.query(`UPDATE antecipacoes SET atualizado_em = now() - interval '10 minutes' WHERE id = $1`, [pedido.id]);

    const r = await require('../../src/modules/antecipacoes').service.reconciliar({ minutos: 2 });
    expect(r.ajustadas).toBeGreaterThanOrEqual(1);
    expect((await c.pedido(p.id)).status).toBe('paga');
    await c.conta({ aprovacao: 'acima_teto' });
  });
});
