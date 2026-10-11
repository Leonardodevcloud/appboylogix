// Aprovadores de pagamento (ADR-036), ponta a ponta pelo caminho real: convite por
// e-mail, senha criada pela própria pessoa, aprovação com código + senha, troca protegida,
// bloqueio por tentativas, pedido sem senha de 72 h e isolamento entre empresas.
//
// O que está sendo travado aqui é a fraude que motivou o ADR: alguém com acesso ao painel
// troca o e-mail do aprovador pelo próprio e aprova sozinho. Nenhum passo abaixo pode ser
// feito só com o login do painel.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createRequire } from 'module';
import { TEM_BANCO, subirApp, criarCenario, criarMotoboy, ligarModulo, db } from './setup.js';
const require = createRequire(import.meta.url);
const request = require('supertest');

const suite = TEM_BANCO ? describe : describe.skip;

suite('aprovadores de pagamento', () => {
  let app, query, A, B;
  const enviados = [];
  const SENHA_CARLOS = 'carlos-aprova-2026';
  const SENHA_FERNANDA = 'fernanda-aprova-2026';
  const ids = {};
  // Domínio novo a cada rodada: e-mail de usuário é único no banco inteiro.
  const DOM = `c${Date.now()}.teste`;

  const api = (m, c, quem = A) => request(app)[m]('/api/v1' + c).set('Authorization', `Bearer ${quem.tokenDono}`);
  const publico = (c) => request(app).post('/api/v1/pagamentos/aprovador' + c);
  const ultimo = (filtro) => [...enviados].reverse().find(filtro);
  const tokenDoLink = (link, p = 't') => new URL(link).searchParams.get(p);
  const CONTA = { ambiente: 'hml', credenciais: { conta: '1' }, teto_item_cent: 500000, teto_lote_cent: 500000, teto_dia_cent: 1000000, aprovacao: 'sempre', ativo: true };

  async function corrida(empresaId, motoboyId, valorCent) {
    await query(`
      INSERT INTO entregas (empresa_id, motoboy_id, protocolo, status, coleta_nome, coleta_endereco,
                            valor_motoboy_cent, valor_cliente_cent, concluida_em, criado_em)
      VALUES ($1,$2,$3,'entregue','C','Rua X',$4,$4, now(), now())`,
    [empresaId, motoboyId, 'AP' + Date.now() + Math.floor(Math.random() * 99999), valorCent]);
  }

  beforeAll(async () => {
    app = await subirApp();
    ({ query } = db());
    A = await criarCenario(app, request, 'aprovA' + Date.now());
    B = await criarCenario(app, request, 'aprovB' + Date.now());
    for (const c of [A, B]) {
      for (const cod of ['financeiro', 'financeiro.pagamento_automatico']) await ligarModulo(c.empresaId, cod).catch(() => {});
      await request(app).put('/api/v1/pagamentos/provedor')
        .set('Authorization', `Bearer ${c.tokenSuper}`).set('X-Empresa-Id', c.empresaId).send({ provedor: 'simulado' });
    }
    // E-mail dublado: guarda tudo o que "saiu" para o teste abrir o link como a pessoa faria.
    const email = require('../../src/modules/email').service;
    vi.spyOn(email, 'enviar').mockImplementation(async (m) => { enviados.push(m); return { id: 'e' }; });
    vi.spyOn(email, 'podeEnviar').mockResolvedValue(true);
    vi.spyOn(email, 'baseDaEmpresa').mockResolvedValue(`https://painel.${DOM}`);
  }, 60_000);

  it('sem aprovador ativo a conta bancária não ativa', async () => {
    const r = await api('put', '/pagamentos/conta').send(CONTA);
    expect(r.status).toBe(422);
    expect(r.body.erro).toMatch(/aprovador/i);
  });

  it('o primeiro aprovador é convidado por e-mail; o painel nunca vê a senha', async () => {
    const r = await api('post', '/pagamentos/aprovadores').send({ nome: 'Carlos Mendes', email: `Carlos@${DOM.toUpperCase()}` });
    expect(r.status).toBe(200);
    const [c] = r.body.aprovadores;
    expect(c.status).toBe('convidado');
    expect(c.email).toBe(`c***s@${DOM}`);          // mascarado na tela
    expect(JSON.stringify(r.body)).not.toMatch(/senha_hash|link_hash/);
    ids.carlos = c.id;

    const convite = ultimo((m) => m.modelo === 'aprovador_convite');
    expect(convite.para).toBe(`carlos@${DOM}`);
    expect(convite.dados.link.startsWith(`https://painel.${DOM}/aprovador?t=`)).toBe(true);
  });

  it('a pessoa abre o link, recebe as regras e cria a senha; o link não serve duas vezes', async () => {
    const token = tokenDoLink(ultimo((m) => m.modelo === 'aprovador_convite').dados.link);
    const conferir = await publico('/convite/conferir').send({ token });
    expect(conferir.status).toBe(200);
    expect(conferir.body).toMatchObject({ nome: 'Carlos Mendes', tipo: 'convite', senha_min: 10 });

    expect((await publico('/convite/aceitar').send({ token, senha: 'curta' })).status).toBe(422);
    expect((await publico('/convite/aceitar').send({ token, senha: '1234567890' })).status).toBe(422);
    const ok = await publico('/convite/aceitar').send({ token, senha: SENHA_CARLOS });
    expect(ok.status).toBe(200);
    expect((await publico('/convite/aceitar').send({ token, senha: SENHA_CARLOS })).status).toBe(422);

    const lista = await api('get', '/pagamentos/aprovadores');
    expect(lista.body.aprovadores[0].status).toBe('ativo');
    expect(lista.body.pausa).toBeNull();
  });

  it('afrouxar a trava da conta pede a senha de um aprovador; apertar não', async () => {
    const sem = await api('put', '/pagamentos/conta').send(CONTA);
    expect(sem.status).toBe(422);
    expect(sem.body.codigo).toBe('AUTORIZACAO_APROVADOR');
    expect(sem.body.detalhe.aprovadores.map((a) => a.nome)).toEqual(['Carlos Mendes']);

    const errada = await api('put', '/pagamentos/conta').send({ ...CONTA, autorizacao: { aprovador_id: ids.carlos, senha: 'nao-e-essa-senha' } });
    expect(errada.status).toBe(422);
    expect(errada.body.erro).toMatch(/Restam 4/);

    const certa = await api('put', '/pagamentos/conta').send({ ...CONTA, autorizacao: { aprovador_id: ids.carlos, senha: SENHA_CARLOS } });
    expect(certa.status).toBe(200);
    expect(certa.body.ativo).toBe(true);

    // Baixar teto é livre; desativar também. Reativar, não.
    const baixa = await api('put', '/pagamentos/conta').send({ ...CONTA, teto_dia_cent: 900000 });
    expect(baixa.status).toBe(200);
    expect((await api('put', '/pagamentos/conta').send({ ...CONTA, teto_dia_cent: 900000, ativo: false })).status).toBe(200);
    expect((await api('put', '/pagamentos/conta').send({ ...CONTA, teto_dia_cent: 900000 })).body.codigo).toBe('AUTORIZACAO_APROVADOR');
    expect((await api('put', '/pagamentos/conta').send({ ...CONTA, teto_dia_cent: 900000, autorizacao: { aprovador_id: ids.carlos, senha: SENHA_CARLOS } })).status).toBe(200);
    // Dispensar código até o teto é afrouxar.
    const dispensa = await api('put', '/pagamentos/conta').send({ ...CONTA, teto_dia_cent: 900000, aprovacao: 'acima_teto' });
    expect(dispensa.body.codigo).toBe('AUTORIZACAO_APROVADOR');
  });

  it('incluir outro aprovador exige a senha de um aprovador ativo', async () => {
    const sem = await api('post', '/pagamentos/aprovadores').send({ nome: 'Fernanda Lima', email: `fernanda@${DOM}` });
    expect(sem.status).toBe(422);
    expect(sem.body.codigo).toBe('AUTORIZACAO_APROVADOR');

    const ok = await api('post', '/pagamentos/aprovadores').send({ nome: 'Fernanda Lima', email: `fernanda@${DOM}`,
      autorizacao: { aprovador_id: ids.carlos, senha: SENHA_CARLOS } });
    expect(ok.status).toBe(200);
    ids.fernanda = ok.body.aprovadores.find((a) => a.nome === 'Fernanda Lima').id;

    const dup = await api('post', '/pagamentos/aprovadores').send({ nome: 'Fernanda Dois', email: `FERNANDA@${DOM.toUpperCase()}`,
      autorizacao: { aprovador_id: ids.carlos, senha: SENHA_CARLOS } });
    expect(dup.status).toBe(409);
  });

  it('a senha de aprovação não pode ser a senha de login da pessoa no painel', async () => {
    const sh = require('../../src/modules/auth/auth.shared');
    await query(`INSERT INTO usuarios (empresa_id, perfil, nome, email, senha_hash) VALUES ($1,'cliente','Fernanda Lima',$2,$3)`,
      [A.empresaId, `fernanda@${DOM}`, await sh.hashSenha('mesma-senha-do-login')]);
    const token = tokenDoLink(ultimo((m) => m.modelo === 'aprovador_convite' && m.para === `fernanda@${DOM}`).dados.link);
    const igual = await publico('/convite/aceitar').send({ token, senha: 'mesma-senha-do-login' });
    expect(igual.status).toBe(422);
    expect(igual.body.erro).toMatch(/diferente da sua senha de login/);
    expect((await publico('/convite/aceitar').send({ token, senha: SENHA_FERNANDA })).status).toBe(200);
  });

  it('no máximo 5 aprovadores', async () => {
    const aut = { aprovador_id: ids.carlos, senha: SENHA_CARLOS };
    for (const n of [3, 4, 5]) {
      const r = await api('post', '/pagamentos/aprovadores').send({ nome: `Pessoa ${n}`, email: `p${n}@${DOM}`, autorizacao: aut });
      expect(r.status).toBe(200);
    }
    const sexto = await api('post', '/pagamentos/aprovadores').send({ nome: 'Pessoa Seis', email: `p6@${DOM}`, autorizacao: aut });
    expect(sexto.status).toBe(422);
    expect(sexto.body.erro).toMatch(/Limite de 5/);
    // Convite pendente também só sai com senha.
    const lista = (await api('get', '/pagamentos/aprovadores')).body.aprovadores;
    for (const p of lista.filter((a) => a.status === 'convidado')) {
      expect((await api('post', `/pagamentos/aprovadores/${p.id}/remover`).send({})).body.codigo).toBe('AUTORIZACAO_APROVADOR');
      expect((await api('post', `/pagamentos/aprovadores/${p.id}/remover`).send({ autorizacao: aut })).status).toBe(200);
    }
  });

  it('com dois aprovadores, quem está na tela escolhe; o código só fecha com a senha de quem o recebeu', async () => {
    const mb = await criarMotoboy(A.empresaId, { nome: 'Recebe Aprovado' });
    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = 'chave-aprov-ok' WHERE id = $1`, [mb.id]);
    await corrida(A.empresaId, mb.id, 30000);

    const pago = await api('post', '/pagamentos/avulso').send({ motoboy_id: mb.id, valor_cent: 10000 });
    expect(pago.status).toBe(200);
    expect(pago.body.status).toBe('aguardando_aprovacao');
    expect(pago.body.aprovacao.escolher).toBe(true);
    expect(pago.body.aprovacao.aprovadores.map((a) => a.nome).sort()).toEqual(['Carlos Mendes', 'Fernanda Lima']);
    const loteId = pago.body.lote_id;

    const tk = await api('post', `/pagamentos/lotes/${loteId}/token`).send({ aprovador_id: ids.fernanda });
    expect(tk.status).toBe(200);
    expect(tk.body.aprovador.nome).toBe('Fernanda Lima');
    const codigo = ultimo((m) => m.modelo === 'token_pagamento').dados.codigo;
    expect(ultimo((m) => m.modelo === 'token_pagamento').para).toBe(`fernanda@${DOM}`);

    // Código certo + senha de OUTRO aprovador: não passa, e o código continua valendo.
    const outro = await api('post', `/pagamentos/lotes/${loteId}/aprovar`).send({ codigo, senha: SENHA_CARLOS });
    expect(outro.status).toBe(422);
    const ok = await api('post', `/pagamentos/lotes/${loteId}/aprovar`).send({ codigo, senha: SENHA_FERNANDA });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('concluido');
    const { rows: [l] } = await query(`SELECT aprovador_id FROM pagamento_lotes WHERE id = $1`, [loteId]);
    expect(l.aprovador_id).toBe(ids.fernanda);
  });

  it('senhas erradas em rajada não furam o limite: 5 erros bloqueiam por 30 minutos e avisam a pessoa', async () => {
    const tentativas = Array.from({ length: 8 }, (_, i) => api('post', `/pagamentos/aprovadores/${ids.fernanda}/remover`)
      .send({ autorizacao: { aprovador_id: ids.carlos, senha: 'errada-' + i } }));
    await Promise.all(tentativas);
    const { rows: [c] } = await query(`SELECT tentativas_erradas, bloqueado_ate FROM pagamento_aprovadores WHERE id = $1`, [ids.carlos]);
    expect(c.tentativas_erradas).toBe(5);
    expect(new Date(c.bloqueado_ate) > new Date()).toBe(true);
    const bloqueada = await api('post', `/pagamentos/aprovadores/${ids.fernanda}/remover`).send({ autorizacao: { aprovador_id: ids.carlos, senha: SENHA_CARLOS } });
    expect(bloqueada.status).toBe(422);
    expect(bloqueada.body.erro).toMatch(/bloqueada/);
    expect(ultimo((m) => m.modelo === 'aprovador_aviso' && m.para === `carlos@${DOM}`).dados.titulo).toMatch(/bloqueada/);
    // O fim do bloqueio não devolve tentativas: o contador só zera num acerto.
    await query(`UPDATE pagamento_aprovadores SET bloqueado_ate = NULL WHERE id = $1`, [ids.carlos]);
    expect((await api('post', `/pagamentos/aprovadores/${ids.fernanda}/remover`).send({ autorizacao: { aprovador_id: ids.carlos, senha: 'errada-9' } })).body.erro).toMatch(/Restam 4/);
  });

  it('o botão do e-mail aprova no aparelho do aprovador: mostra o lote, pede só a senha e não serve duas vezes', async () => {
    const mb = await criarMotoboy(A.empresaId, { nome: 'Recebe Pelo Link' });
    await query(`UPDATE motoboys SET pix_tipo = 'aleatoria', pix_chave = 'chave-link-0001' WHERE id = $1`, [mb.id]);
    await corrida(A.empresaId, mb.id, 30000);
    const pago = await api('post', '/pagamentos/avulso').send({ motoboy_id: mb.id, valor_cent: 7000 });
    await api('post', `/pagamentos/lotes/${pago.body.lote_id}/token`).send({ aprovador_id: ids.fernanda });
    const email = ultimo((m) => m.modelo === 'token_pagamento');
    expect(email.dados.destinos[0][0]).toBe('Recebe Pelo Link');
    expect(email.dados.destinos[0][1]).toMatch(/cha…0001/);
    const link = tokenDoLink(email.dados.link, 'a');

    const ver = await publico('/lote/conferir').send({ token: link });
    expect(ver.status).toBe(200);
    expect(ver.body).toMatchObject({ aprovador: 'Fernanda Lima', quantidade: 1, total: 'R$ 70,00' });
    expect((await publico('/lote/aprovar').send({ token: link, senha: SENHA_CARLOS })).status).toBe(422);   // senha de outro
    const ok = await publico('/lote/aprovar').send({ token: link, senha: SENHA_FERNANDA });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('concluido');
    expect((await publico('/lote/aprovar').send({ token: link, senha: SENHA_FERNANDA })).status).toBe(422);
    // O código do mesmo envio morreu junto.
    expect((await api('post', `/pagamentos/lotes/${pago.body.lote_id}/aprovar`).send({ codigo: email.dados.codigo, senha: SENHA_FERNANDA })).status).toBe(422);
  });

  it('nova senha de aprovação: o link vai só para o e-mail do aprovador e troca a senha', async () => {
    const r = await api('post', `/pagamentos/aprovadores/${ids.carlos}/nova-senha`).send({});
    expect(r.status).toBe(200);
    const link = ultimo((m) => m.modelo === 'aprovador_convite' && m.dados.tipo === 'nova_senha');
    expect(link.para).toBe(`carlos@${DOM}`);
    expect((await publico('/convite/aceitar').send({ token: tokenDoLink(link.dados.link), senha: 'carlos-senha-nova-2026' })).status).toBe(200);
    const antiga = await api('post', `/pagamentos/aprovadores/${ids.fernanda}/remover`).send({ autorizacao: { aprovador_id: ids.carlos, senha: SENHA_CARLOS } });
    expect(antiga.status).toBe(422);
  });

  it('remover pede senha e nunca deixa a central sem aprovador ativo', async () => {
    const r = await api('post', `/pagamentos/aprovadores/${ids.fernanda}/remover`).send({ autorizacao: { aprovador_id: ids.fernanda, senha: SENHA_FERNANDA } });
    expect(r.status).toBe(200);
    const ultimoAtivo = await api('post', `/pagamentos/aprovadores/${ids.carlos}/remover`).send({ autorizacao: { aprovador_id: ids.carlos, senha: 'carlos-senha-nova-2026' } });
    expect(ultimoAtivo.status).toBe(422);
    expect(ultimoAtivo.body.erro).toMatch(/único aprovador ativo/);
  });

  it('outra empresa não enxerga nem mexe nos aprovadores desta', async () => {
    const lista = await api('get', '/pagamentos/aprovadores', B);
    expect(lista.body.aprovadores).toEqual([]);
    const r = await api('post', `/pagamentos/aprovadores/${ids.carlos}/nova-senha`, B).send({});
    expect(r.status).toBe(404);
  });

  it('troca sem senha: confirma o login, pausa os pagamentos e qualquer aprovador cancela pelo link', async () => {
    const corpo = { nome: 'Nova Aprovadora', email: `nova@${DOM}`, remover_id: ids.carlos, motivo: 'Carlos saiu da empresa em 30/09' };
    expect((await api('post', '/pagamentos/aprovadores/pedido').send({ ...corpo, senha_login: 'errada' })).status).toBe(422);
    const r = await api('post', '/pagamentos/aprovadores/pedido').send({ ...corpo, senha_login: 'Senha123!' });
    expect(r.status).toBe(200);
    expect((await api('post', '/pagamentos/aprovadores/pedido').send({ ...corpo, senha_login: 'Senha123!' })).status).toBe(409);

    const lista = await api('get', '/pagamentos/aprovadores');
    expect(lista.body.pausa.pedido.nome).toBe('Nova Aprovadora');
    // Pausado: nada sai, nem com código.
    const mb = await criarMotoboy(A.empresaId, { nome: 'Pausado' });
    await query(`UPDATE motoboys SET pix_chave = 'chave-pausa' WHERE id = $1`, [mb.id]);
    await corrida(A.empresaId, mb.id, 20000);
    const pagar = await api('post', '/pagamentos/avulso').send({ motoboy_id: mb.id, valor_cent: 5000 });
    expect(pagar.status).toBe(409);
    expect(pagar.body.erro).toMatch(/pausados/);

    // O aviso ao aprovador leva o link de cancelar; o da equipe, não.
    const aviso = ultimo((m) => m.modelo === 'aprovador_aviso' && m.para === `carlos@${DOM}` && m.dados.link);
    const token = tokenDoLink(aviso.dados.link, 'c');
    expect((await publico('/pedido/conferir').send({ token })).body.nome).toBe('Nova Aprovadora');
    expect((await publico('/pedido/cancelar').send({ token })).status).toBe(200);
    expect((await publico('/pedido/cancelar').send({ token })).status).toBe(422);
    expect((await api('get', '/pagamentos/aprovadores')).body.pausa).toBeNull();
  });

  it('passadas as 72 h sem cancelamento, a troca vale e o convite sai', async () => {
    const corpo = { nome: 'Nova Aprovadora', email: `nova@${DOM}`, remover_id: ids.carlos, motivo: 'Carlos saiu da empresa em 30/09', senha_login: 'Senha123!' };
    expect((await api('post', '/pagamentos/aprovadores/pedido').send(corpo)).status).toBe(200);
    await query(`UPDATE pagamento_aprovador_pedidos SET libera_em = now() - interval '1 minute' WHERE empresa_id = $1 AND status = 'aguardando'`, [A.empresaId]);

    const lista = await api('get', '/pagamentos/aprovadores');
    expect(lista.body.pausa).toBeNull();
    expect(lista.body.aprovadores.map((a) => [a.nome, a.status])).toEqual([['Nova Aprovadora', 'convidado']]);
    expect(ultimo((m) => m.modelo === 'aprovador_convite').para).toBe(`nova@${DOM}`);
  });

  it('sem aprovador ativo depois de já ter tido, nada muda sem a troca de 72 h', async () => {
    const lista = (await api('get', '/pagamentos/aprovadores')).body.aprovadores;
    const nova = lista.find((a) => a.nome === 'Nova Aprovadora');
    const remover = await api('post', `/pagamentos/aprovadores/${nova.id}/remover`).send({});
    expect(remover.body.codigo).toBe('SEM_APROVADOR_ATIVO');
    const incluir = await api('post', '/pagamentos/aprovadores').send({ nome: 'Eu Mesmo', email: `eu@${DOM}` });
    expect(incluir.body.codigo).toBe('SEM_APROVADOR_ATIVO');
    // A troca de 72 h continua possível (e pausa tudo).
    const pedido = await api('post', '/pagamentos/aprovadores/pedido').send({ nome: 'Outra Pessoa', email: `outra@${DOM}`, remover_id: nova.id, motivo: 'convite enviado ao e-mail errado', senha_login: 'Senha123!' });
    expect(pedido.status).toBe(200);
    // Pausado: nem o reenvio de itens com erro sai.
    const { rows: [l] } = await query(`SELECT id FROM pagamento_lotes WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT 1`, [A.empresaId]);
    expect((await api('post', `/pagamentos/lotes/${l.id}/reenviar`).send({})).status).toBe(409);
    expect((await api('post', `/pagamentos/aprovadores/pedido/${pedido.body.id}/cancelar`).send({})).status).toBe(200);
  });

  it('o histórico conta quem fez o quê e como foi autorizado', async () => {
    const r = await api('get', '/pagamentos/historico');
    const tipos = r.body.linhas.map((l) => l.tipo);
    for (const t of ['aprovador_convidado', 'aprovador_ativado', 'aprovador_bloqueado', 'aprovador_removido', 'lote_aprovado',
      'aprovador_pedido_sem_senha', 'aprovador_pedido_cancelado', 'aprovador_pedido_concluido', 'conta_salva']) {
      expect(tipos, t).toContain(t);
    }
    expect(JSON.stringify(r.body)).not.toMatch(/carlos-aprova|senha_hash/);
  });
});
