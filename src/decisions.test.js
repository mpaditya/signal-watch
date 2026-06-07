// AR-4: Unit tests for src/decisions.js
// Tests: logDecision for each action_type, offline queueing, queue flush.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock supabase.js so tests don't need real credentials
vi.mock('./supabase', () => ({
  insertDecision:      vi.fn(),
  isSupabaseConfigured: vi.fn(() => false),
  isAuthenticated:     vi.fn(() => false),
}))

import {
  logDecision, flushDecisionQueue, getPendingQueue, clearDecisionQueue, ACTION_TYPES
} from './decisions.js'
import { insertDecision, isSupabaseConfigured, isAuthenticated } from './supabase'

describe('decisions.js — offline queueing (Supabase not configured)', () => {
  beforeEach(() => {
    localStorage.clear()
    clearDecisionQueue()
    isSupabaseConfigured.mockReturnValue(false)
    isAuthenticated.mockReturnValue(false)
    insertDecision.mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => { vi.clearAllMocks() })

  it('logDecision BUY_DIP queues decision in localStorage', async () => {
    const { queued, error } = await logDecision(ACTION_TYPES.BUY_DIP, {
      scheme_code: '118989',
      fund_name: 'Small Cap A',
      amount: 5000,
      signal_at_time: 'Buy Dip',
    })
    expect(error).toBeNull()
    expect(queued).toBe(true)
    const queue = getPendingQueue()
    expect(queue.length).toBe(1)
    expect(queue[0].action_type).toBe('BUY_DIP')
    expect(queue[0].amount).toBe(5000)
  })

  it('logDecision SIP_CHANGE queues correctly', async () => {
    const { queued } = await logDecision(ACTION_TYPES.SIP_CHANGE, {
      fund_name: 'Mid Cap A',
      amount: 3000,
      notes: 'Increased SIP after dip',
    })
    expect(queued).toBe(true)
    const queue = getPendingQueue()
    expect(queue[0].action_type).toBe('SIP_CHANGE')
    expect(queue[0].notes).toBe('Increased SIP after dip')
  })

  it('logDecision GOAL_CREATE queues with null fund fields', async () => {
    const { queued } = await logDecision(ACTION_TYPES.GOAL_CREATE, {
      notes: 'Created retirement goal with ₹50L target',
    })
    expect(queued).toBe(true)
    const queue = getPendingQueue()
    expect(queue[0].scheme_code).toBeNull()
    expect(queue[0].fund_name).toBeNull()
  })

  it('logDecision GOAL_UPDATE queues correctly', async () => {
    const { queued } = await logDecision(ACTION_TYPES.GOAL_UPDATE, { notes: 'Extended horizon by 2Y' })
    expect(queued).toBe(true)
  })

  it('logDecision GOAL_ABANDON queues correctly', async () => {
    const { queued } = await logDecision(ACTION_TYPES.GOAL_ABANDON, { notes: 'Cancelled car goal' })
    expect(queued).toBe(true)
  })

  it('logDecision GOAL_ACHIEVE queues correctly', async () => {
    const { queued } = await logDecision(ACTION_TYPES.GOAL_ACHIEVE, { notes: 'Reached retirement target' })
    expect(queued).toBe(true)
  })

  it('logDecision rejects invalid action_type', async () => {
    const { error, queued } = await logDecision('INVALID_ACTION', {})
    expect(error).toBeTruthy()
    expect(queued).toBe(false)
    // Should not have been queued
    expect(getPendingQueue().length).toBe(0)
  })

  it('multiple decisions accumulate in the queue', async () => {
    await logDecision(ACTION_TYPES.BUY_DIP, { amount: 1000 })
    await logDecision(ACTION_TYPES.SIP_CHANGE, { amount: 2000 })
    await logDecision(ACTION_TYPES.GOAL_CREATE, {})
    expect(getPendingQueue().length).toBe(3)
  })

  it('each queued decision has a created_at timestamp', async () => {
    await logDecision(ACTION_TYPES.BUY_DIP, {})
    const queue = getPendingQueue()
    expect(queue[0].created_at).toBeTruthy()
    // Should parse as a valid ISO date
    expect(() => new Date(queue[0].created_at)).not.toThrow()
  })

  it('outcome fields are always null at log time', async () => {
    await logDecision(ACTION_TYPES.BUY_DIP, { amount: 5000 })
    const queue = getPendingQueue()
    expect(queue[0].outcome_30d).toBeNull()
    expect(queue[0].outcome_90d).toBeNull()
  })
})

describe('decisions.js — Supabase online mode', () => {
  beforeEach(() => {
    localStorage.clear()
    clearDecisionQueue()
    isSupabaseConfigured.mockReturnValue(true)
    isAuthenticated.mockReturnValue(true)
  })

  afterEach(() => { vi.clearAllMocks() })

  it('logDecision calls insertDecision when Supabase configured + authenticated', async () => {
    insertDecision.mockResolvedValue({ data: { id: 'abc' }, error: null })
    const { queued, error } = await logDecision(ACTION_TYPES.BUY_DIP, { amount: 5000 })
    expect(insertDecision).toHaveBeenCalledOnce()
    expect(queued).toBe(false)
    expect(error).toBeNull()
  })

  it('falls back to queue when Supabase insert fails', async () => {
    insertDecision.mockResolvedValue({ data: null, error: 'network error' })
    const { queued } = await logDecision(ACTION_TYPES.BUY_DIP, { amount: 5000 })
    expect(queued).toBe(true)
    expect(getPendingQueue().length).toBe(1)
  })
})

describe('decisions.js — queue flush', () => {
  beforeEach(() => {
    localStorage.clear()
    clearDecisionQueue()
  })

  afterEach(() => { vi.clearAllMocks() })

  it('flushDecisionQueue returns 0 flushed when queue is empty', async () => {
    isSupabaseConfigured.mockReturnValue(true)
    isAuthenticated.mockReturnValue(true)
    const { flushed } = await flushDecisionQueue()
    expect(flushed).toBe(0)
  })

  it('flushDecisionQueue returns 0 when not authenticated', async () => {
    isSupabaseConfigured.mockReturnValue(true)
    isAuthenticated.mockReturnValue(false)
    // Queue two items
    isSupabaseConfigured.mockReturnValueOnce(false)
    await logDecision(ACTION_TYPES.BUY_DIP, {})
    isSupabaseConfigured.mockReturnValue(true)
    const { flushed, errors } = await flushDecisionQueue()
    expect(flushed).toBe(0)
    expect(errors).toBeGreaterThan(0)
  })

  it('flushDecisionQueue drains queue on success', async () => {
    // Queue offline
    isSupabaseConfigured.mockReturnValue(false)
    isAuthenticated.mockReturnValue(false)
    await logDecision(ACTION_TYPES.BUY_DIP, { amount: 1000 })
    await logDecision(ACTION_TYPES.SIP_CHANGE, { amount: 2000 })
    expect(getPendingQueue().length).toBe(2)

    // Now flush
    isSupabaseConfigured.mockReturnValue(true)
    isAuthenticated.mockReturnValue(true)
    insertDecision.mockResolvedValue({ data: { id: 'x' }, error: null })
    const { flushed, errors } = await flushDecisionQueue()
    expect(flushed).toBe(2)
    expect(errors).toBe(0)
    expect(getPendingQueue().length).toBe(0)
  })

  it('flushDecisionQueue strips queued_at before inserting (not a DB column)', async () => {
    // Queue a decision offline — enqueue() stamps it with queued_at.
    isSupabaseConfigured.mockReturnValue(false)
    isAuthenticated.mockReturnValue(false)
    await logDecision(ACTION_TYPES.GOAL_ACHIEVE, { notes: 'done' })
    expect(getPendingQueue()[0].queued_at).toBeTruthy() // present in the queue

    // Flush — the row handed to insertDecision must NOT carry queued_at, or Postgres
    // rejects it (no such column) and the row stays stuck forever.
    isSupabaseConfigured.mockReturnValue(true)
    isAuthenticated.mockReturnValue(true)
    insertDecision.mockResolvedValue({ data: { id: 'x' }, error: null })
    await flushDecisionQueue()
    const inserted = insertDecision.mock.calls[0][0]
    expect(inserted.queued_at).toBeUndefined()
    expect(inserted.action_type).toBe('GOAL_ACHIEVE')
  })

  it('flushDecisionQueue keeps failed items in queue', async () => {
    isSupabaseConfigured.mockReturnValue(false)
    isAuthenticated.mockReturnValue(false)
    await logDecision(ACTION_TYPES.BUY_DIP, {})

    isSupabaseConfigured.mockReturnValue(true)
    isAuthenticated.mockReturnValue(true)
    insertDecision.mockResolvedValue({ data: null, error: 'db error' })
    const { flushed, errors } = await flushDecisionQueue()
    expect(flushed).toBe(0)
    expect(errors).toBe(1)
    expect(getPendingQueue().length).toBe(1) // still in queue
  })
})

describe('decisions.js — ACTION_TYPES enum', () => {
  it('exports all required action types', () => {
    expect(ACTION_TYPES.BUY_DIP).toBe('BUY_DIP')
    expect(ACTION_TYPES.SIP_CHANGE).toBe('SIP_CHANGE')
    expect(ACTION_TYPES.GOAL_CREATE).toBe('GOAL_CREATE')
    expect(ACTION_TYPES.GOAL_UPDATE).toBe('GOAL_UPDATE')
    expect(ACTION_TYPES.GOAL_ABANDON).toBe('GOAL_ABANDON')
    expect(ACTION_TYPES.GOAL_ACHIEVE).toBe('GOAL_ACHIEVE')
  })
})
