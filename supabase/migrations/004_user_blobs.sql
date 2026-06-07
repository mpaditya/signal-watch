-- AR-1b (multi-device cloud durability): generic per-user key-value blob store.
-- Run this in: Supabase dashboard → SQL Editor (after 001–003).
--
-- WHY: AR-1 synced the goals table + config blob, but three pieces of state were still
-- localStorage-only (so they never reached a second device or survived a browser wipe):
--   • artha_goal_corpus — per-goal corpus amounts, status, assumedCAGR, AND the SW-16
--     composite data the legacy goalsConfig can't hold: per-fund rates, RD/FD instruments,
--     and the goalType/startDate/totalYears overrides for legacy goals.
--   • artha_funds_v1   — the SW-15 dynamic fund universe overlay ({ added, archivedIds }).
--
-- Rather than add a bespoke table/columns per blob, this is a single key-value table:
-- one row per (user, localStorage-key). The value is JSONB so each blob's shape can evolve
-- without ALTER TABLE — exactly like the existing `config` table, but keyed by `key` so we
-- can store many named blobs per user.

CREATE TABLE IF NOT EXISTS user_blobs (
  user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key        TEXT         NOT NULL,            -- the localStorage key, e.g. 'artha_goal_corpus'
  value      JSONB        NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- Reuse the update_updated_at() trigger function defined in 001_initial_schema.sql.
CREATE TRIGGER user_blobs_updated_at
  BEFORE UPDATE ON user_blobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Same as every other table: a user can only touch their own rows.
ALTER TABLE user_blobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_blobs_select_own" ON user_blobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_blobs_insert_own" ON user_blobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_blobs_update_own" ON user_blobs FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_blobs_delete_own" ON user_blobs FOR DELETE USING (auth.uid() = user_id);
