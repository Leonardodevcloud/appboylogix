// Modelos de e-mail com a marca da central (mockup aprovado em 10/10/2026). Regra pura:
// os modelos montam, levam a marca do cliente (logo, cores, nome) e NUNCA citam a
// plataforma; texto vindo de fora é escapado.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { montar, MODELOS } = require('../src/modules/email/email.modelos');

const MARCA = { nome: 'Motty Entregas Rápidas', logo: 'https://painel.motty.com.br/email/logo/x.png?v=1', cor: '#1d4f91', destaque: '#f14b1c', clara: '#eaf1fb', cidade: 'Franca/SP', resposta: 'suporte@motty.com.br' };
const DADOS = {
  token_pagamento: { codigo: '482917', valor: 'R$ 482,65', quantidade: 3, solicitante: 'Ana Souza', tipo: 'Pagamento avulso / antecipação', referencia: 'AV-20261010-417',
    destinos: [['João Pereira', 'R$ 160,00 · 719…3301']], link: 'https://painel.motty.com.br/aprovador?a=abc' },
  recuperar_senha: { nome: 'Ana Souza', link: 'https://painel.motty.com.br/#/redefinir-senha?t=abc', painel: 'painel.motty.com.br', quando: '10/10/2026 às 19:58', origem: 'Chrome no Windows' },
  recuperar_senha_app: { nome: 'João Pereira', codigo: '305812' },
  exclusao_confirmar: { nome: 'João Pereira', link: 'https://painel.motty.com.br/conta/excluir?t=abc', saldo: 'R$ 312,40' },
  exclusao_concluida: { nome: 'João Pereira', pedidoEm: '10/10/2026', apagadoEm: '25/10/2026', ultimoRepasse: 'R$ 312,40 pago em 15/10/2026' },
  aprovador_convite: { nome: 'Carlos Mendes', link: 'https://painel.motty.com.br/aprovador?t=abc', horas: 48, convidadoPor: 'Ana Souza', tipo: 'convite' },
  aprovador_aviso: { nome: 'Carlos Mendes', titulo: 'Novo aprovador de pagamentos', texto: 'Fernanda foi convidada.', linhas: [['Quando', '11/10/2026 às 09:00']] },
  teste: { remetente: 'avisos@motty.com.br' },
};

describe('e-mails com a marca da central', () => {
  it('os modelos montam com assunto, HTML e texto puro', () => {
    expect(MODELOS.sort()).toEqual(Object.keys(DADOS).sort());
    for (const m of MODELOS) {
      const r = montar(m, { ...DADOS[m], marca: MARCA });
      expect(r.assunto, m).toBeTruthy();
      expect(r.html, m).toContain('<!DOCTYPE html>');
      expect(r.texto, m).toBeTruthy();
    }
  });

  it('levam logo, cores e nome da central — e nada da plataforma', () => {
    for (const m of MODELOS) {
      const { html, texto, assunto } = montar(m, { ...DADOS[m], marca: MARCA });
      expect(html).toContain(MARCA.logo);
      expect(html).toContain('#f14b1c');       // faixa e botões na cor de destaque
      expect(html).toContain('Motty Entregas Rápidas');
      expect(`${html} ${texto} ${assunto}`.toLowerCase()).not.toMatch(/logix/);
    }
  });

  it('sem logo cadastrada sai com as iniciais na cor da marca', () => {
    const { html } = montar('teste', { ...DADOS.teste, marca: { ...MARCA, logo: null } });
    expect(html).not.toContain('<img');
    expect(html).toContain('>ME<');
  });

  it('cor inválida não quebra o e-mail: cai na cor padrão', () => {
    const { html } = montar('teste', { ...DADOS.teste, marca: { nome: 'X', cor: 'red;background:url(x)' } });
    expect(html).not.toContain('url(x)');
    expect(html).toContain('#185FA5');
  });

  it('o código de aprovação mostra o que está sendo aprovado', () => {
    const { html, assunto } = montar('token_pagamento', { ...DADOS.token_pagamento, marca: MARCA });
    expect(assunto).toBe('Código de aprovação: 4 8 2 9 1 7');
    for (const t of ['Pagamento avulso / antecipação', 'R$ 482,65', 'AV-20261010-417', 'Ana Souza', '482917', 'João Pereira', 'Revisar e aprovar', 'aprovador?a=abc']) expect(html).toContain(t);
  });

  it('texto de terceiros é escapado', () => {
    const { html } = montar('recuperar_senha_app', { nome: '<script>x</script>', codigo: '123456', marca: { ...MARCA, nome: 'A & B "C"' } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('A &amp; B &quot;C&quot;');
  });

  it('o convite de aprovador leva o link e deixa claro que só a pessoa vê a senha', () => {
    const { html, assunto } = montar('aprovador_convite', { ...DADOS.aprovador_convite, marca: MARCA });
    expect(assunto).toMatch(/aprovar pagamentos/);
    expect(html).toContain('https://painel.motty.com.br/aprovador?t=abc');
    expect(html).toContain('só você');
    const nova = montar('aprovador_convite', { ...DADOS.aprovador_convite, tipo: 'nova_senha', horas: 2, marca: MARCA });
    expect(nova.assunto).toBe('Criar nova senha de aprovação');
  });
});
