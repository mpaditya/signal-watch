import { useState, useRef, useEffect } from 'react'
import { callLLM, hasLLMKey } from '../llm'

// SE-6 (data minimisation for LLM prompts): the system prompt tells Gemini to never
// echo fund names back, and to treat all monetary values as scaled "units" — not rupees.
// The context we send also anonymises fund names + scales rupee amounts (see buildContext).
const SYSTEM_PROMPT = `You are a personal finance assistant for an Indian mutual fund investor.
Answer questions using the portfolio context provided. Follow these rules:
- Never mention specific fund names — refer to them by category (small cap, mid cap, etc.) or the labels in the context (e.g., "Small Cap A").
- Monetary values in the context are in scaled "units" (1 unit ≈ a private constant; ratios and relative magnitudes are accurate, absolute rupees are withheld). You may reference these units in your analysis but never call them rupees.
- Always anchor recommendations to the investor's goal horizon.
- Keep responses to 2-4 sentences unless the user asks for more detail.
- End every response with one specific action the investor should take.`

// SE-6 (data minimisation) + SW-12 (proportional scaling of monetary values):
// Build anonymised context string from live app state. Fund names → category labels
// (Small Cap A, Mid Cap A, etc.). All rupee amounts divided by SCALE so relative
// magnitudes are preserved but absolute values are hidden.
const SCALE = 1000  // ₹ → units. ₹5,000 SIP becomes "5 units/mo".

function buildContext(funds, metrics, goalsConfig, marketPE) {
  // Assign letter suffixes per category: first Small Cap = "Small Cap A", second = "Small Cap B"
  const categoryCount = {}
  const fundLabels = {}
  funds.forEach(f => {
    categoryCount[f.category] = (categoryCount[f.category] || 0) + 1
    fundLabels[f.id] = `${f.category} ${String.fromCharCode(64 + categoryCount[f.category])}`
  })

  // Fund signal lines (signal status + % deviation from 30d average)
  const signalLines = funds
    .map(f => {
      const m = metrics[f.id]
      if (!m) return null
      const pct = m.fromAvg != null
        ? ` (${m.fromAvg >= 0 ? '+' : ''}${m.fromAvg.toFixed(1)}% from 30d avg)`
        : ''
      return `  - ${fundLabels[f.id]}: ${m.signal.label}${pct}`
    })
    .filter(Boolean)
    .join('\n')

  // SW-12: Goal lines now include scaled target, per-fund SIPs, and total monthly SIP.
  // targetLakh is in lakhs (1 lakh = ₹1,00,000), so multiply by 1,00,000 then divide by SCALE.
  const goalLines = Object.values(goalsConfig)
    .map(g => {
      const targetUnits = Math.round((g.targetLakh * 100000) / SCALE)
      const sipEntries = Object.entries(g.funds || {})
        .filter(([, amt]) => amt > 0)
        .map(([fid, amt]) => `${fundLabels[fid] || fid} ${Math.round(amt / SCALE)}`)
      const totalSIP = Object.values(g.funds || {}).reduce((s, a) => s + (a || 0), 0)
      const totalUnits = Math.round(totalSIP / SCALE)
      return `  - ${g.label}: ${g.yearsLeft}Y remaining, target ${targetUnits} units, total SIP ${totalUnits} units/mo
    Per-fund SIPs (units/mo): ${sipEntries.join(', ') || 'none'}`
    })
    .join('\n')

  const pe = marketPE
  const peStr = [
    pe.largecap ? `Nifty50 P/E: ${pe.largecap.toFixed(1)}` : null,
    pe.midcap   ? `MidCap P/E: ${pe.midcap.toFixed(1)}`    : null,
    pe.smallcap ? `SmallCap P/E: ${pe.smallcap.toFixed(1)}` : null,
  ].filter(Boolean).join(', ')

  return `Portfolio context (today):
Note: monetary values are in scaled "units" (relative magnitudes accurate, absolute rupees withheld).
Market valuations: ${peStr || 'unavailable'}
Goals:
${goalLines}
Current fund signals:
${signalLines || '  - (signals loading)'}`
}

const WELCOME      = "Ask me anything about your portfolio signals, goals, or investment decisions. I have context about your current fund signals and market valuations."
const NO_KEY_MSG   = "No Gemini API key set. Open AI Settings (top nav) to add one. Without it I can only answer with deterministic analysis from the app."
const FALLBACK_MSG = "AI unavailable right now (network or rate limit). The app's deterministic analysis on each fund card is still accurate — refer to the verdict panels below each fund."

export default function ChatPanel({ funds, metrics, goalsConfig, marketPE }) {
  const [open, setOpen]         = useState(false)
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  // SW-11 (multi-turn chat memory): messages array holds the full conversation as UI state.
  // synthetic=true marks app-generated messages (welcome, fallbacks) that must NOT be sent
  // to Gemini as conversation history.
  const [messages, setMessages] = useState([
    { role: 'ai', text: WELCOME, synthetic: true }
  ])
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const bs = '0.5px solid var(--border)'

  // Scroll to latest message whenever messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    // SW-11: Capture conversation history BEFORE appending the new user message.
    // Filter out synthetic (app-generated) messages so Gemini only sees real exchanges.
    const history = messages.filter(m => !m.synthetic)

    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)

    if (!hasLLMKey()) {
      setMessages(prev => [...prev, { role: 'ai', text: NO_KEY_MSG, synthetic: true }])
      setLoading(false)
      return
    }

    // Portfolio context goes into systemInstruction (sent every call but not duplicated
    // across the contents array). System prompt + live context together = system role.
    const context = buildContext(funds, metrics, goalsConfig, marketPE)
    const systemPrompt = `${SYSTEM_PROMPT}\n\n${context}`

    const result = await callLLM(text, { systemPrompt, history })

    if (result?.text) {
      setMessages(prev => [...prev, { role: 'ai', text: result.text }])
    } else {
      setMessages(prev => [...prev, { role: 'ai', text: FALLBACK_MSG, synthetic: true }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          width: 48, height: 48, borderRadius: '50%',
          background: open ? 'var(--text-primary)' : '#185FA5',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        title={open ? 'Close AI chat' : 'Ask AI'}
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 24, zIndex: 100,
          width: 360, height: 480,
          background: 'var(--bg)', border: bs, borderRadius: 'var(--radius-lg)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 14px', borderBottom: bs,
            fontSize: 13, fontWeight: 600,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>AI Assistant</span>
            <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>
              {hasLLMKey() ? 'Gemini · context-aware' : 'No key — set one in AI Settings'}
            </span>
          </div>

          {/* Message list */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '82%', padding: '8px 11px',
                  borderRadius: msg.role === 'user'
                    ? '12px 12px 2px 12px'
                    : '12px 12px 12px 2px',
                  background: msg.role === 'user' ? 'var(--text-primary)' : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? 'var(--bg)' : 'var(--text-primary)',
                  fontSize: 12, lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '8px 14px', borderRadius: '12px 12px 12px 2px',
                  background: 'var(--bg-secondary)', fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: bs, display: 'flex', gap: 6 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask about a signal, goal, or decision…"
              disabled={loading}
              style={{
                flex: 1, padding: '7px 10px', border: bs,
                borderRadius: 'var(--radius-md)', fontSize: 12,
                background: 'var(--bg)', color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                padding: '7px 13px', border: 'none', borderRadius: 'var(--radius-md)',
                background: input.trim() && !loading ? '#185FA5' : 'var(--bg-secondary)',
                color: input.trim() && !loading ? 'white' : 'var(--text-secondary)',
                fontSize: 12, fontWeight: 500,
                cursor: input.trim() && !loading ? 'pointer' : 'default',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  )
}
