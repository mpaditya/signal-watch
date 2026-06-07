-- AR-3: signal_history table
-- Written by GitHub Actions (scripts/alert.py) using the service role key.
-- Read by React app using user's JWT.
--
-- RLS policies:
--   - Service role key (used by GH Actions): bypasses RLS entirely — can INSERT any row.
--   - Anon key (used by React app after auth): user can only SELECT their own rows.
--
-- Because GH Actions writes rows on behalf of a user (by user_id), the user must
-- first exist in auth.users. In practice: user logs in once via magic link (AR-2),
-- then GH Actions writes their daily signal rows by looking up their user_id from
-- ALERT_EMAIL via the Supabase Admin API (or a service-role SELECT on auth.users).

CREATE TABLE IF NOT EXISTS signal_history (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Fund identity
  scheme_code     TEXT         NOT NULL,
  fund_name       TEXT         NOT NULL,
  category        TEXT,                   -- Small Cap | Mid Cap | etc.

  -- Signal snapshot
  signal          TEXT         NOT NULL,  -- BUY_DIP | WATCH | STRONG_RUN | NEUTRAL
  dip_depth       NUMERIC,                -- % below rolling average (negative = dip)
  pe_ratio        NUMERIC,                -- market P/E at time of signal (index-matched)
  conviction_score NUMERIC,              -- 0–100 conviction score from DipPrioritisation
  nav             NUMERIC                 -- NAV at time of signal
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS signal_history_user_date_idx
  ON signal_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS signal_history_fund_idx
  ON signal_history(user_id, scheme_code, created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE signal_history ENABLE ROW LEVEL SECURITY;

-- React app (anon key): users can only read their own signal history
CREATE POLICY "signal_history_select_own"
  ON signal_history FOR SELECT
  USING (auth.uid() = user_id);

-- GH Actions (service role key): bypasses RLS entirely — service role can INSERT all rows.
-- No explicit INSERT policy needed for service role (service role ignores RLS).
-- If using anon key in GH Actions (not recommended), add:
-- CREATE POLICY "signal_history_insert_service" ON signal_history FOR INSERT WITH CHECK (true);
