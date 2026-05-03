-- ============================================================
-- FASE DE ESTABILIZACAO - Hot paths de leitura do app
-- Execute este script depois das fases 1 e 1 complementar.
-- Objetivo:
-- 1. acelerar listas por `lancamentos`
-- 2. acelerar leituras do dashboard por `tipo`, `contexto` e `mes_competencia`
-- 3. reduzir custo de joins de parcelamentos no resumo temporal
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_tipo_data
  ON lancamentos (user_id, tipo, data_evento DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_tipo_mes
  ON lancamentos (user_id, tipo, mes_competencia DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_contexto_tipo_mes
  ON lancamentos (user_id, contexto, tipo, mes_competencia DESC);

CREATE INDEX IF NOT EXISTS idx_lancamentos_user_tipo_origem_mes
  ON lancamentos (user_id, tipo, mes_origem_compra DESC, mes_competencia DESC);

CREATE INDEX IF NOT EXISTS idx_parcelamentos_user_origem_contexto
  ON parcelamentos (user_id, mes_origem_compra DESC, contexto, status);

CREATE INDEX IF NOT EXISTS idx_parcelas_lancamento_user_mes_status_parcelamento
  ON parcelas_lancamento (user_id, mes_competencia DESC, status, parcelamento_id);

CREATE INDEX IF NOT EXISTS idx_parcelas_lancamento_parcelamento_mes
  ON parcelas_lancamento (parcelamento_id, mes_competencia DESC);

-- ============================================================
-- NOTAS
-- ============================================================
-- 1. Este script nao altera dados, apenas melhora acesso.
-- 2. Se o projeto tiver muito volume, vale rodar fora de horario de uso.
-- 3. Depois de aplicar, teste novamente:
--    - lista de gastos
--    - lista de entradas
--    - resumo
