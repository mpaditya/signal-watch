// AR-2 (Authentication — magic link): Login modal for Supabase Auth.
// Magic link flow:
//   1. User enters email → app calls sendMagicLink() → Supabase emails a link
//   2. User clicks link → browser redirects to app with token in URL hash
//   3. App parses hash in useEffect → calls verifyMagicLinkToken()
//   4. On success: session stored in memory (NOT localStorage), app renders
//
// "Continue without account" skips auth for local-only mode.
// Session is stored in React state via onAuthSuccess callback — never persisted
// to localStorage to avoid token exposure (design principle: DEC-AR2).

import { useState } from 'react'
import { sendMagicLink, isSupabaseConfigured } from '../supabase'

export default function AuthModal({ onAuthSuccess, onSkip }) {
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState(null)
  const bs = '0.5px solid var(--border)'

  async function handleSend(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    const err = await sendMagicLink(email.trim())
    setLoading(false)
    if (err) {
      setError(err.error || 'Failed to send magic link. Check your email address.')
    } else {
      setSent(true)
    }
  }

  if (!isSupabaseConfigured()) {
    // Supabase not yet configured — show a reduced UI that only offers local mode
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}>
        <div style={{
          background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '1.5rem',
          width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Welcome to Signal Watch</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
            Cloud sync is not configured yet. Your data will be saved to this browser only.
            To enable cloud sync, add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment.
          </div>
          <button
            onClick={onSkip}
            style={{
              width: '100%', padding: '9px', background: 'var(--text-primary)',
              color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius-md)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Continue with local storage
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 400,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '1.5rem',
        width: '100%', maxWidth: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: 22, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Sign in to Signal Watch</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
          Enter your email to receive a magic link. No password needed.
          Your data syncs securely to the cloud.
        </div>

        {!sent ? (
          <form onSubmit={handleSend}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoFocus
              style={{
                width: '100%', padding: '8px 12px', border: bs,
                borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 10,
                background: 'var(--bg)', color: 'var(--text-primary)', boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            {error && (
              <div style={{ fontSize: 11, color: '#A32D2D', marginBottom: 10 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: '100%', padding: '9px', marginBottom: 8,
                background: loading || !email.trim() ? 'var(--bg-secondary)' : 'var(--text-primary)',
                color: loading || !email.trim() ? 'var(--text-secondary)' : 'var(--bg)',
                border: 'none', borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: 500, cursor: loading || !email.trim() ? 'default' : 'pointer',
              }}
            >
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
            <button
              type="button"
              onClick={onSkip}
              style={{
                width: '100%', padding: '7px', background: 'transparent',
                color: 'var(--text-secondary)', border: bs,
                borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer',
              }}
            >
              Continue without account
            </button>
          </form>
        ) : (
          <div>
            <div style={{
              padding: '12px', background: '#EAF3DE', borderRadius: 'var(--radius-md)',
              fontSize: 12, color: '#3B6D11', lineHeight: 1.6, marginBottom: 16,
            }}>
              Magic link sent to <strong>{email}</strong>. Check your inbox and click the link to sign in.
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Didn't receive it? Check your spam folder, or{' '}
              <button onClick={() => setSent(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
                try again
              </button>.
            </div>
            <button
              onClick={onSkip}
              style={{
                width: '100%', padding: '7px', background: 'transparent',
                color: 'var(--text-secondary)', border: bs,
                borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer',
              }}
            >
              Continue without account for now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
