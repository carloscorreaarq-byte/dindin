-- ============================================================
-- FASE 1 - Nucleo analitico de lancamentos
-- Cria a nova base estrutural sem remover o schema legado.
-- Execute este script no SQL Editor do Supabase.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CONTAS FINANCEIRAS
-- ============================================================
CREATE TABLE IF NOT EXISTS contas_financeiras (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome          TEXT NOT NULL,
  instituicao   TEXT,
  tipo          TEXT NOT NULL CHECK (tipo IN ('conta_corrente', 'cartao_credito', 'carteira', 'investimento', 'caixa', 'outro')),
  titularidade  TEXT NOT NULL CHECK (titularidade IN ('eu', 'mae', 'compartilhado')),
  ativa         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LANCAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS lancamentos (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tipo                    TEXT NOT NULL CHECK (tipo IN ('saida', 'entrada', 'transferencia_interna', 'ajuste')),
  proprietario_economico  TEXT NOT NULL CHECK (proprietario_economico IN ('eu', 'mae')),
  contexto                TEXT NOT NULL CHECK (contexto IN ('pessoal', 'mae', 'casa_atual', 'alya', 'investimento')),
  descricao               TEXT,
  categoria               TEXT,
  subcategoria            TEXT,
  necessidade             SMALLINT CHECK (necessidade BETWEEN 1 AND 4),
  valor                   NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  data_evento             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mes_competencia         DATE GENERATED ALWAYS AS (
                            DATE_TRUNC('month', data_evento AT TIME ZONE 'America/Sao_Paulo')::DATE
                          ) STORED,
  conta_origem_id         UUID REFERENCES contas_financeiras(id) ON DELETE SET NULL,
  conta_destino_id        UUID REFERENCES contas_financeiras(id) ON DELETE SET NULL,
  forma_pagamento         TEXT CHECK (forma_pagamento IN ('credito', 'debito', 'conta_corrente', 'transferencia', 'pix', 'boleto', 'dinheiro', 'outro')),
  banco_referencia        TEXT,
  observacoes             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lancamentos_transferencia_contas_ck CHECK (
    tipo <> 'transferencia_interna'
    OR (conta_origem_id IS NOT NULL AND conta_destino_id IS NOT NULL)
  )
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE contas_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contas_financeiras_own" ON contas_financeiras
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "lancamentos_own" ON lancamentos
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- INDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contas_financeiras_user_ativa
  ON contas_financeiras (user_id, ativa);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_data
  ON lancamentos (user_id, data_evento DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_mes
  ON lancamentos (user_id, mes_competencia DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_contexto_mes
  ON lancamentos (user_id, contexto, mes_competencia DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_categoria_mes
  ON lancamentos (user_id, categoria, mes_competencia DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_proprietario_mes
  ON lancamentos (user_id, proprietario_economico, mes_competencia DESC);

-- ============================================================
-- VIEW ANALITICA BASICA
-- ============================================================
CREATE OR REPLACE VIEW v_lancamentos_mensais AS
SELECT
  user_id,
  mes_competencia,
  tipo,
  proprietario_economico,
  contexto,
  categoria,
  subcategoria,
  necessidade,
  SUM(valor) AS total,
  COUNT(*) AS qtd
FROM lancamentos
GROUP BY
  user_id,
  mes_competencia,
  tipo,
  proprietario_economico,
  contexto,
  categoria,
  subcategoria,
  necessidade;

-- ============================================================
-- NOTAS DE USO
-- ============================================================
-- 1. Este script nao migra dados das tabelas legadas `gastos` e `entradas`.
-- 2. A migracao dos dados antigos deve ocorrer em uma etapa separada.
-- 3. O app pode continuar operando com o schema atual enquanto a migracao e preparada.
-- 4. `mes_competencia` fica ancorado em `America/Sao_Paulo` para evitar ambiguidade de timezone.
