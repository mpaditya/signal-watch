/**
 * DipPrioritisation.jsx — "Deploy Lump Sum" Ranked Table (SW-3)
 *
 * When multiple funds show Buy Dip signals simultaneously, the user needs
 * to decide WHERE to deploy their available lump sum. This component ranks
 * all Buy Dip fund–goal pairs by a conviction score (0–100) and suggests
 * how much to allocate to each.
 *
 * WHEN IT APPEARS:
 * - User has entered a lump sum amount (> 0)
 * - At least one fund has a Buy Dip signal
 *
 * HOW IT WORKS:
 * 1. For each fund with Buy Dip signal, for each goal that fund belongs to,
 *    compute a conviction score using 5 weighted factors (see goalUtils.js)
 * 2. Sort by conviction score descending (highest = most worth buying)
 * 3. Allocate the lump sum proportionally to conviction scores
 * 4. Show a ranked table with fund name, signal, goal, score, and suggested amount
 *
 * EXCLUSIONS (handled by the scoring function):
 * - Emergency fund goals always get 0 (no equity ever)
 * - Goals < 2 years away always get 0 (capital preservation)
 *
 * References: SW-3, DEC-034, Brief §4.2 (goal types), Brief §4.3 (health)
 *
 * Styling: Uses the same CSS variables and inline styles as the rest of the app.
 * No Tailwind, no CSS frameworks — consistent with CLAUDE.md design principles.
 */

import { useMemo } from 'react';
import {
  computeConvictionScore,
  allocateLumpSum,
  GOAL_TYPES,
} from '../goalUtils';

// ─── Conviction color bands ─────────────────────────────────────────
// These map conviction score ranges to visual indicators.
// High conviction = green (buy aggressively), low = amber (be cautious).
function convictionColor(score) {
  if (score >= 70) return { bg: '#EAF3DE', color: '#3B6D11', label: 'High' };
  if (score >= 40) return { bg: '#FAEEDA', color: '#854F0B', label: 'Medium' };
  return { bg: '#FCEBEB', color: '#A32D2D', label: 'Low' };
}

/**
 * Format INR with Indian number system (commas at lakh/crore positions).
 * e.g., 1500000 → ₹15,00,000
 */
function fmtINR(n) {
  if (n == null || n === 0) return '₹0';
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Build a one-line explanation for why this entry scored the way it did.
 * This helps the user understand the recommendation, not just follow it blindly.
 * (Design principle: "You decide, AI advises" — show the reasoning.)
 */
function buildExplanation({ dipPercent, marketPE, yearsLeft, onTrackPct, goalLabel, drawdownPercent }) {
  const parts = [];

  // Dip depth
  if (dipPercent >= 10) parts.push(`Deep dip (-${dipPercent.toFixed(1)}%)`);
  else if (dipPercent >= 5) parts.push(`Moderate dip (-${dipPercent.toFixed(1)}%)`);
  else parts.push(`Mild dip (-${dipPercent.toFixed(1)}%)`);

  // Market valuation
  if (marketPE != null) {
    if (marketPE < 18) parts.push('cheap market');
    else if (marketPE <= 22) parts.push('fair market');
    else parts.push('expensive market');
  }

  // Drawdown
  if (drawdownPercent > 20) parts.push(`${Math.abs(drawdownPercent).toFixed(0)}% off 52W high`);

  // Horizon
  if (yearsLeft > 15) parts.push(`long horizon (${Math.round(yearsLeft)}Y ${goalLabel})`);
  else if (yearsLeft > 5) parts.push(`medium horizon (${Math.round(yearsLeft)}Y ${goalLabel})`);
  else parts.push(`short horizon (${Math.round(yearsLeft)}Y ${goalLabel})`);

  // Health
  if (onTrackPct < 70) parts.push('goal at risk');
  else if (onTrackPct < 90) parts.push('goal needs attention');

  return parts.join(' + ') + ' = ' + (
    parts.length >= 3 ? 'high conviction' :
    parts.length >= 2 ? 'moderate conviction' : 'cautious'
  );
}

// ─── Component ──────────────────────────────────────────────────────
export default function DipPrioritisation({
  lumpSum,           // number: user-entered lump sum in INR
  funds,             // array: FUNDS config from App.jsx (fund definitions)
  metrics,           // object: { fundId: { signal, fromAvg, drawdownFrom52, cur, hi, ... } }
  goalsConfig,       // object: { goalId: { label, yearsLeft, targetLakh, emoji, funds, ... } }
  marketPE,          // object: { largecap, midcap, smallcap } — P/E ratios per index
  healthMap,         // object: { goalId: { onTrackPct, status, ... } } — from GoalDashboard
}) {
  const bs = '0.5px solid var(--border)';

  // ── Compute scored entries ──────────────────────────────────────
  // For each fund with a Buy Dip signal, iterate over every goal that
  // fund belongs to and compute a conviction score for that pair.
  // A single fund can appear multiple times if it's linked to multiple goals
  // (e.g., HDFC Small Cap mapped to both Retirement and Education).
  const scoredEntries = useMemo(() => {
    const entries = [];

    for (const fund of funds) {
      const m = metrics[fund.id];
      // Only process funds with Buy Dip or Watch signal
      // (Watch is included because the user might want to act on those too,
      //  but they'll naturally score lower due to shallower dip depth.)
      if (!m || (m.signal.id !== 'dip' && m.signal.id !== 'watch')) continue;

      // Arbitrage/debt funds are not equity — skip them for dip buying
      if (fund.category === 'Arbitrage') continue;

      // Collect all goal IDs this fund belongs to (both legacy and new goals)
      const goalIds = new Set(fund.goals || []);
      Object.entries(goalsConfig).forEach(([gid, gc]) => {
        if (gc.funds?.[fund.id] !== undefined && gc.funds[fund.id] > 0) {
          goalIds.add(gid);
        }
      });

      for (const gid of goalIds) {
        const gc = goalsConfig[gid];
        if (!gc) continue;

        // Get the P/E for this fund's market index
        const pe = fund.index ? marketPE[fund.index] : null;

        // Get goal health (on-track %) from the health map if available.
        // If healthMap is not provided (e.g., user hasn't set corpus yet),
        // default to 100% (assume on-track — conservative: won't inflate urgency).
        const health = healthMap?.[gid];
        const onTrackPct = health?.onTrackPct ?? 100;

        // Infer goal type from the goal config
        // Legacy goals use the goalId as type (e.g., 'retirement', 'education')
        // New goals have a goalType field
        const goalType = gc.goalType || gid;

        const score = computeConvictionScore({
          dipPercent: Math.abs(m.fromAvg),
          marketPE: pe,
          drawdownPercent: Math.abs(m.drawdownFrom52 || 0),
          yearsLeft: gc.yearsLeft || 0,
          onTrackPct,
          goalType,
        });

        entries.push({
          fundId: fund.id,
          fundName: fund.name,
          fundCategory: fund.category,
          signalId: m.signal.id,
          signalLabel: m.signal.label,
          signalColor: m.signal.color,
          signalBg: m.signal.bg,
          dipPercent: Math.abs(m.fromAvg),
          drawdownPercent: m.drawdownFrom52 || 0,
          goalId: gid,
          goalLabel: gc.label || gid,
          goalEmoji: gc.emoji || GOAL_TYPES[goalType]?.emoji || '🎯',
          yearsLeft: gc.yearsLeft || 0,
          onTrackPct,
          goalType,
          marketPE: pe,
          score,
        });
      }
    }

    // Sort by conviction score descending (highest first)
    entries.sort((a, b) => b.score - a.score);
    return entries;
  }, [funds, metrics, goalsConfig, marketPE, healthMap]);

  // ── Allocate lump sum ───────────────────────────────────────────
  const allocations = useMemo(() => {
    if (!lumpSum || lumpSum <= 0) return [];
    return allocateLumpSum(scoredEntries, lumpSum);
  }, [scoredEntries, lumpSum]);

  // ── Build a lookup for suggested amounts ────────────────────────
  const amountMap = useMemo(() => {
    const map = {};
    for (const a of allocations) {
      map[`${a.fundId}_${a.goalId}`] = a.suggestedAmount;
    }
    return map;
  }, [allocations]);

  // ── Determine if there are any dip signals at all ───────────────
  const hasDipSignals = scoredEntries.some(e => e.score > 0);

  // ── Don't render if no lump sum entered ─────────────────────────
  if (!lumpSum || lumpSum <= 0) return null;

  // ── No dip signals: show hold message ───────────────────────────
  if (!hasDipSignals) {
    return (
      <div style={{
        padding: '14px 16px', background: 'var(--bg)',
        borderRadius: 'var(--radius-lg)', border: bs, marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>💰</span>
          <span style={{ fontSize: 13, fontWeight: 500 }}>Deploy Lump Sum: {fmtINR(lumpSum)}</span>
        </div>
        <div style={{
          padding: '10px 12px', background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          No dip signals today. Hold your lump sum or continue regular SIPs.
          Deploying during neutral or strong-run signals means buying at or above
          average prices — wait for a meaningful correction.
        </div>
      </div>
    );
  }

  // ── Render ranked table ─────────────────────────────────────────
  // Only show entries with score > 0 (excludes emergency and imminent goals)
  const visibleEntries = scoredEntries.filter(e => e.score > 0);

  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
      border: bs, marginBottom: 14, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: bs,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💰</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Deploy Lump Sum</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              Ranked by conviction score · {visibleEntries.length} opportunit{visibleEntries.length === 1 ? 'y' : 'ies'}
            </div>
          </div>
        </div>
        <span style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
        }}>
          {fmtINR(lumpSum)}
        </span>
      </div>

      {/* Ranked entries */}
      {visibleEntries.map((entry, idx) => {
        const cc = convictionColor(entry.score);
        const amount = amountMap[`${entry.fundId}_${entry.goalId}`] || 0;
        const explanation = buildExplanation(entry);

        return (
          <div key={`${entry.fundId}_${entry.goalId}`} style={{
            padding: '10px 16px', borderBottom: idx < visibleEntries.length - 1 ? bs : 'none',
          }}>
            {/* Row: Rank + Fund + Signal + Goal + Score + Amount */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Rank badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 600,
                background: cc.bg, color: cc.color, flexShrink: 0,
              }}>
                {idx + 1}
              </span>

              {/* Fund + Goal info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {entry.fundName}
                  </span>
                  <span style={{
                    padding: '1px 7px', borderRadius: 99, fontSize: 9, fontWeight: 500,
                    background: entry.signalBg, color: entry.signalColor,
                  }}>
                    {entry.signalLabel} {entry.dipPercent.toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {entry.goalEmoji} {entry.goalLabel} · {Math.round(entry.yearsLeft)}Y
                </div>
              </div>

              {/* Conviction score */}
              <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 50 }}>
                <div style={{
                  fontSize: 14, fontWeight: 600, color: cc.color,
                }}>{entry.score}</div>
                <div style={{
                  fontSize: 8, textTransform: 'uppercase', letterSpacing: '.05em',
                  color: cc.color, fontWeight: 500,
                }}>{cc.label}</div>
              </div>

              {/* Suggested amount */}
              <div style={{
                textAlign: 'right', flexShrink: 0, minWidth: 80,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {fmtINR(amount)}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
                  {lumpSum > 0 ? Math.round(amount / lumpSum * 100) : 0}% of total
                </div>
              </div>
            </div>

            {/* Explanation line */}
            <div style={{
              fontSize: 10, color: 'var(--text-secondary)', marginTop: 5,
              marginLeft: 34, lineHeight: 1.5,
            }}>
              {explanation}
            </div>
          </div>
        );
      })}

      {/* Footer note */}
      <div style={{
        padding: '8px 16px', background: 'var(--bg-secondary)',
        fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6,
      }}>
        Suggested amounts are proportional to conviction scores and rounded to ₹500.
        This is a decision aid — review each recommendation before investing.
      </div>
    </div>
  );
}
