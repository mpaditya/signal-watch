import { useState } from 'react'
import { hasLLMKey, setLLMKey } from '../llm'

// Settings modal for Gemini API key. Key is stored in localStorage only — never leaves the browser.
export default function LLMSettings({ onClose }) {
  const [input, setInput] = useState('')
  const [saved, setSaved] = useState(hasLLMKey)

  function save() {
    if (!input.trim()) return
    setLLMKey(input.trim())
    setInput('')
    setSaved(true)
  }

  function clear() {
    setLLMKey(null)
    setSaved(false)
  }

  const bs = '0.5px solid var(--border)'

  return (
    <div
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background:'var(--bg)',borderRadius:'var(--radius-lg)',padding:'1.5rem',width:380,border:bs,boxShadow:'0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
          <div style={{ fontSize:14,fontWeight:600 }}>AI Settings</div>
          <button onClick={onClose} style={{ border:'none',background:'none',fontSize:18,cursor:'pointer',color:'var(--text-secondary)',lineHeight:1 }}>✕</button>
        </div>

        <div style={{ fontSize:11,color:'var(--text-secondary)',marginBottom:12,lineHeight:1.6 }}>
          Gemini API key — stored only in your browser (localStorage). Never sent anywhere except Google.
          Free key at <b>aistudio.google.com</b> → restrict to <b>mpaditya.github.io/*</b> and <b>localhost:5173/*</b>.
        </div>

        {saved ? (
          <div style={{ padding:'10px 14px',background:'#EAF3DE',borderRadius:'var(--radius-md)',fontSize:12,color:'#3B6D11',marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <span>Key saved — AI features active</span>
            <button onClick={clear} style={{ border:'none',background:'none',fontSize:11,color:'#A32D2D',cursor:'pointer',fontWeight:500 }}>Remove</button>
          </div>
        ) : (
          <div style={{ display:'flex',gap:6,marginBottom:12 }}>
            <input
              type="password"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="AIza..."
              autoFocus
              style={{ flex:1,padding:'7px 10px',border:bs,borderRadius:'var(--radius-md)',fontSize:12,background:'var(--bg)',color:'var(--text-primary)',outline:'none' }}
            />
            <button
              onClick={save}
              disabled={!input.trim()}
              style={{ padding:'7px 14px',border:'none',borderRadius:'var(--radius-md)',background:input.trim()?'var(--text-primary)':'var(--bg-secondary)',color:input.trim()?'var(--bg)':'var(--text-secondary)',fontSize:12,cursor:input.trim()?'pointer':'default',fontWeight:500 }}
            >
              Save
            </button>
          </div>
        )}

        <div style={{ fontSize:10,color:'var(--text-tertiary)',lineHeight:1.6 }}>
          No key set? All AI features fall back to deterministic analysis. Your financial data stays local regardless.
        </div>
      </div>
    </div>
  )
}
