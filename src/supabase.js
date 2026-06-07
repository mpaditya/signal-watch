// AR-1 (Supabase migration): Single entry point for all Supabase interactions.
// If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars are not set, every
// function falls back to localStorage so the app works fully offline.
//
// Think of this module like a Python class with two implementations:
//   - CloudStore: talks to Supabase REST API
//   - LocalStore: reads/writes localStorage
// The exported functions pick the right implementation at runtime based on whether
// the env vars are present. Callers never need to check — they always get a result.

// ─── Configuration ────────────────────────────────────────────────────────────
// Vite exposes .env vars prefixed VITE_ via import.meta.env at build time.
// When not set, these evaluate to undefined, which is safe — we check isConfigured().
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

// True when Supabase credentials are present (both URL and anon key required)
export function isSupabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON)
}

// ─── Raw REST helper ──────────────────────────────────────────────────────────
// Supabase exposes a PostgREST-compatible REST API at /rest/v1/<table>.
// We use the REST API directly instead of the @supabase/supabase-js SDK to avoid
// adding a dependency. PostgREST is simple: GET/POST/PATCH/DELETE with
// Authorization and apikey headers.
//
// Python analogy: this is like requests.Session() pre-loaded with auth headers.
async function supabaseRequest(method, table, body = null, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`
  // Authenticate as the logged-in USER (their access_token), not the anon role, so
  // Postgres sees auth.uid() = their id and RLS policies (auth.uid() = user_id) pass.
  // Fall back to the anon key only when there's no session (unauthenticated reads).
  // BUG FIX: this previously always sent the anon key, so every authenticated
  // INSERT/UPDATE was rejected by RLS and silently fell back to the offline queue.
  const token = getSession()?.access_token ?? SUPABASE_ANON
  // PostgREST upsert: a plain POST with a duplicate primary key returns 409 Conflict.
  // To make POST behave as INSERT-or-UPDATE we must add resolution=merge-duplicates
  // whenever the caller passed an on_conflict target. Without this, every write-through
  // of an existing goal/config row failed.
  const isUpsert = params.includes('on_conflict')
  const headers = {
    'apikey':        SUPABASE_ANON,
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Prefer':        method === 'POST'
      ? (isUpsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation')
      : '',
  }
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  let res = await fetch(url, opts)
  // Access tokens expire (~1h). On a 401, try a one-time refresh using the stored
  // refresh_token, then retry the request with the new token. Without this, every
  // write/read silently failed once the token aged out and decisions piled up offline.
  if (res.status === 401 && getSession()?.refresh_token) {
    const refreshed = await refreshSession()
    if (refreshed) {
      opts.headers.Authorization = `Bearer ${getSession().access_token}`
      res = await fetch(url, opts)
    }
  }
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Supabase ${method} ${table}: HTTP ${res.status} — ${err}`)
  }
  // DELETE returns 204 No Content; everything else returns JSON
  return res.status === 204 ? null : res.json()
}

// Exchange the stored refresh_token for a fresh access_token (Supabase token rotation).
// Returns true on success (session updated in place), false otherwise.
export async function refreshSession() {
  const rt = getSession()?.refresh_token
  if (!isSupabaseConfigured() || !rt) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) return false
    const json = await res.json()
    if (!json.access_token) return false
    setSession({
      access_token:  json.access_token,
      refresh_token: json.refresh_token || rt,
      user: getSession()?.user || { id: json.user?.id, email: json.user?.email },
    })
    return true
  } catch {
    return false
  }
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
// Auth session persisted in sessionStorage: survives page reload but is cleared when
// the browser tab closes. Chosen over localStorage to shrink the XSS exposure window
// (token isn't retained across browser restarts) while still fixing the "re-login on
// every reload" annoyance of a purely in-memory session. NOT localStorage (would persist
// the token indefinitely). Python analogy: a module-level singleton that also writes a
// backup copy to a per-tab scratch store so a reload can rehydrate it.
const SESSION_KEY = 'artha_auth_session'

function loadSessionFromStorage() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Rehydrate on module load so a page reload restores the logged-in session.
let _session = loadSessionFromStorage()

export function getSession()              { return _session }
export function setSession(session)       {
  _session = session
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}
export function clearSession()            {
  _session = null
  try { sessionStorage.removeItem(SESSION_KEY) } catch {}
}
export function isAuthenticated()         { return !!_session }

// Get the authenticated user's ID (used as user_id in all table rows for RLS)
export function getUserId()               { return _session?.user?.id ?? null }

// Get the auth header for authenticated requests.
// When logged in, use the user's JWT instead of the anon key.
function authHeader() {
  const token = _session?.access_token ?? SUPABASE_ANON
  return {
    'apikey':        SUPABASE_ANON,
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  }
}

// ─── Auth API ─────────────────────────────────────────────────────────────────
// Send a magic link email. Supabase Auth uses OTP flow for magic links.
// Returns { error } or null on success.
export async function sendMagicLink(email) {
  if (!isSupabaseConfigured()) return { error: 'Supabase not configured' }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method:  'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, create_user: true }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { error: err.error_description || err.msg || 'Failed to send magic link' }
    }
    return null // success
  } catch (e) {
    return { error: e.message }
  }
}

// Verify OTP token from magic link URL fragment.
// Called on app load — checks URL hash for #access_token or token_hash.
// Returns { session, error } where session = { access_token, user: { id, email } }
export async function verifyMagicLinkToken(token, type = 'magiclink') {
  if (!isSupabaseConfigured()) return { session: null, error: 'Supabase not configured' }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method:  'POST',
      headers: { 'apikey': SUPABASE_ANON, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, type }),
    })
    const json = await res.json()
    if (!res.ok) return { session: null, error: json.error_description || json.msg || 'Verification failed' }
    const session = {
      access_token:  json.access_token,
      refresh_token: json.refresh_token,
      user: { id: json.user.id, email: json.user.email },
    }
    return { session, error: null }
  } catch (e) {
    return { session: null, error: e.message }
  }
}

// ─── Goals table ──────────────────────────────────────────────────────────────
// localStorage key: 'artha_goals_v4'
// Supabase table: goals (schema in supabase/migrations/001_initial_schema.sql)
//
// fetchGoals() — returns array of goal rows for the current user.
// upsertGoal(goal) — insert or update a goal row (matched by id).
// deleteGoal(id) — soft-delete: sets status = 'abandoned'.

export async function fetchGoals() {
  if (!isSupabaseConfigured() || !isAuthenticated()) {
    // Fallback: read from localStorage (artha_goals_v4 schema)
    try {
      const s = localStorage.getItem('artha_goals_v4')
      return s ? JSON.parse(s) : []
    } catch { return [] }
  }
  try {
    const userId = getUserId()
    return await supabaseRequest('GET', 'goals', null,
      `?user_id=eq.${userId}&status=neq.deleted&order=created_at.asc`)
  } catch (e) {
    console.warn('[supabase] fetchGoals failed, using localStorage:', e.message)
    try { const s = localStorage.getItem('artha_goals_v4'); return s ? JSON.parse(s) : [] } catch { return [] }
  }
}

// Map an app goal object (legacy goalsConfig entry OR v4 goal) onto the `goals` table
// columns. The full rich object is preserved in config_json so nothing is lost; the
// scalar columns (type, name, target_lakh, …) are extracted for querying + SW-14 status.
// BUG FIX: upsertGoal previously POSTed the raw goal object, whose keys (label, yearsLeft,
// funds, emoji, …) don't match the table columns, so every insert was rejected with a 400.
export function goalToRow(goal) {
  // Total monthly SIP: legacy funds are { fid: amount }, v4 funds are { fid: { monthlySIP } }
  let sip = 0
  if (goal.funds) {
    for (const v of Object.values(goal.funds)) {
      sip += typeof v === 'number' ? v : Number(v?.monthlySIP || 0)
    }
  }
  return {
    id:          goal.id,
    user_id:     getUserId(),
    type:        goal.goalType || goal.type || 'retirement',
    name:        goal.label || goal.name || 'Goal',
    target_lakh: Number(goal.targetLakh ?? 0),
    horizon:     Number(goal.totalYears ?? goal.yearsLeft ?? 0),
    years_left:  Number(goal.yearsLeft ?? goal.totalYears ?? 0),
    start_date:  goal.startDate || null,
    corpus:      Number(goal.currentCorpus ?? 0),
    sip_amount:  sip,
    config_json: goal,
    status:      goal.status || 'active',
  }
}

export async function upsertGoal(goal, { cache = true } = {}) {
  // Write to the localStorage extra-goals cache (write-through, DEC-048) — UNLESS the
  // caller is syncing primary goalsConfig goals to the goals table, in which case we must
  // not pollute artha_goals_v4 with them (cache:false).
  if (cache) {
    try {
      const existing = JSON.parse(localStorage.getItem('artha_goals_v4') || '[]')
      const idx = existing.findIndex(g => g.id === goal.id)
      if (idx >= 0) existing[idx] = goal; else existing.push(goal)
      localStorage.setItem('artha_goals_v4', JSON.stringify(existing))
    } catch {}
  }

  if (!isSupabaseConfigured() || !isAuthenticated()) return { data: goal, error: null }
  try {
    const row = goalToRow(goal)
    const data = await supabaseRequest('POST', 'goals', row, '?on_conflict=id')
    return { data, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

export async function updateGoalStatus(id, status) {
  // Update localStorage
  try {
    const existing = JSON.parse(localStorage.getItem('artha_goals_v4') || '[]')
    const goal = existing.find(g => g.id === id)
    if (goal) { goal.status = status; localStorage.setItem('artha_goals_v4', JSON.stringify(existing)) }
  } catch {}

  if (!isSupabaseConfigured() || !isAuthenticated()) return { error: null }
  try {
    await supabaseRequest('PATCH', `goals?id=eq.${id}&user_id=eq.${getUserId()}`, { status })
    return { error: null }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── Config table ─────────────────────────────────────────────────────────────
// localStorage key: 'artha_config_v1'
// Supabase table: config (one row per user; key=value pairs as JSONB)

export async function fetchConfig() {
  if (!isSupabaseConfigured() || !isAuthenticated()) {
    try { const s = localStorage.getItem('artha_config_v1'); return s ? JSON.parse(s) : null } catch { return null }
  }
  try {
    const userId = getUserId()
    const rows = await supabaseRequest('GET', 'config', null, `?user_id=eq.${userId}&limit=1`)
    return rows?.[0]?.value ?? null
  } catch (e) {
    console.warn('[supabase] fetchConfig failed, using localStorage:', e.message)
    try { const s = localStorage.getItem('artha_config_v1'); return s ? JSON.parse(s) : null } catch { return null }
  }
}

export async function saveConfig(value) {
  // Write-through to localStorage
  try { localStorage.setItem('artha_config_v1', JSON.stringify(value)) } catch {}

  if (!isSupabaseConfigured() || !isAuthenticated()) return { error: null }
  try {
    const userId = getUserId()
    await supabaseRequest('POST', 'config', { user_id: userId, value },
      '?on_conflict=user_id')
    return { error: null }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── User blobs (AR-1b) ─────────────────────────────────────────────────────────
// Generic per-user key-value store for localStorage blobs the goals/config tables can't
// hold. Each blob is identified by its localStorage key (e.g. 'artha_goal_corpus',
// 'artha_funds_v1') so callers reuse the same key on both sides. value is arbitrary JSON.
//
// fetchUserBlob(key)        — returns the cloud value (or localStorage fallback), else null.
// saveUserBlob(key, value)  — write-through: always localStorage, plus cloud when signed in.
//
// Python analogy: a dict[user][key] = json backed by Postgres, with a localStorage mirror.

export async function fetchUserBlob(key) {
  if (!isSupabaseConfigured() || !isAuthenticated()) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null } catch { return null }
  }
  try {
    const userId = getUserId()
    const rows = await supabaseRequest('GET', 'user_blobs', null,
      `?user_id=eq.${userId}&key=eq.${encodeURIComponent(key)}&limit=1`)
    return rows?.[0]?.value ?? null
  } catch (e) {
    console.warn(`[supabase] fetchUserBlob(${key}) failed, using localStorage:`, e.message)
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null } catch { return null }
  }
}

export async function saveUserBlob(key, value) {
  // Write-through to localStorage first so the app is correct even offline.
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}

  if (!isSupabaseConfigured() || !isAuthenticated()) return { error: null }
  try {
    // Composite-key upsert: on_conflict=user_id,key → merge-duplicates (see supabaseRequest).
    await supabaseRequest('POST', 'user_blobs',
      { user_id: getUserId(), key, value }, '?on_conflict=user_id,key')
    return { error: null }
  } catch (e) {
    return { error: e.message }
  }
}

// ─── Signal history table ─────────────────────────────────────────────────────
// Written by GitHub Actions (scripts/alert.py) using service role key.
// Read by React app using user's anon key (RLS: user can only read their own rows).
// See supabase/migrations/002_signal_history.sql

export async function fetchSignalHistory(days = 30) {
  if (!isSupabaseConfigured() || !isAuthenticated()) return []
  try {
    const userId = getUserId()
    const since = new Date(Date.now() - days * 86400000).toISOString()
    return await supabaseRequest('GET', 'signal_history', null,
      `?user_id=eq.${userId}&created_at=gte.${since}&order=created_at.desc&limit=500`)
  } catch (e) {
    console.warn('[supabase] fetchSignalHistory failed:', e.message)
    return []
  }
}

// ─── Decisions audit log ──────────────────────────────────────────────────────
// See src/decisions.js for the logDecision() API and supabase/migrations/003_decisions.sql

export async function insertDecision(row) {
  if (!isSupabaseConfigured() || !isAuthenticated()) return { error: 'not configured' }
  try {
    const data = await supabaseRequest('POST', 'decisions', { ...row, user_id: getUserId() })
    return { data, error: null }
  } catch (e) {
    return { data: null, error: e.message }
  }
}

export async function fetchDecisions(limit = 100) {
  if (!isSupabaseConfigured() || !isAuthenticated()) return []
  try {
    const userId = getUserId()
    return await supabaseRequest('GET', 'decisions', null,
      `?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`)
  } catch (e) {
    console.warn('[supabase] fetchDecisions failed:', e.message)
    return []
  }
}

// ─── Migration helper ─────────────────────────────────────────────────────────
// Called once after auth succeeds if Supabase is freshly configured.
// Reads existing localStorage data and upserts it to Supabase.
// Returns { success, errors }
export async function migrateLocalStorageToSupabase() {
  if (!isSupabaseConfigured() || !isAuthenticated()) {
    return { success: false, errors: ['Not configured or not authenticated'] }
  }

  const errors = []

  // Migrate config (artha_config_v1)
  try {
    const cfg = localStorage.getItem('artha_config_v1')
    if (cfg) await saveConfig(JSON.parse(cfg))
  } catch (e) { errors.push(`config: ${e.message}`) }

  // Migrate PRIMARY goals (artha_config_v1 — retirement, education, etc., the goals the
  // user actually edits). These were previously only saved to the config blob, leaving the
  // goals table empty. Now also upsert each as a normalized row (cache:false so we don't
  // duplicate them into the artha_goals_v4 extra-goals cache).
  try {
    const cfg = localStorage.getItem('artha_config_v1')
    if (cfg) {
      const goalsConfig = JSON.parse(cfg)
      // Merge in corpus amounts (artha_goal_corpus) so the goals-table corpus column is
      // seeded with the user's real invested values, not 0.
      let corpusMap = {}
      try { corpusMap = JSON.parse(localStorage.getItem('artha_goal_corpus') || '{}') } catch {}
      for (const [id, g] of Object.entries(goalsConfig)) {
        const { error } = await upsertGoal({ id, ...g, currentCorpus: corpusMap[id]?.amount ?? 0 }, { cache: false })
        if (error) errors.push(`goal ${id}: ${error}`)
      }
    }
  } catch (e) { errors.push(`primary goals: ${e.message}`) }

  // Migrate EXTRA goals (artha_goals_v4 — created via "+ New Goal", v4 schema)
  try {
    const goals = localStorage.getItem('artha_goals_v4')
    if (goals) {
      const parsed = JSON.parse(goals)
      // goals may be array or object — normalise
      const arr = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([id, g]) => ({ id, ...g }))
      for (const goal of arr) {
        const { error } = await upsertGoal(goal)
        if (error) errors.push(`goal ${goal.id}: ${error}`)
      }
    }
  } catch (e) { errors.push(`goals: ${e.message}`) }

  // AR-1b: migrate the composite/overlay blobs that the goals + config tables can't hold:
  //   artha_goal_corpus — corpus amounts, status, per-fund rates, RD/FD instruments, and
  //                       the legacy goalType/startDate/totalYears overrides.
  //   artha_funds_v1    — the SW-15 dynamic fund universe overlay ({ added, archivedIds }).
  // Without this, a second device (or a browser-wiped one) lost all of it on first login.
  for (const key of ['artha_goal_corpus', 'artha_funds_v1']) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const { error } = await saveUserBlob(key, JSON.parse(raw))
        if (error) errors.push(`${key}: ${error}`)
      }
    } catch (e) { errors.push(`${key}: ${e.message}`) }
  }

  // Migrate abandoned goal IDs → status = 'abandoned' (SW-14)
  try {
    const abandoned = localStorage.getItem('artha_abandoned_goals')
    if (abandoned) {
      const ids = JSON.parse(abandoned)
      for (const id of ids) {
        const { error } = await updateGoalStatus(id, 'abandoned')
        if (error) errors.push(`abandon ${id}: ${error}`)
      }
    }
  } catch (e) { errors.push(`abandoned: ${e.message}`) }

  return { success: errors.length === 0, errors }
}
