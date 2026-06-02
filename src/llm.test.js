/**
 * llm.test.js — Tests for the LLM abstraction layer (AR-5: multi-LLM abstraction layer).
 *
 * Covers key management, error handling, response parsing, hyperparameter defaults,
 * options wiring, and SW-11 (multi-turn chat memory) history → contents mapping.
 * Run with: node llm.test.js
 *
 * Uses plain Node assertions — no framework, no bundler.
 * fetch and localStorage are mocked so tests run offline and never hit Gemini.
 */

// ─── Mock localStorage ─────────────────────────────────────────────────────────
const store = {}
global.localStorage = {
  getItem:    k    => store[k] ?? null,
  setItem:    (k,v) => { store[k] = String(v) },
  removeItem: k    => { delete store[k] },
}

// ─── Functions under test (inlined — no bundler in plain Node) ────────────────
// Keep in sync with src/llm.js

const LS_KEY              = 'artha_gemini_key'
const GEMINI_MODEL        = 'gemini-2.5-flash'
const GEMINI_URL          = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_TOP_P       = 0.75
const DEFAULT_MAX_TOKENS  = 1024

function hasLLMKey() {
  return !!localStorage.getItem(LS_KEY)
}

function setLLMKey(key) {
  if (key && key.trim()) localStorage.setItem(LS_KEY, key.trim())
  else localStorage.removeItem(LS_KEY)
}

async function callLLM(prompt, options = {}) {
  const key = localStorage.getItem(LS_KEY)
  if (!key) return null

  const {
    systemPrompt,
    history       = [],
    temperature   = DEFAULT_TEMPERATURE,
    topP          = DEFAULT_TOP_P,
    maxTokens     = DEFAULT_MAX_TOKENS,
    enableSearch  = false,
  } = options
  const t0 = Date.now()

  try {
    const contents = history.map(m => ({
      role:  m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }))
    contents.push({ role: 'user', parts: [{ text: prompt }] })

    const body = {
      contents,
      generationConfig: { temperature, topP, maxOutputTokens: maxTokens },
    }
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] }
    }
    if (enableSearch) {
      body.tools = [{ google_search: {} }]
    }

    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const latency = Date.now() - t0

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.warn(`[llm] ${GEMINI_MODEL} failed — HTTP ${res.status}`, err?.error?.message ?? '', `(${latency}ms)`)
      return null
    }

    const json = await res.json()
    const candidate = json.candidates?.[0]
    const text = candidate?.content?.parts?.[0]?.text ?? null
    const tokens = {
      input:  json.usageMetadata?.promptTokenCount     ?? 0,
      output: json.usageMetadata?.candidatesTokenCount ?? 0,
    }

    // SW-13: extract grounding metadata when Gemini invoked Google Search
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? []
    const usedSearch = groundingChunks.length > 0
    const citations = groundingChunks
      .map(c => c?.web ? { uri: c.web.uri, title: c.web.title } : null)
      .filter(Boolean)

    if (!text) return null
    return { text, provider: 'gemini', model: GEMINI_MODEL, tokens, usedSearch, citations }

  } catch (err) {
    return null
  }
}

// ─── Test runner ───────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function assert(condition, testName, detail) {
  if (condition) {
    passed++
    console.log(`  ✅ ${testName}`)
  } else {
    failed++
    console.log(`  ❌ ${testName}${detail ? ': ' + detail : ''}`)
  }
}

// Helper: capture the JSON body of the next fetch call and return a successful mock response.
function makeCaptureFetch(captureRef) {
  return async (_url, opts) => {
    captureRef.body = JSON.parse(opts.body)
    return {
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
      }),
    }
  }
}

// ─── Test suite ────────────────────────────────────────────────────────────────
;(async () => {

  console.log('\n🤖 llm.js — Abstraction Layer Test Suite\n')

  // ── Key management ───────────────────────────────────────────────────────
  console.log('Key Management:')
  {
    setLLMKey(null)
    assert(!hasLLMKey(), 'hasLLMKey() false when no key set')

    setLLMKey('AIzaTestKey123')
    assert(hasLLMKey(), 'hasLLMKey() true after setLLMKey()')
    assert(localStorage.getItem(LS_KEY) === 'AIzaTestKey123', 'key stored verbatim')

    setLLMKey('  AIzaWithSpaces  ')
    assert(localStorage.getItem(LS_KEY) === 'AIzaWithSpaces', 'setLLMKey() trims whitespace')

    setLLMKey(null)
    assert(!hasLLMKey(), 'setLLMKey(null) removes key')

    setLLMKey('AIzaAgain')
    setLLMKey('')
    assert(!hasLLMKey(), 'setLLMKey("") removes key')
  }

  // ── callLLM: no key → deterministic-only mode ────────────────────────────
  console.log('\ncallLLM — No Key (deterministic-only mode):')
  {
    setLLMKey(null)
    global.fetch = undefined
    const result = await callLLM('Hello')
    assert(result === null, 'returns null when no key set')
    assert(global.fetch === undefined, 'no fetch attempted when key absent')
  }

  // ── callLLM: HTTP errors ─────────────────────────────────────────────────
  console.log('\ncallLLM — HTTP Errors:')
  {
    setLLMKey('AIzaTestKey')

    global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'API_KEY_INVALID' } }) })
    assert(await callLLM('Hello') === null, 'returns null on 403 invalid key')

    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'RESOURCE_EXHAUSTED' } }) })
    assert(await callLLM('Hello') === null, 'returns null on 429 rate limit')

    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
    assert(await callLLM('Hello') === null, 'returns null on 500 server error')
  }

  // ── callLLM: network / offline ───────────────────────────────────────────
  console.log('\ncallLLM — Network Error (offline):')
  {
    setLLMKey('AIzaTestKey')

    global.fetch = async () => { throw new Error('Failed to fetch') }
    assert(await callLLM('Hello') === null, 'returns null when fetch throws (offline)')

    global.fetch = async () => { throw new TypeError('NetworkError when attempting to fetch resource') }
    assert(await callLLM('Hello') === null, 'returns null on TypeError network failure')
  }

  // ── callLLM: successful response ─────────────────────────────────────────
  console.log('\ncallLLM — Successful Response:')
  {
    setLLMKey('AIzaTestKey')

    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Continue your SIP — the dip is within normal volatility.' }] } }],
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 12 },
      }),
    })

    const result = await callLLM('Why is this fund on watch?')
    assert(result !== null, 'returns non-null on success')
    assert(result.text === 'Continue your SIP — the dip is within normal volatility.', 'text extracted from candidates[0].content.parts[0]')
    assert(result.provider === 'gemini', 'provider is "gemini"')
    assert(result.model === GEMINI_MODEL, `model is "${GEMINI_MODEL}"`)
    assert(result.tokens.input  === 42, 'input token count correct')
    assert(result.tokens.output === 12, 'output token count correct')
  }

  // ── callLLM: malformed responses ─────────────────────────────────────────
  console.log('\ncallLLM — Empty / Malformed Response:')
  {
    setLLMKey('AIzaTestKey')

    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [], usageMetadata: {} }) })
    assert(await callLLM('Test') === null, 'returns null when candidates array is empty')

    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{}] } }], usageMetadata: {} }) })
    assert(await callLLM('Test') === null, 'returns null when text field is absent from parts')

    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ usageMetadata: {} }) })
    assert(await callLLM('Test') === null, 'returns null when candidates key missing entirely')
  }

  // ── Hyperparameter defaults & overrides (DEC-040: financial-advice tuning) ──
  console.log('\ncallLLM — Hyperparameter Defaults & Overrides:')
  {
    setLLMKey('AIzaTestKey')
    const cap = {}

    global.fetch = makeCaptureFetch(cap)
    await callLLM('Default options')
    assert(cap.body?.generationConfig?.temperature      === 0.2,  'default temperature is 0.2 (tight, factual)')
    assert(cap.body?.generationConfig?.topP             === 0.75, 'default topP is 0.75')
    assert(cap.body?.generationConfig?.maxOutputTokens  === 1024, 'default maxTokens is 1024')
    // Penalties intentionally NOT set — Gemini's default of 0.0 is correct for factual content.
    assert(cap.body?.generationConfig?.presencePenalty  === undefined, 'presencePenalty not set (Gemini default 0.0 preserved)')
    assert(cap.body?.generationConfig?.frequencyPenalty === undefined, 'frequencyPenalty not set (Gemini default 0.0 preserved)')

    global.fetch = makeCaptureFetch(cap)
    await callLLM('Custom', { temperature: 0.0, topP: 0.5, maxTokens: 256 })
    assert(cap.body?.generationConfig?.temperature     === 0.0, 'custom temperature forwarded')
    assert(cap.body?.generationConfig?.topP            === 0.5, 'custom topP forwarded')
    assert(cap.body?.generationConfig?.maxOutputTokens === 256, 'custom maxTokens forwarded')
  }

  // ── systemPrompt wiring ──────────────────────────────────────────────────
  console.log('\ncallLLM — systemPrompt Wiring:')
  {
    setLLMKey('AIzaTestKey')
    const cap = {}

    global.fetch = makeCaptureFetch(cap)
    await callLLM('User question', { systemPrompt: 'You are a finance assistant.' })
    assert(
      cap.body?.systemInstruction?.parts?.[0]?.text === 'You are a finance assistant.',
      'systemPrompt passed through as systemInstruction'
    )

    global.fetch = makeCaptureFetch(cap)
    await callLLM('No system prompt')
    assert(!cap.body?.systemInstruction, 'systemInstruction absent when no systemPrompt given')
  }

  // ── SW-11 (multi-turn chat memory): history → contents mapping ───────────
  console.log('\ncallLLM — SW-11 Multi-Turn History:')
  {
    setLLMKey('AIzaTestKey')
    const cap = {}

    // Empty history → contents has only the current user message
    global.fetch = makeCaptureFetch(cap)
    await callLLM('Hello there')
    assert(cap.body.contents.length === 1, 'contents has 1 item when no history')
    assert(cap.body.contents[0].role === 'user', 'lone item is user role')
    assert(cap.body.contents[0].parts[0].text === 'Hello there', 'lone item is current prompt')

    // History with one user + one ai turn → 3-item contents, ai mapped to model
    global.fetch = makeCaptureFetch(cap)
    const history = [
      { role: 'user', text: 'first question' },
      { role: 'ai',   text: 'first answer' },
    ]
    await callLLM('second question', { history })
    assert(cap.body.contents.length === 3, 'contents has 3 items: 2 history + 1 current')
    assert(cap.body.contents[0].role === 'user' && cap.body.contents[0].parts[0].text === 'first question', 'history[0] preserved as user')
    assert(cap.body.contents[1].role === 'model' && cap.body.contents[1].parts[0].text === 'first answer', 'history[1] mapped ai → model')
    assert(cap.body.contents[2].role === 'user' && cap.body.contents[2].parts[0].text === 'second question', 'current prompt appended last as user')

    // Longer alternating history preserves order
    global.fetch = makeCaptureFetch(cap)
    const longHistory = [
      { role: 'user', text: 'q1' },
      { role: 'ai',   text: 'a1' },
      { role: 'user', text: 'q2' },
      { role: 'ai',   text: 'a2' },
    ]
    await callLLM('q3', { history: longHistory })
    assert(cap.body.contents.length === 5, 'long history preserved (4 + 1)')
    assert(
      cap.body.contents.map(c => c.role).join(',') === 'user,model,user,model,user',
      'role order user→model→user→model→user preserved'
    )
    assert(
      cap.body.contents.map(c => c.parts[0].text).join(',') === 'q1,a1,q2,a2,q3',
      'text order preserved verbatim'
    )
  }

  // ── SW-13 (Google Search grounding): tool wiring + citation extraction ──
  console.log('\ncallLLM — SW-13 Google Search Grounding:')
  {
    setLLMKey('AIzaTestKey')
    const cap = {}

    // Default behaviour: no tools field when enableSearch not set
    global.fetch = makeCaptureFetch(cap)
    await callLLM('plain question')
    assert(cap.body?.tools === undefined, 'no tools field by default (enableSearch defaults false)')

    // enableSearch: false explicitly → still no tools
    global.fetch = makeCaptureFetch(cap)
    await callLLM('plain question', { enableSearch: false })
    assert(cap.body?.tools === undefined, 'no tools field when enableSearch=false')

    // enableSearch: true → google_search tool declared in request body
    global.fetch = makeCaptureFetch(cap)
    await callLLM('what is Nifty P/E today?', { enableSearch: true })
    assert(Array.isArray(cap.body?.tools), 'tools array present when enableSearch=true')
    assert(cap.body.tools.length === 1, 'tools array has exactly one entry')
    assert(cap.body.tools[0]?.google_search !== undefined, 'tools[0] declares google_search')

    // Response WITHOUT groundingMetadata → usedSearch=false, citations=[]
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'no search needed' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    })
    const r1 = await callLLM('hello', { enableSearch: true })
    assert(r1?.usedSearch === false, 'usedSearch false when Gemini chose not to invoke search')
    assert(Array.isArray(r1?.citations) && r1.citations.length === 0, 'citations empty when no search')

    // Response WITH groundingMetadata → usedSearch=true, citations populated
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: 'Nifty P/E is currently 22.8.' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://nseindia.com/abc',     title: 'NSE Nifty 50 P/E' } },
              { web: { uri: 'https://moneycontrol.com/xyz', title: 'Market Valuations' } },
            ],
          },
        }],
        usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 },
      }),
    })
    const r2 = await callLLM('current Nifty P/E?', { enableSearch: true })
    assert(r2?.usedSearch === true, 'usedSearch true when Gemini invoked search')
    assert(r2?.citations?.length === 2, 'two citations extracted')
    assert(r2.citations[0].uri === 'https://nseindia.com/abc', 'citation 0 uri correct')
    assert(r2.citations[0].title === 'NSE Nifty 50 P/E', 'citation 0 title correct')
    assert(r2.citations[1].uri === 'https://moneycontrol.com/xyz', 'citation 1 uri correct')

    // Malformed groundingChunks (missing web key) → filtered out, no crash
    global.fetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: 'partial' }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://valid.com', title: 'Valid' } },
              { other: 'unknown' },
              null,
            ],
          },
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      }),
    })
    const r3 = await callLLM('test', { enableSearch: true })
    assert(r3?.citations?.length === 1, 'malformed chunks filtered, only valid web entries kept')
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed === 0) console.log('All tests passed ✅')
  else { console.log('Some tests failed ❌'); process.exit(1) }

})()
