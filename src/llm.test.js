// llm.test.js — Tests for the LLM abstraction layer (AR-5).
//
// REWRITTEN (Sprint 3): now imports the REAL functions from ./llm.js instead of
// testing inline copies. Previously this file re-declared callLLM/hasLLMKey/setLLMKey
// inside the test, so it validated a frozen copy — the real module could break and
// these tests would still pass. Now a regression in llm.js fails these tests.
//
// fetch is mocked per-test; localStorage is provided by jsdom (see vite.config test env).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { callLLM, hasLLMKey, setLLMKey } from './llm.js'

const LS_KEY       = 'artha_gemini_key'
const GEMINI_MODEL = 'gemini-2.5-flash'

// Capture the request body of the next fetch and return a canned success response.
function mockCaptureFetch(captureRef) {
  return vi.fn(async (_url, opts) => {
    captureRef.body = JSON.parse(opts.body)
    return {
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
      }),
    }
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('llm.js — key management', () => {
  it('hasLLMKey() false when no key set', () => {
    setLLMKey(null)
    expect(hasLLMKey()).toBe(false)
  })
  it('hasLLMKey() true after setLLMKey() and stores verbatim', () => {
    setLLMKey('AIzaTestKey123')
    expect(hasLLMKey()).toBe(true)
    expect(localStorage.getItem(LS_KEY)).toBe('AIzaTestKey123')
  })
  it('setLLMKey() trims whitespace', () => {
    setLLMKey('  AIzaWithSpaces  ')
    expect(localStorage.getItem(LS_KEY)).toBe('AIzaWithSpaces')
  })
  it('setLLMKey(null) and setLLMKey("") remove the key', () => {
    setLLMKey('AIzaAgain')
    setLLMKey(null)
    expect(hasLLMKey()).toBe(false)
    setLLMKey('AIzaAgain')
    setLLMKey('')
    expect(hasLLMKey()).toBe(false)
  })
})

describe('llm.js — callLLM no key (deterministic-only mode)', () => {
  it('returns null when no key set and never calls fetch', async () => {
    setLLMKey(null)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await callLLM('Hello')
    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('llm.js — callLLM HTTP errors', () => {
  beforeEach(() => setLLMKey('AIzaTestKey'))
  it('returns null on 403 invalid key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'API_KEY_INVALID' } }) })))
    expect(await callLLM('Hello')).toBeNull()
  })
  it('returns null on 429 rate limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'RESOURCE_EXHAUSTED' } }) })))
    expect(await callLLM('Hello')).toBeNull()
  })
  it('returns null on 500 server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    expect(await callLLM('Hello')).toBeNull()
  })
})

describe('llm.js — callLLM network errors (offline)', () => {
  beforeEach(() => setLLMKey('AIzaTestKey'))
  it('returns null when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch') }))
    expect(await callLLM('Hello')).toBeNull()
  })
  it('returns null on TypeError network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('NetworkError when attempting to fetch resource') }))
    expect(await callLLM('Hello')).toBeNull()
  })
})

describe('llm.js — callLLM successful response', () => {
  it('extracts text, provider, model, tokens', async () => {
    setLLMKey('AIzaTestKey')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Continue your SIP — the dip is within normal volatility.' }] } }],
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 12 },
      }),
    })))
    const result = await callLLM('Why is this fund on watch?')
    expect(result).not.toBeNull()
    expect(result.text).toBe('Continue your SIP — the dip is within normal volatility.')
    expect(result.provider).toBe('gemini')
    expect(result.model).toBe(GEMINI_MODEL)
    expect(result.tokens.input).toBe(42)
    expect(result.tokens.output).toBe(12)
  })
})

describe('llm.js — callLLM empty/malformed responses', () => {
  beforeEach(() => setLLMKey('AIzaTestKey'))
  it('returns null when candidates array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [], usageMetadata: {} }) })))
    expect(await callLLM('Test')).toBeNull()
  })
  it('returns null when text field absent from parts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{}] } }], usageMetadata: {} }) })))
    expect(await callLLM('Test')).toBeNull()
  })
  it('returns null when candidates key missing entirely', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ usageMetadata: {} }) })))
    expect(await callLLM('Test')).toBeNull()
  })
})

describe('llm.js — hyperparameter defaults & overrides (DEC-040)', () => {
  beforeEach(() => setLLMKey('AIzaTestKey'))
  it('uses default temperature 0.2, topP 0.75, maxTokens 1024; no penalties set', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('Default options')
    expect(cap.body.generationConfig.temperature).toBe(0.2)
    expect(cap.body.generationConfig.topP).toBe(0.75)
    expect(cap.body.generationConfig.maxOutputTokens).toBe(1024)
    expect(cap.body.generationConfig.presencePenalty).toBeUndefined()
    expect(cap.body.generationConfig.frequencyPenalty).toBeUndefined()
  })
  it('forwards custom hyperparameters', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('Custom', { temperature: 0.0, topP: 0.5, maxTokens: 256 })
    expect(cap.body.generationConfig.temperature).toBe(0.0)
    expect(cap.body.generationConfig.topP).toBe(0.5)
    expect(cap.body.generationConfig.maxOutputTokens).toBe(256)
  })
})

describe('llm.js — systemPrompt wiring', () => {
  beforeEach(() => setLLMKey('AIzaTestKey'))
  it('passes systemPrompt through as systemInstruction', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('User question', { systemPrompt: 'You are a finance assistant.' })
    expect(cap.body.systemInstruction.parts[0].text).toBe('You are a finance assistant.')
  })
  it('omits systemInstruction when no systemPrompt given', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('No system prompt')
    expect(cap.body.systemInstruction).toBeUndefined()
  })
})

describe('llm.js — SW-11 multi-turn history → contents mapping', () => {
  beforeEach(() => setLLMKey('AIzaTestKey'))
  it('contents has only current message when no history', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('Hello there')
    expect(cap.body.contents).toHaveLength(1)
    expect(cap.body.contents[0].role).toBe('user')
    expect(cap.body.contents[0].parts[0].text).toBe('Hello there')
  })
  it('maps ai → model and appends current prompt last', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    const history = [
      { role: 'user', text: 'first question' },
      { role: 'ai',   text: 'first answer' },
    ]
    await callLLM('second question', { history })
    expect(cap.body.contents).toHaveLength(3)
    expect(cap.body.contents[0]).toMatchObject({ role: 'user' })
    expect(cap.body.contents[1]).toMatchObject({ role: 'model' })
    expect(cap.body.contents[2].parts[0].text).toBe('second question')
  })
  it('preserves order across a longer alternating history', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    const longHistory = [
      { role: 'user', text: 'q1' }, { role: 'ai', text: 'a1' },
      { role: 'user', text: 'q2' }, { role: 'ai', text: 'a2' },
    ]
    await callLLM('q3', { history: longHistory })
    expect(cap.body.contents.map(c => c.role).join(',')).toBe('user,model,user,model,user')
    expect(cap.body.contents.map(c => c.parts[0].text).join(',')).toBe('q1,a1,q2,a2,q3')
  })
})

describe('llm.js — SW-13 Google Search grounding', () => {
  beforeEach(() => setLLMKey('AIzaTestKey'))
  it('no tools field by default', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('plain question')
    expect(cap.body.tools).toBeUndefined()
  })
  it('no tools field when enableSearch=false', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('plain question', { enableSearch: false })
    expect(cap.body.tools).toBeUndefined()
  })
  it('declares google_search tool when enableSearch=true', async () => {
    const cap = {}
    vi.stubGlobal('fetch', mockCaptureFetch(cap))
    await callLLM('what is Nifty P/E today?', { enableSearch: true })
    expect(Array.isArray(cap.body.tools)).toBe(true)
    expect(cap.body.tools).toHaveLength(1)
    expect(cap.body.tools[0].google_search).toBeDefined()
  })
  it('usedSearch=false and citations=[] when no groundingMetadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'no search needed' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    })))
    const r = await callLLM('hello', { enableSearch: true })
    expect(r.usedSearch).toBe(false)
    expect(r.citations).toEqual([])
  })
  it('extracts citations when groundingMetadata present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: 'Nifty P/E is currently 22.8.' }] },
          groundingMetadata: { groundingChunks: [
            { web: { uri: 'https://nseindia.com/abc',     title: 'NSE Nifty 50 P/E' } },
            { web: { uri: 'https://moneycontrol.com/xyz', title: 'Market Valuations' } },
          ] },
        }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 },
      }),
    })))
    const r = await callLLM('current Nifty P/E?', { enableSearch: true })
    expect(r.usedSearch).toBe(true)
    expect(r.citations).toHaveLength(2)
    expect(r.citations[0]).toEqual({ uri: 'https://nseindia.com/abc', title: 'NSE Nifty 50 P/E' })
    expect(r.citations[1].uri).toBe('https://moneycontrol.com/xyz')
  })
  it('filters malformed groundingChunks without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: 'partial' }] },
          groundingMetadata: { groundingChunks: [
            { web: { uri: 'https://valid.com', title: 'Valid' } },
            { other: 'unknown' },
            null,
          ] },
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      }),
    })))
    const r = await callLLM('test', { enableSearch: true })
    expect(r.citations).toHaveLength(1)
  })
})
