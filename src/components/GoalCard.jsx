/**
 * GoalCard.jsx — Goal Health Dashboard Card
 * 
 * Styled to match existing Signal Watch design language:
 * - CSS vars: --bg, --bg-secondary, --text-primary, --text-secondary,
 *   --text-tertiary, --border, --border-strong, --radius-md, --radius-lg
 * - Inline styles, no Tailwind
 * - Same pill/badge patterns as fund cards
 * 
 * References: Brief §4.3 (health indicators), DEC-014 (required CAGR display)
 */

import { useState } from 'react';
import {
  computeGoalHealth,
  formatLakh,
  formatTimeLeft,
  formatINR,
  GOAL_TYPES,
  GOAL_STATUSES,
} from '../goalUtils';

const HEALTH = {
  green: { bg: '#EAF3DE', color: '#3B6D11', label: 'On Track' },
  amber: { bg: '#FAEEDA', color: '#854F0B', label: 'Needs Attention' },
  red:   { bg: '#FCEBEB', color: '#A32D2D', label: 'At Risk' },
};

const LEVER_ICONS = {
  increaseSIP: '📈',
  extendTimeline: '📅',
  reduceTarget: '🎯',
  lumpSum: '💰',
  higherReturn: '⚡',
};

const STALENESS_MSG = {
  fresh: null,
  amber: 'Corpus data is getting stale — consider updating.',
  red: 'Corpus data is very outdated — projections may be inaccurate.',
};

export default function GoalCard({ goal, onEdit, onUpdateCorpus, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const health = computeGoalHealth(goal);
  const hc = HEALTH[health.status];
  const typeDef = GOAL_TYPES[goal.goalType];
  const bs = '0.5px solid var(--border)';

  // For amber goals, show top 2 levers by default; red shows all
  const maxLevers = expanded ? health.levers.length : (health.status === 'amber' ? 2 : health.levers.length);
  const visibleLevers = health.levers.slice(0, maxLevers);
  const hasMore = health.levers.length > maxLevers;

  const isPaused = goal.status === GOAL_STATUSES.PAUSED;

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 'var(--radius-lg, 12px)',
      padding: '1rem', border: bs, position: 'relative',
      opacity: isPaused ? 0.5 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header: emoji + name + badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 22 }}>{goal.emoji}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {goal.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                {typeDef?.label || goal.goalType} · {formatTimeLeft(health.yearsLeft)} left
                {typeDef?.isFixed === true && ' · Non-negotiable'}
              </div>
            </div>
          </div>
        </div>
        <span style={{
          padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 500,
          background: hc.bg, color: hc.color, whiteSpace: 'nowrap',
        }}>
          {health.status === 'green' ? '✓' : health.status === 'amber' ? '!' : '✕'}{' '}
          {hc.label} · {Math.round(health.onTrackPct)}%
        </span>
      </div>

      {/* Projected vs Target */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em', color: 'var(--text-primary)' }}>
          {formatLakh(health.projected)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          of {formatLakh(health.targetINR)}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', width: Math.min(100, health.onTrackPct) + '%',
          background: hc.color, borderRadius: 2,
          transition: 'width 0.5s ease-out',
        }} />
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4,
        padding: '8px 0', borderTop: bs, borderBottom: bs, marginBottom: 8,
      }}>
        {[
          ['Invested', formatLakh(goal.currentCorpus || 0)],
          ['Monthly SIP', health.totalMonthlySIP > 0 ? formatINR(health.totalMonthlySIP) : '—'],
          ['CAGR', goal.assumedCAGR + '%'],
        ].map(([label, val]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2, color: 'var(--text-primary)' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Required CAGR — only amber/red (DEC-014) */}
      {health.status !== 'green' && health.reqCAGR !== null && (
        <div style={{
          padding: '7px 10px', borderRadius: 'var(--radius-md, 8px)',
          background: health.reqCAGR > 15 ? '#FCEBEB' : '#FAEEDA',
          fontSize: 11, color: health.reqCAGR > 15 ? '#A32D2D' : '#854F0B',
          marginBottom: 8, lineHeight: 1.5,
        }}>
          📊 Requires <b style={{ fontWeight: 600 }}>{health.reqCAGR}%</b> CAGR to reach target.
          {health.reqCAGR > 15 && <span> This is extremely aggressive — not sustainable long-term.</span>}
          {health.reqCAGR <= goal.assumedCAGR && <span> (Below your assumed {goal.assumedCAGR}% — may recover.)</span>}
        </div>
      )}

      {/* Corpus staleness warning */}
      {STALENESS_MSG[health.staleness] && (
        <div style={{
          padding: '6px 10px', borderRadius: 'var(--radius-md, 8px)',
          background: health.staleness === 'red' ? '#FCEBEB' : '#FAEEDA',
          fontSize: 10, lineHeight: 1.5, marginBottom: 8,
          color: health.staleness === 'red' ? '#A32D2D' : '#854F0B',
        }}>
          🕐 {STALENESS_MSG[health.staleness]}
          {health.daysSinceUpdate !== Infinity && <span> ({health.daysSinceUpdate}d ago)</span>}
        </div>
      )}

      {/* Derisking alert */}
      {health.shouldDerisk && goal.goalType !== 'emergency' && (
        <div style={{
          padding: '6px 10px', borderRadius: 'var(--radius-md, 8px)',
          background: '#FAEEDA', fontSize: 10, color: '#854F0B',
          marginBottom: 8, lineHeight: 1.5,
        }}>
          🛡️ Within {health.equityCutoffYears}Y equity cutoff — consider shifting to debt/liquid funds.
        </div>
      )}

      {/* Off-track levers */}
      {visibleLevers.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{
            fontSize: 10, fontWeight: 500, textTransform: 'uppercase',
            letterSpacing: '.05em', color: 'var(--text-secondary)', marginBottom: 6,
          }}>
            Recommended Actions
          </div>
          {visibleLevers.map((lever, idx) => (
            <div key={lever.key} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '8px 10px', background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md, 8px)', marginBottom: 4,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%', fontSize: 10, fontWeight: 600,
                background: hc.bg, color: hc.color, flexShrink: 0,
              }}>{idx + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 1 }}>
                  {LEVER_ICONS[lever.key] || '•'} {lever.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {lever.description}
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <button
              onClick={() => setExpanded(true)}
              style={{
                width: '100%', padding: '5px 0', border: 'none',
                background: 'none', fontSize: 11, color: 'var(--text-secondary)',
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              + {health.levers.length - maxLevers} more option{health.levers.length - maxLevers > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {onEdit && (
          <button onClick={() => onEdit(goal)} style={{
            padding: '4px 10px', borderRadius: 99, fontSize: 11,
            border: '0.5px solid var(--border-strong)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>✏ Edit</button>
        )}
        {onUpdateCorpus && (
          <button onClick={() => onUpdateCorpus(goal.id)} style={{
            padding: '4px 10px', borderRadius: 99, fontSize: 11,
            border: '0.5px solid var(--border-strong)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>💰 Update Corpus</button>
        )}
        {onStatusChange && goal.status === GOAL_STATUSES.ACTIVE && (
          <button onClick={() => onStatusChange(goal.id, GOAL_STATUSES.PAUSED)} style={{
            padding: '4px 10px', borderRadius: 99, fontSize: 11,
            border: '0.5px solid var(--border-strong)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>⏸ Pause</button>
        )}
        {onStatusChange && goal.status === GOAL_STATUSES.PAUSED && (
          <button onClick={() => onStatusChange(goal.id, GOAL_STATUSES.ACTIVE)} style={{
            padding: '4px 10px', borderRadius: 99, fontSize: 11,
            border: '0.5px solid var(--border-strong)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>▶ Resume</button>
        )}
      </div>
    </div>
  );
}
