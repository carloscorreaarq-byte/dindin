-- ============================================================
-- SCHEMA — Finanças Pessoais
-- Cole e execute no SQL Editor do seu projeto Supabase
-- ============================================================

-- Extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- GASTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS gastos (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  dono             TEXT NOT NULL DEFAULT 'eu' CHECK (dono IN ('eu', 'mae')),
  valor            NUMERIC(10,2) NOT NULL,
  tipo_pagamento   TEXT NOT NULL DEFAULT 'a_vista',   -- 'a_vista' | '1x'...'12x'
  forma_pagamento  TEXT NOT NULL DEFAULT 'credito',   -- 'credito' | 'conta_corrente' | 'transferencia'
  banco            TEXT NOT NULL DEFAULT 'XP',        -- 'XP' | 'Santander' | 'Nubank'
  data             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  categoria        TEXT,                               -- NULL para gastos da mãe
  subcategoria     TEXT,                               -- NULL para gastos da mãe
  necessidade      SMALLINT CHECK (necessidade BETWEEN 1 AND 4), -- NULL para gastos da mãe
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ENTRADAS
-- ============================================================
CREATE TABLE IF NOT EXISTS entradas (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  valor                 NUMERIC(10,2) NOT NULL,
  origem                TEXT NOT NULL,
  -- 'pro_labore' | 'adiantamento_lucros' | 'bonus' | 'reembolso'
  -- | 'aluguel' | 'transferencia' | 'outro'
  origem_de             TEXT,    -- preenchido quando origem = 'transferencia'
  origem_motivo         TEXT,    -- preenchido quando origem = 'transferencia'
  origem_especificacao  TEXT,    -- preenchido quando origem = 'outro'
  data                  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBCATEGORIAS CUSTOMIZADAS (criadas pelo usuário via "Outros")
-- ============================================================
CREATE TABLE IF NOT EXISTS subcategorias_custom (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  categoria   TEXT NOT NULL,
  nome        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, categoria, nome)
);

-- ============================================================
-- ROW LEVEL SECURITY — cada usuário vê apenas seus dados
-- ============================================================
ALTER TABLE gastos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE entradas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategorias_custom ENABLE ROW LEVEL SECURITY;

-- Políticas gastos
CREATE POLICY "gastos_own" ON gastos
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Políticas entradas
CREATE POLICY "entradas_own" ON entradas
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Políticas subcategorias_custom
CREATE POLICY "subcats_own" ON subcategorias_custom
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ÍNDICES para performance nas queries do dashboard
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_gastos_user_data   ON gastos (user_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_dono        ON gastos (user_id, dono);
CREATE INDEX IF NOT EXISTS idx_entradas_user_data ON entradas (user_id, data DESC);

-- ============================================================
-- VIEWS ÚTEIS (opcional — facilitam queries futuras do dashboard)
-- ============================================================

-- Gastos agrupados por mês (meus)
CREATE OR REPLACE VIEW v_gastos_mes AS
SELECT
  user_id,
  dono,
  DATE_TRUNC('month', data)::DATE AS mes,
  categoria,
  SUM(valor) AS total,
  COUNT(*) AS qtd
FROM gastos
GROUP BY user_id, dono, DATE_TRUNC('month', data), categoria;

-- Entradas agrupadas por mês
CREATE OR REPLACE VIEW v_entradas_mes AS
SELECT
  user_id,
  DATE_TRUNC('month', data)::DATE AS mes,
  origem,
  SUM(valor) AS total,
  COUNT(*) AS qtd
FROM entradas
GROUP BY user_id, DATE_TRUNC('month', data), origem;
