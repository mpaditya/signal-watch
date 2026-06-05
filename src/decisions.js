// AR-4 (Decisions audit log): Every user investment decision is logged here.
// Provides logDecision() as the single entry point from all UI components.
//
// When Supabase is configured + user is authenticated: inserts a row into the
// `decisions` Supabase table (see supabase/migrations/003_decisions.sql).
//
// When offline or not authenticated: queues the decision in localStorage under
// 'artha_decision_queue'. The queue is flushed on next successful auth.
//
// Python analogy: this module is like a write-ahead log. Writes land in a local
// queue first (cheap, never fails), then get flushed to the real store async.
//
// Valid action_type values (mirrors decisions table enum):
//   BUY_DIP     — user decided to buy during a dip signal
//   SIP_CHANGE  — user changed a SIP amount
//   GOAL_CREATE — user created a new goal
//   GOAL_UPDATE — user updated goal parameters
//   GOAL_ABANDON — user archived/abandoned a goal
//   GOAL_ACHIEVE — user marked a goal as achieved

import { insertDecision, isSupabaseConfigured, isAuthenticated } from './supabase'

// Valid action types — exported so callers can use constants instead of strings
export const ACTION_TYPES = {
  BUY_DIP:      'BUY_DIP',
  SIP_CHANGE:   'SIP_CHANGE',
  GOAL_CREATE:  'GOAL_CREATE',
  GOAL_UPDATE:  'GOAL_UPDATE',
  GOAL_ABANDON: 'GOAL_ABANDON',
  GOAL_ACHIEVE: 'GOAL_ACHIEVE',
}

const QUEUE_KEY = 'artha_decision_queue'

// ─── Offline queue helpers ────────────────────────────────────────────────────
function loadQueue() {
  try { const s = localStorage.getItem(QUEUE_KEY); return s ? JSON.parse(s) : [] }
  catch { return [] }
}
function saveQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch {}
}
function enqueue(row) {
  const queue = loadQueue()
  queue.push({ ...row, queued_at: new Date().toISOString() })
  saveQueue(queue)
}

// ─── Main API ─────────────────────────────────────────────────────────────────
// logDecision(actionType, payload) — log a user decision.
//
// actionType: one of ACTION_TYPES values
// payload: {
//   scheme_code?    — mfapi.in scheme code (for fund decisions)
//   fund_name?      — anonymised label ('Small Cap A') or display name
//   amount?         — rupees committed (number)
//   signal_at_time? — signal label at time of decision ('Buy Dip', 'Watch', etc.)
//   notes?          — free-text user notes
// }
//
// Returns { data, error, queued } where:
//   queued=true means decision was saved to offline queue (no Supabase yet)
export async function logDecision(actionType, payload = {}) {
  // Validate action type
  if (!Object.values(ACTION_TYPES).includes(actionType)) {
    console.warn(`[decisions] Unknown action_type: ${actionType}`)
    return { data: null, error: `Invalid action_type: ${actionType}`, queued: false }
  }

  const row = {
    action_type:    actionType,
    scheme_code:    payload.scheme_code    ?? null,
    fund_name:      payload.fund_name      ?? null,
    amount:         payload.amount         ?? null,
    signal_at_time: payload.signal_at_time ?? null,
    notes:          payload.notes          ?? null,
    // outcome_30d and outcome_90d are always null at logging time
    // They are filled later by a background job
    outcome_30d:    null,
    outcome_90d:    null,
    created_at:     new Date().toISOString(),
  }

  // Always log to console for SE-7 (LLM traceability partial implementation)
  console.log('[decisions] Logging:', actionType, payload)

  // Try Supabase first (if configured + authenticated)
  if (isSupabaseConfigured() && isAuthenticated()) {
    const { data, error } = await insertDecision(row)
    if (!error) {
      return { data, error: null, queued: false }
    }
    // Supabase write failed — fall through to offline queue
    console.warn('[decisions] Supabase insert failed, queueing offline:', error)
  }

  // Offline queue: decision is saved locally, will be flushed later
  enqueue(row)
  return { data: row, error: null, queued: true }
}

// ─── Queue flush ──────────────────────────────────────────────────────────────
// Call this after successful auth to drain the offline queue to Supabase.
// Returns { flushed, errors } counts.
export async function flushDecisionQueue() {
  const queue = loadQueue()
  if (!queue.length) return { flushed: 0, errors: 0 }
  if (!isSupabaseConfigured() || !isAuthenticated()) return { flushed: 0, errors: queue.length }

  let flushed = 0, errors = 0
  const remaining = []

  for (const row of queue) {
    const { error } = await insertDecision(row)
    if (error) { errors++; remaining.push(row) }
    else flushed++
  }

  saveQueue(remaining)
  console.log(`[decisions] Flushed ${flushed} queued decisions (${errors} failed)`)
  return { flushed, errors }
}

// Inspect the offline queue (for testing / debugging)
export function getPendingQueue() {
  return loadQueue()
}

// Clear the queue (e.g. after migration wipes old data)
export function clearDecisionQueue() {
  try { localStorage.removeItem(QUEUE_KEY) } catch {}
}
