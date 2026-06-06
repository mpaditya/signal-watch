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
  const headers = {
    'apikey':        SUPABASE_ANON,
    'Authorization': `Bearer ${SUPABASE_ANON}`,
    'Content-Type':  'application/json',
    'Prefer':        method === 'POST' ? 'return=representation' : '',
  }
  const opts = { method, headers }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Supabase ${method} ${table}: HTTP ${res.status} — ${err}`)
  }
  // DELETE returns 204 No Content; everything else returns JSON
  return res.status === 204 ? null : res.json()
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

export async function upsertGoal(goal) {
  // Always write to localStorage (write-through cache — DEC-048)
  try {
    const existing = JSON.parse(localStorage.getItem('artha_goals_v4') || '[]')
    const idx = existing.findIndex(g => g.id === goal.id)
    if (idx >= 0) existing[idx] = goal; else existing.push(goal)
    localStorage.setItem('artha_goals_v4', JSON.stringify(existing))
  } catch {}

  if (!isSupabaseConfigured() || !isAuthenticated()) return { data: goal, error: null }
  try {
    const row = { ...goal, user_id: getUserId() }
    const data = await supabaseRequest('POST', 'goals', row,
      '?on_conflict=id')
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

  // Migrate goals (artha_goals_v4)
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
