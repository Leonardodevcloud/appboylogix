// Antecipação vista pela central: pagar vários de uma vez, pagar por fora com
// abatimento travado, estornar, o profissional desistir, e o que a tela lê (fila com
// indicadores, detalhe com abatimento e linha do tempo, exportação).
import { describe, it, expect, beforeAll } from 'vitest';
import { TEM_BANCO } from './setup.js';
import { montarCenario } from './antecipacoes.helpers.js';

const suite = TEM_BANCO ? describe : describe.skip;

suite('antecipação: gestão pela central', () => {
  let c;
  beforeAll(async () => { c = await montarCenario('antges'); }, 60_000);

  async function pedir(nome, saldo, valor, chave) {
    const p = await c.profissional(nome, saldo, chave);
    await p.app('post', '').send({ valor_cent: valor });
    return { ...p, pedido: await c.pedido(p.id) };
  }

  it('pagar vários: um lote só, um código só, e quem não passa fica na fila com o motivo', async () => {
    await c.conta({ aprovacao: 'sempre' });
    const a = await pedir('Varios A', 50000, 10000);
    const b = await pedir('Varios B', 50000, 20000);
    const ruim = await pedir('Varios Ruim', 50000, 10000);
    // Saldo some entre o pedido e o pagamento (desconto lançado): a reavaliação barra.
    await c.query(`INSERT INTO financeiro_lancamentos (empresa_id, motoboy_id, tipo, valor_cent, descricao) VALUES ($1,$2,'abatimento',45000,'desconto')`,
      [c.empresaId, ruim.id]);
    const antes = c.codigos.length;

    const r = await c.api('post', '/antecipacoes/pagar-varios').send({ ids: [a.pedido.id, b.pedido.id, ruim.pedido.id] });
    expect(r.status).toBe(200);
    expect(r.body.processando).toBe(2);
    expect(r.body.falhas.map((f) => f.id)).toEqual([ruim.pedido.id]);
    expect(c.codigos.length - antes, 'um e-mail de código para o lote inteiro').toBe(1);
    expect((await c.pedido(ruim.id)).status).toBe('aguardando');

    await c.api('post', `/pagamentos/lotes/${r.body.lote_id}/aprovar`).send({ codigo: c.codigos.at(-1), senha: c.aprovador.senha });
    await new Promise((res) => setTimeout(res, 300));
    expect((await c.pedido(a.id)).status).toBe('paga');
    expect((await c.pedido(b.id)).status).toBe('paga');
    expect(await c.saldo(b.id)).toBe(30000);
    await c.conta({ aprovacao: 'acima_teto' });
  });

  it('pago por fora: abate o valor cheio, e o abatimento não pode ser apagado pela tela de lançamentos', async () => {
    const p = await pedir('Manual Trava', 50000, 20000);
    const r = await c.api('post', `/antecipacoes/${p.pedido.id}/pagar-manual`).send({});
    expect(r.status).toBe(200);
    expect(r.body.via).toBe('manual');
    expect(await c.saldo(p.id)).toBe(30000);

    const exc = await c.api('delete', `/financeiro/lancamentos/${r.body.lancamento_id}`);
    expect(exc.status).toBe(422);
    expect(exc.body.mensagem || exc.body.erro).toMatch(/Estornar/);
    expect(await c.saldo(p.id), 'o saldo não pode voltar por exclusão').toBe(30000);
  });

  it('estornar o pago por fora devolve o saldo com um crédito (sem apagar nada)', async () => {
    const p = await pedir('Manual Estorno', 50000, 20000);
    await c.api('post', `/antecipacoes/${p.pedido.id}/pagar-manual`).send({});
    const r = await c.api('post', `/antecipacoes/${p.pedido.id}/estornar`).send({ motivo: 'Marquei o pedido errado' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('estornada');
    expect(await c.saldo(p.id)).toBe(50000);
    const { rows } = await c.query(`SELECT tipo FROM financeiro_lancamentos WHERE motoboy_id = $1 ORDER BY criado_em`, [p.id]);
    expect(rows.map((x) => x.tipo)).toEqual(['abatimento', 'credito']);
  });

  it('o que saiu pelo banco não se estorna pela tela', async () => {
    const p = await pedir('Api Sem Estorno', 50000, 20000);
    await c.api('post', `/antecipacoes/${p.pedido.id}/pagar`).send({});
    const r = await c.api('post', `/antecipacoes/${p.pedido.id}/estornar`).send({ motivo: 'tentativa' });
    expect(r.status).toBe(422);
    expect(await c.saldo(p.id)).toBe(30000);
  });

  it('o profissional desiste do pedido em análise; o de outro ele não alcança', async () => {
    const p = await pedir('Desiste', 50000, 20000);
    const outro = await pedir('Desiste Outro', 50000, 20000);
    const alheio = await p.app('post', `/${outro.pedido.id}/cancelar`).send({});
    expect(alheio.status).toBe(404);
    const ok = await p.app('post', `/${p.pedido.id}/cancelar`).send({});
    expect(ok.status).toBe(200);
    expect((await c.pedido(p.id)).status).toBe('cancelada');
    // Desistiu, a vaga de pedido aberto volta: pode pedir de novo.
    const denovo = await p.app('post', '').send({ valor_cent: 10000 });
    expect(denovo.status).toBe(200);
  });

  it('detalhe conta a história: pagamento, abatimento ligado e linha do tempo', async () => {
    const p = await pedir('Detalhe', 50000, 20000);
    await c.api('post', `/antecipacoes/${p.pedido.id}/pagar`).send({});
    const d = await c.api('get', `/antecipacoes/${p.pedido.id}`);
    expect(d.status).toBe(200);
    expect(d.body.pagamento.status).toBe('confirmado');
    expect(d.body.lancamentos).toHaveLength(1);
    expect(d.body.lancamentos[0]).toMatchObject({ tipo: 'abatimento', valor_cent: 20000 });
    expect(d.body.saldo_atual_cent).toBe(30000);
    const titulos = d.body.linha_do_tempo.map((e) => e.titulo);
    expect(titulos[0]).toBe('Pedido feito pelo app');
    expect(titulos).toContain('Pix confirmado pelo banco');
    expect(titulos.some((t) => /Abatimento de R\$ 200,00/.test(t))).toBe(true);
  });

  it('fila: contagens por estado, atrasados pelo prazo da central e exportação', async () => {
    await c.configurar({ sla_minutos: 30 });
    const p = await pedir('Atrasado', 50000, 20000);
    await c.query(`UPDATE antecipacoes SET criado_em = now() - interval '45 minutes' WHERE id = $1`, [p.pedido.id]);

    const f = await c.api('get', '/antecipacoes?status=atrasados');
    expect(f.status).toBe(200);
    expect(f.body.sla_minutos).toBe(30);
    expect(f.body.linhas.map((l) => l.id)).toContain(p.pedido.id);
    expect(f.body.linhas.find((l) => l.id === p.pedido.id).atrasado).toBe(true);
    expect(f.body.contagens.atrasados).toBeGreaterThanOrEqual(1);
    expect(f.body.contagens.pagas).toBeGreaterThanOrEqual(1);
    expect(typeof f.body.hoje.tempo_medio_min).toBe('number');

    const csv = await c.api('get', '/antecipacoes/exportar?status=paga');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toMatch(/^\uFEFF?Pedido em;Código;Profissional;Solicitado/);
    await c.configurar();
  });

  it('id que não é uuid não chega ao banco', async () => {
    const r = await c.api('get', '/antecipacoes/nao-e-id');
    expect(r.status).toBe(404);
  });
});
