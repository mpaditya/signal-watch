-- ============================================================
-- Project Artha — ALL MIGRATIONS COMBINED (Sprint 3)
-- Paste this entire file into: Supabase dashboard → SQL Editor → Run
-- Safe to re-run: uses CREATE IF NOT EXISTS / CREATE OR REPLACE throughout
-- ============================================================

-- ─── 001: Initial schema (goals + config) ─────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE goal_status AS ENUM ('active', 'paused', 'abandoned', 'achieved');

CREATE TABLE IF NOT EXISTS goals (
  id           TEXT         PRIMARY KEY,
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  type         TEXT         NOT NULL,
  name         TEXT         NOT NULL,
  target_lakh  NUMERIC      NOT NULL,
  horizon      INTEGER      NOT NULL,
  years_left   INTEGER      NOT NULL,
  start_date   DATE,
  corpus       NUMERIC      DEFAULT 0,
  sip_amount   NUMERIC      DEFAULT 0,
  config_json  JSONB,
  status       goal_status  NOT NULL DEFAULT 'active',
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS goals_user_id_idx ON goals(user_id);
CREATE INDEX IF NOT EXISTS goals_status_idx  ON goals(user_id, status);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS goals_updated_at ON goals;
CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS config (
  user_id    UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  value      JSONB        NOT NULL DEFAULT '{}'
);

DROP TRIGGER IF EXISTS config_updated_at ON config;
CREATE TRIGGER config_updated_at
  BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE goals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_select_own" ON goals;
DROP POLICY IF EXISTS "goals_insert_own" ON goals;
DROP POLICY IF EXISTS "goals_update_own" ON goals;
DROP POLICY IF EXISTS "goals_delete_own" ON goals;

CREATE POLICY "goals_select_own" ON goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals_insert_own" ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_update_own" ON goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_delete_own" ON goals FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "config_select_own" ON config;
DROP POLICY IF EXISTS "config_insert_own" ON config;
DROP POLICY IF EXISTS "config_update_own" ON config;

CREATE POLICY "config_select_own" ON config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "config_insert_own" ON config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "config_update_own" ON config FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE VIEW active_goals AS
  SELECT * FROM goals WHERE status = 'active' AND deleted_at IS NULL;

-- ─── 002: signal_history ──────────────────────────────────
CREATE TABLE IF NOT EXISTS signal_history (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  user_id          UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheme_code      TEXT         NOT NULL,
  fund_name        TEXT         NOT NULL,
  category         TEXT,
  signal           TEXT         NOT NULL,
  dip_depth        NUMERIC,
  pe_ratio         NUMERIC,
  conviction_score NUMERIC,
  nav              NUMERIC
);

CREATE INDEX IF NOT EXISTS signal_history_user_date_idx
  ON signal_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS signal_history_fund_idx
  ON signal_history(user_id, scheme_code, created_at DESC);

ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signal_history_select_own" ON signal_history;
CREATE POLICY "signal_history_select_own"
  ON signal_history FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 003: decisions audit log ─────────────────────────────
CREATE TYPE decision_action AS ENUM (
  'BUY_DIP',
  'SIP_CHANGE',
  'GOAL_CREATE',
  'GOAL_UPDATE',
  'GOAL_ABANDON',
  'GOAL_ACHIEVE'
);

CREATE TABLE IF NOT EXISTS decisions (
  id               UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  user_id          UUID             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type      decision_action  NOT NULL,
  scheme_code      TEXT,
  fund_name        TEXT,
  amount           NUMERIC,
  signal_at_time   TEXT,
  notes            TEXT,
  outcome_30d      NUMERIC,
  outcome_90d      NUMERIC
);

CREATE INDEX IF NOT EXISTS decisions_user_date_idx
  ON decisions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS decisions_action_idx
  ON decisions(user_id, action_type);

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decisions_select_own" ON decisions;
DROP POLICY IF EXISTS "decisions_insert_own" ON decisions;

CREATE POLICY "decisions_select_own" ON decisions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "decisions_insert_own" ON decisions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── Done! All 5 tables + RLS created. ───────────────────
SELECT 'Migration complete' AS status,
  (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('goals','config','signal_history','decisions')) AS tables_created;
