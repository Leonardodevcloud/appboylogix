// E-mail por cliente: quem configura, o que trava o envio e o que o webhook pode mudar.
//
// O provedor é dublado (RESEND_API_KEY ausente / chamadas mockadas): o que se testa aqui
// é a REGRA — master configura, central e loja não enxergam, envio exige domínio
// verificado e remetente do próprio domínio, e o webhook só é aceito assinado.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';
import { TEM_BANCO, subirApp, criarCenario, db } from './setup.js';
const require = createRequire(import.meta.url);
const request = require('supertest');

const suite = TEM_BANCO ? describe : describe.skip;

suite('e-mail por cliente (área do master)', () => {
  let app, query, tokenMaster, tokenCentral, empresaId, verificarDominio;
  const SEGREDO = 'whsec_' + Buffer.from('segredo-de-teste-123456').toString('base64');

  beforeAll(async () => {
    process.env.RESEND_API_KEY = 're_teste';
    process.env.RESEND_WEBHOOK_SECRET = SEGREDO;
    app = await subirApp();
    ({ query } = db());
    const c = await criarCenario(app, request, 'email' + Date.now());
    empresaId = c.empresaId;
    tokenMaster = c.tokenSuper;
    tokenCentral = c.tokenDono;

    // Dubla o provedor: nenhuma chamada sai para a internet no teste.
    const provedor = require('../../src/modules/email/email.resend');
    vi.spyOn(provedor, 'criarDominio').mockResolvedValue({
      id: 'dom_teste_1', status: 'pending',
      registros: [{ tipo: 'TXT', nome: 'avisos', valor: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto', status: 'pending' }],
    });
    verificarDominio = vi.spyOn(provedor, 'verificarDominio').mockResolvedValue({ id: 'dom_teste_1', status: 'verified', registros: [] });
    vi.spyOn(provedor, 'obterDominio').mockResolvedValue({
      id: 'dom_teste_1', status: 'verified',
      registros: [{ tipo: 'TXT', nome: 'avisos', valor: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto', status: 'verified' }],
    });
    vi.spyOn(provedor, 'enviar').mockResolvedValue({ id: 'msg_teste_1' });
  }, 60_000);

  const master = (m, c) => request(app)[m]('/api/v1' + c).set('Authorization', `Bearer ${tokenMaster}`).set('X-Empresa-Id', empresaId);

  it('a central não alcança a configuração de e-mail (é tela do master)', async () => {
    const r = await request(app).get('/api/v1/email/config').set('Authorization', `Bearer ${tokenCentral}`);
    expect(r.status).toBe(403);
  });

  it('começa sem domínio configurado', async () => {
    const r = await master('get', '/email/config');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('nao_configurado');
  });

  it('criar o domínio guarda os registros para publicar no DNS', async () => {
    const r = await master('post', '/email/dominio').send({ dominio: 'avisos.clienteteste.com.br', regiao: 'sa-east-1' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('pendente');
    expect(r.body.registros.length).toBeGreaterThan(0);
    expect(r.body.registros[0].tipo).toBe('TXT');
  });

  it('remetente precisa pertencer ao domínio configurado', async () => {
    const errado = await master('put', '/email/remetente')
      .send({ nome: 'Cliente Teste', email: 'nao-responda@outrodominio.com.br' });
    expect(errado.status).toBe(422);

    const certo = await master('put', '/email/remetente')
      .send({ nome: 'Cliente Teste', email: 'nao-responda@avisos.clienteteste.com.br', responder_para: 'financeiro@clienteteste.com.br' });
    expect(certo.status).toBe(200);
    expect(certo.body.remetente_email).toBe('nao-responda@avisos.clienteteste.com.br');
  });

  it('envio é bloqueado enquanto o domínio não está verificado', async () => {
    const r = await master('post', '/email/teste').send({ para: 'alguem@exemplo.com' });
    expect(r.status).toBe(422);
    expect(r.body.mensagem || r.body.erro).toMatch(/verificad/i);
  });

  it('depois de verificar, o envio sai e fica no log', async () => {
    const v = await master('post', '/email/dominio/verificar').send({});
    expect(v.status).toBe(200);
    expect(v.body.status).toBe('verificado');
    // Só LEU o status: reiniciar a verificação no provedor atrasaria o resultado.
    expect(verificarDominio).not.toHaveBeenCalled();
    expect(v.body.registros[0].status).toBe('verified');

    const envio = await master('post', '/email/teste').send({ para: 'alguem@exemplo.com' });
    expect(envio.status).toBe(200);

    const log = await master('get', '/email/envios');
    expect(log.body.linhas[0].para).toBe('alguem@exemplo.com');

    // O log de envios nunca guarda código de aprovação (o assunto leva o código).
    const email = require('../../src/modules/email').service;
    await email.enviar({ empresaId, para: 'aprova@exemplo.com', modelo: 'token_pagamento',
      dados: { codigo: '482917', valor: 'R$ 1,00', quantidade: 1, solicitante: 'Ana' } });
    const { rows: [reg] } = await query(`SELECT assunto FROM email_envios WHERE empresa_id = $1 AND para = 'aprova@exemplo.com'`, [empresaId]);
    expect(reg.assunto).not.toMatch(/4 ?8 ?2 ?9 ?1 ?7/);
    expect(reg.assunto).toContain('••••••');
    expect(log.body.linhas[0].modelo).toBe('teste');
  });

  it('webhook sem assinatura válida é recusado', async () => {
    const r = await request(app).post('/api/v1/email/webhook')
      .set('svix-id', 'msg_1').set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
      .set('svix-signature', 'v1,assinaturaerrada')
      .send({ type: 'domain.updated', data: { id: 'dom_teste_1', status: 'failed' } });
    expect(r.status).toBe(403);

    const { rows: [d] } = await query(`SELECT status FROM email_dominios WHERE empresa_id = $1`, [empresaId]);
    expect(d.status).toBe('verificado');            // nada mudou
  });

  it('webhook assinado corretamente atualiza o status do domínio', async () => {
    const corpo = JSON.stringify({ type: 'domain.updated', data: { id: 'dom_teste_1', status: 'failed' } });
    const id = 'msg_2';
    await webhookAssinado(id, corpo);
    const { rows: [d] } = await query(`SELECT status FROM email_dominios WHERE empresa_id = $1`, [empresaId]);
    expect(d.status).toBe('falhou');
  });

  // 11/10/2026: o domínio da Motty ficou verificado e a tabela continuou em "faltando",
  // porque o webhook só gravava o status geral.
  it('webhook grava o status de cada registro e "parcial" quando só parte foi conferida', async () => {
    const corpo = JSON.stringify({ type: 'domain.updated', data: { id: 'dom_teste_1', status: 'partially_verified',
      records: [{ record: 'DKIM', name: 'resend._domainkey.avisos', type: 'TXT', value: 'p=abc', ttl: 'Auto', status: 'verified' },
        { record: 'SPF', name: 'send.avisos', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com', priority: 10, ttl: 'Auto', status: 'pending' }] } });
    await webhookAssinado('msg_3', corpo);
    const { rows: [d] } = await query(`SELECT status, registros FROM email_dominios WHERE empresa_id = $1`, [empresaId]);
    expect(d.status).toBe('parcial');
    expect(d.registros.map((r) => r.status)).toEqual(['verified', 'pending']);
    expect(d.registros[1].prioridade).toBe('10');
  });

  async function webhookAssinado(id, corpo) {
    const ts = String(Math.floor(Date.now() / 1000));
    const chave = Buffer.from(SEGREDO.replace(/^whsec_/, ''), 'base64');
    const assinatura = crypto.createHmac('sha256', chave).update(`${id}.${ts}.${corpo}`).digest('base64');

    const r = await request(app).post('/api/v1/email/webhook')
      .set('svix-id', id).set('svix-timestamp', ts).set('svix-signature', `v1,${assinatura}`)
      .set('Content-Type', 'application/json').send(corpo);
    expect(r.status).toBe(200);
  }
});
