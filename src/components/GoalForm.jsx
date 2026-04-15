/**
 * GoalForm.jsx — Add / Edit Goal Modal
 * 
 * Styled to match existing Signal Watch design language.
 * Uses same CSS vars as App.jsx: --bg, --bg-secondary, --text-primary,
 * --text-secondary, --border, --border-strong, --radius-md, --radius-lg
 * 
 * References: Brief §4.1 (schema), §4.2 (goal categories), DEC-012, DEC-015
 */

import { useState, useEffect, useMemo } from 'react';
import {
  GOAL_TYPES,
  GOAL_TYPE_OPTIONS,
  createGoal,
  updateGoal,
  validateGoal,
} from '../goalUtils';

export default function GoalForm({ isOpen, onClose, onSave, existingGoal, trackedFunds }) {
  const isEdit = !!existingGoal;
  const bs = '0.5px solid var(--border-strong)';

  const [goalType, setGoalType] = useState('retirement');
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalYears, setTotalYears] = useState(22);
  const [targetLakh, setTargetLakh] = useState('');
  const [currentCorpus, setCurrentCorpus] = useState('');
  const [assumedCAGR, setAssumedCAGR] = useState(12);
  const [selectedFunds, setSelectedFunds] = useState({});
  const [errors, setErrors] = useState([]);

  // Populate on open
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
    }
    setErrors([]);
  }, [isOpen, existingGoal]);

  const handleTypeChange = (type) => {
    setGoalType(type);
    const td = GOAL_TYPES[type];
    setEmoji(td.emoji);
    if (!isEdit) {
      setTotalYears(td.defaultHorizonYears);
      setAssumedCAGR(td.defaultCAGR);
      if (!label) setLabel(td.label);
    }
  };

  const targetDateDisplay = useMemo(() => {
    if (!startDate || !totalYears) return '—';
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + parseInt(totalYears, 10));
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }, [startDate, totalYears]);

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

  const cagrWarning = useMemo(() => {
    if (assumedCAGR > 15) return 'CAGR above 15% is extremely aggressive and historically rare over full market cycles.';
    if (assumedCAGR > 12 && totalYears < 10) return 'High CAGR over short horizons carries significant sequence-of-returns risk.';
    if (goalType === 'emergency' && assumedCAGR > 8) return 'Emergency funds should use low-risk instruments. 7–8% is appropriate.';
    return null;
  }, [assumedCAGR, totalYears, goalType]);

  const handleSubmit = () => {
    const goalData = {
      label: label.trim() || GOAL_TYPES[goalType]?.label || 'Goal',
      goalType, emoji, startDate,
      totalYears: parseInt(totalYears, 10),
      targetLakh: parseFloat(targetLakh) || 0,
      currentCorpus: parseFloat(currentCorpus) || 0,
      assumedCAGR: parseFloat(assumedCAGR),
      funds: selectedFunds,
    };
    const errs = validateGoal(goalData);
    if (errs.length > 0) { setErrors(errs); return; }

    let saved;
    if (isEdit) {
      saved = updateGoal(existingGoal, goalData);
    } else {
      saved = createGoal(goalData);
    }
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
        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 14, background: 'none',
          border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer',
        }}>✕</button>

        {/* Title */}
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{emoji}</span>
          {isEdit ? 'Edit Goal' : 'New Goal'}
        </div>

        {/* Goal Type Picker */}
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
              borderRadius: 'var(--radius-md, 8px)',
              borderLeft: '3px solid var(--text-primary)',
            }}>
              {GOAL_TYPES[goalType].description}
              {GOAL_TYPES[goalType].isFixed === true && (
                <span style={{ color: '#854F0B' }}> Target is non-negotiable.</span>
              )}
            </div>
          )}
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Goal Name</label>
          <input style={inputStyle} type="text" value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={GOAL_TYPES[goalType]?.label || 'My Goal'} maxLength={50} />
        </div>

        {/* Target */}
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

        {/* Timeline */}
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

        {/* Corpus */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Current Corpus (₹)</label>
          <input style={inputStyle} type="number" value={currentCorpus}
            onChange={e => setCurrentCorpus(e.target.value)}
            placeholder="Total invested so far (MF + RD/FD)" min="0" />
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
            Include all instruments for this goal: MF units + RDs + FDs.
          </div>
        </div>

        {/* CAGR */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Assumed Annual Return (CAGR %)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min="4" max="18" step="0.5" value={assumedCAGR}
              onChange={e => setAssumedCAGR(parseFloat(e.target.value))}
              style={{ flex: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', minWidth: 40, textAlign: 'right' }}>
              {assumedCAGR}%
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
            Default for {GOAL_TYPES[goalType]?.label}: {GOAL_TYPES[goalType]?.defaultCAGR}%
          </div>
          {cagrWarning && (
            <div style={{
              fontSize: 11, color: '#854F0B', marginTop: 6,
              padding: '6px 10px', background: '#FAEEDA',
              borderRadius: 'var(--radius-md, 8px)',
            }}>⚠️ {cagrWarning}</div>
          )}
        </div>

        {/* Fund Mapping */}
        {trackedFunds && trackedFunds.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-secondary)', marginBottom: 8 }}>
              Linked Funds & SIPs
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
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{fund.category}</div>
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

        {/* Errors */}
        {errors.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {errors.map((e, i) => (
              <div key={i} style={{ fontSize: 11, color: '#A32D2D', marginBottom: 2 }}>• {e}</div>
            ))}
          </div>
        )}

        {/* Actions */}
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
