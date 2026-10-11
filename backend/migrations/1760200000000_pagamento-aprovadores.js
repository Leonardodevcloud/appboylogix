// Aprovadores de pagamento (ADR-036). Pedido do Tutts em 11/10/2026: o e-mail que recebia
// o código de aprovação era um campo comum da conta bancária, e quem tinha acesso ao
// painel trocava o e-mail pelo próprio e aprovava sozinho.
//
//   pagamento_aprovadores        pessoa que aprova: e-mail confirmado por convite e uma
//                                senha de aprovação que só ela conhece (hash bcrypt). Até 5
//                                por empresa. Incluir ou remover pede a senha de um
//                                aprovador ativo.
//   pagamento_aprovador_pedidos  troca/inclusão SEM a senha de nenhum aprovador (ele saiu da
//                                empresa, perdeu a senha). Só vale depois de 72 h, com os
//                                pagamentos pausados; aprovadores e admins são avisados e
//                                qualquer um deles cancela.
//   pagamento_tokens.aprovador_id  o código do lote vai para UM aprovador, e só a senha dele
//                                fecha a aprovação.
//   pagamento_tokens.link_hash   link do e-mail para aprovar no aparelho do aprovador.
//   pagamento_lotes.aprovador_id   quem aprovou de fato (aprovado_por continua sendo o usuário
//                                do painel que digitou).
//
// responsavel_nome/responsavel_email de pagamento_contas deixam de ser usados e ficam como
// estão (nada é apagado numa migration de segurança).
exports.shorthands = undefined;

const CONDICAO = "coalesce(current_setting('app.empresa_id', true), '') = '' OR empresa_id IS NULL OR empresa_id::text = current_setting('app.empresa_id', true)";
function rls(pgm, tabela) {
  pgm.sql(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY`);
  pgm.sql(`ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY`);
  pgm.sql(`DROP POLICY IF EXISTS tenant_isolamento ON ${tabela}`);
  pgm.sql(`CREATE POLICY tenant_isolamento ON ${tabela} FOR ALL USING (${CONDICAO}) WITH CHECK (${CONDICAO})`);
}

exports.up = (pgm) => {
  // status: convidado → ativo → removido. Linha removida fica (histórico), só sai da conta.
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS pagamento_aprovadores (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome                TEXT NOT NULL,
      email               TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'convidado' CHECK (status IN ('convidado','ativo','removido')),
      senha_hash          TEXT,
      senha_definida_em   TIMESTAMPTZ,
      -- Link do e-mail (convite ou nova senha): só o hash, uso único, com validade.
      link_hash           TEXT UNIQUE,
      link_tipo           TEXT CHECK (link_tipo IN ('convite','nova_senha')),
      link_expira_em      TIMESTAMPTZ,
      tentativas_erradas  INTEGER NOT NULL DEFAULT 0,
      bloqueado_ate       TIMESTAMPTZ,
      convidado_por       UUID,
      autorizado_por      UUID,           -- aprovador cuja senha autorizou a inclusão
      removido_em         TIMESTAMPTZ,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // O mesmo e-mail não aparece duas vezes entre os aprovadores vivos da empresa.
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uq_pag_aprovador_email ON pagamento_aprovadores(empresa_id, lower(email))
             WHERE status <> 'removido'`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pag_aprovadores_empresa ON pagamento_aprovadores(empresa_id, status)`);
  rls(pgm, 'pagamento_aprovadores');

  // status: aguardando → concluido | cancelado
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS pagamento_aprovador_pedidos (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome            TEXT NOT NULL,
      email           TEXT NOT NULL,
      remover_id      UUID REFERENCES pagamento_aprovadores(id),
      motivo          TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','concluido','cancelado')),
      cancelar_hash   TEXT UNIQUE,          -- link "não fui eu" mandado aos aprovadores
      pedido_por      UUID NOT NULL,
      libera_em       TIMESTAMPTZ NOT NULL,
      cancelado_em    TIMESTAMPTZ,
      cancelado_por   TEXT,                 -- 'usuario:<id>' ou 'aprovador:<id>'
      concluido_em    TIMESTAMPTZ,
      criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Um pedido aberto por empresa: é ele que pausa os pagamentos.
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uq_pag_aprovador_pedido_aberto ON pagamento_aprovador_pedidos(empresa_id)
             WHERE status = 'aguardando'`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_pag_aprovador_pedido_libera ON pagamento_aprovador_pedidos(libera_em) WHERE status = 'aguardando'`);
  rls(pgm, 'pagamento_aprovador_pedidos');

  pgm.sql(`ALTER TABLE pagamento_tokens ADD COLUMN IF NOT EXISTS aprovador_id UUID REFERENCES pagamento_aprovadores(id)`);
  // Link "Revisar e aprovar" do e-mail do código: o aprovador aprova no aparelho DELE, sem
  // digitar a senha na tela de outra pessoa. Mesmo token do código: o que for usado
  // primeiro encerra os dois.
  pgm.sql(`ALTER TABLE pagamento_tokens ADD COLUMN IF NOT EXISTS link_hash TEXT UNIQUE`);
  pgm.sql(`ALTER TABLE pagamento_lotes ADD COLUMN IF NOT EXISTS aprovador_id UUID REFERENCES pagamento_aprovadores(id)`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE pagamento_lotes DROP COLUMN IF EXISTS aprovador_id`);
  pgm.sql(`ALTER TABLE pagamento_tokens DROP COLUMN IF EXISTS link_hash`);
  pgm.sql(`ALTER TABLE pagamento_tokens DROP COLUMN IF EXISTS aprovador_id`);
  pgm.sql(`DROP TABLE IF EXISTS pagamento_aprovador_pedidos`);
  pgm.sql(`DROP TABLE IF EXISTS pagamento_aprovadores`);
};
