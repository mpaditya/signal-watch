-- AR-4: decisions audit log table
-- Every user investment decision is logged here for retrospective analysis.
-- outcome_30d and outcome_90d are filled in later by a background job when
-- the NAV data for those dates becomes available.
--
-- action_type enum values:
--   BUY_DIP    — user decided to buy a fund during a dip signal
--   SIP_CHANGE — user changed a SIP amount
--   GOAL_CREATE  — user created a new goal
--   GOAL_UPDATE  — user updated goal parameters
--   GOAL_ABANDON — user archived/abandoned a goal

CREATE TYPE decision_action AS ENUM (
  'BUY_DIP',
  'SIP_CHANGE',
  'GOAL_CREATE',
  'GOAL_UPDATE',
  'GOAL_ABANDON',
  'GOAL_ACHIEVE'
);

CREATE TABLE IF NOT EXISTS decisions (
  id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  user_id          UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What happened
  action_type      decision_action NOT NULL,

  -- Fund context (nullable — goal actions don't have a fund)
  scheme_code      TEXT,           -- e.g. '118989' (mfapi.in scheme code)
  fund_name        TEXT,           -- anonymised label ('Small Cap A') or full name

  -- Amount context (nullable — goal actions may not have a specific amount)
  amount           NUMERIC,        -- rupees committed (if BUY_DIP or SIP_CHANGE)

  -- Signal context (what the app showed when the user made the decision)
  signal_at_time   TEXT,           -- 'Buy Dip' | 'Watch' | 'Strong Run' | 'Neutral'

  -- Free-text notes from user
  notes            TEXT,

  -- Outcome tracking — filled by a future background job
  -- outcome_30d: NAV return 30 days after decision date (%)
  -- outcome_90d: NAV return 90 days after decision date (%)
  outcome_30d      NUMERIC,
  outcome_90d      NUMERIC
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS decisions_user_date_idx
  ON decisions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS decisions_action_idx
  ON decisions(user_id, action_type);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

-- Users can SELECT, INSERT their own decisions
CREATE POLICY "decisions_select_own" ON decisions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "decisions_insert_own" ON decisions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Outcome columns are updated by a service-role background job (no user policy needed)
-- Service role bypasses RLS for UPDATE operations.
