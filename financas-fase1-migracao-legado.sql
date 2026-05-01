-- ============================================================
-- FASE 1 - Migracao do legado para `lancamentos`
-- Migra dados de `gastos` e `entradas` para o novo nucleo.
-- Execute este script apenas depois de aplicar `financas-fase1-lancamentos.sql`.
-- ============================================================

BEGIN;

-- ============================================================
-- MIGRACAO DE GASTOS
-- ============================================================
INSERT INTO lancamentos (
  id,
  user_id,
  tipo,
  proprietario_economico,
  contexto,
  descricao,
  categoria,
  subcategoria,
  necessidade,
  valor,
  data_evento,
  forma_pagamento,
  banco_referencia,
  observacoes,
  created_at
)
SELECT
  g.id,
  g.user_id,
  'saida' AS tipo,
  CASE
    WHEN g.dono = 'mae' THEN 'mae'
    ELSE 'eu'
  END AS proprietario_economico,
  CASE
    WHEN g.dono = 'mae' THEN 'mae'
    WHEN g.categoria = 'Moradia' THEN 'casa_atual'
    ELSE 'pessoal'
  END AS contexto,
  COALESCE(g.subcategoria, g.categoria, CASE WHEN g.dono = 'mae' THEN 'Gasto Mae' ELSE 'Gasto' END) AS descricao,
  g.categoria,
  g.subcategoria,
  g.necessidade,
  g.valor,
  g.data AS data_evento,
  g.forma_pagamento,
  g.banco AS banco_referencia,
  'Migrado da tabela gastos. legado_id=' || g.id || '; tipo_pagamento=' || g.tipo_pagamento AS observacoes,
  COALESCE(g.created_at, NOW()) AS created_at
FROM gastos g
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MIGRACAO DE ENTRADAS
-- ============================================================
INSERT INTO lancamentos (
  id,
  user_id,
  tipo,
  proprietario_economico,
  contexto,
  descricao,
  categoria,
  subcategoria,
  valor,
  data_evento,
  observacoes,
  created_at
)
SELECT
  e.id,
  e.user_id,
  'entrada' AS tipo,
  'eu' AS proprietario_economico,
  CASE
    WHEN e.origem = 'aluguel' THEN 'casa_atual'
    ELSE 'pessoal'
  END AS contexto,
  CASE
    WHEN e.origem = 'transferencia' THEN COALESCE(NULLIF(e.origem_motivo, ''), NULLIF(e.origem_de, ''), 'Transferencia')
    WHEN e.origem = 'outro' THEN COALESCE(NULLIF(e.origem_especificacao, ''), 'Outro')
    ELSE e.origem
  END AS descricao,
  'Entradas' AS categoria,
  e.origem AS subcategoria,
  e.valor,
  (e.data::timestamp AT TIME ZONE 'America/Sao_Paulo') AS data_evento,
  'Migrado da tabela entradas. legado_id=' || e.id
    || COALESCE('; origem_de=' || NULLIF(e.origem_de, ''), '')
    || COALESCE('; origem_motivo=' || NULLIF(e.origem_motivo, ''), '')
    || COALESCE('; origem_especificacao=' || NULLIF(e.origem_especificacao, ''), '') AS observacoes,
  COALESCE(e.created_at, NOW()) AS created_at
FROM entradas e
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- CONSULTAS DE VALIDACAO
-- Execute separadamente apos a migracao.
-- ============================================================
-- SELECT COUNT(*) AS gastos_legado FROM gastos;
-- SELECT COUNT(*) AS entradas_legado FROM entradas;
-- SELECT COUNT(*) AS lancamentos_migrados FROM lancamentos;
-- SELECT contexto, tipo, COUNT(*) AS qtd, SUM(valor) AS total
-- FROM lancamentos
-- GROUP BY contexto, tipo
-- ORDER BY contexto, tipo;

-- ============================================================
-- NOTAS
-- ============================================================
-- 1. Esta migracao nao preenche `conta_origem_id` nem `conta_destino_id`.
-- 2. Entradas legadas sao migradas como propriedade economica `eu`.
-- 3. `origem = aluguel` entra como `contexto = casa_atual`.
-- 4. Gastos da mae entram como `proprietario_economico = mae` e `contexto = mae`.
