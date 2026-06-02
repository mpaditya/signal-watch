// AR-5 (Multi-LLM abstraction layer): Single entry point for all LLM calls in the app.
// Currently backed by Gemini only. Full multi-provider cascade deferred (see DEC-037, Gemini-only initial build).
// Callers always receive { text, provider, model, tokens, usedSearch, citations } or null.
// null means "no LLM available" — callers must handle gracefully.

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const LS_KEY = 'artha_gemini_key'

// Defaults tuned for financial-advice use case (low randomness, focused token pool).
// See DEC-040 (hyperparameter regime for financial advice).
const DEFAULT_TEMPERATURE = 0.2
const DEFAULT_TOP_P       = 0.75
const DEFAULT_MAX_TOKENS  = 1024

// Main LLM call.
// prompt:  current user message (string)
// options:
//   systemPrompt?   — string injected as Gemini systemInstruction (role + portfolio context)
//   history?        — array of { role: 'user'|'ai', text } from prior turns (SW-11: multi-turn chat memory).
//                     Mapped to Gemini's contents array with role 'ai' → 'model'.
//   temperature?    — randomness (default 0.2 for factual finance)
//   topP?           — nucleus sampling (default 0.75)
//   maxTokens?      — max output tokens (default 1024)
//   enableSearch?   — SW-13 (Google Search grounding). Opt-in. When true, Gemini may
//                     invoke Google Search to ground responses in real-time web data.
//                     Tool use is conditional — Gemini decides per turn whether to search.
//                     See DEC-043 (Enable Gemini Google Search grounding for chat panel).
//
// Returns on success:
//   { text, provider, model, tokens, usedSearch, citations }
//     usedSearch — true if Gemini invoked Google Search for this response
//     citations  — array of { uri, title } from groundingMetadata (empty if no search)
// Returns null on any failure.
export async function callLLM(prompt, options = {}) {
  const key = localStorage.getItem(LS_KEY)
  // No key set — deterministic-only mode. Callers fall back to rule-based output.
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
    // SW-11 (multi-turn chat memory): Build contents from history + current prompt.
    // Gemini uses 'user' and 'model' role names; our UI uses 'user' and 'ai'.
    const contents = history.map(m => ({
      role:  m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }))
    contents.push({ role: 'user', parts: [{ text: prompt }] })

    const body = {
      contents,
      generationConfig: {
        temperature,
        topP,
        maxOutputTokens: maxTokens,
      },
    }
    // Gemini separates the system prompt from user content via systemInstruction.
    // Portfolio context is folded into systemPrompt by the caller — sent once per call,
    // never duplicated across the history.
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] }
    }
    // SW-13 (Google Search grounding): opt-in tool declaration. Gemini will only
    // invoke search when it determines current external info is needed (conditional
    // tool use). No extra cost when not invoked.
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
    // Gemini wraps the response in candidates[0].content.parts[0].text.
    // When search was invoked, candidates[0].groundingMetadata is populated.
    const candidate = json.candidates?.[0]
    const text = candidate?.content?.parts?.[0]?.text ?? null
    const tokens = {
      input:  json.usageMetadata?.promptTokenCount     ?? 0,
      output: json.usageMetadata?.candidatesTokenCount ?? 0,
    }

    // SW-13: Extract grounding metadata if Gemini used search.
    // groundingChunks is an array of { web: { uri, title } } entries.
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks ?? []
    const usedSearch = groundingChunks.length > 0
    const citations = groundingChunks
      .map(c => c?.web ? { uri: c.web.uri, title: c.web.title } : null)
      .filter(Boolean)

    console.log(
      `[llm] ${GEMINI_MODEL} ok — ${tokens.input}in + ${tokens.output}out tokens, ${latency}ms` +
      (usedSearch ? ` · search invoked (${citations.length} citations)` : '')
    )

    if (!text) return null
    return { text, provider: 'gemini', model: GEMINI_MODEL, tokens, usedSearch, citations }

  } catch (err) {
    const latency = Date.now() - t0
    console.warn(`[llm] ${GEMINI_MODEL} error — ${err.message} (${latency}ms)`)
    return null
  }
}

// True if the user has configured a Gemini key
export function hasLLMKey() {
  return !!localStorage.getItem(LS_KEY)
}

// Save key to localStorage. Pass null/empty to clear.
export function setLLMKey(key) {
  if (key && key.trim()) localStorage.setItem(LS_KEY, key.trim())
  else localStorage.removeItem(LS_KEY)
}
