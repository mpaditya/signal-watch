/**
 * GoalForm.jsx — Add / Edit Goal Modal (SW-16 + SW-15)
 *
 * Section order:
 *   Goal Type → Name → Target → Timeline → Current Corpus → Funding Sources → Blended Return
 *
 * SW-16 — Composite funding:
 *   A goal is funded by a SINGLE unified "Funding sources" list. Each row is one of:
 *     • MF  — pick a fund + monthly SIP (₹) + expected return % (defaults to the fund's
 *             index-suggested CAGR via computeSuggestedCAGR, editable)
 *     • RD  — label + monthly (₹) + rate % + start/maturity dates + optional maturity amount
 *     • FD  — label + principal (₹) + rate % + start/maturity dates + optional maturity amount
 *   The goal-level single "Assumed CAGR" slider is GONE. Instead we show a DERIVED,
 *   read-only "Blended return" computed by blendedReturn() in goalUtils. The goal still
 *   keeps `assumedCAGR` (used as the MF default rate for any fund whose rate is left blank),
 *   but it is no longer the single source of truth for the projection.
 *
 * SW-15 — Dynamic fund universe:
 *   The MF row's fund picker reads the effective (non-archived) fund list, with an inline
 *   "+ Add new fund" form (name / category / index) and a lightweight "Manage funds" panel
 *   to archive (soft-delete) funds. Archived funds drop out of the picker but keep their data.
 *
 * For a Python dev: React state is just variables the UI re-renders from. `useState` holds
 * each field; `useMemo` recomputes derived values (like the blended rate) when inputs change.
 * On save we transform the editable "rows" into the persisted schema (funds{} + instruments[]).
 *
 * Inline CSS + CSS variables only — matches the existing design language.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  GOAL_TYPES,
  GOAL_TYPE_OPTIONS,
  createGoal,
  updateGoal,
  validateGoal,
  computeSuggestedCAGR,
  blendedReturn,
  computeTargetDate,
} from '../goalUtils';

const INDEX_DISPLAY = {
  largecap:  'Nifty 50',
  midcap:    'Nifty MC150',
  smallcap:  'Nifty SC250',
  nifty500:  'Nifty 500',
  arbitrage: 'Arbitrage',
};

// Category → index suggestions for the "Add new fund" inline form.
const INDEX_OPTIONS = [
  { value: 'smallcap', label: 'Nifty SC250 (Small Cap)' },
  { value: 'midcap',   label: 'Nifty MC150 (Mid Cap)' },
  { value: 'largecap', label: 'Nifty 50 (Large Cap)' },
  { value: 'nifty500', label: 'Nifty 500 (Multi/Flexi Cap)' },
  { value: '',         label: 'None (Arbitrage / Debt)' },
];
const CATEGORY_OPTIONS = ['Small Cap', 'Mid Cap', 'Large Cap', 'Large & Mid Cap', 'Multi Cap', 'Flexi Cap', 'Arbitrage', 'Debt'];

const todayISO = () => new Date().toISOString().slice(0, 10);
// Default an RD/FD maturity to ~1 year out so the date inputs aren't empty.
const oneYearISO = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

let rowSeq = 0;
const nextRowId = () => `row_${Date.now()}_${rowSeq++}`;

export default function GoalForm({
  isOpen, onClose, onSave, existingGoal, trackedFunds,
  // SW-15: full universe (incl. archived) + management callbacks. Optional — when absent,
  // the picker simply uses trackedFunds and the add/manage affordances hide.
  allFunds, onAddFund, onArchiveFund, onRestoreFund,
}) {
  const isEdit = !!existingGoal;
  const bs = '0.5px solid var(--border-strong)';

  // ── Core goal fields ──────────────────────────────────────────────
  const [goalType,      setGoalType]      = useState('retirement');
  const [label,         setLabel]         = useState('');
  const [emoji,         setEmoji]         = useState('');
  const [startDate,     setStartDate]     = useState(todayISO());
  const [totalYears,    setTotalYears]    = useState(22);
  const [targetLakh,    setTargetLakh]    = useState('');
  // SW-16: current corpus entered in ₹ LAKHS (matches the target + Update-Corpus modal).
  const [currentCorpusLakh, setCurrentCorpusLakh] = useState('');
  const [errors,        setErrors]        = useState([]);

  // ── Funding rows (the unified MF/RD/FD list) ──────────────────────
  // Each row is an editable representation; converted to funds{}/instruments[] on save.
  const [rows, setRows] = useState([]);

  // ── SW-15 inline fund UI state ────────────────────────────────────
  const [addFundOpen, setAddFundOpen] = useState(false);
  const [manageOpen,  setManageOpen]  = useState(false);
  const [newFund, setNewFund] = useState({ name: '', category: 'Flexi Cap', index: 'nifty500' });

  // The picker list = effective funds (trackedFunds is already non-archived from App).
  const pickerFunds = trackedFunds || [];

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
      setCurrentCorpusLakh(existingGoal.currentCorpus ? existingGoal.currentCorpus / 100000 : '');
      setRows(goalToRows(existingGoal));
    } else {
      const dt = 'retirement';
      setGoalType(dt);
      setLabel('');
      setEmoji(GOAL_TYPES[dt].emoji);
      setStartDate(todayISO());
      setTotalYears(GOAL_TYPES[dt].defaultHorizonYears);
      setTargetLakh('');
      setCurrentCorpusLakh('');
      setRows([]);
    }
    setErrors([]);
    setAddFundOpen(false);
    setManageOpen(false);
  }, [isOpen, existingGoal]);

  // ── Goal type change ──────────────────────────────────────────────
  const handleTypeChange = (type) => {
    setGoalType(type);
    const td = GOAL_TYPES[type];
    setEmoji(td.emoji);
    if (!isEdit) {
      setTotalYears(td.defaultHorizonYears);
      if (!label) setLabel(td.label);
    }
  };

  // ── Target date display ───────────────────────────────────────────
  const targetDateDisplay = useMemo(() => {
    if (!startDate || !totalYears) return '—';
    // parseFloat + shared computeTargetDate so the preview honours fractional years
    // (e.g. 1.5) exactly like the persisted goal does.
    const d = new Date(computeTargetDate(startDate, parseFloat(totalYears)));
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }, [startDate, totalYears]);

  // ── Suggested MF rate (index-based, used as default for new MF rows) ──
  // We compute a single representative suggestion across all MF rows so a newly-added
  // fund row gets a sensible editable default. Per-fund overrides live on each row.
  const suggestedMFRate = useMemo(() => {
    const selected = {};
    for (const r of rows) if (r.kind === 'MF' && r.fundId) selected[r.fundId] = { monthlySIP: Number(r.monthlySIP) || 0 };
    const s = computeSuggestedCAGR(selected, parseInt(totalYears) || 1, trackedFunds);
    return s ?? (GOAL_TYPES[goalType]?.defaultCAGR ?? 12);
  }, [rows, totalYears, goalType, trackedFunds]);

  // Suggest a rate for a single fund id (used when picking a fund in an MF row).
  const suggestRateForFund = (fundId) => {
    const s = computeSuggestedCAGR({ [fundId]: { monthlySIP: 0 } }, parseInt(totalYears) || 1, trackedFunds);
    return s ?? (GOAL_TYPES[goalType]?.defaultCAGR ?? 12);
  };

  // ── Live preview goal → blended return + projection-ready shape ───
  const previewGoal = useMemo(
    () => rowsToGoal({ goalType, totalYears, targetLakh, currentCorpusLakh, startDate, rows, suggestedMFRate }),
    [goalType, totalYears, targetLakh, currentCorpusLakh, startDate, rows, suggestedMFRate]
  );
  const blended = useMemo(() => blendedReturn(previewGoal), [previewGoal]);

  // Emergency-fund equity guard: any equity MF (recognised equity index) on an emergency goal.
  const emergencyEquityWarning = useMemo(() => {
    if (goalType !== 'emergency') return false;
    return rows.some(r => {
      if (r.kind !== 'MF' || !r.fundId) return false;
      const meta = pickerFunds.find(f => f.id === r.fundId);
      const idx = meta?.index;
      return idx && idx !== 'arbitrage'; // equity index linked
    });
  }, [goalType, rows, pickerFunds]);

  // ── Row mutation helpers ──────────────────────────────────────────
  const updateRow = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeRow = (id) => setRows(rs => rs.filter(r => r.id !== id));

  const addMFRow = () => setRows(rs => [...rs, { id: nextRowId(), kind: 'MF', fundId: '', monthlySIP: '', rate: '', startDate: todayISO(), endDate: '' }]);
  const addRDRow = () => setRows(rs => [...rs, {
    id: nextRowId(), kind: 'RD', label: 'Recurring Deposit', monthly: '', rate: 7,
    startDate: todayISO(), maturityDate: oneYearISO(), maturityAmount: '',
  }]);
  const addFDRow = () => setRows(rs => [...rs, {
    id: nextRowId(), kind: 'FD', label: 'Fixed Deposit', principal: '', rate: 7,
    startDate: todayISO(), maturityDate: oneYearISO(), maturityAmount: '',
  }]);

  // When a fund is chosen in an MF row, prefill its rate with the index suggestion (editable).
  const handlePickFund = (rowId, fundId) => {
    updateRow(rowId, { fundId, rate: fundId ? suggestRateForFund(fundId) : '' });
  };

  // ── SW-15: add a new fund inline, then auto-select it in a fresh MF row ──
  const submitNewFund = () => {
    const name = newFund.name.trim();
    if (!name || !onAddFund) return;
    // Derive a deterministic id the same way funds.js does, so we can select it immediately.
    const fundId = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'fund';
    onAddFund({ name, category: newFund.category, index: newFund.index || null });
    setRows(rs => [...rs, { id: nextRowId(), kind: 'MF', fundId, monthlySIP: '', rate: suggestRateForFund(fundId), startDate: todayISO(), endDate: '' }]);
    setNewFund({ name: '', category: 'Flexi Cap', index: 'nifty500' });
    setAddFundOpen(false);
  };

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const resolvedLabel = (label || '').trim() || GOAL_TYPES[goalType]?.label || 'Goal';
    const goalData = rowsToGoal({ goalType, totalYears, targetLakh, currentCorpusLakh, startDate, rows, suggestedMFRate, label: resolvedLabel, emoji });
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
  const miniInput = { ...inputStyle, padding: '4px 6px', fontSize: 12 };
  const sectionHdr = { fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-secondary)', marginBottom: 8 };

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
          width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto',
          padding: '1.25rem', position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 14, background: 'none',
          border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer',
        }}>✕</button>

        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{emoji}</span>
          {isEdit ? 'Edit Goal' : 'New Goal'}
        </div>

        {/* ── Goal Type Picker ──────────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHdr}>Goal Type</div>
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

        {/* ── Target Corpus (₹ Lakhs) ───────────────────────────── */}
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
          <div style={sectionHdr}>Timeline</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input style={inputStyle} type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Horizon (years)</label>
              <input aria-label="Horizon (years)" style={inputStyle} type="number" value={totalYears}
                onChange={e => setTotalYears(e.target.value)} min="1" max="40" step="0.5" />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 500 }}>
            Target: {targetDateDisplay}
          </div>
        </div>

        {/* ── Current Corpus (₹ Lakhs) ──────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Current Corpus (₹ Lakhs)</label>
          <input style={inputStyle} type="number" value={currentCorpusLakh}
            onChange={e => setCurrentCorpusLakh(e.target.value)}
            placeholder="e.g., 3.5 — MF units already invested" min="0" step="0.1" />
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>
            Existing invested value (grows at the blended equity rate). RD/FD principals are
            entered as funding sources below, not here.
          </div>
        </div>

        {/* ── Funding Sources (SW-16 unified list) ──────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={sectionHdr}>Funding Sources</div>
            {allFunds && onArchiveFund && (
              <button type="button" onClick={() => setManageOpen(o => !o)} style={{
                fontSize: 10, background: 'none', border: 'none', color: '#185FA5',
                cursor: 'pointer', padding: 0, textDecoration: 'underline',
              }}>Manage funds</button>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8, lineHeight: 1.5 }}>
            Mix mutual fund SIPs with recurring/fixed deposits. Each source has its own return —
            the goal's blended return is derived below.
          </div>

          {/* SW-15: Manage funds (archive / restore) */}
          {manageOpen && allFunds && (
            <div style={{
              border: bs, borderRadius: 'var(--radius-md, 8px)', padding: '8px 10px',
              marginBottom: 8, background: 'var(--bg-secondary)',
            }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Archive removes a fund from pickers + signals (data kept). Restore brings it back.
              </div>
              {allFunds.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 0', fontSize: 11, color: 'var(--text-primary)',
                  opacity: f.archived ? 0.5 : 1,
                }}>
                  <span>{f.name} <span style={{ color: 'var(--text-tertiary)' }}>· {f.category}</span></span>
                  {f.archived
                    ? <button type="button" onClick={() => onRestoreFund && onRestoreFund(f.id)} style={{
                        fontSize: 10, border: '0.5px solid #3B6D11', background: '#EAF3DE', color: '#3B6D11',
                        borderRadius: 99, padding: '2px 8px', cursor: 'pointer',
                      }}>↺ Restore</button>
                    : <button type="button" onClick={() => onArchiveFund && onArchiveFund(f.id)} style={{
                        fontSize: 10, border: bs, background: 'transparent', color: 'var(--text-secondary)',
                        borderRadius: 99, padding: '2px 8px', cursor: 'pointer',
                      }}>🗄 Archive</button>}
                </div>
              ))}
            </div>
          )}

          {/* The rows */}
          {rows.map(row => (
            <FundingRow
              key={row.id} row={row} bs={bs} miniInput={miniInput}
              pickerFunds={pickerFunds} onUpdate={updateRow} onRemove={removeRow}
              onPickFund={handlePickFund}
              onAddNewFund={onAddFund ? () => setAddFundOpen(true) : null}
            />
          ))}

          {/* SW-15: inline add-new-fund form */}
          {addFundOpen && onAddFund && (
            <div style={{ border: bs, borderRadius: 'var(--radius-md, 8px)', padding: '8px 10px', marginBottom: 8, background: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>New fund</div>
              <input style={{ ...miniInput, marginBottom: 6 }} placeholder="Fund name"
                value={newFund.name} onChange={e => setNewFund(n => ({ ...n, name: e.target.value }))} />
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select style={{ ...miniInput }} value={newFund.category}
                  onChange={e => setNewFund(n => ({ ...n, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select style={{ ...miniInput }} value={newFund.index}
                  onChange={e => setNewFund(n => ({ ...n, index: e.target.value }))}>
                  {INDEX_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setAddFundOpen(false)} style={{
                  fontSize: 11, border: bs, background: 'transparent', color: 'var(--text-secondary)',
                  borderRadius: 99, padding: '3px 10px', cursor: 'pointer',
                }}>Cancel</button>
                <button type="button" onClick={submitNewFund} style={{
                  fontSize: 11, border: 'none', background: 'var(--text-primary)', color: 'var(--bg)',
                  borderRadius: 99, padding: '3px 12px', cursor: 'pointer', fontWeight: 500,
                }}>Add fund</button>
              </div>
            </div>
          )}

          {/* Add-row controls */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button type="button" onClick={addMFRow} style={addBtnStyle(bs)}>+ MF SIP</button>
            <button type="button" onClick={addRDRow} style={addBtnStyle(bs)}>+ RD</button>
            <button type="button" onClick={addFDRow} style={addBtnStyle(bs)}>+ FD</button>
            {onAddFund && (
              <button type="button" onClick={() => setAddFundOpen(true)} style={{ ...addBtnStyle(bs), marginLeft: 'auto', color: '#185FA5' }}>
                + New fund
              </button>
            )}
          </div>

          {emergencyEquityWarning && (
            <div style={{ marginTop: 8, padding: '7px 10px', background: '#FCEBEB', borderRadius: 'var(--radius-md, 8px)', fontSize: 11, color: '#A32D2D', lineHeight: 1.5 }}>
              ⚠️ Emergency funds must never hold equity. Use RD/FD or arbitrage/debt funds only.
            </div>
          )}
        </div>

        {/* ── Blended Return (derived, read-only) ───────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionHdr}>Blended Return</div>
          <div style={{
            padding: '10px 12px', borderRadius: 'var(--radius-md, 8px)',
            background: '#E1F5EE', border: '0.5px solid #0F6E56',
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: '#0F6E56' }}>
              Contribution-weighted across all funding sources
            </span>
            <span style={{ fontSize: 18, fontWeight: 600, color: '#0F6E56' }}>{blended}%</span>
          </div>
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

// ─── A single funding-source row (MF / RD / FD) ─────────────────────
function FundingRow({ row, bs, miniInput, pickerFunds, onUpdate, onRemove, onPickFund, onAddNewFund }) {
  const kindBtn = (k) => ({
    fontSize: 11, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
    border: row.kind === k ? '1px solid var(--text-primary)' : bs,
    background: row.kind === k ? 'var(--bg-secondary)' : 'var(--bg)',
    color: 'var(--text-primary)', fontWeight: row.kind === k ? 500 : 400,
  });

  // Switching kind resets the row to that kind's defaults (keeps id).
  const switchKind = (k) => {
    if (k === row.kind) return;
    if (k === 'MF') onUpdate(row.id, { kind: 'MF', fundId: '', monthlySIP: '', rate: '', startDate: todayISO(), endDate: '' });
    else if (k === 'RD') onUpdate(row.id, { kind: 'RD', label: 'Recurring Deposit', monthly: '', rate: 7, startDate: todayISO(), maturityDate: oneYearISO(), maturityAmount: '' });
    else onUpdate(row.id, { kind: 'FD', label: 'Fixed Deposit', principal: '', rate: 7, startDate: todayISO(), maturityDate: oneYearISO(), maturityAmount: '' });
  };

  return (
    <div style={{ border: bs, borderRadius: 'var(--radius-md, 8px)', padding: '8px 10px', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <button type="button" style={kindBtn('MF')} onClick={() => switchKind('MF')}>MF</button>
        <button type="button" style={kindBtn('RD')} onClick={() => switchKind('RD')}>RD</button>
        <button type="button" style={kindBtn('FD')} onClick={() => switchKind('FD')}>FD</button>
        <button type="button" aria-label="Remove source" onClick={() => onRemove(row.id)} style={{
          marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)',
          fontSize: 14, cursor: 'pointer',
        }}>✕</button>
      </div>

      {row.kind === 'MF' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px', gap: 6, alignItems: 'center' }}>
          <select
            aria-label="Fund"
            style={{ ...miniInput }}
            value={row.fundId || ''}
            onChange={e => {
              if (e.target.value === '__add__') { onAddNewFund && onAddNewFund(); return; }
              onPickFund(row.id, e.target.value);
            }}
          >
            <option value="">Select fund…</option>
            {pickerFunds.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}{f.index ? ` · ${INDEX_DISPLAY[f.index] || f.index}` : ''}
              </option>
            ))}
            {onAddNewFund && <option value="__add__">+ Add new fund…</option>}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>₹</span>
            <input aria-label="Monthly SIP" type="number" min="0" step="500" placeholder="SIP/mo"
              style={{ ...miniInput, textAlign: 'right' }} value={row.monthlySIP}
              onChange={e => onUpdate(row.id, { monthlySIP: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input aria-label="Expected return" type="number" min="0" step="0.5" placeholder="rate"
              style={{ ...miniInput, textAlign: 'right' }} value={row.rate}
              onChange={e => onUpdate(row.id, { rate: e.target.value })} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>%</span>
          </div>
          {/* SW-16b: SIP start date (default today) + OPTIONAL end date. A past start date
              means the SIP is already running (its accrued value is in Current Corpus); an
              end date earlier than the goal target means the SIP stops then and the amount
              accumulated by then grows on to the target. Leave End blank to run to target. */}
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 2 }}>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>SIP Start</label>
              <input aria-label="SIP start date" type="date" style={{ ...miniInput }}
                value={row.startDate || ''} onChange={e => onUpdate(row.id, { startDate: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>SIP End (optional)</label>
              <input aria-label="SIP end date" type="date" style={{ ...miniInput }}
                value={row.endDate || ''} onChange={e => onUpdate(row.id, { endDate: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {(row.kind === 'RD' || row.kind === 'FD') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
          <input aria-label="Label" type="text" placeholder="Label" style={{ ...miniInput }}
            value={row.label} onChange={e => onUpdate(row.id, { label: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>₹</span>
              <input
                aria-label={row.kind === 'RD' ? 'Monthly contribution' : 'Principal'}
                type="number" min="0" step="500"
                placeholder={row.kind === 'RD' ? 'monthly' : 'principal'}
                style={{ ...miniInput, textAlign: 'right' }}
                value={row.kind === 'RD' ? row.monthly : row.principal}
                onChange={e => onUpdate(row.id, row.kind === 'RD' ? { monthly: e.target.value } : { principal: e.target.value })} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <input aria-label="Rate" type="number" min="0" step="0.25" placeholder="rate"
                style={{ ...miniInput, textAlign: 'right' }} value={row.rate}
                onChange={e => onUpdate(row.id, { rate: e.target.value })} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>%</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Start</label>
              <input aria-label="Start date" type="date" style={{ ...miniInput }}
                value={row.startDate} onChange={e => onUpdate(row.id, { startDate: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>Maturity</label>
              <input aria-label="Maturity date" type="date" style={{ ...miniInput }}
                value={row.maturityDate} onChange={e => onUpdate(row.id, { maturityDate: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>₹</span>
            <input aria-label="Known maturity amount" type="number" min="0" step="1000"
              placeholder="Known maturity amount (optional)"
              style={{ ...miniInput, textAlign: 'right' }} value={row.maturityAmount}
              onChange={e => onUpdate(row.id, { maturityAmount: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}

function addBtnStyle(bs) {
  return {
    fontSize: 11, padding: '4px 10px', borderRadius: 99, border: bs,
    background: 'var(--bg)', color: 'var(--text-secondary)', cursor: 'pointer',
  };
}

// ─── Schema <-> rows transforms ─────────────────────────────────────
// Convert a persisted goal (funds{} + instruments[]) into editable rows for the form.
function goalToRows(goal) {
  const rows = [];
  if (goal.funds) {
    for (const [fid, f] of Object.entries(goal.funds)) {
      rows.push({
        id: nextRowId(), kind: 'MF', fundId: fid,
        monthlySIP: f.monthlySIP ?? '', rate: f.rate ?? '',
        // SW-16b: SIP contribution window. Default start to today for funds saved before
        // this field existed; end stays blank (= runs to the goal target).
        startDate: f.startDate || todayISO(), endDate: f.endDate || '',
      });
    }
  }
  if (Array.isArray(goal.instruments)) {
    for (const inst of goal.instruments) {
      rows.push({
        id: nextRowId(), kind: inst.type, label: inst.label || (inst.type === 'RD' ? 'Recurring Deposit' : 'Fixed Deposit'),
        monthly: inst.monthly ?? '', principal: inst.principal ?? '', rate: inst.rate ?? 7,
        startDate: inst.startDate || todayISO(), maturityDate: inst.maturityDate || oneYearISO(),
        maturityAmount: inst.maturityAmount ?? '',
      });
    }
  }
  return rows;
}

// Convert editable rows back into the persisted/projection-ready goal shape.
// `suggestedMFRate` is the fallback rate for MF rows whose rate field is blank.
function rowsToGoal({ goalType, totalYears, targetLakh, currentCorpusLakh, startDate, rows, suggestedMFRate, label, emoji }) {
  const funds = {};
  const instruments = [];
  let mfDefaultRate = suggestedMFRate;

  for (const r of (rows || [])) {
    if (r.kind === 'MF') {
      if (!r.fundId) continue;
      const rate = r.rate === '' || r.rate == null ? suggestedMFRate : Number(r.rate);
      funds[r.fundId] = {
        monthlySIP: Number(r.monthlySIP) || 0,
        sipDate: funds[r.fundId]?.sipDate || 1,
        rate,
        // SW-16b: persist the SIP contribution window. null = "from now" / "runs to target".
        startDate: r.startDate || null,
        endDate: r.endDate || null,
      };
      mfDefaultRate = rate; // last MF rate seen → used as goal.assumedCAGR fallback
    } else if (r.kind === 'RD') {
      instruments.push({
        id: r.id, type: 'RD', label: r.label || 'Recurring Deposit',
        monthly: Number(r.monthly) || 0, rate: Number(r.rate) || 0,
        startDate: r.startDate, maturityDate: r.maturityDate,
        maturityAmount: r.maturityAmount === '' ? null : Number(r.maturityAmount),
      });
    } else if (r.kind === 'FD') {
      instruments.push({
        id: r.id, type: 'FD', label: r.label || 'Fixed Deposit',
        principal: Number(r.principal) || 0, rate: Number(r.rate) || 0,
        startDate: r.startDate, maturityDate: r.maturityDate,
        maturityAmount: r.maturityAmount === '' ? null : Number(r.maturityAmount),
      });
    }
  }

  return {
    label, emoji, goalType, startDate,
    // parseFloat (not parseInt) so fractional horizons like 1.5 years survive — a past
    // bug truncated 1.5 → 1, so only whole-year edits ever "stuck".
    totalYears: parseFloat(totalYears) || 0,
    targetLakh: parseFloat(targetLakh) || 0,
    // ₹ lakhs → rupees (matches Update-Corpus modal convention).
    currentCorpus: (parseFloat(currentCorpusLakh) || 0) * 100000,
    // assumedCAGR is the MF default rate (used by projectGoalComposite for the existing
    // corpus and any MF without an explicit rate). Kept on the goal for back-compat.
    assumedCAGR: mfDefaultRate,
    funds,
    instruments,
  };
}
