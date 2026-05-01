-- ============================================================
-- FASE 1 COMPLEMENTAR - Parcelamentos ativos e origem temporal
-- Evolui o schema atual para suportar:
-- 1. `data_contratacao` e `mes_origem_compra`
-- 2. cadastro de parcelamentos ja existentes em aberto
-- 3. analise separando custo herdado, gasto novo e gasto jogado para frente
-- Execute este script depois de:
-- - `financas-fase1-lancamentos.sql`
-- - `financas-fase1-parcelamentos.sql`
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- LANCAMENTOS - ORIGEM TEMPORAL
-- ============================================================
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS data_contratacao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mes_origem_compra DATE;

UPDATE lancamentos
SET
  data_contratacao = COALESCE(data_contratacao, data_evento),
  mes_origem_compra = COALESCE(
    mes_origem_compra,
    DATE_TRUNC('month', COALESCE(data_contratacao, data_evento) AT TIME ZONE 'America/Sao_Paulo')::DATE
  )
WHERE data_contratacao IS NULL
   OR mes_origem_compra IS NULL;

CREATE OR REPLACE FUNCTION trg_lancamentos_fill_origem_temporal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.data_contratacao := COALESCE(NEW.data_contratacao, NEW.data_evento, NOW());
  NEW.mes_origem_compra := DATE_TRUNC(
    'month',
    COALESCE(NEW.data_contratacao, NEW.data_evento, NOW()) AT TIME ZONE 'America/Sao_Paulo'
  )::DATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lancamentos_fill_origem_temporal_biu ON lancamentos;

CREATE TRIGGER lancamentos_fill_origem_temporal_biu
BEFORE INSERT OR UPDATE OF data_contratacao, data_evento
ON lancamentos
FOR EACH ROW
EXECUTE FUNCTION trg_lancamentos_fill_origem_temporal();

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_origem_compra
  ON lancamentos (user_id, mes_origem_compra DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_origem_compra_competencia
  ON lancamentos (user_id, mes_origem_compra DESC, mes_competencia DESC);

-- ============================================================
-- PARCELAMENTOS - SUPORTE A COMPRAS ANTIGAS AINDA EM ABERTO
-- ============================================================
ALTER TABLE parcelamentos
  ADD COLUMN IF NOT EXISTS necessidade SMALLINT,
  ADD COLUMN IF NOT EXISTS data_compra DATE,
  ADD COLUMN IF NOT EXISTS mes_origem_compra DATE,
  ADD COLUMN IF NOT EXISTS parcelas_ja_pagas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_aberto NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origem_cadastro TEXT NOT NULL DEFAULT 'nova_compra';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parcelamentos_necessidade_ck'
  ) THEN
    ALTER TABLE parcelamentos
      ADD CONSTRAINT parcelamentos_necessidade_ck
      CHECK (necessidade IS NULL OR necessidade BETWEEN 1 AND 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parcelamentos_parcelas_ja_pagas_ck'
  ) THEN
    ALTER TABLE parcelamentos
      ADD CONSTRAINT parcelamentos_parcelas_ja_pagas_ck
      CHECK (parcelas_ja_pagas BETWEEN 0 AND total_parcelas);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parcelamentos_origem_cadastro_ck'
  ) THEN
    ALTER TABLE parcelamentos
      ADD CONSTRAINT parcelamentos_origem_cadastro_ck
      CHECK (origem_cadastro IN ('nova_compra', 'parcela_ativa_migrada'));
  END IF;
END $$;

UPDATE parcelamentos
SET
  data_compra = COALESCE(data_compra, inicio_competencia),
  mes_origem_compra = COALESCE(
    mes_origem_compra,
    DATE_TRUNC('month', COALESCE(data_compra, inicio_competencia))::DATE
  ),
  valor_total_aberto = ROUND(
    GREATEST(total_parcelas - COALESCE(parcelas_ja_pagas, 0), 0) * valor_parcela_base,
    2
  ),
  origem_cadastro = COALESCE(origem_cadastro, 'nova_compra')
WHERE data_compra IS NULL
   OR mes_origem_compra IS NULL
   OR valor_total_aberto IS NULL
   OR origem_cadastro IS NULL;

CREATE OR REPLACE FUNCTION trg_parcelamentos_fill_origem_temporal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_data_compra DATE;
  v_abertas INTEGER;
BEGIN
  v_data_compra := COALESCE(NEW.data_compra, NEW.inicio_competencia);
  NEW.data_compra := v_data_compra;
  NEW.mes_origem_compra := DATE_TRUNC('month', v_data_compra)::DATE;
  NEW.origem_cadastro := COALESCE(NEW.origem_cadastro, 'nova_compra');
  NEW.parcelas_ja_pagas := COALESCE(NEW.parcelas_ja_pagas, 0);
  v_abertas := GREATEST(NEW.total_parcelas - NEW.parcelas_ja_pagas, 0);
  NEW.valor_total_aberto := ROUND(v_abertas * NEW.valor_parcela_base, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parcelamentos_fill_origem_temporal_biu ON parcelamentos;

CREATE TRIGGER parcelamentos_fill_origem_temporal_biu
BEFORE INSERT OR UPDATE OF data_compra, inicio_competencia, total_parcelas, parcelas_ja_pagas, valor_parcela_base, origem_cadastro
ON parcelamentos
FOR EACH ROW
EXECUTE FUNCTION trg_parcelamentos_fill_origem_temporal();

ALTER TABLE parcelas_lancamento
  ADD COLUMN IF NOT EXISTS mes_origem_compra DATE;

UPDATE parcelas_lancamento pl
SET mes_origem_compra = p.mes_origem_compra
FROM parcelamentos p
WHERE p.id = pl.parcelamento_id
  AND pl.mes_origem_compra IS NULL;

CREATE INDEX IF NOT EXISTS idx_parcelamentos_user_origem_compra
  ON parcelamentos (user_id, mes_origem_compra DESC);

CREATE INDEX IF NOT EXISTS idx_parcelas_lancamento_user_origem_compra
  ON parcelas_lancamento (user_id, mes_origem_compra DESC, mes_competencia DESC);

-- ============================================================
-- REGERACAO SEGURA DAS PARCELAS FUTURAS
-- Mantem parcelas ja pagas e gera apenas o que ainda esta em aberto.
-- ============================================================
CREATE OR REPLACE FUNCTION sync_parcelas_planejadas(p_parcelamento_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  p_row parcelamentos%ROWTYPE;
  v_primeira_parcela_aberta INTEGER;
  v_ultima_parcela_paga INTEGER;
BEGIN
  SELECT *
  INTO p_row
  FROM parcelamentos
  WHERE id = p_parcelamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcelamento % nao encontrado.', p_parcelamento_id;
  END IF;

  SELECT COALESCE(MAX(numero_parcela), 0)
  INTO v_ultima_parcela_paga
  FROM parcelas_lancamento
  WHERE parcelamento_id = p_parcelamento_id
    AND status = 'paga';

  v_primeira_parcela_aberta := GREATEST(
    COALESCE(p_row.parcelas_ja_pagas, 0) + 1,
    v_ultima_parcela_paga + 1,
    1
  );

  DELETE FROM parcelas_lancamento
  WHERE parcelamento_id = p_parcelamento_id
    AND status <> 'paga';

  IF v_primeira_parcela_aberta > p_row.total_parcelas THEN
    RETURN;
  END IF;

  INSERT INTO parcelas_lancamento (
    user_id,
    parcelamento_id,
    numero_parcela,
    mes_origem_compra,
    mes_competencia,
    data_vencimento,
    valor_previsto,
    status
  )
  SELECT
    p_row.user_id,
    p_row.id,
    gs.n,
    p_row.mes_origem_compra,
    (p_row.inicio_competencia + ((gs.n - 1) * INTERVAL '1 month'))::DATE,
    CASE
      WHEN p_row.dia_vencimento IS NULL THEN NULL
      ELSE (
        DATE_TRUNC('month', p_row.inicio_competencia + ((gs.n - 1) * INTERVAL '1 month'))::DATE
        + (
            LEAST(
              p_row.dia_vencimento,
              EXTRACT(
                DAY FROM (
                  DATE_TRUNC('month', p_row.inicio_competencia + ((gs.n - 1) * INTERVAL '1 month'))
                  + INTERVAL '1 month - 1 day'
                )
              )::INT
            ) - 1
          ) * INTERVAL '1 day'
      )::DATE
    END,
    p_row.valor_parcela_base,
    'prevista'
  FROM GENERATE_SERIES(v_primeira_parcela_aberta, p_row.total_parcelas) AS gs(n);
END;
$$;

-- ============================================================
-- FUNCAO HELPER PARA CADASTRAR PARCELAMENTO ATIVO LEGADO
-- Gera somente as parcelas ainda em aberto.
-- ============================================================
CREATE OR REPLACE FUNCTION criar_parcelamento_ativo_existente(
  p_descricao TEXT,
  p_categoria TEXT,
  p_subcategoria TEXT,
  p_necessidade SMALLINT,
  p_proprietario_economico TEXT,
  p_contexto TEXT,
  p_total_parcelas INTEGER,
  p_parcelas_ja_pagas INTEGER,
  p_valor_parcela_base NUMERIC,
  p_data_compra DATE,
  p_inicio_competencia DATE,
  p_dia_vencimento SMALLINT DEFAULT NULL,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO parcelamentos (
    user_id,
    descricao,
    categoria,
    subcategoria,
    necessidade,
    proprietario_economico,
    contexto,
    total_parcelas,
    inicio_competencia,
    dia_vencimento,
    valor_total,
    valor_parcela_base,
    parcelas_ja_pagas,
    data_compra,
    origem_cadastro,
    observacoes
  )
  VALUES (
    auth.uid(),
    p_descricao,
    p_categoria,
    p_subcategoria,
    p_necessidade,
    p_proprietario_economico,
    p_contexto,
    p_total_parcelas,
    DATE_TRUNC('month', p_inicio_competencia)::DATE,
    p_dia_vencimento,
    ROUND(p_total_parcelas * p_valor_parcela_base, 2),
    p_valor_parcela_base,
    p_parcelas_ja_pagas,
    p_data_compra,
    'parcela_ativa_migrada',
    p_observacoes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- VIEW RESUMO ATUALIZADA
-- ============================================================
CREATE OR REPLACE VIEW v_parcelamentos_resumo AS
SELECT
  p.id,
  p.user_id,
  p.descricao,
  p.categoria,
  p.subcategoria,
  p.proprietario_economico,
  p.contexto,
  p.total_parcelas,
  p.inicio_competencia,
  p.valor_total,
  p.valor_parcela_base,
  p.status,
  COUNT(pl.id) AS qtd_parcelas_geradas,
  COUNT(*) FILTER (WHERE pl.status = 'paga') AS parcelas_pagas,
  COUNT(*) FILTER (WHERE pl.status = 'prevista') AS parcelas_previstas,
  COALESCE(SUM(pl.valor_previsto), 0) AS total_previsto,
  COALESCE(SUM(pl.valor_pago), 0) AS total_pago,
  p.necessidade,
  p.parcelas_ja_pagas,
  p.data_compra,
  p.mes_origem_compra,
  p.valor_total_aberto,
  p.origem_cadastro
FROM parcelamentos p
LEFT JOIN parcelas_lancamento pl ON pl.parcelamento_id = p.id
GROUP BY
  p.id,
  p.user_id,
  p.descricao,
  p.categoria,
  p.subcategoria,
  p.proprietario_economico,
  p.contexto,
  p.total_parcelas,
  p.inicio_competencia,
  p.valor_total,
  p.valor_parcela_base,
  p.status,
  p.necessidade,
  p.parcelas_ja_pagas,
  p.data_compra,
  p.mes_origem_compra,
  p.valor_total_aberto,
  p.origem_cadastro;

-- ============================================================
-- VIEW ANALITICA DE ORIGEM X COMPETENCIA
-- ============================================================
CREATE OR REPLACE VIEW v_gastos_origem_competencia AS
WITH saidas_diretas AS (
  SELECT
    l.user_id,
    l.mes_competencia AS mes_analisado,
    SUM(
      CASE
        WHEN l.mes_origem_compra = l.mes_competencia THEN l.valor
        ELSE 0
      END
    ) AS gasto_novo_no_mes,
    0::NUMERIC(12,2) AS custo_herdado_mes,
    0::NUMERIC(12,2) AS gasto_jogado_para_futuro_no_mes,
    0::INTEGER AS parcelamentos_ativos_mes
  FROM lancamentos l
  WHERE l.tipo = 'saida'
    AND NOT EXISTS (
      SELECT 1
      FROM parcelas_lancamento pl
      WHERE pl.lancamento_pagamento_id = l.id
    )
  GROUP BY l.user_id, l.mes_competencia
),
parcelas_no_mes AS (
  SELECT
    p.user_id,
    pl.mes_competencia AS mes_analisado,
    SUM(
      CASE
        WHEN p.mes_origem_compra = pl.mes_competencia THEN pl.valor_previsto
        ELSE 0
      END
    ) AS gasto_novo_no_mes,
    SUM(
      CASE
        WHEN p.mes_origem_compra < pl.mes_competencia THEN pl.valor_previsto
        ELSE 0
      END
    ) AS custo_herdado_mes,
    0::NUMERIC(12,2) AS gasto_jogado_para_futuro_no_mes,
    COUNT(DISTINCT p.id)::INTEGER AS parcelamentos_ativos_mes
  FROM parcelamentos p
  JOIN parcelas_lancamento pl ON pl.parcelamento_id = p.id
  WHERE pl.status <> 'cancelada'
  GROUP BY p.user_id, pl.mes_competencia
),
parcelas_empurradas AS (
  SELECT
    p.user_id,
    p.mes_origem_compra AS mes_analisado,
    0::NUMERIC(12,2) AS gasto_novo_no_mes,
    0::NUMERIC(12,2) AS custo_herdado_mes,
    SUM(
      CASE
        WHEN pl.mes_competencia > p.mes_origem_compra THEN pl.valor_previsto
        ELSE 0
      END
    ) AS gasto_jogado_para_futuro_no_mes,
    0::INTEGER AS parcelamentos_ativos_mes
  FROM parcelamentos p
  JOIN parcelas_lancamento pl ON pl.parcelamento_id = p.id
  WHERE pl.status <> 'cancelada'
  GROUP BY p.user_id, p.mes_origem_compra
),
base AS (
  SELECT * FROM saidas_diretas
  UNION ALL
  SELECT * FROM parcelas_no_mes
  UNION ALL
  SELECT * FROM parcelas_empurradas
)
SELECT
  user_id,
  mes_analisado,
  ROUND(SUM(gasto_novo_no_mes), 2) AS gasto_novo_no_mes,
  ROUND(SUM(custo_herdado_mes), 2) AS custo_herdado_mes,
  ROUND(SUM(gasto_jogado_para_futuro_no_mes), 2) AS gasto_jogado_para_futuro_no_mes,
  MAX(parcelamentos_ativos_mes) AS parcelamentos_ativos_mes
FROM base
GROUP BY user_id, mes_analisado;

-- ============================================================
-- NOTAS
-- ============================================================
-- 1. `mes_origem_compra` representa quando a decisao de consumo nasceu.
-- 2. `mes_competencia` continua representando quando o caixa do mes foi impactado.
-- 3. Para parcelamentos antigos ainda em aberto, use `criar_parcelamento_ativo_existente(...)`
--    ou insira diretamente em `parcelamentos`; o trigger gerara apenas as parcelas futuras.
-- 4. A view `v_gastos_origem_competencia` foi desenhada para apoiar dashboards que separam:
--    - custo herdado de meses anteriores
--    - gasto novo do proprio mes
--    - gasto jogado para meses futuros
