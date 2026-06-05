// AR-3 (Signal history): Displays the last 30 days of signals per fund from Supabase.
// When Supabase is not configured or user is not authenticated, shows a placeholder
// explaining how to enable cloud sync (app must work without Supabase — design principle 5).

import { useState, useEffect } from 'react'
import { fetchSignalHistory, isSupabaseConfigured, isAuthenticated } from '../supabase'

const SIGNAL_COLORS = {
  BUY_DIP:    { color: '#A32D2D', bg: '#FCEBEB', label: 'Buy Dip' },
  WATCH:      { color: '#854F0B', bg: '#FAEEDA', label: 'Watch' },
  STRONG_RUN: { color: '#3B6D11', bg: '#EAF3DE', label: 'Strong Run' },
  NEUTRAL:    { color: '#5F5E5A', bg: '#F1EFE8', label: 'Neutral' },
}

function signalStyle(signal) {
  // alert.py writes signals as 'BUY_DIP', 'WATCH', etc. (from compute() function)
  const key = signal?.toUpperCase().replace(/ /g, '_').replace(/[^A-Z_]/g, '')
  return SIGNAL_COLORS[key] || SIGNAL_COLORS.NEUTRAL
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  } catch { return iso }
}

export default function SignalHistory() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const bs = '0.5px solid var(--border)'

  // Group rows by fund name for display
  const byFund = rows.reduce((acc, row) => {
    const key = row.fund_name || row.scheme_code || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  useEffect(() => {
    if (!isSupabaseConfigured() || !isAuthenticated()) return
    setLoading(true)
    fetchSignalHistory(30)
      .then(data => { setRows(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const bs2 = '0.5px solid var(--border)'

  if (!isSupabaseConfigured()) {
    return (
      <div style={{ padding: '1.5rem', background: 'var(--bg)', borderRadius: 'var(--radius-lg)', border: bs, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Signal History</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Signal history requires Supabase cloud sync. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable.
          Daily signals are written by GitHub Actions and stored in the <code>signal_history</code> table.
        </div>
      </div>
    )
  }

  if (!isAuthenticated()) {
    return (
      <div style={{ padding: '1.5rem', background: 'var(--bg)', borderRadius: 'var(--radius-lg)', border: bs, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Signal History</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Sign in to view your 30-day signal history.
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
        Signal History — last 30 days
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '1rem 0' }}>Loading signal history…</div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: '#A32D2D', padding: '1rem' }}>
          Could not load signal history: {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '1rem 0', lineHeight: 1.6 }}>
          No signal history yet. Signals are written daily by GitHub Actions at 6:30pm IST.
          Once the workflow runs with Supabase configured, history will appear here.
        </div>
      )}

      {!loading && !error && Object.entries(byFund).map(([fundName, signals]) => (
        <div key={fundName} style={{ marginBottom: 12, background: 'var(--bg)', border: bs2, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', fontSize: 12, fontWeight: 500, borderBottom: bs2 }}>
            {fundName}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
            {signals.slice(0, 30).map((row, i) => {
              const st = signalStyle(row.signal)
              return (
                <div key={i} title={`${row.signal} · ${row.dip_depth != null ? row.dip_depth.toFixed(1) + '% vs avg' : ''}`}
                  style={{
                    padding: '3px 8px', borderRadius: 99, fontSize: 10,
                    background: st.bg, color: st.color, fontWeight: 500,
                  }}>
                  {formatDate(row.created_at)} · {st.label}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
