// AR-4 (Decisions audit log): Displays the user's past investment decisions.
// Each row comes from the `decisions` Supabase table (see 003_decisions.sql).
// When Supabase is not configured, shows a placeholder.
// When decisions exist in the offline queue (localStorage), shows those too.

import { useState, useEffect } from 'react'
import { fetchDecisions, isSupabaseConfigured, isAuthenticated } from '../supabase'
import { getPendingQueue } from '../decisions'

const ACTION_LABELS = {
  BUY_DIP:      { label: 'Buy Dip',      color: '#A32D2D', bg: '#FCEBEB' },
  SIP_CHANGE:   { label: 'SIP Change',   color: '#185FA5', bg: '#E6F1FB' },
  GOAL_CREATE:  { label: 'Goal Created', color: '#3B6D11', bg: '#EAF3DE' },
  GOAL_UPDATE:  { label: 'Goal Updated', color: '#854F0B', bg: '#FAEEDA' },
  GOAL_ABANDON: { label: 'Goal Archived',color: '#5F5E5A', bg: '#F1EFE8' },
  GOAL_ACHIEVE: { label: 'Goal Achieved',color: '#0F6E56', bg: '#E1F5EE' },
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso }
}

function fmtINR(n) {
  if (n == null) return '—'
  return `₹${Number(n).toLocaleString('en-IN')}`
}

function OutcomeBadge({ value, label }) {
  if (value == null) return <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>—</span>
  const color = value >= 0 ? '#3B6D11' : '#A32D2D'
  return (
    <span style={{ fontSize: 10, color }}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}%
      <span style={{ color: 'var(--text-tertiary)', marginLeft: 2 }}>{label}</span>
    </span>
  )
}

export default function DecisionLog() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const bs = '0.5px solid var(--border)'

  // Also show locally queued decisions (not yet pushed to Supabase)
  const queue = getPendingQueue()

  useEffect(() => {
    if (!isSupabaseConfigured() || !isAuthenticated()) return
    setLoading(true)
    fetchDecisions(100)
      .then(data => { setRows(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (!isSupabaseConfigured() && queue.length === 0) {
    return (
      <div style={{ padding: '1.5rem', background: 'var(--bg)', borderRadius: 'var(--radius-lg)', border: bs, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Decision Log</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Log your investment decisions here to track outcomes over 30 and 90 days.
          Use the "Log Decision" button on Buy Dip signals in the Dip Prioritisation panel.
          Decisions sync to Supabase when cloud is configured.
        </div>
      </div>
    )
  }

  const allRows = [
    ...rows,
    // Annotate queued rows so the UI can show them as pending
    ...queue.map(q => ({ ...q, _pending: true }))
  ]

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-secondary)' }}>
          Decision Log
        </div>
        {queue.length > 0 && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#FAEEDA', color: '#854F0B' }}>
            {queue.length} pending sync
          </span>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '1rem 0' }}>Loading decisions…</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: '#A32D2D', padding: '1rem' }}>Error: {error}</div>
      )}

      {!loading && allRows.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0.5rem 0' }}>
          No decisions logged yet. Click "Log Decision" on a Buy Dip fund to start tracking.
        </div>
      )}

      {allRows.length > 0 && (
        <div style={{ background: 'var(--bg)', border: bs, borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                {['Date', 'Action', 'Fund', 'Amount', '30d', '90d', 'Notes'].map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: 'var(--text-secondary)', borderBottom: bs }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, i) => {
                const al = ACTION_LABELS[row.action_type] || { label: row.action_type, color: 'var(--text-secondary)', bg: 'var(--bg-secondary)' }
                return (
                  <tr key={i} style={{ borderBottom: i < allRows.length - 1 ? bs : 'none', opacity: row._pending ? 0.7 : 1 }}>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(row.created_at)}
                      {row._pending && <span style={{ fontSize: 9, marginLeft: 4, color: '#854F0B' }}>⌛</span>}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: al.bg, color: al.color, fontWeight: 500 }}>
                        {al.label}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-primary)' }}>
                      {row.fund_name || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>
                      {fmtINR(row.amount)}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <OutcomeBadge value={row.outcome_30d} label="30d" />
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <OutcomeBadge value={row.outcome_90d} label="90d" />
                    </td>
                    <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.notes || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
