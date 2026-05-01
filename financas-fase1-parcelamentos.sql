-- ============================================================
-- FASE 1 - Modelagem de parcelamentos
-- Cria a estrutura correta para compras parceladas por competencia.
-- Execute este script depois de `financas-fase1-lancamentos.sql`.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PARCELAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS parcelamentos (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lancamento_origem_id    UUID REFERENCES lancamentos(id) ON DELETE SET NULL,
  descricao               TEXT,
  categoria               TEXT,
  subcategoria            TEXT,
  proprietario_economico  TEXT NOT NULL CHECK (proprietario_economico IN ('eu', 'mae')),
  contexto                TEXT NOT NULL CHECK (contexto IN ('pessoal', 'mae', 'casa_atual', 'alya', 'investimento')),
  total_parcelas          INTEGER NOT NULL CHECK (total_parcelas BETWEEN 2 AND 240),
  inicio_competencia      DATE NOT NULL,
  dia_vencimento          SMALLINT CHECK (dia_vencimento BETWEEN 1 AND 31),
  valor_total             NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  valor_parcela_base      NUMERIC(12,2) NOT NULL CHECK (valor_parcela_base >= 0),
  status                  TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'quitado', 'cancelado')),
  observacoes             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parcelamentos_inicio_competencia_ck
    CHECK (inicio_competencia = DATE_TRUNC('month', inicio_competencia)::DATE)
);

-- ============================================================
-- PARCELAS DO PARCELAMENTO
-- ============================================================
CREATE TABLE IF NOT EXISTS parcelas_lancamento (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  parcelamento_id          UUID REFERENCES parcelamentos(id) ON DELETE CASCADE NOT NULL,
  numero_parcela           INTEGER NOT NULL CHECK (numero_parcela >= 1),
  mes_competencia          DATE NOT NULL,
  data_vencimento          DATE,
  valor_previsto           NUMERIC(12,2) NOT NULL CHECK (valor_previsto >= 0),
  valor_pago               NUMERIC(12,2) CHECK (valor_pago >= 0),
  status                   TEXT NOT NULL DEFAULT 'prevista' CHECK (status IN ('prevista', 'paga', 'cancelada')),
  lancamento_pagamento_id  UUID REFERENCES lancamentos(id) ON DELETE SET NULL,
  pago_em                  TIMESTAMPTZ,
  observacoes              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parcelamento_id, numero_parcela)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parcelas_lancamento_pagamento_unico
  ON parcelas_lancamento (lancamento_pagamento_id)
  WHERE lancamento_pagamento_id IS NOT NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE parcelamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas_lancamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parcelamentos_own" ON parcelamentos
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "parcelas_lancamento_own" ON parcelas_lancamento
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- INDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_parcelamentos_user_status
  ON parcelamentos (user_id, status);

CREATE INDEX IF NOT EXISTS idx_parcelamentos_user_contexto
  ON parcelamentos (user_id, contexto);

CREATE INDEX IF NOT EXISTS idx_parcelas_lancamento_user_mes
  ON parcelas_lancamento (user_id, mes_competencia DESC);

CREATE INDEX IF NOT EXISTS idx_parcelas_lancamento_user_status
  ON parcelas_lancamento (user_id, status);

CREATE INDEX IF NOT EXISTS idx_parcelas_lancamento_parcelamento
  ON parcelas_lancamento (parcelamento_id, numero_parcela);

-- ============================================================
-- FUNCAO DE SINCRONIZACAO DAS PARCELAS PREVISTAS
-- ============================================================
CREATE OR REPLACE FUNCTION sync_parcelas_planejadas(p_parcelamento_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  p_row parcelamentos%ROWTYPE;
BEGIN
  SELECT *
  INTO p_row
  FROM parcelamentos
  WHERE id = p_parcelamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcelamento % nao encontrado.', p_parcelamento_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM parcelas_lancamento
    WHERE parcelamento_id = p_parcelamento_id
      AND status = 'paga'
  ) THEN
    RAISE EXCEPTION 'Nao e permitido regerar parcelas quando ja existem parcelas pagas.';
  END IF;

  DELETE FROM parcelas_lancamento
  WHERE parcelamento_id = p_parcelamento_id;

  INSERT INTO parcelas_lancamento (
    user_id,
    parcelamento_id,
    numero_parcela,
    mes_competencia,
    data_vencimento,
    valor_previsto,
    status
  )
  SELECT
    p_row.user_id,
    p_row.id,
    gs.n,
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
  FROM GENERATE_SERIES(1, p_row.total_parcelas) AS gs(n);
END;
$$;

-- ============================================================
-- TRIGGER PARA GERAR PARCELAS NA CRIACAO DO PARCELAMENTO
-- ============================================================
CREATE OR REPLACE FUNCTION trg_seed_parcelas_planejadas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_parcelas_planejadas(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parcelamentos_seed_parcelas_ai ON parcelamentos;

CREATE TRIGGER parcelamentos_seed_parcelas_ai
AFTER INSERT ON parcelamentos
FOR EACH ROW
EXECUTE FUNCTION trg_seed_parcelas_planejadas();

-- ============================================================
-- VIEW RESUMO DE PARCELAMENTOS
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
  COALESCE(SUM(pl.valor_pago), 0) AS total_pago
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
  p.status;

-- ============================================================
-- NOTAS
-- ============================================================
-- 1. Esta modelagem nao tenta reconstruir parcelamentos legados automaticamente.
-- 2. O campo `tipo_pagamento` do legado nao garante competencia historica confiavel.
-- 3. Se um parcelamento ja tiver parcelas pagas, a funcao de sincronizacao bloqueia regeracao.
-- 4. Para alterar parcelas futuras de um parcelamento ativo, ajuste o cadastro antes de baixar parcelas como pagas.
