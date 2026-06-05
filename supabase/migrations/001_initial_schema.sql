-- AR-1: Initial Supabase schema for Project Artha
-- Run this in: Supabase dashboard → SQL Editor
--
-- Tables:
--   goals   — mirrors artha_goals_v4 localStorage schema
--   config  — mirrors artha_config_v1 (funds array + SIP config)
--
-- All tables have Row Level Security (RLS) enabled.
-- Users can only read and write their own rows (auth.uid() = user_id).

-- ─── Enable UUID extension ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── goals table ─────────────────────────────────────────────────────────────
-- Mirrors the artha_goals_v4 localStorage schema.
-- status enum: active | paused | abandoned | achieved (SW-14)
CREATE TYPE goal_status AS ENUM ('active', 'paused', 'abandoned', 'achieved');

CREATE TABLE IF NOT EXISTS goals (
  id           TEXT         PRIMARY KEY,  -- user-assigned ID (e.g. 'retirement', 'education')
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Core goal fields (mirrors GoalForm.jsx schema)
  type         TEXT         NOT NULL,     -- car | house | travel | education | wedding | retirement | emergency
  name         TEXT         NOT NULL,
  target_lakh  NUMERIC      NOT NULL,     -- target corpus in ₹ Lakhs
  horizon      INTEGER      NOT NULL,     -- total horizon in years at goal creation
  years_left   INTEGER      NOT NULL,     -- years remaining (user-maintained)
  start_date   DATE,                      -- when SIPs started
  corpus       NUMERIC      DEFAULT 0,    -- current corpus in ₹
  sip_amount   NUMERIC      DEFAULT 0,    -- total monthly SIP in ₹

  -- Full goal config as JSONB (funds, sipDates, emoji, label, etc.)
  -- We store the rich config object here so the migration helper can upsert
  -- the full artha_goals_v4 object without schema changes.
  config_json  JSONB,

  status       goal_status  NOT NULL DEFAULT 'active',

  -- Soft-delete sentinel: keeps the row in DB for audit even after abandonment
  deleted_at   TIMESTAMPTZ
);

-- Index for fast per-user queries (most queries filter by user_id)
CREATE INDEX IF NOT EXISTS goals_user_id_idx ON goals(user_id);
CREATE INDEX IF NOT EXISTS goals_status_idx  ON goals(user_id, status);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── config table ─────────────────────────────────────────────────────────────
-- One row per user. Stores the funds array + SIP config (artha_config_v1).
-- value is JSONB so the full config object is stored without a rigid column schema —
-- the config format can evolve without ALTER TABLE.
CREATE TABLE IF NOT EXISTS config (
  user_id    UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  value      JSONB        NOT NULL DEFAULT '{}'
);

CREATE TRIGGER config_updated_at
  BEFORE UPDATE ON config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- RLS ensures users can only access their own data.
-- auth.uid() is Supabase's built-in function that returns the JWT user ID.

ALTER TABLE goals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- goals: users can SELECT, INSERT, UPDATE, DELETE only their own rows
CREATE POLICY "goals_select_own" ON goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals_insert_own" ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_update_own" ON goals FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_delete_own" ON goals FOR DELETE USING (auth.uid() = user_id);

-- config: users can SELECT, INSERT, UPDATE only their own row
CREATE POLICY "config_select_own" ON config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "config_insert_own" ON config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "config_update_own" ON config FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── active_goals view ────────────────────────────────────────────────────────
-- Convenience view that filters out non-active goals.
-- SW-14: simplifies queries in the React app — always reads from active_goals,
-- never needs to remember to filter status.
CREATE OR REPLACE VIEW active_goals AS
  SELECT * FROM goals WHERE status = 'active' AND deleted_at IS NULL;
