/**
 * GoalForm.jsx — Add / Edit Goal Modal
 *
 * Section order (deliberate):
 *   Goal Type → Name → Target → Timeline → Corpus → Linked Funds → CAGR
 *
 * Fund Mapping intentionally comes BEFORE CAGR so the user picks their
 * funds first, and the CAGR suggestion auto-updates based on the indices
 * of the funds they've linked. Only then should they (optionally) override.
 *
 * CAGR suggestion logic:
 *   - Calls computeSuggestedCAGR() from goalUtils.js
 *   - Uses historical index CAGRs (Nifty 50 / MC150 / SC250) at the ceiling
 *     horizon bucket, weighted by SIP, minus 0.5% conservatism buffer
 *   - Slider is constrained to ±5 percentage points from the suggestion
 *   - Override warning shown when user sets CAGR above the suggestion
 *
 * Styled to match existing Signal Watch design language (CSS variables).
 * References: Brief §4.1 (schema), §4.2 (goal categories), DEC-012, DEC-015
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  GOAL_TYPES,
  GOAL_TYPE_OPTIONS,
  createGoal,
  updateGoal,
  validateGoal,
  computeSuggestedCAGR,
  getHorizonBucket,
  INDEX_HISTORICAL_CAGR,
  CONSERVATIVE_CAGR_DISCOUNT,
} from '../goalUtils';

// Human-readable labels for each index key — mirrors PE_BANDS labels in App.jsx
const INDEX_DISPLAY = {
  largecap:  'Nifty 50',
  midcap:    'Nifty MC150',
  smallcap:  'Nifty SC250',
  arbitrage: 'Arbitrage',
};

export default function GoalForm({ isOpen, onClose, onSave, existingGoal, trackedFunds }) {
  const isEdit = !!existingGoal;
  const bs = '0.5px solid var(--border-strong)';

  // ── Core goal fields ──────────────────────────────────────────────
  const [goalType,      setGoalType]      = useState('retirement');
  const [label,         setLabel]         = useState('');
  const [emoji,         setEmoji]         = useState('');
  const [startDate,     setStartDate]     = useState(new Date().toISOString().slice(0, 10));
  const [totalYears,    setTotalYears]    = useState(22);
  const [targetLakh,    setTargetLakh]    = useState('');
  const [currentCorpus, setCurrentCorpus] = useState('');
  const [assumedCAGR,   setAssumedCAGR]   = useState(12);
  const [selectedFunds, setSelectedFunds] = useState({});
  const [errors,        setErrors]        = useState([]);

  // ── CAGR override tracking ────────────────────────────────────────
  // cagrOverrodeRef is a useRef so it never causes stale-closure issues
  // inside the auto-update useEffect below. cagrOverride state mirrors
  // it purely for conditional rendering (reset button, breakdown colour).
  const cagrOverrodeRef = useRef(false);
  const [cagrOverride, setCagrOverride] = useState(false);

  function markCagrOverride(val) {
    cagrOverrodeRef.current = val;
    setCagrOverride(val);
  }

  // ── CAGR suggestion (derived from linked funds + horizon) ─────────
  // Returns null if no eligible funds → falls back to goal-type default.
  // Recomputes whenever: funds change, years change, goal type changes.
  const suggestedCAGR = useMemo(() => {
    const fromFunds = computeSuggestedCAGR(
      selectedFunds,
      parseInt(totalYears) || 1,
      trackedFunds
    );
    // Fall back to goal-type default if no fund-derived suggestion available
    return fromFunds ?? (GOAL_TYPES[goalType]?.defaultCAGR ?? 12);
  }, [selectedFunds, totalYears, goalType, trackedFunds]);

  // ── CAGR breakdown for display ────────────────────────────────────
  // Lists which index contributed and at what weight, shown below the slider.
  const cagrBreakdown = useMemo(() => {
    if (!selectedFunds || !trackedFunds) return null;
    const years = parseInt(totalYears) || 1;
    const bucket = getHorizonBucket(years);
    const parts = [];
    let totalSIP = 0;

    for (const [fundId, fundCfg] of Object.entries(selectedFunds)) {
      const meta = trackedFunds.find(f => f.id === fundId);
      if (!meta) continue;

      const indexKey = meta.index
        || (meta.category?.toLowerCase().includes('arbitrage') ? 'arbitrage' : null);
      if (!indexKey || !INDEX_HISTORICAL_CAGR[indexKey]) continue;

      const rawCagr = INDEX_HISTORICAL_CAGR[indexKey][bucket];
      const sip = fundCfg.monthlySIP || 0;
      parts.push({ indexKey, label: INDEX_DISPLAY[indexKey] || indexKey, rawCagr, sip });
      totalSIP += sip;
    }

    if (parts.length === 0) return null;

    // Deduplicate by indexKey (multiple funds can share an index; merge their SIPs)
    const merged = [];
    for (const p of parts) {
      const existing = merged.find(m => m.indexKey === p.indexKey);
      if (existing) existing.sip += p.sip;
      else merged.push({ ...p });
    }

    // Compute display weight % for each index
    const totalMergedSIP = merged.reduce((s, m) => s + m.sip, 0);
    const withWeights = merged.map(m => ({
      ...m,
      weight: totalMergedSIP > 0
        ? Math.round((m.sip / totalMergedSIP) * 100)
        : Math.round(100 / merged.length),
    }));

    return { parts: withWeights, bucket };
  }, [selectedFunds, totalYears, trackedFunds]);

  // ── Slider bounds ─────────────────────────────────────────────────
  // Constrain to ±5 percentage points from suggestion, clamped to [4, 18].
  // The ±5 rule ensures the user stays close to evidence-based estimates —
  // enough room to express a view, not enough to go wildly optimistic.
  const cagrMin = Math.max(4,  suggestedCAGR - 5);
  const cagrMax = Math.min(18, suggestedCAGR + 5);

  // ── Auto-update CAGR when suggestion changes ──────────────────────
  // Triggered when: fund selection changes, years change, goal type changes.
  // Uses ref (not state) to read cagrOverride — avoids stale closure.
  useEffect(() => {
    if (!cagrOverrodeRef.current) {
      // User hasn't manually moved the slider: snap to new suggestion
      setAssumedCAGR(suggestedCAGR);
    } else {
      // User has overridden: clamp their chosen value to the new valid range
      const lo = Math.max(4,  suggestedCAGR - 5);
      const hi = Math.min(18, suggestedCAGR + 5);
      setAssumedCAGR(prev => Math.min(hi, Math.max(lo, prev)));
    }
  }, [suggestedCAGR]); // intentionally only suggestedCAGR; reads cagrOverrodeRef via ref

  // ── Populate form on open ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (existingGoal) {
      setGoalType(existingGoal.goalType);
      setLabel(existingGoal.label);
      setEmoji(existingGoal.emoji || GOAL_TYPES[existingGoal.goalType]?.emoji || '🎯');
      setStartDate(existingGoal.startDate);
      setTotalYears(existingGoal.totalYears);
      setTargetLakh(existingGoal.targetLakh || '');
      setCurrentCorpus(existingGoal.currentCorpus || '');
      setAssumedCAGR(existingGoal.assumedCAGR);
      setSelectedFunds(existingGoal.funds || {});
      // Edit mode: keep the saved CAGR as-is; do not auto-override it with the suggestion.
      // The suggestion is still displayed for reference, and a reset button is available.
      markCagrOverride(true);
    } else {
      const dt = 'retirement';
      setGoalType(dt);
      setLabel('');
      setEmoji(GOAL_TYPES[dt].emoji);
      setStartDate(new Date().toISOString().slice(0, 10));
      setTotalYears(GOAL_TYPES[dt].defaultHorizonYears);
      setTargetLakh('');
      setCurrentCorpus('');
      setAssumedCAGR(GOAL_TYPES[dt].defaultCAGR);
      setSelectedFunds({});
      // New goal: let the suggestion drive CAGR automatically as funds are linked.
      markCagrOverride(false);
    }
    setErrors([]);
  }, [isOpen, existingGoal]);

  // ── Goal type change ──────────────────────────────────────────────
  const handleTypeChange = (type) => {
    setGoalType(type);
    const td = GOAL_TYPES[type];
    setEmoji(td.emoji);
    if (!isEdit) {
      setTotalYears(td.defaultHorizonYears);
      if (!label) setLabel(td.label);
      // Do NOT reset assumedCAGR here — the suggestion useEffect handles it
    }
  };

  // ── Target date display ───────────────────────────────────────────
  const targetDateDisplay = useMemo(() => {
    if (!startDate || !totalYears) return '—';
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + parseInt(totalYears, 10));
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }, [startDate, totalYears]);

  // ── Fund selection ────────────────────────────────────────────────
  const handleFundToggle = (fundId) => {
    setSelectedFunds(prev => {
      const copy = { ...prev };
      if (copy[fundId]) delete copy[fundId];
      else copy[fundId] = { monthlySIP: 0, sipDate: 1, alertEnabled: true };
      return copy;
    });
  };

  const handleFundSIPChange = (fundId, value) => {
    setSelectedFunds(prev => ({
      ...prev,
      [fundId]: { ...prev[fundId], monthlySIP: parseInt(value, 10) || 0 },
    }));
  };

  // ── CAGR warnings ─────────────────────────────────────────────────
  // Two independent warning systems:
  //
  //   cagrWarning       — absolute rule violations regardless of suggestion
  //                       (>15% is unrealistic, short horizon + high rate, emergency fund)
  //
  //   showOverrideWarning — user is ABOVE the fund-derived / goal-type suggestion
  //                         (optimism risk: goal appears on-track but likely isn't)
  //
  // Being BELOW the suggestion is fine — conservatism is good here.
  const cagrWarning = useMemo(() => {
    if (assumedCAGR > 15) return 'CAGR above 15% is extremely aggressive and historically rare over full market cycles.';
    if (assumedCAGR > 12 && totalYears < 10) return 'High CAGR assumptions over short horizons carry significant sequence-of-returns risk.';
    if (goalType === 'emergency' && assumedCAGR > 8) return 'Emergency funds should use low-risk instruments (debt / liquid / arbitrage). 7–8% is appropriate.';
    return null;
  }, [assumedCAGR, totalYears, goalType]);

  // Small epsilon (0.05) avoids false-positive warnings from floating-point arithmetic
  const showOverrideWarning = assumedCAGR > suggestedCAGR + 0.05;

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const goalData = {
      label: label.trim() || GOAL_TYPES[goalType]?.label || 'Goal',
      goalType, emoji, startDate,
      totalYears:    parseInt(totalYears, 10),
      targetLakh:    parseFloat(targetLakh) || 0,
      currentCorpus: parseFloat(currentCorpus) || 0,
      assumedCAGR:   parseFloat(assumedCAGR),
      funds: selectedFunds,
    };
    const errs = validateGoal(goalData);
    if (errs.length > 0) { setErrors(errs); return; }

    const saved = isEdit ? updateGoal(existingGoal, goalData) : createGoal(goalData);
    onSave(saved);
    onClose();
  };

  if (!isOpen) return null;

  const inputStyle = {
    width: '100%', padding: '6px 10px', border: bs,
    borderRadius: 'var(--radius-md, 8px)', fontSize: 13, fontWeight: 500,
    background: 'var(--bg)', color: 'var(--text-primary)', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg)', border: bs,
          borderRadius: 'var(--radius-lg, 12px)',
          width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto',
          padding: '1.25rem', position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Close button ─────────────────────────────────────── */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 14, background: 'none',
          border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer',
        }}>✕</button>

        {/* ── Title ────────────────────────────────────────────── */}
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{emoji}</span>
          {isEdit ? 'Edit Goal' : 'New Goal'}
        </div>

        {/* ── Goal Type Picker ──────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Goal Type
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
            {GOAL_TYPE_OPTIONS.map(t => (
              <button key={t.key} type="button" onClick={() => handleTypeChange(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 10px', borderRadius: 'var(--radius-md, 8px)',
                  border: goalType === t.key ? '1.5px solid var(--text-primary)' : bs,
                  background: goalType === t.key ? 'var(--bg-secondary)' : 'var(--bg)',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
                  fontWeight: goalType === t.key ? 500 : 400,
                }}>
                <span style={{ fontSize: 16 }}>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
          {GOAL_TYPES[goalType] && (
            <div style={{
              fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5,
              padding: '7px 10px', background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md, 8px)', borderLeft: '3px solid var(--text-primary)',
            }}>
              {GOAL_TYPES[goalType].description}
              {GOAL_TYPES[goalType].isFixed === true && (
                <span style={{ color: '#854F0B' }}> Target is non-negotiable.</span>
              )}
            </div>
          )}
        </div>

        {/* ── Goal Name ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Goal Name</label>
          <input style={inputStyle} type="text" value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={GOAL_TYPES[goalType]?.label || 'My Goal'} maxLength={50} />
        </div>

        {/* ── Target Corpus ─────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Target Corpus (₹ Lakhs)</label>
          <input style={inputStyle} type="number" value={targetLakh}
            onChange={e => setTargetLakh(e.target.value)} placeholder="e.g., 100 for ₹1 Cr" min="0" step="1" />
          {targetLakh && parseFloat(targetLakh) >= 100 && (
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
              = ₹{(parseFloat(targetLakh) / 100).toFixed(1)} Crore
            </div>
          )}
        </div>

        {/* ── Timeline ──────────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
            Timeline
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input style={inputStyle} type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Horizon (years)</label>
              <input style={inputStyle} type="number" value={totalYears}
                onChange={e => setTotalYears(e.target.value)} min="1" max="40" />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 500 }}>
            Target: {targetDateDisplay}
          </div>
        </div>

        {/* ── Current Corpus ────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Current Corpus (₹)</label>
          <input style={inputStyle} type="number" value={currentCorpus}
            onChange={e => setCurrentCorpus(e.target.value)}
            placeholder="Total invested so far (MF + RD/FD)" min="0" />
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
            Include all instruments for this goal: MF units + RDs + FDs.
          </div>
        </div>

        {/* ── Linked Funds & SIPs ───────────────────────────────── */}
        {/* Intentionally before CAGR: picking funds here auto-updates the suggestion below */}
        {trackedFunds && trackedFunds.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Linked Funds & SIPs
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8, lineHeight: 1.5 }}>
              Link the funds you're investing in for this goal. Their benchmark indices
              are used to suggest a realistic CAGR below.
            </div>
            {trackedFunds.map(fund => {
              const linked = !!selectedFunds[fund.id];
              return (
                <div key={fund.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 'var(--radius-md, 8px)',
                  border: linked ? '1px solid var(--text-primary)' : bs,
                  background: linked ? 'var(--bg-secondary)' : 'var(--bg)',
                  marginBottom: 4,
                }}>
                  <input type="checkbox" checked={linked} onChange={() => handleFundToggle(fund.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fund.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                      {fund.category}
                      {fund.index && (
                        <span style={{ marginLeft: 4, opacity: 0.7 }}>
                          · {INDEX_DISPLAY[fund.index] || fund.index}
                        </span>
                      )}
                    </div>
                    {goalType === 'emergency' && fund.category &&
                      !['arbitrage', 'liquid', 'debt', 'money market'].includes(fund.category.toLowerCase()) &&
                      linked && (
                        <div style={{ fontSize: 10, color: '#A32D2D', marginTop: 1 }}>
                          ⚠ Equity fund on emergency goal — not recommended
                        </div>
                      )}
                  </div>
                  {linked && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>₹</span>
                      <input type="number"
                        value={selectedFunds[fund.id]?.monthlySIP || ''}
                        onChange={e => handleFundSIPChange(fund.id, e.target.value)}
                        placeholder="SIP" min="0" step="500"
                        style={{ ...inputStyle, width: 72, padding: '4px 6px', fontSize: 12, textAlign: 'right' }} />
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>/mo</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Assumed CAGR ──────────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>

          {/* Label row + Reset button */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Assumed Annual Return (CAGR %)</label>
            {/* Show Reset only when user has manually moved the slider away from suggestion */}
            {cagrOverride && Math.abs(assumedCAGR - suggestedCAGR) > 0.05 && (
              <button
                type="button"
                onClick={() => { markCagrOverride(false); setAssumedCAGR(suggestedCAGR); }}
                style={{
                  fontSize: 10, background: 'none', border: 'none',
                  color: '#185FA5', cursor: 'pointer', padding: 0, textDecoration: 'underline',
                }}
              >
                Reset to suggested ({suggestedCAGR}%)
              </button>
            )}
          </div>

          {/* Slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="range"
              min={cagrMin}
              max={cagrMax}
              step="0.5"
              value={assumedCAGR}
              onChange={e => {
                // Mark as overridden so the auto-update useEffect stops snapping to suggestion
                markCagrOverride(true);
                setAssumedCAGR(parseFloat(e.target.value));
              }}
              style={{ flex: 1 }}
            />
            <span style={{
              fontSize: 14, fontWeight: 600, minWidth: 40, textAlign: 'right',
              color: showOverrideWarning ? '#854F0B' : 'var(--text-primary)',
            }}>
              {assumedCAGR}%
            </span>
          </div>

          {/* Slider range hint */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-tertiary)', marginTop: 2, marginBottom: 8 }}>
            <span>{cagrMin.toFixed(1)}% (min)</span>
            <span>Slider limited to ±5% of suggestion</span>
            <span>{cagrMax.toFixed(1)}% (max)</span>
          </div>

          {/* Suggestion box — shows either fund-derived or goal-type-default explanation */}
          <div style={{
            padding: '9px 11px',
            background: showOverrideWarning ? '#FAEEDA' : '#E1F5EE',
            border: `0.5px solid ${showOverrideWarning ? '#C97B1A' : '#0F6E56'}`,
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: 11, lineHeight: 1.6,
          }}>
            {cagrBreakdown ? (
              // Fund-derived suggestion: show index breakdown
              <>
                <div style={{ fontWeight: 500, color: showOverrideWarning ? '#854F0B' : '#0F6E56', marginBottom: 2 }}>
                  ✨ Suggested: {suggestedCAGR}%
                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
                    from your linked fund indices
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {cagrBreakdown.parts.map((p, i) => (
                    <span key={p.indexKey}>
                      {i > 0 && ' · '}
                      <strong style={{ fontWeight: 500 }}>{p.label}</strong>
                      {cagrBreakdown.parts.length > 1 ? ` (${p.weight}% of SIP)` : ''}
                      {' → '}{p.rawCagr}% historical
                    </span>
                  ))}
                  {' · '}{cagrBreakdown.bucket}Y history window
                  {' · minus '}{CONSERVATIVE_CAGR_DISCOUNT}% buffer = {suggestedCAGR}%
                </div>
              </>
            ) : (
              // No funds linked yet: show goal-type default and prompt to link funds
              <div style={{ color: '#0F6E56' }}>
                ✨ Suggested: <strong style={{ fontWeight: 500 }}>{suggestedCAGR}%</strong>
                <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                  default for {GOAL_TYPES[goalType]?.label}.
                  Link funds above for a more precise, index-based estimate.
                </span>
              </div>
            )}
          </div>

          {/* Override warning — only when user is ABOVE suggestion */}
          {showOverrideWarning && (
            <div style={{
              marginTop: 6, padding: '9px 11px',
              background: '#FAEEDA', border: '0.5px solid #C97B1A',
              borderRadius: 'var(--radius-md, 8px)', fontSize: 11, lineHeight: 1.6,
              color: '#854F0B',
            }}>
              ⚠️ <strong style={{ fontWeight: 500 }}>Are you sure?</strong>{' '}
              You're assuming {assumedCAGR}% — higher than the{' '}
              {suggestedCAGR}%{cagrBreakdown ? ' suggested by index history' : ' default'}.
              Optimistic return assumptions make goals appear on-track when they may not be.
              Any shortfall will only surface close to your deadline, when it's harder to fix.
            </div>
          )}

          {/* Absolute rule violations — independent of suggestion */}
          {cagrWarning && (
            <div style={{
              marginTop: 6, padding: '6px 10px',
              background: '#FAEEDA', borderRadius: 'var(--radius-md, 8px)',
              fontSize: 11, color: '#854F0B',
            }}>
              ⚠️ {cagrWarning}
            </div>
          )}
        </div>

        {/* ── Validation errors ─────────────────────────────────── */}
        {errors.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {errors.map((e, i) => (
              <div key={i} style={{ fontSize: 11, color: '#A32D2D', marginBottom: 2 }}>• {e}</div>
            ))}
          </div>
        )}

        {/* ── Actions ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: bs }}>
          <button onClick={onClose} style={{
            padding: '7px 16px', borderRadius: 99, fontSize: 12,
            border: bs, background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} style={{
            padding: '7px 18px', borderRadius: 99, fontSize: 12,
            border: 'none', background: 'var(--text-primary)',
            color: 'var(--bg)', fontWeight: 500, cursor: 'pointer',
          }}>{isEdit ? 'Save Changes' : 'Create Goal'}</button>
        </div>

      </div>
    </div>
  );
}
