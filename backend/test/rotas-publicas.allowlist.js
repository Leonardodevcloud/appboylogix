// Rotas PÚBLICAS da API — as únicas sob /api/v1 que podem existir sem identidade
// (sem verificarToken, verificarTokenMotoboy ou autenticarIntegracao na pilha).
//
// Toda entrada tem um MOTIVO. Rota nova aqui é decisão de segurança: quem a adiciona
// escreve por que ela pode ser pública e o que a protege no lugar do token.
// O teste test/rotas-inventario.test.js falha para qualquer rota pública fora desta lista
// e também para qualquer entrada desta lista que NÃO exista mais (lista não acumula lixo).
//
// Formato: 'METODO /caminho' exatamente como o Express registra (parâmetros com `:nome`).
'use strict';

module.exports = {
  // ── Autenticação (o token nasce aqui) ──
  'POST /api/v1/auth/login':            'entrada do painel; limiteLogin + bloqueio por falhas + validar(zod)',
  'POST /api/v1/auth/refresh':          'cookie httpOnly lx_refresh com rotação; reuso = 401 (ADR-003)',
  'POST /api/v1/auth/logout':           'só revoga o refresh do cookie; sem cookie é no-op',
  'POST /api/v1/motoboys/auth/login':   'entrada do app; limiteLogin + bloqueio por falhas',
  'POST /api/v1/motoboys/auth/login-email': 'entrada do app (e-mail); mesmas travas do login',
  'POST /api/v1/motoboys/auth/logout':  'revoga o token do app pelo próprio token no corpo; sem token é no-op',

  // ── Esqueci minha senha (quem esqueceu a senha não tem token) ──
  'POST /api/v1/auth/senha/esqueci':    'resposta sempre igual (sem enumeração) e envio fora da requisição; limiteRecuperacao por IP + 3 pedidos/h por conta; o link vai só para o e-mail cadastrado, no domínio cadastrado da central',
  'POST /api/v1/auth/senha/conferir':   'só diz se o token (256 bits, hash no banco, 30 min, uso único) ainda vale; limiteRecuperacao',
  'POST /api/v1/auth/senha/redefinir':  'exige o token de uso único do e-mail; troca a senha e derruba as sessões; limiteRecuperacao',
  'POST /api/v1/motoboys/auth/senha/esqueci':   'idem ao painel: resposta sempre igual; código de 6 dígitos vai só para o e-mail cadastrado; 3 pedidos/h por conta',
  'POST /api/v1/motoboys/auth/senha/redefinir': 'exige o código do e-mail (hash, 15 min, 5 tentativas e morre); derruba as sessões do app; limiteRecuperacao',

  // ── Exclusão de conta do entregador (Play Store exige pedido pela web) ──
  'POST /api/v1/motoboys/conta/exclusao/pedir':     'página pública da central; resposta sempre igual; o link de confirmação vai só para o e-mail cadastrado; limiteExclusaoWeb + 3 pedidos/h por conta',
  'POST /api/v1/motoboys/conta/exclusao/conferir':  'só diz se o token (256 bits, hash, 48 h) vale e o primeiro nome; limiteAprovadorWeb (por link)',
  'POST /api/v1/motoboys/conta/exclusao/confirmar': 'exige o token de uso único do e-mail; encerra o acesso e agenda a exclusão; limiteAprovadorWeb (por link)',

  // ── Pré-cadastro de motoboy pelo app (antes de existir conta) ──
  'GET /api/v1/motoboys/cadastro/contexto/:slug': 'dados públicos da central (nome, cor) para a tela de cadastro; slug não é segredo',
  'GET /api/v1/motoboys/cadastro/cep/:cep':       'consulta de CEP para preencher endereço; sem dado de tenant',
  'POST /api/v1/motoboys/cadastro/:slug':         'cria pré-cadastro pendente de aprovação da central; rate limit por IP',

  // ── Documentos e arquivos ──
  'GET /api/v1/entregas/:id/protocolo':      'capability URL: UUID + link assinado com validade (S6). Colunas explícitas, sem telefone do motoboy',
  'POST /api/v1/uploads/publico/:slug/url':  'URL de upload pré-assinada para o pré-cadastro (documentos do motoboy antes da conta); limitePublico + validar',

  // ── White-label e API pública ──
  'GET /api/v1/branding':                       'branding resolvido pelo Host (painel carrega antes do login); só dados de marca',
  'GET /api/v1/branding/legal':                 'controlador da página pública /privacidade (razão social, CNPJ, endereço, e-mail de privacidade) resolvido pelo Host; dados cadastrais de empresa, sem pessoa física além do encarregado que ela mesma publica',
  'GET /api/v1/integracao/openapi.json':        'contrato da API pública; não expõe dado de cliente',
  'GET /api/v1/integracao/rastreio/:token':     'rastreio para o cliente final por token opaco da entrega; sem tenant',

  // ── Aprovador de pagamentos (ADR-036): página /aprovador no domínio da central ──
  'POST /api/v1/pagamentos/aprovador/convite/conferir': 'só diz se o link do convite/nova senha (256 bits, hash, validade, uso único) vale, com nome e e-mail mascarado; limiteAprovadorWeb (por link)',
  'POST /api/v1/pagamentos/aprovador/convite/aceitar':  'exige o token de uso único do e-mail; cria a senha de aprovação de quem recebeu o link (ninguém do painel a vê); limiteAprovadorWeb (por link)',
  'POST /api/v1/pagamentos/aprovador/lote/conferir':   'botão "Revisar e aprovar" do e-mail do código: mostra o lote ao aprovador (token de 256 bits, hash, 10 min, morre no primeiro uso); limiteAprovadorWeb (por link)',
  'POST /api/v1/pagamentos/aprovador/lote/aprovar':    'aprova o lote com o token do e-mail + a senha de aprovação de quem recebeu (bloqueio por tentativas, pausa e tetos valem igual ao painel); limiteAprovadorWeb (por link)',
  'POST /api/v1/pagamentos/aprovador/pedido/conferir':  'link "não reconheço" mandado só aos aprovadores; mostra o pedido de troca sem senha; limiteAprovadorWeb (por link)',
  'POST /api/v1/pagamentos/aprovador/pedido/cancelar':  'cancela a troca de aprovador sem senha com o token do e-mail dos aprovadores (só cancela, nunca concede nada); limiteAprovadorWeb (por link)',

  // ── Webhook do provedor de e-mail ──
  'POST /api/v1/pagamentos/webhook':            'quem chama é o banco (Sicoob), sem token nosso e sem assinatura na notificação; o corpo NÃO é confiado — só o id é usado para consultar o estado real pela API autenticada',
  'GET /api/v1/email/logo/:arquivo':            'logo do cabeçalho dos e-mails da central (pública por desenho: precisa abrir no Gmail sem login e sem expirar); só a imagem, id UUID no caminho',
  'POST /api/v1/email/webhook':                 'quem chama é o Resend, sem token nosso; protegido por assinatura HMAC do corpo bruto (svix) + janela de 5 min contra reenvio'
};
