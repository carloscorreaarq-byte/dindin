-- ============================================================
-- Fase 3 - Casa atual
-- Estrutura para registrar sublocacao fixa e apoiar a analise
-- mensal do custo real da moradia versus receita fixa.
-- ============================================================

CREATE TABLE IF NOT EXISTS contratos_sublocacao (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao         TEXT NOT NULL DEFAULT 'Sublocacao atual',
  valor_mensal_fixo NUMERIC(12,2) NOT NULL CHECK (valor_mensal_fixo >= 0),
  inicio_vigencia   DATE NOT NULL,
  fim_vigencia      DATE,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contratos_sublocacao_user_ativo
  ON contratos_sublocacao (user_id, ativo, inicio_vigencia DESC);

ALTER TABLE contratos_sublocacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratos_sublocacao_select_own ON contratos_sublocacao;
CREATE POLICY contratos_sublocacao_select_own
  ON contratos_sublocacao
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS contratos_sublocacao_insert_own ON contratos_sublocacao;
CREATE POLICY contratos_sublocacao_insert_own
  ON contratos_sublocacao
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS contratos_sublocacao_update_own ON contratos_sublocacao;
CREATE POLICY contratos_sublocacao_update_own
  ON contratos_sublocacao
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS contratos_sublocacao_delete_own ON contratos_sublocacao;
CREATE POLICY contratos_sublocacao_delete_own
  ON contratos_sublocacao
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE VIEW v_resultado_casa_atual AS
WITH meses AS (
  SELECT
    l.user_id,
    l.mes_competencia AS mes_referencia
  FROM lancamentos l
  WHERE l.contexto = 'casa_atual'
  GROUP BY l.user_id, l.mes_competencia
),
custos AS (
  SELECT
    l.user_id,
    l.mes_competencia AS mes_referencia,
    SUM(l.valor) AS custo_total
  FROM lancamentos l
  WHERE l.contexto = 'casa_atual'
    AND l.tipo = 'saida'
  GROUP BY l.user_id, l.mes_competencia
),
contrato_ativo AS (
  SELECT
    m.user_id,
    m.mes_referencia,
    (
      SELECT c.valor_mensal_fixo
      FROM contratos_sublocacao c
      WHERE c.user_id = m.user_id
        AND c.ativo = true
        AND c.inicio_vigencia <= m.mes_referencia
        AND (c.fim_vigencia IS NULL OR c.fim_vigencia >= m.mes_referencia)
      ORDER BY c.inicio_vigencia DESC, c.created_at DESC
      LIMIT 1
    ) AS receita_sublocacao
  FROM meses m
),
base AS (
  SELECT
    m.user_id,
    m.mes_referencia,
    COALESCE(c.custo_total, 0) AS custo_total,
    COALESCE(a.receita_sublocacao, 0) AS receita_sublocacao
  FROM meses m
  LEFT JOIN custos c
    ON c.user_id = m.user_id
   AND c.mes_referencia = m.mes_referencia
  LEFT JOIN contrato_ativo a
    ON a.user_id = m.user_id
   AND a.mes_referencia = m.mes_referencia
)
SELECT
  user_id,
  mes_referencia,
  custo_total,
  receita_sublocacao,
  receita_sublocacao - custo_total AS resultado_mensal,
  AVG(receita_sublocacao - custo_total) OVER (
    PARTITION BY user_id
    ORDER BY mes_referencia
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ) AS media_movel_3m,
  AVG(receita_sublocacao - custo_total) OVER (
    PARTITION BY user_id
    ORDER BY mes_referencia
    ROWS BETWEEN 5 PRECEDING AND CURRENT ROW
  ) AS media_movel_6m
FROM base;
