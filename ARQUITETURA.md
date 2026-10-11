# Logix — Arquitetura

> Este documento é a fonte de verdade sobre **como o sistema é organizado e por quê**.
> Todo dev lê no primeiro dia. Toda decisão relevante vira um ADR na seção 8.
> Notas específicas do multi-tenant (hierarquia, perfis, white-label) estão em `ARQUITETURA-MULTITENANT.md`.

---

## 1. Em uma frase

**Monólito modular multi-tenant, sem estado no processo, organizado por domínio de negócio, com fronteiras entre módulos impostas por ferramenta e comunicação entre módulos por API pública (`index.js`) e eventos de domínio.**

Não é microserviços. Não vai ser microserviços por padrão. A seção 7 diz exatamente quando e como um módulo vira serviço próprio.

## 2. Visão geral

```
┌──────────────────────────────────────────────────────────────────────────┐
│  BORDA                                                                    │
│  Vercel (painel SPA + BFF /bff → API)   ·   app Expo (repo appboylogix)  │
│  ERPs dos clientes → /api/v1/integracao (chave por cliente)              │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ HTTPS · Bearer JWT (painel/app) · cookie httpOnly só p/ refresh
┌──────────────▼───────────────────────────────────────────────────────────┐
│  API  (N réplicas idênticas · SEM estado em memória)                      │
│  Express · middlewares transversais · 28 módulos de domínio               │
│  WebSocket /ws (salas por empresa/motoboy)                                │
└───────┬──────────────┬─────────────────┬─────────────────────────────────┘
        │              │                 │
┌───────▼──────┐ ┌─────▼──────┐  ┌───────▼──────────────────────────────────┐
│ PostgreSQL   │ │ Redis      │  │ WORKER (opcional)                         │
│ shared-schema│ │ pub/sub WS │  │ cron · webhooks · fechamento · limpeza    │
│ empresa_id   │ │ rate-limit │  │ (todo job com advisory lock: N processos  │
│ em toda tab. │ │ cache      │  │  podem rodar, só um executa)              │
└──────────────┘ └────────────┘  └───────────────────────────────────────────┘
                 Redis opcional: sem REDIS_URL o sistema roda em modo 1 réplica.
Externos: ORS/heigit (rotas, geocoding) · Google Maps · Expo Push · S3/R2 (fotos) · Sentry
```

## 3. Estrutura do backend e regras de fronteira

```
backend/
├── server.js            ← SÓ wiring: monta middlewares, migra, sobe HTTP/WS. Zero regra de negócio.
├── worker.js            ← processo dos jobs (cron). Mesmas env vars da API.
└── src/
    ├── shared/          ← infra transversal: db, logger, contexto (ALS), AppError, storage, push, schemas
    ├── middleware/      ← auth, tenant, permissões, rateLimit, validar (zod), errorHandler, requestLogger
    ├── realtime/ws.js   ← WebSocket (salas). Não conhece módulos.
    ├── integracoes/     ← clientes de APIs externas (ORS). Não conhecem módulos.
    ├── jobs/cron.js     ← orquestra jobs chamando a API pública dos módulos
    └── modules/<nome>/
        ├── index.js            ← API PÚBLICA do módulo: exporta initXRoutes, initXTables e funções que outros módulos podem usar
        ├── <nome>.routes.js    ← HTTP: valida (zod), resolve tenant, chama service. Sem SQL.
        ├── <nome>.service.js   ← regra de negócio + SQL do módulo
        ├── <nome>.<caso>.service.js ← quando o service passa de ~500 linhas, um arquivo por
        │                          responsabilidade e o <nome>.service.js vira fachada que reexporta
        │                          (ex.: entregas → lancamento · consulta · painel · acompanhamento · edicao · rotas · execucao)
        ├── <nome>.shared.js    ← helpers puros do módulo
        └── routes/             ← sub-routers quando > 10 endpoints

Frontend (`frontend/src/modulos/<tela>.js` exporta `montar(container)`): quando a tela passa
de ~600 linhas, as peças independentes vão para `modulos/<tela>/` (componentes, modais,
utilitários) e os modais recebem um `ctx` mínimo da tela em vez de fechar sobre o estado
dela — ex.: `acompanhamento/{util,modais,rota-lote}.js`, `entregas/{campo-busca,mapa,ponto-destino,util}.js`.
```

### Regras (verificadas por `npm run deps:check` — falha o CI)

| # | Regra | Por quê |
|---|---|---|
| R1 | Um módulo só importa **outro módulo pelo `index.js`** dele. Nunca `../filas/filas.service`. | O `index.js` é o contrato. O que não está lá é detalhe interno e pode mudar sem avisar ninguém. |
| R2 | `shared/`, `middleware/`, `realtime/`, `integracoes/` **nunca importam `modules/`**. | A dependência aponta sempre módulo → infra. Infra que conhece domínio vira acoplamento invisível. |
| R3 | **Sem ciclos** entre módulos. | Ciclo = os dois módulos são um só. Ou funde, ou extrai a parte comum para um terceiro. |
| R4 | Cada módulo é **dono das suas tabelas**. Outro módulo não faz `SELECT` nelas; pede uma função no `index.js`. | Sem isso não dá para mudar schema, adicionar cache ou extrair o módulo. |
| R5 | Efeitos colaterais em outro módulo saem como **evento de domínio**, não chamada direta (ver §5). | `entregas` não deve saber que `score` existe. |
| R6 | Toda rota que grava dado tem **schema zod** (`middleware/validar.js` + `shared/schemas.js`). | Entrada é a única coisa que não controlamos. |
| R7 | Toda query em tabela com `empresa_id` **filtra por `empresa_id`**. Sem exceção, inclusive quando o id do recurso vem da URL. | Isolamento de tenant é a promessa central do produto. |
| R8 | Nenhum `console.*` em `src/`. Só `shared/logger` (pino). | Log sem `reqId`/`empresaId` é log que ninguém consegue usar em produção. |

**Estado atual das regras:** R1–R3 ativas com **zero violações** (eram 31 em 2026-09; pagas via `index.js` + getters lazy, eventos de domínio e inversão de dependência — infra recebe do `app.js` o que precisa dos módulos: `tenant.configurar`, `permissoes.configurar`, `openrouteservice.configurar`). A baseline `.dependency-cruiser-known-violations.json` está vazia e deve continuar assim. O CI falha em violação **nova**; as antigas são pagas conforme os módulos forem tocados. Para ver a dívida: `npm run deps:divida`. Ao pagar uma, rode `npm run deps:baseline` e commite o JSON.

## 4. Fluxo de uma requisição

```
requestLogger  → gera X-Request-Id, abre contexto (ALS) com reqId
compression · helmet · cors (lista explícita) · json · cookies · sanitizer
[rate limit]
verificarToken → req.usuario (Bearer JWT). Cookie NÃO autentica (ADR-003)
resolverTenant → req.empresaId / req.lojaId conforme perfil; setEmpresa(ALS)
exigirModulo / exigirPermissao → plano da empresa e papel do usuário
exigirEntregaDaLoja → o recurso da URL é da loja de quem pede (alheio = 404) · pilha completa: ADR-016
validar(schema) → req.body coerido e limpo
handler → service → db (SEMPRE $1,$2 · SEMPRE empresa_id)
errorHandler → AppError → status dela · PG conhecido → 409/422 · resto → 500 + Sentry + reqId
```

Tudo dentro do handler enxerga `reqId`, `empresaId` e `usuarioId` pelo `AsyncLocalStorage` (`shared/contexto.js`) — o logger injeta sozinho, as integrações externas usam para contabilizar custo por empresa (`apiuso`).

## 5. Comunicação entre módulos

**Implementado (Sprint 2):** barramento de eventos de domínio em `shared/eventos.js`. Cada módulo registra seus ouvintes em `registrarOuvintes()` no próprio `index.js`; `src/app.js` chama todos no boot.

```js
// no módulo que causa o fato
eventos.emitir('entrega.concluida', { empresaId, entregaId, motoboyId, em });

// nos módulos interessados (registram no próprio index.js)
eventos.ouvir('entrega.concluida', async (e) => scoreService.pontuar(e));
```

Regras: nome `<agregado>.<fato-no-passado>`; payload só com ids e dados imutáveis (quem precisa de mais consulta); handler nunca lança (loga e segue); handler é idempotente (o mesmo evento pode chegar duas vezes).

Implementação: `EventEmitter` in-process (o processo que causa o fato trata os ouvintes). Para extrair um módulo, o mesmo `emitir/ouvir` passa a publicar em Redis Streams — **nenhum módulo muda**. Essa é a fronteira que vira fila (§7).

**Catálogo (Onda 2A, 11/09/2026):** a lista oficial mora em `shared/eventos.catalogo.js` — `eventos.emitir()` **lança** para nome fora dela, então o catálogo é contrato, não documentação. 27 eventos:

| Agregado | Eventos | Quem ouve |
|---|---|---|
| entrega | criada · atribuida (via: manual/lote/oferta/reatribuicao) · atribuidas_em_lote · removida_do_motoboy · status_alterado · editada · ponto_concluido · ponto_protocolado · concluida · finalizada_manual · retorno_criado · reaberta · cancelada | notificacoes; score (ponto_concluido); chat e seguro (concluida, cancelada) |
| ponto | liberacao_solicitada · liberado | notificacoes |
| oferta | disparada · aceita · recusada | notificacoes; score e seguro (aceita); score (recusada) |
| motoboy | status_alterado · posicao_atualizada · cadastro_recebido · cadastro_avaliado · dados_atualizados · documento_atualizado | notificacoes; seguro (posicao) |
| chat | mensagem_enviada | notificacoes |
| sistema | erro_http | saude |

**Módulo `notificacoes`** (`src/modules/notificacoes/`) é o **único** que importa `realtime/ws` e `shared/push` (lint, regra 24). Ele ouve os eventos acima e traduz para as mensagens WebSocket que painel, lojas e app já conheciam (`entrega.atribuida`, `motoboy.status`, `oferta.nova`…) e para os textos de push — preservando nomes e payloads que os clientes leem (`test/notificacoes.test.js` fixa isso). Módulo de negócio não sabe que WS existe: emite o fato e pronto. As 52 chamadas diretas que havia em 7 arquivos viraram 0.

**Decisão 2.12 (12/09/2026):** `entrega.finalizada_manual` e `entrega.ponto_protocolado` (painel) continuam eventos **distintos** de `entrega.concluida`/`entrega.ponto_concluido` (app), mas `chat` e `seguro_iza` ouvem os dois — a conversa e o período segurado são da corrida, não de quem a fechou. `score` ouve **só** o app: pontuar é recompensa por conclusão comprovada pelo motoboy; a central fechar manualmente é exceção operacional. Mudar essa regra é trocar ouvintes, sem tocar em `entregas`.

## 6. Multi-tenancy e dados

- **Shared database, shared schema.** `empresa_id UUID NOT NULL` em toda tabela de negócio; `loja_id` no segundo nível.
- Escopo resolvido em `middleware/tenant.js`; nunca confie em `empresa_id` vindo do body.
- **Segunda trava (ADR-012):** Row-Level Security em todas as 43 tabelas com `empresa_id` (`RLS_ENABLED=true`, usuário não-superuser). Se um dev esquecer o `WHERE`, o banco barra — coberto por teste de integração.
- Se um cliente exigir banco dedicado por contrato: `DATABASE_URL` resolvido por tenant no `contexto.js`. A arquitetura permite; não fazemos por padrão.
- **GPS (módulo `posicoes`, dono do dado):** `rastreamento` particionada por dia (`PARTITION BY RANGE (capturado_em)`, partições `rastreamento_YYYYMMDD` + `rastreamento_default`); retenção = `DROP` da partição (cron diário, `manterParticoes`). "Posição atual" vem de `motoboy_posicao_atual` (1 linha por motoboy, UPSERT que nunca regride no tempo) — **tabela publicada**: outros módulos podem lê-la em JOIN, só `posicoes` escreve. Histórico só é lido para trajeto de entrega e janela do radar (índice `(entrega_id, capturado_em)`).
- **Concorrência entre processos:** ondas de oferta com `FOR UPDATE SKIP LOCKED`; todo job do cron com `pg_try_advisory_lock` (`shared/locks.js`). Testado com 3 execuções paralelas (test/integracao/concorrencia).
- **Migrations em UMA camada (ADR-019, Onda 4):** só `backend/migrations/` (node-pg-migrate, tabela `pgmigrations`, `up`/`down`). A primeira da série, `1756000000000_baseline-modulos`, é a antiga baseline de boot dos módulos — roda **uma vez por banco**, não a cada boot. O boot (`migrar()`) só aplica o que está pendente, sob `pg_advisory_lock`, como rede de segurança do pre-deploy (`npm run migrate` nas Settings do Railway). Banco que já existia antes da Onda 4 recebe o registro da baseline por `scripts/marcar-baseline-aplicada.js` **antes** do deploy; sem isso `checkOrder` recusa a série e o deploy falha cedo. Regra: toda mudança de schema nova é um arquivo em `migrations/`. O CI aplica a série inteira e sobe a API em banco **vazio**.

## 7. Quando (e como) um módulo vira serviço próprio

Um módulo só é extraído se **pelo menos dois** forem verdadeiros:

1. **Perfil de escala diferente** — precisa de muito mais réplicas/CPU/memória que o resto (ex.: ingestão de GPS).
2. **Cadência de deploy diferente** — um time quer publicar 10× por dia sem afetar o resto.
3. **Runtime diferente** — precisa de linguagem/lib que não cabe no Node (ex.: roteirização pesada).
4. **Isolamento de falha** — se cair, o resto tem que continuar (ex.: chat).

"Vai crescer" e "tem mais dev" **não** são critérios. Time cresce → mais módulos, mais donos, regras R1–R8 mais rígidas. Não → mais serviços.

**Candidatos, em ordem:** `posicoes` (GPS; critérios 1 e 4 — já isolado como módulo, único escritor das suas tabelas) → `roteirizador` (1 e 3) → `chat` (4). Nenhum outro está no radar.

**Como extrair (strangler):** o módulo já fala com o resto por `index.js` + eventos e é dono das suas tabelas (R1, R4, R5). Extração = mover a pasta para um processo, trocar `eventos` in-process por Redis Streams, expor as funções do `index.js` como HTTP interno. Semanas, não meses — **se as regras estiverem sendo cumpridas.** É por isso que elas existem.

## 8. ADRs — decisões registradas

Formato: contexto → decisão → consequências. Não se apaga ADR; se mudar, escreve outro que supersede.

### ADR-001 · Monólito modular, não microserviços (2026-09)
**Contexto:** SaaS B2B com 1 dev, domínio em evolução, clientes grandes entrando.
**Decisão:** monólito modular com fronteiras impostas por CI (§3) e critérios objetivos de extração (§7).
**Consequências:** deploy único, transações ACID entre módulos, onboarding simples. Custo: disciplina de fronteira precisa ser automatizada (dependency-cruiser), senão vira "big ball of mud".

### ADR-002 · API sem estado; Redis para tudo que é compartilhado (2026-09)
**Contexto:** WS, rate-limit, cache e timers vivem em memória → 1 réplica.
**Decisão:** nenhum estado compartilhado em memória de processo. Redis para pub/sub, rate-limit e cache; worker separado para jobs; `FOR UPDATE SKIP LOCKED` / `pg_advisory_lock` onde N processos concorrem.
**Consequências:** escala horizontal trivial; dependência nova (Redis, opcional — sem ela o sistema cai para modo 1 réplica automaticamente). Implementado na Sprint 2: `shared/redis.js`, `shared/cache.js`, `middleware/rateLimit.js` (store Redis), `realtime/ws.js` (pub/sub com id de instância para não duplicar entrega local).

### ADR-003 · Access token só em Bearer; cookie apenas para refresh (2026-09)
**Contexto:** cookie `lx_access` com `sameSite=none` autenticava rotas de negócio; middleware CSRF existia mas nunca foi aplicado.
**Decisão:** access token vai no corpo e o cliente envia como `Authorization: Bearer`. Cookie httpOnly `lx_refresh` com `path=/api/v1/auth` só serve `/refresh` e `/logout`. Middleware `csrf.js` removido.
**Consequências:** superfície CSRF desaparece (nenhuma rota de negócio aceita cookie). Painel já funcionava assim (renova pelo refresh após reload). Rotação de refresh continua (reuso = 401).
**Estado em 12/09/2026 (Onda 6):** o path do cookie é `/` (o painel chega pelo BFF da Vercel, `/bff/v1/auth/...`); a rotação tem janela de graça de 60 s para abas concorrentes (`REFRESH_GRACE_MS`) e reuso fora dela derruba todas as sessões (1758000000000). **Nada da sessão fica em `sessionStorage`/`localStorage`** — o access token vive só em memória (`frontend/src/core/api.js`) e até o objeto `usuario` saiu do navegador na Onda 6; o boot reconstrói tudo pelo cookie (`restaurar()` → `/auth/refresh` → `/auth/eu`). O JWT é assinado e verificado com **algoritmo fixo `HS256` e `iss` obrigatório** (`shared/jwt.js`, `JWT_ISSUER`, padrão `logix`). O access token do painel é **revogável**: carrega `tv` = `usuarios.token_versao`; `verificarToken` confere (cache de 60 s por usuário, `USUARIO_TOKEN_CACHE_MS`) que o usuário segue ativo e que a versão bate, e falha fechada (503) se o banco cair. Desativar, rebaixar perfil, trocar papel/loja/empresa ou redefinir senha incrementa a versão por trigger (1758300000000) — mesmo padrão do app do motoboy (`motoboys.token_versao`, 1757000007000). Janela máxima de acesso indevido: 60 s (era 15 min). Se o cache estiver **atrás** do token (senha trocada + novo login dentro dos 60 s), o middleware reconsulta em vez de recusar. WebSocket autentica **só** pela primeira mensagem `{tipo:'auth',token}`; `?token=` na URL foi removido (fecha com 4003, métrica `logix_ws_auth_url_recusada_total`). O painel na Vercel envia CSP (nonce por requisição para o único `<script>` inline, `script-src` restrito a `'self'` + cdnjs + Google Maps), HSTS, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` e `Permissions-Policy` (`frontend/api/render.js` + `frontend/vercel.json`) — como o token só existe em memória, XSS era o único vetor de roubo e a CSP é a trava dele. Onda 6b (13/09): `img-src`/`connect-src` por lista quando `LOGIX_CSP_HOSTS` está definida na Vercel (storage: endpoint do upload + host público do bucket; o resto é fixo no `render.js`) — sem a variável fica em `https:`/`wss:`; `rastreio.html`, `openapi.html` e `integracao-docs.html` ganharam CSP fixa no `vercel.json` e os scripts inline foram para `frontend/src/paginas/` (o rastreio usa o GoogleMutant local em vez do unpkg).

### ADR-004 · Observabilidade: pino + reqId + Sentry (2026-09)
**Decisão:** log JSON estruturado com `reqId`/`empresaId`/`usuarioId` automáticos via ALS; `X-Request-Id` devolvido em toda resposta e no corpo de erros; Sentry opcional por `SENTRY_DSN`; health `/live` e `/ready`; graceful shutdown em SIGTERM.
**Consequências:** suporte pede o `reqId` ao cliente e encontra o log exato. Próximo: métricas Prometheus (`/metrics`) e OpenTelemetry.

### ADR-005 · CORS explícito, negado por padrão (2026-09)
**Contexto:** sem `CORS_ORIGIN`, a API refletia qualquer origem com credentials.
**Decisão:** só origens listadas; sem `Origin` (app nativo, server-to-server) passa; `localhost` só fora de produção.

### ADR-007 · Eventos de domínio in-process, locks no Postgres (2026-09) — *complementado na Onda 2A: catálogo obrigatório em `shared/eventos.catalogo.js` e módulo `notificacoes` como único emissor de WS/push (ver §5)*
**Contexto:** score/chat eram chamados direto de filas/entregas com `try/catch` espalhado; jobs usavam flags em memória contra sobreposição.
**Decisão:** `shared/eventos.js` (EventEmitter) para efeitos colaterais entre módulos; `shared/locks.js` (advisory lock) e `SKIP LOCKED` para exclusão mútua entre processos. Não adotar fila externa (BullMQ/Kafka) até haver um consumidor fora do processo.
**Consequências:** módulos desacoplados sem infraestrutura nova; cron seguro em N réplicas; a troca para Redis Streams fica localizada em `eventos.js`.

### ADR-008 · `src/app.js` separado de `server.js` (2026-09)
**Decisão:** aplicação Express (middlewares, módulos, migrations) em `src/app.js`; processo (porta, WS, Redis, sinais) em `server.js`.
**Consequências:** testes de integração sobem o app com supertest sem porta nem WS; o CI roda isolamento de tenant e concorrência contra Postgres+Redis reais.

### ADR-009 · GPS: módulo `posicoes`, posição atual separada do histórico, histórico particionado (2026-09)
**Contexto:** 11 pontos do código faziam `ORDER BY capturado_em DESC LIMIT 1` sobre o histórico; retenção era `DELETE` em tabela que cresce milhões de linhas/dia.
**Decisão:** módulo `posicoes` é o único escritor de GPS. `motoboy_posicao_atual` (UPSERT, `WHERE EXCLUDED.capturado_em >= atual`) serve toda leitura de "onde está". `rastreamento` particionada por dia; retenção por `DROP`. Ingestão em lote (`/app/posicoes`, ≤20 pontos).
**Consequências:** leitura do mapa é 1 index scan por motoboy independente do tamanho do histórico; retenção sem bloat; 4× menos requests quando o app adotar o lote. Custo: 1 transação com 2 statements por ping.

### ADR-010 · Migrations versionadas com node-pg-migrate (2026-09) — *complementado pelo ADR-019: a baseline de boot deixou de existir como camada*
**Decisão:** ver §6. Novas mudanças só em `migrations/` com `down` obrigatório; o pre-deploy do Railway (Settings → Pre-deploy command) executa `npm run migrate`.
**Consequências:** rollback de schema documentado e testado; CI valida `up` em banco vazio.

### ADR-011 · Arquivos por upload direto ao storage (URL pré-assinada) (2026-09)
**Contexto:** fotos/documentos chegavam em base64 pela API (`limit: '15mb'` global); fotos de protocolo eram gravadas em base64 **dentro do Postgres**.
**Decisão:** módulo `uploads` emite URL assinada de PUT; cliente envia direto ao R2; rota de negócio recebe só a `storage_key` e confirma (prefixo da empresa + HEAD + tamanho). Base64 legado é aceito por compatibilidade, mas vai para o storage — nunca para o banco. Body JSON global = 1 MB.
**Consequências:** API sem tráfego de bytes de arquivo; Postgres para de inchar; chaves auditáveis por empresa/finalidade. Custo: CORS no bucket precisa listar os domínios do painel; clientes precisam de 2 chamadas (URL + PUT) em vez de 1.

### ADR-012 · Row-Level Security como segunda trava de tenant (2026-09)
**Contexto:** isolamento dependia 100% de `WHERE empresa_id` em cada query (regra R7). Um esquecimento vazaria dados entre clientes.
**Decisão:** política `tenant_isolamento` em toda tabela com `empresa_id` (migration 0004, `FORCE ROW LEVEL SECURITY`); contexto via `set_config('app.empresa_id')` em todo checkout de conexão (`shared/db.js`), só para perfis presos a uma empresa. Sem contexto → permissiva. Ligado por `RLS_ENABLED`. Exige usuário de banco não-superuser.
**Consequências:** defesa em profundidade provada por teste (SELECT sem WHERE no contexto de B não vê A; INSERT com empresa errada falha com 42501). Custo: 1 round-trip por checkout. Super_admin permanece cross-tenant por design.

### ADR-013 · Observabilidade dentro do produto (módulo `saude`) (2026-09)
**Contexto:** Prometheus/Grafana exigem ferramenta externa; a operação precisa de um "está tudo bem?" no próprio painel.
**Decisão:** cada réplica grava 1 amostra/min (`saude_amostras`, JSONB: HTTP, p95 por rota, GPS, WS, pool, memória, event-loop); `errorHandler` emite `sistema.erro_http` e o módulo `saude` persiste (`saude_erros`). `GET /saude/resumo` agrega (buckets por período, mediana dos p95) em lotes de 4 consultas para não esgotar o pool. Retenção 7 dias (cron). Grafana continua para alertas e retenção longa.
**Consequências:** visão ao vivo de réplicas, RLS efetivo, uploads legados (gatilho para remover base64) sem sair do painel. Custo: ~1 INSERT/min por réplica.

### ADR-014 · Rotação de chave do JWT com `kid` (2026-09)
**Decisão:** `shared/jwt.js` assina com a chave `JWT_ACTIVE_KID` (header `kid`) e verifica com qualquer chave em `JWT_KEYS` ∪ `JWT_ACCESS_SECRET` (kid implícito `v0`). Rotação em 3 deploys sem derrubar sessão: adiciona → ativa → remove a antiga após o maior TTL.
**Consequências:** segredo vazado deixa de ser catástrofe; tokens forjados com `kid` desconhecido são rejeitados. Sem `JWT_KEYS` o comportamento é idêntico ao anterior.

### ADR-015 · Tracing via Sentry, não OpenTelemetry direto (2026-09)
**Contexto:** OTel puro exige collector/backend (Tempo, Honeycomb) e ~40 pacotes.
**Decisão:** usar o OpenTelemetry embutido no `@sentry/node` 10 (`SENTRY_TRACES=0.1`): spans de Express, pg e fetch aparecem em Sentry → Performance, ligados ao mesmo `reqId` dos erros. Reavaliar OTel direto se houver mais de um serviço para correlacionar.

### ADR-006 · Validação de entrada com zod (2026-09)
**Decisão:** `validar(schema)` por rota; schemas em `shared/schemas.js`. Substitui `validators.js` e o sanitizer global (que será removido quando todas as rotas de escrita tiverem schema).

### ADR-016 · Autorização em degraus fixos, verificada por teste de inventário (2026-09)
**Contexto:** revisão sênior (09/2026) apontou "autorização ad-hoc": cada uma das ~334 rotas decidia sozinha quem pode o quê, e três rotas do domínio crítico (`/:id/acompanhar`, `POST .../protocolo`, `POST /posicao`) tinham guarda incompleta. As rotas foram corrigidas, mas a correção era disciplina, não enforcement — nada impedia a próxima rota de nascer sem guarda.
**Decisão:** toda rota sob `/api/v1` passa por uma pilha fixa, nesta ordem, e cada degrau tem um responsável único:

| Degrau | Middleware | Responde |
|---|---|---|
| 1 · Identidade | `verificarToken` (painel) · `verificarTokenMotoboy` (app) · chave por cliente (`/integracao`) | quem é |
| 2 · Tenant | `resolverTenant` → `req.empresaId`/`req.lojaId` do token, nunca do cliente | de qual empresa/loja |
| 3 · Plano | `exigirModulo` / `exigirFuncionalidade` | a empresa contratou isto |
| 4 · Papel | `exigirPermissao('modulo.acao')` · `exigirCentral` · `exigirSuper` | este usuário pode esta ação |
| 5 · Escopo do recurso | `exigirEntregaDaLoja()` (e equivalentes por agregado) | este recurso é dele — alheio responde **404** |

Rota **pública** (login, refresh, protocolo assinado, health, integração) só existe se estiver na allowlist explícita e comentada de `backend/test/rotas-publicas.allowlist.js`. O teste de inventário (`backend/test/rotas-inventario.test.js`) percorre o router do Express (`scripts/lib/rotas-express.js`) e falha o CI para: rota fora da allowlist sem degrau 1; rota do painel sem degrau 4 **de papel** (`exigirModulo` não conta — é plano, não papel); escrita em `/entregas/:id` sem degrau 5; permissão depois do escopo; entrada morta na allowlist. Rota de **autoatendimento** (o service escopa pelo próprio ator: `/auth/eu`, `/branding/eu`, `/uploads/url`…) declara isso com o marcador `qualquerLogado` — a ausência de `exigirPermissao` passa a ser decisão escrita, não esquecimento. Rotas do app do motoboy (`verificarTokenMotoboy`) têm a identidade como guarda. Para o inventário reconhecer os middlewares, toda fábrica devolve função **nomeada** (`shared/nomear.js`).

**Implementado na Onda 1 (11/09/2026).** O primeiro run do inventário encontrou o que a revisão não tinha visto: gestão de cadastros de motoboy (`/motoboys/cadastros/*`, 16 rotas) aberta a qualquer usuário da empresa — inclusive loja; `GET /lojas/:id/enderecos` deixando a loja A ler endereços da loja B; `/:id/cancelar` e `/:id/valores` sem escopo de loja; `/:id/acompanhar` e `/protocolo-link` sem permissão de papel. Tudo corrigido no mesmo PR (`exigirCentral` + `motoboys.gerenciar`/`motoboys.ver`; novo `exigirLojaPropria`; `entregas.criar` para cancelar; `entregas.ver` para ler). Allowlist: 15 rotas públicas, cada uma com motivo.
**Consequências:** "sem permissão" é sempre 403 e "não é seu" é sempre 404 — a ordem 4 → 5 garante isso. Rota nova sem guarda vira CI vermelho, não item de code review. Custo: toda rota pública precisa de justificativa escrita na allowlist; middlewares de guarda precisam de `.name` estável para o inventário identificá-los.

### ADR-017 · Geocoding e roteirização síncronos no request, por escolha e com gatilho de saída (2026-09)
**Contexto:** `POST /entregas` geocodifica pontos e pede rota/otimização ao ORS dentro do request HTTP. A revisão sênior apontou que isso não escala para milhares de criações simultâneas (pool do Postgres + timeouts). É verdade — e não é o problema de hoje.
**Decisão:** manter síncrono enquanto o volume não justificar a complexidade de um job (fila, estado "geocodificando", polling no painel, idempotência). Mitigações já em vigor: geocoding em ponto único (`integracoes/geocoding.js`) com cache Redis de 7 dias — em última milha o mesmo endereço repete todo dia; `httpRequest` com timeout; `apiuso` contabiliza cada chamada paga.
**Gatilho objetivo de saída (qualquer um):** p95 de `POST /entregas` na tela Saúde acima de **1.500 ms por 7 dias consecutivos**; **ou** mais de **200 criações/min** sustentadas; **ou** timeout do ORS aparecendo em `saude_erros` mais de 1 %/dia. Alerta correspondente no Grafana (`docs/grafana/`). Quando disparar: `entregas.lancamento` grava a entrega com `status='geocodificando'`, emite `entrega.criada`, e o worker resolve coordenadas/rota e emite `entrega.roteirizada`; o painel já escuta eventos por WS.
**Consequências:** decisão passa a ser disparada por dado, não por opinião em revisão. A saída já tem desenho — não precisa ser redesenhada sob pressão. Custo: enquanto síncrono, uma queda do ORS degrada a criação de entrega (hoje cai para "sem rota", não bloqueia).

### ADR-018 · Frontend vanilla, sem build e sem TypeScript; contrato com a API verificado no CI (2026-09)
**Contexto:** a revisão sênior classificou o frontend (SPA vanilla, ~200 caminhos de API como string, sem tipagem) como frágil para evoluir. `AGENTS.md §4` já proibia TS e build, mas como "não toque", sem o motivo — e por isso a proposta volta a cada revisão.
**Decisão:** frontend continua ESM vanilla servido estático pela Vercel: 1 dev, zero toolchain, deploy = copiar arquivos, debug no navegador é o código-fonte. TypeScript e bundler exigiriam pipeline, source maps e um passo a mais entre "salvei" e "está no ar" que hoje não existe. **Mitigação da fragilidade real** (rota renomeada no backend quebra a tela em silêncio): `backend/scripts/checar-contrato-api.js` lê os caminhos que o frontend chama e as rotas que o Express registra, e falha o CI se algum caminho não tiver rota (`npm run contrato`, dentro de `npm run check`). Onda 3 do plano estende a checagem ao método HTTP.
**Gatilho de reavaliação:** segundo dev fixo no frontend, **ou** um módulo de tela passar de 3 arquivos interdependentes com estado compartilhado, **ou** a Vercel deixar de servir estático puro. Até lá, a resposta a "e se virasse TS?" é este ADR.
**Consequências:** o custo de não ter tipos é aceito e nomeado; a classe de erro mais comum (rota que sumiu) é pega no CI, não pelo cliente. Custo: erros de corpo/resposta continuam só em runtime — cobertos por revisão e pelos testes de integração do backend.

### ADR-019 · Uma camada de migrations: a baseline de boot virou a migration mais antiga da série (2026-09)
**Contexto:** revisão sênior (Confiabilidade e banco): "19 versionadas + 21 boot por módulo + `schema-baseline.sql`" — três lugares descrevendo o mesmo schema, e os `initXTables()` rodando a cada boot em produção (DDL em todo deploy, com `IF NOT EXISTS` como única defesa).
**Decisão:** o schema tem um dono só: `backend/migrations/`. A migration `1756000000000_baseline-modulos` chama, na ordem que o `app.js` usava, os 22 `initXTables()` dos módulos — DDL idempotente e testado em produção há meses, que não valia a pena reescrever à mão. Ela roda **uma vez por banco** (registrada em `pgmigrations`, `pgm.noTransaction()` porque os módulos usam o pool). `app.js migrar()` não chama mais módulo nenhum: só `rodarMigracoes()` + partições + verificação de RLS. Bancos pré-existentes (produção, staging) recebem o registro da baseline por `scripts/marcar-baseline-aplicada.js` **antes** do deploy; sem o registro, `checkOrder: true` recusa a série (uma migration mais antiga que as já aplicadas, sem registro) e o `npm run migrate` do pre-deploy falha com o processo antigo ainda no ar — falha segura, verificada em teste local (5 cenários: banco vazio · repetição · produção sem marca · marca + migrate · marca idempotente). `docs/schema-baseline.sql` vai para `docs/historico/` (era um dump, nunca foi executado por nada).
**Consequências:** um lugar para ler o schema, uma ordem, um registro. O boot deixa de fazer DDL. O corpo da baseline (os antigos `*.migration.js`) mora em `backend/migrations/baseline/<modulo>.js` — node-pg-migrate ignora a subpasta; os módulos não têm mais arquivo de migration nem exportam `initXTables` (item 4.5, 12/09). Custo: rollout exige o passo manual de marcação em cada banco existente (documentado em `backend/DEPLOY.md §11`); a baseline não tem `down` — recomeçar é recriar o banco.

### ADR-020 · Nomenclatura de tabelas e colunas em pt-BR, com empréstimos nomeados (2026-09)
**Contexto:** revisão sênior (segunda rodada): tabelas ora em inglês, ora em português. Auditoria de 12/09: colunas eram 100 % pt-BR (`criado_em`, `ativo`, `senha_hash`); 3 das 74 tabelas estavam em inglês (`refresh_tokens`, `geocode_cache`, `motoboy_push_tokens`) e o prefixo variava entre plural (`entregas_*`) e singular (`motoboy_*`, `cliente_*`, `empresa_*`).
**Decisão:** tabela = `<dono no singular>_<coisas no plural>` em pt-BR (`motoboy_documentos`, `cliente_centros_custo`); coluna em pt-BR; `criado_em`/`atualizado_em`, `ativo`, `*_id`. **Empréstimos aceitos** por serem o termo do domínio ou do próprio ADR-003, e não traduzíveis sem perder o significado: `refresh`, `token`, `push`, `chat`, `score`, `radar`, `branding`, `hub`, `SLA`, `status`, `slug`. A migration 1758400000000 renomeia as 3 tabelas (`sessoes_refresh`, `geocodificacao_cache` com `hit_count → acessos`, `motoboy_tokens_push`) e recria a função plpgsql `lx_revogar_sessoes_usuario()`, que tinha o nome antigo escrito no corpo — RENAME é metadado no Postgres (índices, FKs, triggers e policies de RLS acompanham pelo OID), mas texto dentro de função **não** acompanha. **Exceções registradas:** `sla_config`, `score_*` e o prefixo plural `entregas_*` (165 referências em `entregas_pontos`/`ofertas`/`logs`) ficam como estão — custo de regressão sem ganho funcional. A baseline (`migrations/baseline/`) continua congelada (ADR-019): quem lê o schema histórico vê o nome antigo na baseline e o rename na 1758400000000.
**Consequências:** regra objetiva para tabela nova (checada em revisão, não por lint). Rename com dado e tráfego reais entra em **duas** migrations — a primeira cria uma VIEW updatable com o nome antigo para a réplica que ainda está no ar durante o rollout, a segunda (deploy seguinte) apaga a view. Em 12/09 não havia cliente real no banco, então o rename foi direto.

### ADR-021 · Provedor de banco é adaptador em código; a credencial é dado do cliente; a liberação é do master (2026-09)
**Contexto:** clientes passam a pagar entregadores pela API do próprio banco (Sicoob primeiro). Três coisas diferentes se misturavam numa só: qual banco o sistema sabe conversar (código), quais credenciais são daquela empresa (dado) e quem pode ligar o banco para um cliente (decisão comercial).
**Decisão:** cada banco é um arquivo em `pagamentos.bancos.js` implementando a mesma interface (`autenticar`, `iniciarPix`, `confirmarPix`, `consultarPix`, `saldo`, `extrato`, `configurarWebhook`); banco novo é arquivo novo, sem tocar em lote, item, token ou tela. As credenciais vivem em `pagamento_contas`, uma linha por empresa, cifradas com `shared/cripto` (AES-256-GCM) — entram e nunca saem: a tela recebe máscara, o valor em claro só é decifrado dentro do adaptador. O **provedor** não é escolha da central: é liberado pelo master (`PUT /pagamentos/provedor`, `verificarAdmin`), porque habilitar um banco depende de contrato, certificado A1 e homologação feitos pela Logix. `PUT /pagamentos/conta` **ignora** qualquer provedor vindo no corpo — senão bastaria mandar outro campo pela API para apontar para outro banco. Existe também o adaptador `simulado`, que não é dublê de teste: é o ambiente de homologação do cliente, onde o fluxo inteiro roda antes de existir credencial.
**Consequências:** trocar ou acrescentar banco é trabalho isolado; a central nunca vê segredo, nem o próprio; conta sem provedor liberado fica inerte (não cria lote, não envia). Custo: a liberação vira passo de onboarding, e cliente que contratar o módulo sem liberação encontra a tela avisando para falar com o suporte — comportamento desejado, mas precisa estar no roteiro comercial. Testes: `pagamentos.integracao` cobre segredo que não vaza, central sem liberação (422), central que tenta liberar para si (403) e liberação pelo master.

### ADR-022 · Pagamento em duas etapas, com o endToEndId como âncora de idempotência (2026-09)
**Contexto:** a API Pix Pagamentos do Sicoob (v2) **não tem campo de idempotência**. O pagamento é `POST /pagamentos` (resolve a chave no DICT e devolve o `endToEndId`, sem mover dinheiro) seguido de `POST /pagamentos/confirmacao` (efetiva). Uma queda entre as duas, ou um reenvio ingênuo, pagaria duas vezes.
**Decisão:** três camadas, e nenhuma depende de o código "lembrar" de ser cuidadoso. (1) `pagamento_itens.idempotencia` é `UNIQUE` no Postgres: nem um bug cria dois itens para o mesmo par lote+entregador+valor. (2) O `endToEndId` é **gravado entre** iniciar e confirmar; item que já tem e2e nunca é reiniciado — `enviarItem` consulta o estado real. (3) O reenvio de erros passa pelo mesmo caminho, então "reenviar" de um item já pago é uma consulta, não um pagamento. O laço respeita o rate limit publicado (1 req/s), via `intervaloMs` do adaptador. O webhook do banco chega **sem assinatura** (`{id, estado, valor}`), então o corpo não é fonte de verdade: usamos só o `id` para saber o que olhar e consultamos pela API autenticada — um POST forjado não confirma nada.
**Consequências:** o pior caso real (processo morto no meio) é recuperável sem intervenção humana. Pagamento confirmado fecha o `financeiro_fechamentos` correspondente, senão o mesmo saldo entraria no lote seguinte. Custo: cada item consome duas chamadas ao banco, e com o freio de 1 req/s um lote de 40 entregadores leva cerca de 90 segundos — aceitável para repasse, inviável para pagamento síncrono na tela. Teste: `item já iniciado não é reenviado` prova que `consultarPix` é chamado e `iniciarPix` não.

### ADR-023 · Aprovação de lote por código fora da sessão, amarrado ao valor (2026-09)
**Contexto:** quem monta o lote está logado no painel. Se a aprovação também fosse um clique na mesma sessão, uma sessão sequestrada pagaria qualquer valor para qualquer chave.
**Decisão:** o lote congela em `aguardando_aprovacao` e a liberação exige um código de 6 dígitos enviado por **e-mail ao responsável cadastrado na conta** — outro canal, outra pessoa. Guardamos só o hash (`sha256` de `lote:codigo`), com validade de 10 minutos e 5 tentativas. O token carrega o **total congelado**: se o lote mudar depois de gerado, o código é destruído e é preciso pedir outro. Acima disso, os tetos por item, por lote e por dia são do sistema e valem **mesmo com código correto** — limite não se negocia com humano apressado. A permissão `financeiro.pagar` é separada de lançar, fechar e sacar.
**Consequências:** pagar exige acesso ao painel **e** ao e-mail do responsável. Dependência nova: sem o domínio de e-mail da empresa verificado (ADR-024), a aprovação não funciona e o lote fica parado — falha segura, mas precisa estar claro no onboarding. Testes: código errado não envia e consome tentativa; código certo aprova, envia e registra quem aprovou.

### ADR-024 · E-mail transacional com remetente do cliente: uma conta de provedor, um domínio verificado por empresa (2026-09)
**Contexto:** o produto é white-label e nada pode sair com identidade da Logix — nem recuperação de senha, nem código de pagamento. Ao mesmo tempo, pedir que cada cliente mantenha a própria conta de provedor seria transferir um problema operacional para quem não quer tê-lo.
**Decisão:** uma conta única da plataforma (`RESEND_API_KEY`, variável de ambiente) com **vários domínios verificados dentro** — um por empresa, em `email_dominios`. Não há credencial de cliente guardada. O master cria o domínio pelo provedor, a tela mostra os registros DNS para o cliente publicar, e a verificação chega por webhook (`domain.updated`), este sim assinado (HMAC do corpo bruto, padrão svix, com janela de 5 min contra reenvio). O envio exige domínio **verificado** e remetente pertencente a ele — conferido ao salvar, não na hora de enviar. O corpo do e-mail é montado com logo, cor e nome de `empresa_branding`.
**Consequências:** cliente novo não envia e-mail nenhum até publicar o DNS — inclusive recuperação de senha. Foi decisão consciente: a alternativa (domínio neutro de fallback) foi recusada por ferir a regra de não mencionar a plataforma. O ônus é de onboarding, não de arquitetura. Testes: `email.integracao` cobre central sem acesso (403), remetente fora do domínio (422), envio travado sem verificação e webhook sem assinatura.

### ADR-025 · RLS é responsabilidade da migration que cria a tabela (2026-09)
**Contexto:** a migration 1757000004000 ligou row-level security varrendo as tabelas que existiam **naquele momento**. Tabelas criadas depois nunca foram cobertas — auditoria de 15/09 encontrou `planos`, `plano_itens`, `faturas`, `saude_erros` e as partições de auditoria com `empresa_id` e sem policy. A primeira trava (`resolverTenant`) segurava, mas a segunda, que existe justamente para o caso de a primeira falhar, não existia ali.
**Decisão:** toda migration que cria tabela com `empresa_id` liga `ENABLE`/`FORCE ROW LEVEL SECURITY` e cria a policy `tenant_isolamento` na mesma migration — como fazem `1758700000000_email-dominios` e `1758800000000_pagamentos`. A migration 1759000000000 corrige as órfãs. O teste `rls-cobertura.integracao` falha o CI se aparecer tabela com `empresa_id` sem RLS, com uma lista de exceções escrita e justificada.
**Consequências:** a regra deixa de depender de alguém lembrar. Custo: a lista de exceções precisa de manutenção consciente — entrar nela é decisão registrada, não atalho.

### ADR-026 · Credencial de banco é declarada pelo adaptador, não modelada em coluna (2026-09)
**Contexto:** a primeira versão do módulo de pagamentos modelou `pagamento_contas` no formato do Sicoob — `client_id`, `client_secret`, `certificado` (.pfx) e senha — e a tela tinha esses campos escritos à mão. Com um banco só, funciona. O Stark Bank autentica com chave privada ECDSA e id de projeto: não tem .pfx nem client secret. Manter colunas fixas significaria uma coluna nova por banco integrado e uma tela mostrando campos que não servem para o banco escolhido.
**Decisão:** o adaptador declara `campos: [{ codigo, rotulo, tipo, obrigatorio, segredo, ajuda }]` e `capacidades: { pix_chave, pix_qrcode, saldo, extrato }`. O valor vive em `pagamento_contas.credenciais` (JSONB), com cada campo secreto cifrado individualmente (`shared/cripto`) — a granularidade é do campo, não do blob, para que trocar só o secret não reescreva o certificado. A tela **monta o formulário a partir da declaração** e o service **valida a partir dela**: campo fora da lista do adaptador é ignorado, porque o formulário não decide o que o banco aceita. As capacidades escondem o que aquele banco não faz, em vez de oferecer um botão que sempre erra. Campo obrigatório só é cobrado quando a conta vai ficar **ativa** — dá para salvar em partes durante a homologação. A migration 1759200000000 move o que existir das colunas antigas para o JSONB **sem decifrar** (a migration não tem a chave, e não deve ter) e derruba as colunas.
**Consequências:** banco novo = um arquivo em `pagamentos.bancos.js`; nada muda em tabela, rota, tela, lote ou token. A auditoria passa a registrar *quais campos* foram tocados, nunca o valor. Custo: o Zod da rota não valida mais campo a campo (só garante objeto raso de strings com teto de tamanho) — a validação de verdade passou para a declaração do adaptador, que é onde ela pode ser específica. Feito enquanto não havia credencial real gravada; depois seria migração de dado sensível.

### ADR-027 · Pagamento avulso nunca excede o saldo, e todo pagamento abate o saldo (2026-09)
**Contexto:** o repasse por lote sai do fechamento, e fechar já tira as corridas do saldo aberto. O pagamento avulso — adiantamento, acerto, entregador sem chave cadastrada — sairia por fora: o dinheiro deixaria a conta da central e o saldo no app do entregador continuaria inteiro. Ele receberia o mesmo valor duas vezes.
**Decisão:** (1) O **entregador é obrigatório** no avulso. A chave Pix ou o copia-e-cola são o destino do dinheiro, não a identidade de quem recebe — sem entregador não há saldo para conferir nem para abater. (2) O valor **nunca pode passar do saldo em aberto**, que é corridas entregues não fechadas + créditos − abatimentos: o mesmo cálculo do fechamento, sem recorte de período. A checagem vem antes dos tetos da conta, porque teto é política da central e saldo é dinheiro que existe; e roda de novo dentro da transação, com `SELECT ... FOR UPDATE` no entregador, para que dois avulsos simultâneos de R$ 100 não passem os dois sobre um saldo de R$ 150. (3) Avulso **confirmado grava um `abatimento`** em `financeiro_lancamentos`, com `origem_id` apontando para o item de pagamento. É isso que tira o valor do saldo do app na mesma hora e faz o próximo fechamento nascer descontado. Pix que falha não gera abatimento; Pix devolvido estorna o que gerou.
**Consequências:** adiantamento sobre corrida futura deixa de existir por decisão de negócio — quem quiser adiantar precisa lançar um crédito antes, o que fica registrado e auditado. A tela mostra o saldo de cada entregador já na busca, antes de digitar o valor. Custo: mais uma transação e um lock por pagamento avulso; irrelevante no volume de um avulso, que é operação pontual. Testes: `pagamento-avulso.integracao` cobre recusa acima do saldo, débito imediato, o saldo já debitado limitando o avulso seguinte, saldo zerado e Pix falho sem abatimento.

### ADR-028 · Credencial de banco tem cofre próprio, separado do segredo do JWT (2026-09)
**Contexto:** `shared/cripto` nasceu para a credencial da seguradora e usa `SEGURO_CRYPTO_KEY` com queda para `JWT_ACCESS_SECRET`. Quando o módulo de pagamentos reusou esse utilitário, passou a proteger com a mesma chave o client secret, o certificado A1 e a senha do certificado dos bancos. Consequência: **rotacionar o segredo do JWT — operação de segurança normal, e obrigatória depois de um vazamento — tornaria as credenciais bancárias ilegíveis**, sem erro visível; os pagamentos apenas parariam de autenticar. Auditoria de 15/09/2026.
**Decisão:** `cripto` passa a ter **cofres nomeados**, cada um com chave mestra e sal próprios. O cofre `seguro` mantém o encadeamento histórico, para não invalidar o que já está cifrado. O cofre `pagamentos` exige `PAGAMENTOS_CRYPTO_KEY` e **não cai** no JWT: sem ela o módulo recusa gravar credencial, com mensagem explícita — guardar segredo que não poderá ser lido é pior que recusar o salvamento. A tela recebe `cofre_pronto` e avisa antes de o operador digitar. `scripts/reencriptar-pagamentos.js` (`npm run reencriptar:pagamentos`) move o que existir de um cofre para o outro, é idempotente e tem modo simulação.
**Consequências:** rotação de JWT e rotação de credencial bancária deixam de estar acopladas — que era o ponto. Cada cofre pode ser rotacionado no seu próprio ritmo. Custo: mais uma variável obrigatória no ambiente, e o deploy falha cedo se faltar — de propósito. Teste: `regras-puras` prova que o que é cifrado num cofre não é lido pelo outro.

### ADR-029 · Antecipação: o saldo é o teto, e o valor pago não é o valor abatido (2026-09)
**Contexto:** o profissional pede pelo app parte do saldo que já ganhou. Duas coisas não cabiam no que existia. A primeira: é dinheiro saindo por iniciativa de quem recebe, não da central — a superfície de ataque é outra. A segunda: com taxa, **paga-se o líquido e abate-se o cheio** (pede R$ 200, taxa R$ 4, recebe R$ 196, o saldo cai R$ 200), e até aqui pagamento e abatimento eram sempre o mesmo número.
**Decisão:** (1) `pagamento_itens.abatimento_cent` separa o que saiu da conta do que sai do saldo; NULL = iguais, que é o caso do lote e do avulso comum. A trava de saldo passa a valer sobre o **abatimento**, não sobre o valor pago. (2) A antecipação não tem caminho próprio para o dinheiro: ela usa o pagamento avulso, que já tem idempotência, abatimento, estorno e auditoria (ADR-027). (3) Defesa em profundidade contra duplicidade: índice único de um pedido **aberto** por profissional, `SELECT … FOR UPDATE` no profissional durante a criação, e uma **janela de 60 segundos** que recusa pedido idêntico repetido — o índice sozinho não cobre o modo automático, onde o primeiro vira `paga` em segundos e libera a vaga. (4) No app, o `motoboyId` vem do **token**, nunca do corpo. (5) As regras são reavaliadas **antes de pagar**, ignorando o próprio pedido na contagem diária — sem isso ele reprovaria a si mesmo.
**Consequências:** o app pode bloquear o que quiser para não frustrar, sem que isso seja segurança: quem decide é o servidor, duas vezes. Falha no pagamento automático devolve o pedido à fila com o motivo, em vez de perdê-lo. Custo: mais uma coluna e mais uma transação por antecipação; irrelevante no volume de saques. Testes: `antecipacoes.integracao` cobre pedir acima do saldo, abaixo do mínimo, dois pedidos abertos, toque duplo com chamadas simultâneas, abatimento do valor cheio, recusa com motivo, gratuidade mensal e tentativa de pedir em nome de outro.

### ADR-030 · Gratuidade é um vale concedido, não um contador (2026-09)
**Contexto:** a primeira versão modelou gratuidade como "N antecipações sem taxa por mês", contadas na hora do pedido. A operação usa outra coisa: a central **concede** — escolhe o profissional, quantos vales, o valor de cada um e o motivo (campanha, reconhecimento, acerto de um problema). Contador não guarda motivo, não tem dono, não se cancela e não aparece na auditoria.
**Decisão:** gratuidade vira registro em `antecipacao_gratuidades`: um vale por linha, com valor máximo, motivo, validade opcional e estado (`disponivel` → `usada` | `cancelada`). O vale isenta a taxa de **uma** antecipação até o teto e é consumido **inteiro no uso**, mesmo que o profissional saque menos — vale de R$ 300 com saldo de R$ 100 paga os R$ 100 sem taxa e se encerra; os R$ 200 não ficam guardados. Momentos importam: o vale é **reservado** no pedido (a antecipação guarda `gratuidade_id`), **consumido** só quando o pagamento confirma — pagamento que não saiu não gasta cortesia — e **devolvido** se a central recusar o pedido. A regra "N por mês para todos" não sumiu: virou geradora de vales sob demanda, para existir um único caminho de consumo e um único histórico.
**Consequências:** toda gratuidade tem dono, motivo e rastro na auditoria, e pode ser cancelada antes do uso. A tela de concessão fica na mesma área das solicitações, porque é a mesma conversa. Custo: uma tabela e uma consulta a mais por simulação; o índice parcial sobre `status = 'disponivel'` mantém isso barato. Testes: isenção com vale, vale abaixo do teto do pedido (cobra taxa normal), consumo integral sacando menos, e devolução na recusa.

### ADR-031 · Pix copia e cola e QR gerados no servidor, sem depender de banco (2026-09)
**Contexto:** quando não há API do banco — ou quando ela está fora do ar — a central paga na mão. Digitar chave e valor no app do banco é onde o dinheiro se perde: chave errada não volta.
**Decisão:** o "copia e cola" (BR Code, padrão EMV®QRCPS-MPM do Bacen) é montado **localmente**, a partir da chave e do valor que já estão no pedido. Não fala com banco nenhum, de propósito: precisa funcionar justamente no cenário em que a integração não funciona. O CRC16/CCITT-FALSE é o ponto frágil — errado, todo código é recusado sem explicação —, então está travado por teste com o vetor conhecido do padrão (`123456789` → `29B1`). A **imagem** do QR é desenhada no servidor (biblioteca `qrcode`, SVG), não no navegador: o painel não tem build, e assim nada externo é carregado na tela do operador. Falha ao desenhar não bloqueia nada — o copia e cola é o que o banco realmente lê. Pagamento feito por fora tem **rota própria** (`/antecipacoes/:id/pagar-manual`), separada do caminho da API: ela não chama banco, e a auditoria precisa distinguir o que a API pagou do que alguém declarou ter pago.
**Consequências:** o fluxo manual deixa de depender de digitação. Custo: uma dependência nova no backend (`qrcode`, sem dependências transitivas relevantes) e a necessidade de alguém **marcar como pago** — o sistema não tem como saber que o Pix saiu do celular do operador, e é esse clique que abate o saldo, com reavaliação do saldo antes.

### ADR-032 · Idempotência da API do ERP ancorada no dado, não no log (2026-09)
**Contexto:** o `gravar` da API pública decidia "este pedido já existe?" lendo `integracoes_requisicoes` — tabela escrita **sem await**, depois de a resposta já ter sido enviada. Um retry rápido do ERP não encontrava o registro e criava uma **segunda corrida** com o mesmo número de pedido. Ou seja: a proteção falhava exatamente no caso para o qual existe. Duplicata aqui é motoboy alocado duas vezes e cliente cobrado duas vezes. Detectado pelo CI em 16/09/2026, quando a segunda chamada devolveu protocolo diferente.
**Decisão:** a verificação passa a consultar a própria tabela `entregas` por (`integracao_chave_id`, `referencia_externa`) — dado commitado junto com a criação, não um efeito colateral assíncrono. Acima dela, um **índice único parcial** (`uq_entrega_pedido_integracao`) fecha a janela de corrida que consulta nenhuma resolve: duas chamadas simultâneas, a segunda é recusada pelo banco e a aplicação trata o `23505` devolvendo a corrida que venceu — para o ERP, as duas respostas são idênticas e corretas. A migration renomeia a referência de duplicatas históricas antes de criar o índice, em vez de apagar corridas que podem ter acontecido de verdade.
**Consequências:** idempotência deixa de depender de tempo. O log de requisições volta a ser só log — é o papel dele. Custo: um índice a mais em `entregas`; irrelevante perto do que evita. Teste: duas chamadas **simultâneas** com o mesmo número de pedido, conferindo que só existe uma corrida — o teste anterior era sequencial e por isso passava por sorte.

### ADR-033 · Antecipação tem estado "processando", e o desfecho do Pix volta por evento (2026-10)
**Contexto:** o pedido de antecipação só conhecia `aguardando → paga | recusada`. Quando a conta exigia código de aprovação (ou o banco respondia "em processamento"), o pedido continuava `aguardando`: um segundo clique em Pagar criava **outro lote**, e aprovar os dois pagava o profissional em dobro. E quando o lote era aprovado depois, nada avisava a antecipação — ela ficava em análise para sempre, com o dinheiro já na conta dele e o vale de gratuidade nunca consumido. Achado e provado por teste em 10/10/2026 (`antecipacoes-pagamento.integracao`: o segundo Pagar respondia 200). Junto, um furo vizinho: o abatimento gerado por um pagamento podia ser apagado pela tela de Lançamentos, devolvendo ao saldo um dinheiro que já tinha saído.
**Decisão:** (1) Estado novo `processando`, e a transição `aguardando → processando` acontece num `UPDATE … WHERE status = 'aguardando'` **antes** de chamar o banco — o segundo clique, a segunda aba ou o automático concorrente não encontram mais o pedido livre. O índice de "um pedido aberto por profissional" passa a cobrir `aguardando` e `processando`. (2) O módulo de pagamentos emite `pagamento.item_resolvido` (confirmado | erro | devolvido) no desfecho compartilhado e `pagamento.lote_cancelado` no cancelamento; a antecipação **ouve** e sincroniza o pedido pelo item (`confirmado → paga` + consome o vale; `erro`/lote cancelado → volta para a fila com o motivo; `devolvido → devolvida` + devolve o vale, o abatimento já foi estornado pelo pagamentos, ADR-027). Pagamentos continua sem conhecer quem pediu o Pix (regra 5). (3) Evento é in-process e se perde num restart: uma **varredura** a cada 3 min confere quem está `processando` há mais de 5 min contra o item no banco — e, se o processo caiu antes de guardar o id do item, acha o item pelo profissional, pelos dois valores e pela hora, em vez de pagar de novo. (4) Lançamento com dono (`financeiro_lancamentos.origem_tipo` = `pagamento` | `antecipacao` | `estorno_antecipacao`) não se exclui pela tela de lançamentos. O pago **por fora** se desfaz com **Estornar**, que lança um crédito (não apaga o abatimento); o pago pela API não se estorna na tela — volta só por devolução do Pix. (5) "Pagar selecionados" vira **um** lote avulso com N itens e **um** código de aprovação pelo total; quem não passa na reavaliação fica de fora com o motivo e não trava os outros. (6) O profissional pode desistir enquanto o pedido está `aguardando`; em `processando`, não.
**Consequências:** pagar em dobro deixa de depender de alguém não clicar duas vezes. A tela do ADM ganha o meio do caminho ("pagando · aguarda código") e a história completa do pedido (linha do tempo com eventos do Pix e o abatimento lançado, com o fechamento em que caiu). Custo: dois eventos no catálogo, um job de 3 min e o `antecipacoes.service` dividido em cinco arquivos por responsabilidade (regra 29 — a divisão e a mudança de regra foram no mesmo pacote, por exceção: a rede de 17 testes já existia e foi mantida verde, e 15 novos travam o comportamento novo). Testes: `antecipacoes-pagamento.integracao` (código, clique duplo, aprovação, lote cancelado, falha, devolução, varredura) e `antecipacoes-gestao.integracao` (pagar vários com um código, pago por fora travado, estorno, desistência, detalhe, fila e exportação).

### ADR-034 · Antecipação abate o saldo no pedido, e devolve com crédito se não pagar (2026-10)
**Contexto:** até aqui o abatimento só nascia quando o Pix confirmava (ADR-029/033). Entre o pedido e o pagamento, o app mostrava o saldo cheio: o profissional achava que o dinheiro ainda estava lá, e o painel mostrava "ao pagar" numa coluna que ele lê como "já saiu?". Pedido explícito do Tutts em 10/10/2026: o valor sai **no ato da solicitação**; se o pedido for recusado (pela central ou pelo banco), volta — e tudo com registro.
**Decisão:** (1) O pedido lança, **na mesma transação** em que é criado, um `abatimento` do valor cheio com dono (`origem_tipo = 'antecipacao'`), guardado em `antecipacoes.lancamento_id`, e marca `abatido_no_pedido = TRUE`. (2) Tudo que encerra o pedido sem pagamento lança um **crédito** do mesmo valor (`origem_tipo = 'estorno_antecipacao'`, em `estorno_lancamento_id`), também na transação da mudança de estado: recusa, desistência do profissional, Pix devolvido e estorno do pago por fora. Nada é apagado — o extrato mostra as duas pernas, e funciona mesmo se o abatimento já caiu num fechamento (o crédito entra no próximo). A devolução é idempotente (não devolve duas vezes). (3) Pagar não abate de novo: a antecipação chama o avulso com `jaAbatido`, o item grava `abatimento_cent = 0` e o desfecho compartilhado não lança abatimento para ele. Na reavaliação antes de pagar, o valor reservado pelo próprio pedido é somado de volta ao saldo (senão ele reprovaria a si mesmo); o que saiu por outros motivos não volta. (4) Falha do banco ao **enviar** o Pix não devolve sozinha: o pedido continua aberto, na fila, com o motivo e o valor reservado — a central tenta de novo (o caso comum é chave corrigida) ou recusa, e o profissional pode desistir pelo app; em ambos o valor volta na hora. Pix **devolvido** depois de pago devolve sozinho. (5) Cada movimento de saldo grava auditoria (`antecipacao_solicitada`, `antecipacao_saldo_devolvido`, com o id do lançamento) e log. (6) O pedido grava `taxa_regra`, a conta da taxa por extenso (`detalharTaxa`, mesma função do cálculo), porque a central pode mudar a regra depois. (7) Pedido anterior a esta regra (`abatido_no_pedido = FALSE`) segue o caminho antigo até se resolver.
**Consequências:** o saldo que o app mostra é o saldo de verdade desde o pedido, e "um pedido aberto por profissional" deixa de ser a única coisa que impede pedir o mesmo dinheiro duas vezes. O aviso de pago e o de recusa dizem quanto saiu e quanto voltou. Custo: duas colunas, um lançamento a mais por pedido recusado/desistido, e o pagamentos ganha o caso `abatimento_cent = 0`. Muda o ADR-029 só no **momento** do abatimento — o valor continua sendo o cheio, e pagamento e abatimento continuam sendo números diferentes. Testes: `antecipacoes-saldo.integracao` (abate no pedido com abatimento travado e auditoria, recusa e desistência devolvem uma vez, Pix devolvido devolve, pagar por fora/vários não abatem de novo, sem saldo e sem chave Pix, conta da taxa por extenso, pedido antigo) e `regras-antecipacao` (`detalharTaxa` sempre igual a `calcularTaxa`).

### ADR-035 · E-mail com a marca da central: logo pública no banco, links só no domínio cadastrado (2026-10)
**Contexto:** o código de aprovação de pagamento já saía pelo Resend com o domínio de cada central, mas (1) a logo do e-mail era a chave do storage da Identidade visual — no e-mail ela virava link assinado que **expira em 7 dias** (ou nem abria); (2) recuperar senha (painel e app) e excluir conta (exigência da Play Store, pedido pela web) não existiam. Regra do Tutts: nada no e-mail cita a plataforma, e cada e-mail chega com a identidade da central (mockup aprovado em 10/10/2026).
**Decisão:** (1) **Logo dos e-mails** própria, gravada pelo master em White-label › E-mail, guardada no banco (`email_dominios.logo`, ≤ 300 KB, PNG/JPG/WEBP — sem SVG) e servida por `GET /email/logo/:id.png`, rota **pública por desenho** (só a imagem; cache longo; `?v=` muda quando a logo muda). A URL vai pelo **domínio do painel da central** (rewrite `/email/logo/*` da Vercel), para nem o endereço da imagem citar a plataforma. O bucket continua privado. (2) **Links dos e-mails usam só o domínio cadastrado** da central (domínio próprio, subdomínio ou `PAINEL_URL_PADRAO`) — nunca Host/Origin da requisição, que permitiria a quem pede "esqueci a senha" escolher para onde vai o token. (3) **Senha do painel:** link com token de 256 bits, só o hash no banco (`usuario_redefinicoes`), 30 min, uso único, pedir de novo invalida o anterior, 3 por hora por conta; trocar a senha derruba as sessões (trigger + revogação do refresh) e destrava o bloqueio de login. **Senha do app:** código de 6 dígitos (`motoboy_redefinicoes`), 15 min, 5 erros matam o código. As duas respostas de "esqueci" são **sempre iguais** e o envio roda fora da requisição (sem enumeração por conteúdo nem por tempo). (4) **Exclusão de conta do entregador** (`motoboy_exclusoes`): pedido pelo app ou pela página `/conta/excluir` do domínio da central (HTML sem script, formulários POST) → e-mail com link (48 h) → confirmou: acesso encerrado **na hora** (inativo + token_versao); um job diário apaga os dados pessoais depois de **15 dias e só sem nada a receber** (saldo aberto e fechamento não pago, via `financeiro.pendenciasDoProfissional`) — apagar o Pix antes impediria pagar o que ele tem a receber. A linha do motoboy é **anonimizada**, não removida (corridas e repasses apontam para ela); documentos saem do storage; o e-mail guardado no pedido só existe até o aviso de conclusão. (5) Limite por IP **+ e-mail** nas rotas de recuperação (o painel chega pela borda da Vercel: muitos usuários atrás de um IP); a página de exclusão tem teto próprio mais alto, porque quem chama a API é o servidor da Vercel.
**Consequências:** o mesmo canal serve a qualquer e-mail novo (basta um modelo em `email.modelos.js`). Uma central sem domínio verificado ou sem domínio do painel **não envia** link nenhum (fica no log), e a tela do master avisa. Usuário sem empresa (master da plataforma) não recupera senha por aqui. Custo: três tabelas pequenas com RLS, um job diário e duas rotas públicas novas na allowlist. Testes: `email-modelos` (seis modelos, marca do cliente, nada da plataforma, escape) e `emails-conta.integracao` (logo pública e só do master; link de senha de uso único que derruba sessões; central sem e-mail não envia; código do app que morre em 5 erros; exclusão que encerra o acesso na hora e só apaga sem saldo; página pública que não enumera e não cruza centrais).

### ADR-036 · Aprovador de pagamento é pessoa com senha própria; afrouxar a trava pede essa senha (2026-10)
**Contexto:** o código de aprovação ia para `pagamento_contas.responsavel_email`, um campo comum da conta bancária. Quem tinha acesso ao painel (permissão de pagar) trocava esse e-mail pelo próprio, recebia o código e aprovava sozinho; do mesmo jeito subia o teto ou passava a aprovação para "só acima do teto" e pagava sem código. Pedido do Tutts em 11/10/2026: mais de um aprovador, sem que alguém consiga criar aprovador à vontade para agir de má-fé. Mockup aprovado no mesmo dia (tela nova Financeiro › Configurações de pagamento).
**Decisão:** (1) **Aprovador é pessoa** (`pagamento_aprovadores`): o painel informa só nome e e-mail; vai um link (256 bits, hash, 48 h, uso único) para esse e-mail, e é a **própria pessoa**, na página `/aprovador` do domínio da central (HTML sem script, como `/conta/excluir`), que cria a **senha de aprovação** (bcrypt; ≥ 10 caracteres, não óbvia, diferente da senha de login dela no painel). Ninguém do painel vê nem define essa senha; não há "recuperar" pelo painel — "esqueci" manda um link (2 h) **só para o e-mail do próprio aprovador**, e a senha antiga vale até ele criar a nova. (2) **Aprovar um lote** exige o código do e-mail **e** a senha de quem recebeu o código (`pagamento_tokens.aprovador_id`). Com vários aprovadores, quem está na tela escolhe para quem mandar; código certo com senha errada não queima o código. O e-mail do código traz para quem vai o dinheiro (nome, valor, começo e fim da chave) e um botão **"Revisar e aprovar"** (`/aprovador?a=`, `pagamento_tokens.link_hash`): o aprovador confere o lote e digita só a senha **no aparelho dele**, sem digitar a senha na tela de outra pessoa; a janela do painel percebe sozinha. Código e link são o mesmo token: o primeiro uso encerra o outro. O log de envios de e-mail grava o assunto **sem o código**. (3) **Até 5 aprovadores.** Incluir, remover ou cancelar convite pede a senha de **um aprovador ativo** (autorização com código `AUTORIZACAO_APROVADOR`, que a tela trata pedindo a senha e repetindo); o último ativo não sai. A única janela sem trava é a **primeira configuração** (a central nunca teve aprovador com senha) — avisada à equipe toda. Central que já teve aprovador e ficou sem nenhum ativo (ex.: logo depois de uma troca) não volta a essa janela: qualquer mudança vai pela troca de 72 h (`SEM_APROVADOR_ATIVO`). Inclusão e remoção rodam numa transação com trava da empresa (advisory lock): pedidos simultâneos não passam do limite de 5 nem deixam a central sem aprovador ativo. (4) **Afrouxar a trava da conta** pede a mesma senha: trocar credencial (só a que mudou de fato) ou ambiente, subir qualquer teto, passar para "dispensar até o teto", ativar a conta. Apertar (baixar teto, exigir sempre o código, desativar) é livre — desativar é o botão de pânico de quem aprova. A conta só ativa com aprovador ativo. A opção "dispensar até o teto" **fica** (protegida), porque é ela que permite a antecipação automática. (5) **Sem a senha de ninguém** (aprovador saiu, perdeu tudo): pedido com a **senha de login** de quem pede, que só vale depois de **72 h**, com **todos os pagamentos pausados** (avulso, vários, lote, código, aprovação e reenvio de itens com erro recusam com 409); aprovadores recebem um link "não reconheço" que cancela, a equipe recebe aviso e cancela pelo painel; um pedido aberto por vez (`pagamento_aprovador_pedidos`). Vencido, um job de 10 min (e a própria tela) aplica: sai quem foi indicado, entra o novo como convidado. (6) A conferência da senha é **serializada por aprovador** (`SELECT … FOR UPDATE`) e a do código **reserva a tentativa** antes de comparar (incremento atômico com teto): rajadas em paralelo não furam os limites. A cada **5 senhas erradas** seguidas o aprovador fica bloqueado 30 min; com **15** sem um acerto, 24 h; o contador só zera num acerto, e a pessoa é avisada a cada bloqueio. As rotas públicas de `/aprovador` têm limite **por link** (o IP visto é o da Vercel, um para todos). (7) Toda mudança avisa por e-mail aprovadores e quem pode pagar (`aprovador_aviso`), e entra em `pagamento_eventos` (aba Histórico) e na auditoria — sem senha nem link.
**Consequências:** fraudar a aprovação passa a exigir a senha de outra pessoa, ou três dias de pedido exposto na caixa de entrada de quem pode impedi-lo. Custo: um passo a mais em cada aprovação (a senha), duas tabelas com RLS, seis rotas públicas na allowlist (`/pagamentos/aprovador/*`, token de uso único) e um job. Revisão de segurança independente antes da entrega; o que ela achou está corrigido aqui. Junto, porque estava na mesma função: o reenvio de itens com erro passa a conferir que o lote é da empresa (404) e já foi aprovado, e filtra os itens por empresa. `responsavel_nome/responsavel_email` deixam de ser usados (as colunas ficam). Conta já ativa sem aprovador continua ativa, mas nada é aprovado até alguém criar a senha. Junto, correção do domínio de e-mail: o webhook `domain.updated` passa a gravar o status de cada registro DNS, `partially_verified` vira "parcial", e "Atualizar status" só **lê** o provedor (reiniciar a verificação em andamento a atrasava). Testes: `aprovadores.integracao` (convite e senha pela página, regras da senha, autorização para incluir/remover/afrouxar/ativar, limite de 5, escolha do aprovador e senha de quem recebeu o código, aprovação pelo botão do e-mail, rajada de senhas erradas, nova senha, último ativo, sem aprovador ativo depois de já ter tido, isolamento entre empresas, pedido sem senha que pausa inclusive o reenvio, cancelamento pelo link e conclusão após 72 h, histórico), `email.integracao` (status por registro, verificação que só lê, log sem código) e `email-modelos`.

## 9. Ferramentas e comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API com reload (`node --watch`) — `\| npx pino-pretty` para log legível |
| `npm run lint` | ESLint (erros reais, `no-console` em `src/`) |
| `npm run deps:check` | Fronteiras de módulo (falha em violação nova) |
| `npm run deps:divida` | Lista as violações conhecidas (baseline) |
| `npm test` | Testes (vitest). Unitários sempre; integração só com `DATABASE_URL_TEST` definida |
| `npm run test:integracao` | Só integração (Postgres real; Redis se `REDIS_URL`) |
| `npm run check` | lint + deps + test (o que o CI roda) |
| `npm run smoke` | Cadeia principal contra uma API viva |
| `npm run migrate` / `migrate:down` | Migrations versionadas (pre-deploy no Railway) |
| `npm run fotos:migrar [--dry-run]` | Move fotos legadas (base64 no banco) para o storage |
| `npm run titular:exportar <id>` / `titular:excluir <id> [--confirmar]` | LGPD: acesso/portabilidade e exclusão (anonimização) de um motoboy |
| `npm run dr:verificar` | Confere integridade de um banco restaurado (teste trimestral de DR) |

CI (`.github/workflows/ci.yml`): lint → fronteiras → `npm audit` → testes → **boot em Postgres vazio + seed + smoke**.

## 10. Roadmap de arquitetura

| Sprint | Entrega | Status |
|---|---|---|
| 1 | Observabilidade (pino, reqId, Sentry, health, shutdown) · CORS · ADR-003 · zod nas rotas críticas · CI · testes base · boot em banco vazio | **feito** |
| 2A/2B | Redis opcional (WS pub/sub, rate-limit, cache) · `SKIP LOCKED` nas ondas · advisory locks no cron · barramento de eventos (score, chat) · `src/app.js` · testes de integração com Postgres+Redis no CI | **feito** |
| 3 | módulo `posicoes` · `motoboy_posicao_atual` · `rastreamento` particionada · GPS em lote · migrations versionadas · `/metrics` Prometheus | **feito** |
| 3b | App: GPS em lote com buffer offline (OTA) · backend de upload direto (módulo `uploads`) · correção de autorização no `concluir` | **feito** |
| 3c | Clientes do upload direto (app + painel) · OpenAPI da API pública (`/integracao/openapi.json` + `/openapi.html`) · remoção de `rastreamento_legado` (0003) · `npm run fotos:migrar` · dashboard Grafana (`docs/grafana/`) | **feito** |
| 4 | RLS (migration 0004 + `RLS_ENABLED`, verificação de superuser no boot e em `/ready`) · logo do branding pelo `uploads` · `docs/DR-CONTINUIDADE.md` · `docs/LGPD-DADOS-PESSOAIS.md` · ciclo `middleware/permissoes` ↔ módulo quebrado | **feito** (RLS ligado em produção · `rls.efetivo: true`) |
| 5 | Tela **Saúde do sistema** (super_admin): módulo `saude` (amostras por minuto de cada réplica em `saude_amostras`, erros 5xx em `saude_erros` via evento `sistema.erro_http`, `/saude/resumo`), painel `modulos/saude.js` fiel ao mockup aprovado · rota `/custos-api` registrada (estava só no menu) | **feito** |
| 6 | Fronteiras **0 violações** (inversão de dependência) · flag `UPLOADS_LEGADO` (desliga base64 sem deploy) · rotação de chave JWT com `kid` (`shared/jwt.js`) · tracing via `SENTRY_TRACES` (OpenTelemetry embutido no Sentry 10) · scripts LGPD `titular:exportar` / `titular:excluir` · `dr:verificar` + `docs/DR-TESTES.md` · `docs/schema-baseline.sql` · cache 15 s no `/saude/resumo` · tela Saúde com botão de erro de teste | **feito** |
| 7 | ~~Ligar `UPLOADS_LEGADO=false`~~ (**feito** · base64 migrado e desligado) · 1º teste de restore · DPO · consolidar migrations de boot na baseline versionada | parcial — os 3 restantes migraram para o plano abaixo (Ondas 4 e 5) |
| **Revisão sênior** | Fechar 100 % dos pontos do PDF "5 pontos mais críticos": camada de autorização verificável (ADR-016), eventos no lugar de WS/push direto, SQL fora das rotas, quebra de `entregas.service`, Zod em todas as rotas de escrita, uma camada de migrations, gate na Vercel, staging. Plano, ondas e critérios de pronto em **`docs/PLANO-REVISAO-SENIOR.md`** | **Ondas 0–4 completas** (12/09): Zod em 150/150 rotas de escrita com regra R-F no inventário; baseline com corpo em `migrations/baseline/`; Onda 5: 5.0, 5.1, 5.2, 5.6 feitos; 5.2b/5.3/5.4/5.5/5.7 são operação (`DEPLOY.md §12`) |
| **Revisão sênior · Onda 6** (segunda rodada, 12/09) | CSP + headers de segurança no painel (Vercel) · `usuarios.token_versao` (access do painel revogável em ≤ 60 s) · JWT com `HS256` + `iss` fixos · WebSocket sem `?token=` · sessão fora do `sessionStorage` · ADR-020 + rename das 3 tabelas em inglês · `npm audit fix` (body-parser) | **feito** — testes: `painel-token-versao`, `ws-auth`, `jwt` (alg/iss) e integração `seguranca` (access antigo cai, novo login passa com cache quente); série de 22 migrations + boot + seed + smoke verificados em Postgres 16 local |
| **Onda 6b** (13/09) | CSP por lista de hosts (`LOGIX_CSP_HOSTS`) · CSP nas páginas estáticas (scripts em `src/paginas/`, GoogleMutant local) · vitest 4 (GHSA-82fw-gwwq-j7x9) com catraca re-baseada | **feito** |
| **Onda 7** (13/09) | Rede de testes de integração nos 5 módulos sem cobertura (integracoes, financeiro, cadastro do motoboy, filas, score) — 46 casos, um arquivo por fluxo · 2 bugs reais corrigidos (lançamento/fechamento em motoboy de outra empresa; sessão do motoboy pendente morta em 401) | **feito** — 341 testes; cobertura real (com integração) 46 % → 55 % linhas |
| **Onda 8** (13/09) | Quebra de `filas.service` (675 → regras 47 + elegibilidade 147 + atribuição 173 + ofertas 342, fachada 17) e `integracoes.service` (659 → chaves 194 + catálogo 103 + serviços 379, fachada 18), sem mudança de regra; regra 29 do AGENTS (teto ~400 linhas + ordem testes→quebra) | **feito** — 341 testes verdes antes e depois; fachadas exportam o mesmo conjunto |
| **Onda 9** (13/09) | Quebra de `financeiro.service` (567 → faturamento 196 + lançamentos 135 + fechamento 258), `cadastro.service` (561 → base 136 + app 183 + central 259), `entregas.execucao.service` (550 → consulta 179 + conclusão 369) e `score.service` (430 → pontos 211 + campanhas 230), todos com fachada; sem mudança de regra | **feito** — 341 testes verdes antes e depois; só `clientehub.service` (510) segue acima do teto, aguardando rede |
| **Onda 10** (13/09) | Auditoria do fluxo do motoboy: app com `?token=` no WS (quebrado desde a Onda 6) → `src/realtime/socket.js` no app com auth por mensagem e backoff; "corrida aparece fora do raio" → validade da posição 60 min → 10 min (`POSICAO_VALIDADE_MIN`) e atribuição automática exige coordenadas; `checar-contrato-api.js --app` para o contrato REST do app | **feito** — backend em PR; app publica por OTA (`eas update`) |
