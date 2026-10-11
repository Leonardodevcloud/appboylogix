const rateLimit = require('express-rate-limit');
const { redis, redisDisponivel } = require('../shared/redis');

// Fábrica: cria um limitador que usa Redis quando disponível (contadores
// compartilhados entre réplicas) e memória caso contrário. O store é resolvido
// na PRIMEIRA requisição (o Redis conecta depois do require dos módulos).
function criarLimite(opcoes) {
  let limitador = null;
  let usandoRedis = false;
  const montar = () => {
    const nome = opcoes.nome || 'geral';
    const base = {
      standardHeaders: true, legacyHeaders: false,
      // S4: cada bloqueio conta na métrica e sai no log com reqId/ip — sem isso um ataque
      // (ou um cliente legítimo travado) era invisível.
      handler(req, res, _next, options) {
        try { require('../shared/metricas').rateLimitBloqueios.inc({ nome }); } catch (_) {}
        require('../shared/logger').warn({ limitador: nome, ip: req.ip, rota: (req.originalUrl || '').split('?')[0] }, 'rate-limit: bloqueado');
        res.status(options.statusCode).send(options.message);
      },
      // O limitador é criado na 1ª requisição DE PROPÓSITO (o Redis conecta depois do
      // require dos módulos). Desliga só a validação que reclama disso.
      validate: { creationStack: false },
      ...opcoes,
    };
    if (redisDisponivel()) {
      try {
        const { RedisStore } = require('rate-limit-redis');
        base.store = new RedisStore({
          sendCommand: (...args) => redis().call(...args),
          prefix: `lx:rl:${opcoes.nome || 'geral'}:`,
        });
        usandoRedis = true;
      } catch { usandoRedis = false; }
    }
    delete base.nome;
    return rateLimit(base);
  };
  return (req, res, next) => {
    // Se o Redis ficou disponível depois (ou caiu), remonta o limitador.
    if (!limitador || usandoRedis !== redisDisponivel()) limitador = montar();
    return limitador(req, res, next);
  };
}

// Global por IP. Painel de central faz polling e o operador costuma ter várias abas
// (todas somam no mesmo IP), então o teto precisa de folga. Configurável por env.
// O refresh/logout de sessão e os health checks NUNCA entram aqui — senão um IP
// movimentado tomaria 429 no /auth/refresh e o usuário legítimo seria deslogado.
const limiteGlobal = criarLimite({
  nome: 'global', windowMs: 60_000, max: Number(process.env.LIMITE_GLOBAL_MAX) || 600,
  skip: (req) => {
    const p = (req.originalUrl || req.url || '').split('?')[0];
    return p.endsWith('/auth/refresh') || p.endsWith('/auth/logout')
      || p.includes('/health') || p.includes('/saude/');
  },
});
const limiteLogin = criarLimite({
  nome: 'login', windowMs: 15 * 60_000, max: Number(process.env.LOGIN_RATE_MAX) || 10, // por IP; a trava por CONTA está em shared/loginGuard.js
  message: { erro: 'Muitas tentativas. Tente novamente mais tarde.', codigo: 'RATE_LIMIT' },
});
// Rastreamento recebe muitos pings; limite mais alto.
const limiteRastreamento = criarLimite({ nome: 'rastreio', windowMs: 60_000, max: 240 });
// Chat: anti-spam no envio de mensagens (por IP/sessão).
const limiteChat = criarLimite({ nome: 'chat', windowMs: 10_000, max: 20, message: { erro: 'Você está enviando muito rápido. Aguarde um instante.' } });

// GPS do app: por MOTOBOY (não por IP — vários motoboys compartilham IP de operadora).
// App envia a cada 15s (~4/min); 12/min dá folga para retentativas sem permitir flood.
const limiteRastreamentoMotoboy = criarLimite({
  nome: 'gps', windowMs: 60_000, max: 12,
  keyGenerator: (req) => (req.motoboy && req.motoboy.id) ? String(req.motoboy.id) : req.ip,
});

// Esqueci a senha / exclusão de conta pela web: rotas públicas que disparam e-mail.
// Por IP; a trava por conta (pedidos por hora) fica no service.
// A chave é IP + e-mail pedido: o painel chega pela Vercel (muitos usuários atrás do
// mesmo IP de borda), e um teto só por IP travaria a central inteira por causa de um.
const limiteRecuperacao = criarLimite({
  nome: 'recuperacao', windowMs: 15 * 60_000, max: Number(process.env.RECUPERACAO_RATE_MAX) || 8,
  keyGenerator: (req) => `${req.ip}|${String((req.body && req.body.email) || (req.motoboy && req.motoboy.id) || '').toLowerCase().slice(0, 160)}`,
  message: { erro: 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.', codigo: 'RATE_LIMIT' },
});

// Página /conta/excluir: quem chama a API é o servidor da Vercel (um IP para todos os
// visitantes), então o teto por IP é bem mais alto — a proteção real é o token de 256
// bits (conferir/confirmar) e o limite por conta (pedir).
const limiteExclusaoWeb = criarLimite({
  nome: 'exclusao-web', windowMs: 15 * 60_000, max: Number(process.env.EXCLUSAO_WEB_RATE_MAX) || 120,
  message: { erro: 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.', codigo: 'RATE_LIMIT' },
});

// Página /aprovador (ADR-036): como na exclusão, quem chama a API é o servidor da Vercel —
// um IP para todos. O teto é POR LINK (token), para um visitante qualquer não esgotar o
// limite de todos e impedir um aprovador de cancelar a troca dentro das 72 h.
const limiteAprovadorWeb = criarLimite({
  nome: 'aprovador-web', windowMs: 15 * 60_000, max: Number(process.env.APROVADOR_WEB_RATE_MAX) || 20,
  keyGenerator: (req) => 'tk:' + require('crypto').createHash('sha256').update(String((req.body && req.body.token) || req.ip)).digest('hex').slice(0, 32),
  message: { erro: 'Muitas tentativas com este link. Aguarde alguns minutos.', codigo: 'RATE_LIMIT' },
});

module.exports = { limiteAprovadorWeb, criarLimite, limiteGlobal, limiteLogin, limiteRastreamento, limiteRastreamentoMotoboy, limiteChat, limiteRecuperacao, limiteExclusaoWeb };
