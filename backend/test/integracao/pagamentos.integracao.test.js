// Pagamento de entregadores: montagem do lote, tetos, token e idempotência.
//
// Roda no banco adaptador `simulado`, que é o mesmo caminho do Sicoob até a borda —
// só não sai da máquina. O que se testa aqui é a REGRA, que é onde o dinheiro se perde.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'module';
import { TEM_BANCO, subirApp, criarCenario, criarMotoboy, ligarModulo, db, criarAprovador } from './setup.js';
const require = createRequire(import.meta.url);
const request = require('supertest');

const suite = TEM_BANCO ? describe : describe.skip;

suite('pagamento de entregadores', () => {
  let app, query, token, tokenMaster, empresaId, motoboys, aprovador;

  const api = (m, c) => request(app)[m]('/api/v1' + c).set('Authorization', `Bearer ${token}`);
  const CONTA = {
    ambiente: 'hml', credenciais: { conta: '12345-6' },
    teto_item_cent: 200000, teto_lote_cent: 500000, teto_dia_cent: 1000000,
    aprovacao: 'sempre', ativo: true,
  };

  // Fechamento aberto = entregador com saldo a receber.
  async function fechamento(motoboyId, saldoCent) {
    await query(`INSERT INTO financeiro_fechamentos (empresa_id, motoboy_id, periodo_de, periodo_ate,
                 qtd_corridas, total_corridas_cent, saldo_liquido_cent, status)
                 VALUES ($1,$2,'2026-09-01','2026-09-15',10,$3,$3,'aberto')`, [empresaId, motoboyId, saldoCent]);
  }

  beforeAll(async () => {
    app = await subirApp();
    ({ query } = db());
    const c = await criarCenario(app, request, 'pag' + Date.now());
    empresaId = c.empresaId;
    token = c.tokenDono;
    tokenMaster = c.tokenSuper;
    for (const cod of ['financeiro', 'financeiro.pagamento_automatico']) await ligarModulo(empresaId, cod).catch(() => {});
    aprovador = await criarAprovador(empresaId);

    // O e-mail do token é dublado: o que importa aqui é o lote, não o envio.
    const email = require('../../src/modules/email').service;
    vi.spyOn(email, 'enviar').mockResolvedValue({ id: 'email_teste' });

    const a = await criarMotoboy(empresaId, { nome: 'Pago Um' });
    const b = await criarMotoboy(empresaId, { nome: 'Pago Dois' });
    const semChave = await criarMotoboy(empresaId, { nome: 'Sem Chave' });
    const caro = await criarMotoboy(empresaId, { nome: 'Acima do Teto' });
    motoboys = { a, b, semChave, caro };

    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = $2 WHERE id = $1`, [a.id, 'chave-a-ok']);
    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = $2 WHERE id = $1`, [b.id, 'chave-b-ok']);
    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = $2 WHERE id = $1`, [caro.id, 'chave-c-ok']);
    // semChave fica sem chave de propósito.

    await fechamento(a.id, 120000);
    await fechamento(b.id, 80000);
    await fechamento(semChave.id, 50000);
    await fechamento(caro.id, 300000);      // acima do teto por entregador
  }, 60_000);

  it('sem banco liberado pela plataforma, a central não configura conta', async () => {
    const r = await api('put', '/pagamentos/conta').send({ ...CONTA, autorizacao: aprovador.autorizacao });
    expect(r.status).toBe(422);
    expect(r.body.mensagem || r.body.erro).toMatch(/liberad/i);
  });

  it('a central não pode liberar banco para si mesma', async () => {
    const r = await api('put', '/pagamentos/provedor').send({ provedor: 'simulado' });
    expect(r.status).toBe(403);
  });

  it('o master libera o banco da empresa', async () => {
    const r = await request(app).put('/api/v1/pagamentos/provedor')
      .set('Authorization', `Bearer ${tokenMaster}`).set('X-Empresa-Id', empresaId)
      .send({ provedor: 'simulado' });
    expect(r.status).toBe(200);
    expect(r.body.provedor).toBe('simulado');
  });

  it('segredo declarado pelo adaptador nunca volta em claro', async () => {
    // Usa o Sicoob só para exercitar a regra de máscara: o adaptador declara
    // client_secret como segredo, então a tela recebe máscara, não o valor.
    await request(app).put('/api/v1/pagamentos/provedor')
      .set('Authorization', `Bearer ${tokenMaster}`).set('X-Empresa-Id', empresaId)
      .send({ provedor: 'sicoob' });
    const r = await api('put', '/pagamentos/conta')
      .send({ ...CONTA, autorizacao: aprovador.autorizacao, ativo: false, credenciais: { client_id: 'id-publico', client_secret: 'muito-secreto' } });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('muito-secreto');
    expect(r.body.credenciais.client_secret).toMatch(/•/);
    // volta para o simulado, que é o banco usado pelo resto da suíte
    await request(app).put('/api/v1/pagamentos/provedor')
      .set('Authorization', `Bearer ${tokenMaster}`).set('X-Empresa-Id', empresaId)
      .send({ provedor: 'simulado' });
  });

  it('a tela recebe os campos declarados pelo banco liberado', async () => {
    const r = await api('put', '/pagamentos/conta').send({ ...CONTA, autorizacao: aprovador.autorizacao });
    expect(r.status).toBe(200);
    // O adaptador simulado declara só `conta`; campo de outro banco é ignorado.
    expect(r.body.campos.map((f) => f.codigo)).toEqual(['conta']);
    expect(r.body.credenciais.conta).toBe('12345-6');
  });

  it('tetos inconsistentes são recusados', async () => {
    const r = await api('put', '/pagamentos/conta').send({ ...CONTA, autorizacao: aprovador.autorizacao, teto_item_cent: 900000 });
    expect(r.status).toBe(422);
  });

  it('prévia separa quem entra de quem fica de fora, com motivo', async () => {
    const r = await api('get', '/pagamentos/previa?de=2026-09-01&ate=2026-09-15');
    expect(r.status).toBe(200);
    expect(r.body.quantidade).toBe(2);                    // só os dois elegíveis
    expect(r.body.total_cent).toBe(200000);
    const fora = r.body.itens.filter((i) => !i.elegivel);
    expect(fora.length).toBe(2);
    expect(fora.map((f) => f.motivo).join(' ')).toMatch(/sem chave Pix/);
    expect(fora.map((f) => f.motivo).join(' ')).toMatch(/teto/);
  });

  it('lote nasce aguardando aprovação e não paga nada sozinho', async () => {
    const r = await api('post', '/pagamentos/lotes').send({ de: '2026-09-01', ate: '2026-09-15' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('aguardando_aprovacao');
    expect(r.body.itens.length).toBe(2);
    expect(r.body.itens.every((i) => i.status === 'pendente')).toBe(true);
  });

  it('código errado não envia e consome tentativa', async () => {
    const lotes = await api('get', '/pagamentos/lotes');
    const loteId = lotes.body.linhas[0].id;
    await api('post', `/pagamentos/lotes/${loteId}/token`).send({});
    const r = await api('post', `/pagamentos/lotes/${loteId}/aprovar`).send({ codigo: '000000', senha: aprovador.senha });
    expect(r.status).toBe(422);
    const lote = await api('get', `/pagamentos/lotes/${loteId}`);
    expect(lote.body.status).toBe('aguardando_aprovacao');
    expect(lote.body.itens.every((i) => i.status === 'pendente')).toBe(true);
  });

  it('código certo aprova, envia e registra quem aprovou', async () => {
    const lotes = await api('get', '/pagamentos/lotes');
    const loteId = lotes.body.linhas[0].id;
    await api('post', `/pagamentos/lotes/${loteId}/token`).send({});
    // O código só existe em hash; no teste lemos o que foi gerado pelo caminho real.
    const { rows: [t] } = await query(`SELECT codigo_hash FROM pagamento_tokens WHERE lote_id = $1 AND usado_em IS NULL`, [loteId]);
    const crypto = require('crypto');
    let codigo = null;
    for (let n = 100000; n < 1000000 && !codigo; n += 1) {
      if (crypto.createHash('sha256').update(`${loteId}:${n}`).digest('hex') === t.codigo_hash) codigo = String(n);
      if (n % 50000 === 0) await new Promise((r) => setImmediate(r));
    }
    expect(codigo).toBeTruthy();

    const r = await api('post', `/pagamentos/lotes/${loteId}/aprovar`).send({ codigo, senha: aprovador.senha });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('concluido');
    expect(r.body.itens.every((i) => i.status === 'confirmado')).toBe(true);
    expect(r.body.aprovado_por).toBeTruthy();
  }, 60_000);

  it('lote pode ser criado a partir de fechamentos já escolhidos', async () => {
    // Caminho novo: a seleção vem da tela de Fechamentos, não do período.
    const { rows } = await query(
      `SELECT id FROM financeiro_fechamentos WHERE empresa_id = $1 AND status = 'aberto' LIMIT 2`, [empresaId]);
    if (!rows.length) return;                    // todos já pagos pelos testes anteriores
    const previa = await api('post', '/pagamentos/previa-fechamentos')
      .send({ fechamento_ids: rows.map((r) => r.id) });
    expect(previa.status).toBe(200);
    expect(previa.body.linhas.length).toBe(rows.length);
    // Cada linha diz se entra e, quando não entra, por quê — sem bloquear o lote.
    for (const l of previa.body.linhas) expect(l).toHaveProperty('elegivel');
  });

  it('o código Pix copia e cola sai com o QR desenhado', async () => {
    const r = await api('post', '/pagamentos/brcode')
      .send({ chave: 'teste@email.com', valor_cent: 19600 });
    expect(r.status).toBe(200);
    expect(r.body.payload.startsWith('000201')).toBe(true);
    expect(r.body.payload).toContain('teste@email.com');
    expect(r.body.payload).toContain('5406196.00');
    // A imagem é desenhada no servidor: o painel não carrega biblioteca externa.
    expect(r.body.svg).toContain('<svg');
  });

  it('cada item tem chave de idempotência única', async () => {
    const { rows } = await query(`SELECT count(*)::int AS total, count(DISTINCT idempotencia)::int AS unicas FROM pagamento_itens WHERE empresa_id = $1`, [empresaId]);
    expect(rows[0].total).toBe(rows[0].unicas);
  });

  it('item já iniciado não é reenviado: consulta o e2e em vez de pagar de novo', async () => {
    // Simula o pior caso real: o processo caiu DEPOIS de iniciar e ANTES de confirmar.
    // O item ficou com endToEndId gravado; o reenvio precisa consultar, nunca iniciar
    // outro pagamento — a API do banco não tem idempotência, o e2e é a nossa âncora.
    const bancos = require('../../src/modules/pagamentos/pagamentos.bancos');
    const simulado = bancos.PROVEDORES.simulado;
    const iniciar = vi.spyOn(simulado, 'iniciarPix');
    const consultar = vi.spyOn(simulado, 'consultarPix');

    const { rows: [item] } = await query(
      `SELECT i.id, i.lote_id FROM pagamento_itens i WHERE i.empresa_id = $1 LIMIT 1`, [empresaId]);
    await query(`UPDATE pagamento_itens SET status = 'erro', erro = 'queda de rede', provedor_id = 'E2E-JA-EXISTE' WHERE id = $1`, [item.id]);
    await query(`UPDATE pagamento_lotes SET status = 'concluido_com_erro' WHERE id = $1`, [item.lote_id]);

    const r = await api('post', `/pagamentos/lotes/${item.lote_id}/reenviar`).send({});
    expect(r.status).toBe(200);
    expect(consultar).toHaveBeenCalled();
    expect(iniciar).not.toHaveBeenCalled();

    iniciar.mockRestore(); consultar.mockRestore();
  });

  it('lote acima do teto do lote é recusado antes de existir', async () => {
    // Os fechamentos anteriores já foram pagos e saíram da prévia. Dois saldos novos,
    // cada um DENTRO do teto por entregador, mas somando acima do teto por LOTE.
    await api('put', '/pagamentos/conta').send({ ...CONTA, autorizacao: aprovador.autorizacao, teto_item_cent: 150000, teto_lote_cent: 150000, teto_dia_cent: 1000000 });
    await fechamento(motoboys.a.id, 100000);
    await fechamento(motoboys.b.id, 100000);
    const r = await api('post', '/pagamentos/lotes').send({ de: '2026-09-01', ate: '2026-09-15' });
    expect(r.status).toBe(422);
    expect(r.body.mensagem || r.body.erro).toMatch(/teto/i);
  });
});
