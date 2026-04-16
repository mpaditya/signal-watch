/**
 * GoalDashboard.jsx — Goal Health Dashboard
 * 
 * BRIDGE COMPONENT: reads the existing goalsConfig format from App.jsx
 * and layers goal health projections, off-track detection, and corpus
 * tracking on top — without breaking the existing signal/verdict system.
 * 
 * Integration: <GoalDashboard goalsConfig={goalsConfig} funds={FUNDS}
 *                onUpdateGoalsConfig={setGoalsConfig} />
 * 
 * The existing goals panel (SIP amounts, years, targets) continues to
 * work as-is for signal verdicts. This dashboard ADDS:
 * - Per-goal health status (green/amber/red)
 * - Projected corpus vs target
 * - Off-track lever recommendations
 * - Corpus tracking with staleness nudges
 * - New goal creation with v4 schema
 * 
 * References: Brief §4.1–4.3, SW-1, SW-2
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import GoalCard from './GoalCard';
import GoalForm from './GoalForm';
import {
  GOAL_TYPES,
  GOAL_STATUSES,
  computeGoalHealth,
  formatLakh,
  createGoal,
  updateGoal,
} from '../goalUtils';

// ─── Bridge: convert existing goalsConfig to v4 goal objects ───────
// Existing format:
//   { retirement: { label, yearsLeft, targetLakh, emoji,
//                   funds: {fid: amount}, sipDates: {fid: date} } }
// V4 format:
//   { id, label, goalType, startDate, targetDate, totalYears,
//     currentCorpus, assumedCAGR,
//     funds: { fid: { monthlySIP, sipDate, alertEnabled } }, status, ... }

const CORPUS_STORAGE_KEY = 'artha_goal_corpus';
const EXTRA_GOAL_STORAGE_KEY = 'artha_goals_v4';

function loadCorpusData() {
  try {
    const raw = localStorage.getItem(CORPUS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveCorpusData(data) {
  try { localStorage.setItem(CORPUS_STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function loadExtraGoals() {
  try {
    const raw = localStorage.getItem(EXTRA_GOAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveExtraGoals(goals) {
  try { localStorage.setItem(EXTRA_GOAL_STORAGE_KEY, JSON.stringify(goals)); } catch {}
}

/**
 * Convert a single legacy goal entry to v4 format.
 * Merges in corpus + CAGR data from separate storage.
 */
function legacyToV4(goalId, legacyGoal, corpusData) {
  const goalType = inferType(goalId, legacyGoal.label);
  const typeDef = GOAL_TYPES[goalType];
  const yearsLeft = legacyGoal.yearsLeft || 10;
  const now = new Date();

  // Use today as start, yearsLeft as totalYears
  const startDate = now.toISOString().slice(0, 10);
  const targetDate = new Date(now);
  targetDate.setFullYear(targetDate.getFullYear() + yearsLeft);

  // Convert funds: {fid: amount} + sipDates: {fid: date}
  //            →   {fid: {monthlySIP, sipDate, alertEnabled}}
  const funds = {};
  if (legacyGoal.funds) {
    for (const [fid, amount] of Object.entries(legacyGoal.funds)) {
      funds[fid] = {
        monthlySIP: Number(amount) || 0,
        sipDate: legacyGoal.sipDates?.[fid] || 1,
        alertEnabled: true,
      };
    }
  }

  const corpus = corpusData[goalId] || {};

  return {
    id: goalId,
    label: legacyGoal.label || 'Goal',
    emoji: legacyGoal.emoji || typeDef?.emoji || '🎯',
    goalType,
    startDate,
    targetDate: targetDate.toISOString().slice(0, 10),
    totalYears: yearsLeft,
    currentCorpus: corpus.amount || 0,
    corpusUpdatedAt: corpus.updatedAt || null,
    targetLakh: legacyGoal.targetLakh || 0,
    assumedCAGR: corpus.assumedCAGR || typeDef?.defaultCAGR || 12,
    funds,
    status: GOAL_STATUSES.ACTIVE,
    createdAt: corpus.createdAt || now.toISOString(),
    _isLegacy: true,
  };
}

function inferType(goalId, label) {
  const lower = (goalId + ' ' + (label || '')).toLowerCase();
  if (lower.includes('retire')) return 'retirement';
  if (lower.includes('education') || lower.includes('kid')) return 'education';
  if (lower.includes('car')) return 'car';
  if (lower.includes('house')) return 'house';
  if (lower.includes('travel')) return 'travel';
  if (lower.includes('wedding')) return 'wedding';
  if (lower.includes('emergency')) return 'emergency';
  return 'retirement';
}

// ─── Component ─────────────────────────────────────────────────────
export default function GoalDashboard({ goalsConfig, funds, onUpdateGoalsConfig, onHealthUpdate }) {
  const [corpusData, setCorpusData] = useState(() => loadCorpusData());
  const [extraGoals, setExtraGoals] = useState(() => loadExtraGoals());
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [corpusGoalId, setCorpusGoalId] = useState(null);
  const [corpusInput, setCorpusInput] = useState('');

  // Build unified goals array: legacy goals from goalsConfig + extra goals NOT already in goalsConfig
  // (New goals get injected into goalsConfig on save, so we skip them from extraGoals to avoid dupes)
  const allGoals = useMemo(() => {
    const configKeys = new Set(Object.keys(goalsConfig || {}));
    const legacy = Object.entries(goalsConfig || {}).map(([gid, g]) =>
      legacyToV4(gid, g, corpusData)
    );
    const extras = extraGoals
      .filter(g => g.status === GOAL_STATUSES.ACTIVE && !configKeys.has(g.id));
    return [...legacy, ...extras];
  }, [goalsConfig, corpusData, extraGoals]);

  // Compute health for all goals
  const healthMap = useMemo(() => {
    const map = {};
    for (const goal of allGoals) {
      map[goal.id] = computeGoalHealth(goal);
    }
    return map;
  }, [allGoals]);

  // SW-3: Propagate healthMap to parent (App.jsx) for DipPrioritisation component.
  // This avoids duplicating the health computation logic — GoalDashboard owns the
  // health engine, and passes results up for the conviction scorer to use.
  useEffect(() => {
    if (onHealthUpdate) onHealthUpdate(healthMap);
  }, [healthMap, onHealthUpdate]);

  // Summary stats
  const summary = useMemo(() => {
    let totalInvested = 0, totalProjected = 0, totalTarget = 0, atRisk = 0;
    for (const goal of allGoals) {
      const h = healthMap[goal.id];
      if (!h) continue;
      totalInvested += goal.currentCorpus || 0;
      totalProjected += h.projected;
      totalTarget += h.targetINR;
      if (h.status === 'red') atRisk++;
    }
    return { totalInvested, totalProjected, totalTarget, atRisk, count: allGoals.length };
  }, [allGoals, healthMap]);

  // ── Corpus Update ───────────────────────────────────────────────
  const openCorpusUpdate = useCallback((goalId) => {
    setCorpusInput(corpusData[goalId]?.amount || '');
    setCorpusGoalId(goalId);
  }, [corpusData]);

  const saveCorpus = useCallback(() => {
    if (!corpusGoalId) return;
    const updated = {
      ...corpusData,
      [corpusGoalId]: {
        ...corpusData[corpusGoalId],
        amount: parseFloat(corpusInput) || 0,
        updatedAt: new Date().toISOString().slice(0, 10),
      },
    };
    setCorpusData(updated);
    saveCorpusData(updated);
    setCorpusGoalId(null);
    setCorpusInput('');
  }, [corpusGoalId, corpusInput, corpusData]);

  // ── Edit ────────────────────────────────────────────────────────
  const handleEdit = useCallback((goal) => {
    setEditingGoal(goal);
    setFormOpen(true);
  }, []);

  // ── Save from GoalForm ──────────────────────────────────────────
  const handleFormSave = useCallback((goal) => {
    if (goal._isLegacy) {
      // Sync corpus + CAGR to separate storage
      const updated = {
        ...corpusData,
        [goal.id]: {
          ...corpusData[goal.id],
          amount: goal.currentCorpus || 0,
          updatedAt: goal.corpusUpdatedAt || new Date().toISOString().slice(0, 10),
          assumedCAGR: goal.assumedCAGR,
        },
      };
      setCorpusData(updated);
      saveCorpusData(updated);

      // Convert v4 funds back to legacy format and sync everything
      // v4: { fid: { monthlySIP, sipDate, alertEnabled } }
      // legacy: funds: { fid: amount }, sipDates: { fid: date }
      const legacyFunds = {};
      const legacySipDates = {};
      if (goal.funds) {
        for (const [fid, fdata] of Object.entries(goal.funds)) {
          legacyFunds[fid] = fdata.monthlySIP || 0;
          legacySipDates[fid] = fdata.sipDate || 1;
        }
      }

      if (onUpdateGoalsConfig) {
        onUpdateGoalsConfig(prev => ({
          ...prev,
          [goal.id]: {
            ...prev[goal.id],
            yearsLeft: goal.totalYears,
            targetLakh: goal.targetLakh,
            label: goal.label,
            emoji: goal.emoji,
            funds: legacyFunds,
            sipDates: legacySipDates,
          },
        }));
      }
    } else {
      // New goal: save to extra goals storage for health dashboard
      setExtraGoals(prev => {
        const idx = prev.findIndex(g => g.id === goal.id);
        let next;
        if (idx >= 0) {
          next = [...prev];
          next[idx] = goal;
        } else {
          next = [...prev, goal];
        }
        saveExtraGoals(next);
        return next;
      });

      // ALSO inject into goalsConfig in legacy format so the signal/verdict
      // system, header pills, goals panel, and filter tabs all pick it up.
      // Convert v4 funds → legacy funds + sipDates
      const legacyFunds = {};
      const legacySipDates = {};
      if (goal.funds) {
        for (const [fid, fdata] of Object.entries(goal.funds)) {
          legacyFunds[fid] = fdata.monthlySIP || 0;
          legacySipDates[fid] = fdata.sipDate || 1;
        }
      }

      // Store corpus + CAGR in separate storage (same as legacy goals)
      const updatedCorpus = {
        ...corpusData,
        [goal.id]: {
          ...corpusData[goal.id],
          amount: goal.currentCorpus || 0,
          updatedAt: goal.corpusUpdatedAt || new Date().toISOString().slice(0, 10),
          assumedCAGR: goal.assumedCAGR,
        },
      };
      setCorpusData(updatedCorpus);
      saveCorpusData(updatedCorpus);

      if (onUpdateGoalsConfig) {
        onUpdateGoalsConfig(prev => ({
          ...prev,
          [goal.id]: {
            label: goal.label,
            emoji: goal.emoji,
            yearsLeft: goal.totalYears,
            targetLakh: goal.targetLakh,
            funds: legacyFunds,
            sipDates: legacySipDates,
          },
        }));
      }
    }
    setEditingGoal(null);
    setFormOpen(false);
  }, [corpusData, onUpdateGoalsConfig]);

  // ── Status Change (extra goals only) ────────────────────────────
  const handleStatusChange = useCallback((goalId, newStatus) => {
    setExtraGoals(prev => {
      const updated = prev.map(g => g.id === goalId ? { ...g, status: newStatus } : g);
      saveExtraGoals(updated);
      return updated;
    });
  }, []);

  // ── Fund list for GoalForm ──────────────────────────────────────
  const trackedFunds = useMemo(() =>
    (funds || []).map(f => ({ id: f.id, name: f.name, category: f.category })),
    [funds]
  );

  const bs = '0.5px solid var(--border)';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.25rem 1.5rem' }}>
      <div style={{ borderTop: bs, marginBottom: 16 }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          🎯 Goal Health
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>
            Projections & Tracking
          </span>
        </div>
        <button
          onClick={() => { setEditingGoal(null); setFormOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 13px', borderRadius: 99,
            border: '0.5px solid var(--border-strong)',
            background: 'var(--bg)', color: 'var(--text-secondary)',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          + New Goal
        </button>
      </div>

      {/* Summary pills */}
      {summary.count > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {summary.totalInvested > 0 && (
            <span style={{ padding: '3px 11px', background: 'var(--bg-secondary)', borderRadius: 99, fontSize: 11, color: 'var(--text-secondary)' }}>
              Invested: <b style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatLakh(summary.totalInvested)}</b>
            </span>
          )}
          <span style={{ padding: '3px 11px', background: 'var(--bg-secondary)', borderRadius: 99, fontSize: 11, color: 'var(--text-secondary)' }}>
            Projected: <b style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatLakh(summary.totalProjected)}</b>
          </span>
          <span style={{ padding: '3px 11px', background: 'var(--bg-secondary)', borderRadius: 99, fontSize: 11, color: 'var(--text-secondary)' }}>
            Target: <b style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatLakh(summary.totalTarget)}</b>
          </span>
          {summary.atRisk > 0 && (
            <span style={{ padding: '3px 11px', background: '#FCEBEB', borderRadius: 99, fontSize: 11, fontWeight: 500, color: '#A32D2D' }}>
              {summary.atRisk} at risk
            </span>
          )}
        </div>
      )}

      {/* First-time hint */}
      {allGoals.length > 0 && allGoals.every(g => !g.currentCorpus) && (
        <div style={{
          padding: '10px 14px', background: 'var(--bg)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 'var(--radius-md, 8px)',
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14,
        }}>
          💡 <strong style={{ fontWeight: 500 }}>Tip:</strong> Tap "Update Corpus" on each goal
          to enter your current invested amount. This enables accurate on-track projections.
          Check your CAS statement or fund app for latest values.
        </div>
      )}

      {/* Goal Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {allGoals.map(goal => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={handleEdit}
            onUpdateCorpus={openCorpusUpdate}
            onStatusChange={goal._isLegacy ? undefined : handleStatusChange}
          />
        ))}
      </div>

      {allGoals.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', fontSize: 13 }}>
          No goals to display. Create a goal to start tracking.
        </div>
      )}

      {/* Goal Form Modal */}
      <GoalForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditingGoal(null); }}
        onSave={handleFormSave}
        existingGoal={editingGoal}
        trackedFunds={trackedFunds}
      />

      {/* Corpus Update Modal */}
      {corpusGoalId !== null && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 1000, padding: 16,
          }}
          onClick={() => setCorpusGoalId(null)}
        >
          <div
            style={{
              background: 'var(--bg)', border: '0.5px solid var(--border-strong)',
              borderRadius: 'var(--radius-lg, 12px)', padding: '1.25rem',
              width: '100%', maxWidth: 360,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
              💰 Update Current Corpus
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
              Enter the total current value of all investments for this goal
              (MF units + RDs + FDs). Check your CAS statement or fund app for latest values.
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>Amount (₹)</div>
              <input
                type="number"
                value={corpusInput}
                onChange={e => setCorpusInput(e.target.value)}
                placeholder="e.g., 350000"
                min="0"
                autoFocus
                style={{
                  width: '100%', padding: '8px 10px',
                  border: '0.5px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: 14, fontWeight: 500, boxSizing: 'border-box',
                  background: 'var(--bg)', color: 'var(--text-primary)',
                }}
              />
              {corpusInput && parseFloat(corpusInput) > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                  = ₹{(parseFloat(corpusInput) / 100000).toFixed(1)} Lakhs
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCorpusGoalId(null)}
                style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 12,
                  border: '0.5px solid var(--border-strong)',
                  background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={saveCorpus}
                style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 12,
                  border: 'none', background: 'var(--text-primary)',
                  color: 'var(--bg)', fontWeight: 500, cursor: 'pointer',
                }}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
