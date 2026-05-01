-- ============================================================
-- Fase 4 - Alya
-- Base de dados para fluxo contratual, pagamentos e painel
-- analitico inicial do apartamento.
-- ============================================================

CREATE TABLE IF NOT EXISTS empreendimentos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  unidade     TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alya_fluxo_base (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empreendimento_id   UUID NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
  bloco               TEXT NOT NULL CHECK (bloco IN ('entrada','mensal','anual','reforco','financiamento','intermediaria')),
  descricao           TEXT,
  ordem               INTEGER,
  data_vencimento_base DATE NOT NULL,
  valor_base          NUMERIC(12,2) NOT NULL CHECK (valor_base >= 0),
  valor_atual         NUMERIC(12,2) CHECK (valor_atual >= 0),
  status              TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','pago','cancelado')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alya_pagamentos (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empreendimento_id          UUID NOT NULL REFERENCES empreendimentos(id) ON DELETE CASCADE,
  alya_fluxo_base_id         UUID REFERENCES alya_fluxo_base(id) ON DELETE SET NULL,
  data_pagamento             DATE NOT NULL,
  valor_pago                 NUMERIC(12,2) NOT NULL CHECK (valor_pago >= 0),
  numero_referencia          TEXT,
  indice_aplicado            NUMERIC(12,8),
  fator_vs_parcela_anterior  NUMERIC(12,8),
  observacoes                TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_empreendimentos_user_ativo
  ON empreendimentos (user_id, ativo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alya_fluxo_user_emp_data
  ON alya_fluxo_base (user_id, empreendimento_id, data_vencimento_base, ordem);

CREATE INDEX IF NOT EXISTS idx_alya_pagamentos_user_emp_data
  ON alya_pagamentos (user_id, empreendimento_id, data_pagamento DESC);

ALTER TABLE empreendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE alya_fluxo_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE alya_pagamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS empreendimentos_select_own ON empreendimentos;
CREATE POLICY empreendimentos_select_own
  ON empreendimentos FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS empreendimentos_insert_own ON empreendimentos;
CREATE POLICY empreendimentos_insert_own
  ON empreendimentos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS empreendimentos_update_own ON empreendimentos;
CREATE POLICY empreendimentos_update_own
  ON empreendimentos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS empreendimentos_delete_own ON empreendimentos;
CREATE POLICY empreendimentos_delete_own
  ON empreendimentos FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_fluxo_base_select_own ON alya_fluxo_base;
CREATE POLICY alya_fluxo_base_select_own
  ON alya_fluxo_base FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_fluxo_base_insert_own ON alya_fluxo_base;
CREATE POLICY alya_fluxo_base_insert_own
  ON alya_fluxo_base FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_fluxo_base_update_own ON alya_fluxo_base;
CREATE POLICY alya_fluxo_base_update_own
  ON alya_fluxo_base FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_fluxo_base_delete_own ON alya_fluxo_base;
CREATE POLICY alya_fluxo_base_delete_own
  ON alya_fluxo_base FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_pagamentos_select_own ON alya_pagamentos;
CREATE POLICY alya_pagamentos_select_own
  ON alya_pagamentos FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_pagamentos_insert_own ON alya_pagamentos;
CREATE POLICY alya_pagamentos_insert_own
  ON alya_pagamentos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_pagamentos_update_own ON alya_pagamentos;
CREATE POLICY alya_pagamentos_update_own
  ON alya_pagamentos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS alya_pagamentos_delete_own ON alya_pagamentos;
CREATE POLICY alya_pagamentos_delete_own
  ON alya_pagamentos FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW v_alya_posicao_atual AS
WITH base AS (
  SELECT
    f.user_id,
    f.empreendimento_id,
    COALESCE(f.valor_atual, f.valor_base) AS valor_evento,
    f.bloco,
    f.status,
    f.data_vencimento_base,
    f.descricao
  FROM alya_fluxo_base f
),
agregado AS (
  SELECT
    user_id,
    empreendimento_id,
    SUM(CASE WHEN status = 'pago' THEN valor_evento ELSE 0 END) AS total_pago_fluxo,
    SUM(CASE WHEN status = 'aberto' AND bloco = 'financiamento' THEN valor_evento ELSE 0 END) AS saldo_financiamento_aberto,
    SUM(CASE WHEN status = 'aberto' AND bloco <> 'financiamento' THEN valor_evento ELSE 0 END) AS saldo_construtora_aberto,
    COUNT(*) FILTER (WHERE status = 'pago') AS eventos_pagos,
    COUNT(*) FILTER (WHERE status = 'aberto') AS eventos_abertos
  FROM base
  GROUP BY user_id, empreendimento_id
),
prox_reforco AS (
  SELECT DISTINCT ON (user_id, empreendimento_id)
    user_id,
    empreendimento_id,
    data_vencimento_base AS proximo_reforco_data,
    valor_evento AS proximo_reforco_valor,
    descricao AS proximo_reforco_descricao
  FROM base
  WHERE status = 'aberto'
    AND bloco IN ('reforco','anual','intermediaria')
  ORDER BY user_id, empreendimento_id, data_vencimento_base ASC
)
SELECT
  a.user_id,
  a.empreendimento_id,
  a.total_pago_fluxo,
  a.saldo_construtora_aberto,
  a.saldo_financiamento_aberto,
  (a.saldo_construtora_aberto + a.saldo_financiamento_aberto) AS saldo_total_aberto,
  a.eventos_pagos,
  a.eventos_abertos,
  p.proximo_reforco_data,
  p.proximo_reforco_valor,
  p.proximo_reforco_descricao
FROM agregado a
LEFT JOIN prox_reforco p
  ON p.user_id = a.user_id
 AND p.empreendimento_id = a.empreendimento_id;
