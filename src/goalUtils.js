/**
 * goalUtils.js — Project Artha Goal Engine
 * 
 * Financial math, goal projections, off-track detection,
 * recommendation engine, and v3→v4 schema migration.
 * 
 * References: Brief §4.1 (schema), §4.2 (goal categories),
 *             §4.3 (off-track engine), DEC-012 through DEC-018
 * 
 * IMPORTANT: All projections use flat CAGR assumptions.
 * Real equity returns are volatile — these are indicative, not guaranteed.
 * The off-track thresholds (§4.3) build in some margin for this.
 */

// ─── Schema Version ────────────────────────────────────────────────
export const SCHEMA_VERSION = 4;
const STORAGE_KEY_GOALS = 'artha_goals';
const STORAGE_KEY_VERSION = 'artha_schema_version';

// ─── Goal Type Definitions (Brief §4.2) ────────────────────────────
export const GOAL_TYPES = {
  car: {
    key: 'car',
    label: 'Car',
    emoji: '🚗',
    defaultCAGR: 10,
    defaultHorizonYears: 4,
    isFixed: false,       // target corpus is negotiable
    equityCutoffYears: 2, // stop equity exposure within this many years of target
    description: 'Depreciating asset. Most flexible — changing the car model is the easiest lever.',
  },
  house: {
    key: 'house',
    label: 'House Down Payment',
    emoji: '🏠',
    defaultCAGR: 11,
    defaultHorizonYears: 7,
    isFixed: 'semi',
    equityCutoffYears: 3,
    description: 'Typically largest corpus. Area/size is adjustable if needed.',
  },
  travel: {
    key: 'travel',
    label: 'Travel',
    emoji: '✈️',
    defaultCAGR: 9,
    defaultHorizonYears: 2,
    isFixed: false,
    equityCutoffYears: 1,
    description: 'Short horizon — conservative instruments recommended.',
  },
  education: {
    key: 'education',
    label: 'Education',
    emoji: '🎓',
    defaultCAGR: 12,
    defaultHorizonYears: 15,
    isFixed: true, // non-negotiable
    equityCutoffYears: 5,
    description: 'Non-negotiable target. Inflation-adjusted planning recommended.',
  },
  wedding: {
    key: 'wedding',
    label: 'Wedding',
    emoji: '💍',
    defaultCAGR: 11,
    defaultHorizonYears: 18,
    isFixed: 'semi',
    equityCutoffYears: 3,
    description: 'Long horizon but scope is culturally adjustable.',
  },
  retirement: {
    key: 'retirement',
    label: 'Retirement',
    emoji: '🏖️',
    defaultCAGR: 12,
    defaultHorizonYears: 22,
    isFixed: true,
    equityCutoffYears: 3,
    description: 'Longest horizon, most compound growth, most forgiving on risk.',
  },
  emergency: {
    key: 'emergency',
    label: 'Emergency Fund',
    emoji: '🛡️',
    defaultCAGR: 7,
    defaultHorizonYears: 1,
    isFixed: true,
    equityCutoffYears: Infinity, // never allow equity
    description: 'No equity ever. Debt/liquid/arbitrage only.',
  },
};

// ─── Goal Statuses ─────────────────────────────────────────────────
// SW-14: Added ACHIEVED status. Mirrors the Supabase goals table enum:
// active | paused | abandoned | achieved.
// COMPLETED is kept as an alias for backwards compatibility with existing stored goals.
export const GOAL_STATUSES = {
  ACTIVE:    'active',
  PAUSED:    'paused',
  COMPLETED: 'completed',  // legacy alias — treat same as ACHIEVED in UI
  ABANDONED: 'abandoned',
  ACHIEVED:  'achieved',   // SW-14: user explicitly marks goal as achieved
};

// ─── Health Thresholds (Brief §4.3) ────────────────────────────────
const HEALTH_GREEN_THRESHOLD = 90;   // >90% on-track
const HEALTH_AMBER_THRESHOLD = 70;   // 70–90% on-track
// Below 70% = red

// Corpus staleness thresholds (Brief §4.1)
const CORPUS_STALE_AMBER_DAYS = 30;
const CORPUS_STALE_RED_DAYS = 60;

// ─── Financial Math ────────────────────────────────────────────────

/**
 * Convert annual CAGR to effective monthly rate.
 * Uses (1 + annual)^(1/12) - 1 for proper compounding.
 * This is more accurate than simply dividing by 12.
 */
export function annualToMonthlyRate(annualPct) {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/**
 * Future value of a lump sum (current corpus growing at CAGR).
 * FV = PV × (1 + r)^n
 * 
 * @param {number} presentValue - Current corpus in INR
 * @param {number} annualCAGR - Annual return % (e.g., 12 for 12%)
 * @param {number} years - Time horizon in years (can be fractional)
 * @returns {number} Future value in INR
 */
export function futureValueLumpSum(presentValue, annualCAGR, years) {
  if (years <= 0 || presentValue <= 0) return presentValue;
  return presentValue * Math.pow(1 + annualCAGR / 100, years);
}

/**
 * Future value of monthly SIPs (annuity-due: payment at start of month).
 * FV = P × [((1 + r)^n - 1) / r] × (1 + r)
 * 
 * Indian MF SIPs are debited early in the month, so annuity-due
 * is the correct model. This gives slightly higher FV than annuity-immediate.
 * 
 * @param {number} monthlySIP - Monthly SIP amount in INR
 * @param {number} annualCAGR - Annual return % (e.g., 12)
 * @param {number} years - Time horizon in years
 * @returns {number} Future value of all SIP payments
 */
export function futureValueSIP(monthlySIP, annualCAGR, years) {
  if (years <= 0 || monthlySIP <= 0) return 0;
  const r = annualToMonthlyRate(annualCAGR);
  const n = Math.round(years * 12); // total months
  if (r === 0) return monthlySIP * n; // edge case: 0% return
  // Annuity-due formula
  return monthlySIP * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

/**
 * Total projected corpus = FV of current corpus + FV of future SIPs.
 * 
 * @param {number} currentCorpus - Current invested value in INR
 * @param {number} totalMonthlySIP - Sum of all monthly SIPs for this goal
 * @param {number} annualCAGR - Assumed annual return %
 * @param {number} yearsLeft - Years remaining to goal target date
 * @returns {number} Total projected corpus at target date
 */
export function projectCorpus(currentCorpus, totalMonthlySIP, annualCAGR, yearsLeft) {
  const fvCorpus = futureValueLumpSum(currentCorpus, annualCAGR, yearsLeft);
  const fvSIP = futureValueSIP(totalMonthlySIP, annualCAGR, yearsLeft);
  return fvCorpus + fvSIP;
}

/**
 * On-track percentage: how close is the projected corpus to the target?
 * Capped at 200% to avoid misleading display for massively over-funded goals.
 */
export function onTrackPercent(projectedCorpus, targetCorpusINR) {
  if (targetCorpusINR <= 0) return 100;
  return Math.min(200, (projectedCorpus / targetCorpusINR) * 100);
}

/**
 * Health status based on on-track percentage (Brief §4.3).
 * @returns {'green' | 'amber' | 'red'}
 */
export function healthStatus(onTrackPct) {
  if (onTrackPct >= HEALTH_GREEN_THRESHOLD) return 'green';
  if (onTrackPct >= HEALTH_AMBER_THRESHOLD) return 'amber';
  return 'red';
}

/**
 * Required CAGR to reach target from current state.
 * Solved via bisection method — no closed-form solution exists
 * when both lump sum growth and SIP contributions are combined.
 * 
 * Returns null if:
 * - Target is already met
 * - No mathematically feasible rate exists (would need >50% CAGR)
 * - Years remaining is 0 or negative
 * 
 * @param {number} currentCorpus - Current corpus in INR
 * @param {number} totalMonthlySIP - Monthly SIP total in INR
 * @param {number} targetINR - Target corpus in INR
 * @param {number} yearsLeft - Years remaining
 * @returns {number|null} Required annual CAGR % or null
 */
export function requiredCAGR(currentCorpus, totalMonthlySIP, targetINR, yearsLeft) {
  if (yearsLeft <= 0) return null;

  // Check if already on-track at 0%
  const atZero = projectCorpus(currentCorpus, totalMonthlySIP, 0, yearsLeft);
  if (atZero >= targetINR) return 0;

  // Bisection: find rate where projected = target
  let lo = 0;
  let hi = 50; // cap at 50% — anything above is unrealistic
  const MAX_ITER = 100;
  const TOLERANCE = 0.01; // 0.01% precision

  // Check if even 50% isn't enough
  const atMax = projectCorpus(currentCorpus, totalMonthlySIP, hi, yearsLeft);
  if (atMax < targetINR) return null; // infeasible

  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (lo + hi) / 2;
    const projected = projectCorpus(currentCorpus, totalMonthlySIP, mid, yearsLeft);

    if (Math.abs(projected - targetINR) / targetINR < 0.0001) {
      return Math.round(mid * 100) / 100;
    }

    if (projected < targetINR) {
      lo = mid;
    } else {
      hi = mid;
    }

    if (hi - lo < TOLERANCE / 100) break;
  }

  return Math.round(((lo + hi) / 2) * 100) / 100;
}

// ─── Time Calculations ─────────────────────────────────────────────

/**
 * Compute years remaining from today to target date.
 * This is ALWAYS computed, never stored (Brief §4.1 design note).
 * Returns fractional years for precision.
 */
export function computeYearsLeft(targetDateStr) {
  const target = new Date(targetDateStr);
  const today = new Date();
  const diffMs = target.getTime() - today.getTime();
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, years);
}

/**
 * Corpus staleness: how many days since corpus was last updated.
 * @returns {'fresh' | 'amber' | 'red'}
 */
export function corpusStaleness(corpusUpdatedAtStr) {
  if (!corpusUpdatedAtStr) return 'red';
  const updated = new Date(corpusUpdatedAtStr);
  const today = new Date();
  const daysSince = (today.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > CORPUS_STALE_RED_DAYS) return 'red';
  if (daysSince > CORPUS_STALE_AMBER_DAYS) return 'amber';
  return 'fresh';
}

/**
 * Days since corpus was last updated (for display).
 */
export function daysSinceCorpusUpdate(corpusUpdatedAtStr) {
  if (!corpusUpdatedAtStr) return Infinity;
  const updated = new Date(corpusUpdatedAtStr);
  const today = new Date();
  return Math.floor((today.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Off-Track Recommendation Engine (Brief §4.3) ─────────────────

/**
 * Lever 1: Additional monthly SIP needed to close the gap.
 * Solves for ΔP in: FV(corpus, cagr, t) + FV_SIP(currentSIP + ΔP, cagr, t) = target
 * 
 * @returns {number} Additional monthly SIP needed in INR (0 if on-track)
 */
export function additionalSIPNeeded(currentCorpus, currentMonthlySIP, annualCAGR, yearsLeft, targetINR) {
  const projected = projectCorpus(currentCorpus, currentMonthlySIP, annualCAGR, yearsLeft);
  if (projected >= targetINR) return 0;

  const gap = targetINR - projected;
  // Gap needs to be filled by additional SIP's future value
  // FV_SIP(ΔP) = ΔP × [((1+r)^n - 1) / r] × (1+r) = gap
  // ΔP = gap / [((1+r)^n - 1) / r × (1+r)]
  const r = annualToMonthlyRate(annualCAGR);
  const n = Math.round(yearsLeft * 12);
  if (n <= 0) return gap; // need lump sum if no time left
  if (r === 0) return gap / n;

  const sipMultiplier = ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  return Math.ceil(gap / sipMultiplier);
}

/**
 * Lever 2: Extra months needed at current SIP + CAGR to reach target.
 * Uses bisection since no closed-form solution.
 * 
 * @returns {number} Additional months needed (0 if on-track, null if infeasible even at 50 extra years)
 */
export function extraMonthsNeeded(currentCorpus, currentMonthlySIP, annualCAGR, currentYearsLeft, targetINR) {
  const projected = projectCorpus(currentCorpus, currentMonthlySIP, annualCAGR, currentYearsLeft);
  if (projected >= targetINR) return 0;

  // If no SIP and no corpus, it's infeasible
  if (currentMonthlySIP <= 0 && currentCorpus <= 0) return null;

  // Binary search for extra years needed
  let lo = 0;
  let hi = 50; // max 50 extra years
  const totalAtMax = projectCorpus(currentCorpus, currentMonthlySIP, annualCAGR, currentYearsLeft + hi);
  if (totalAtMax < targetINR) return null; // infeasible

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const proj = projectCorpus(currentCorpus, currentMonthlySIP, annualCAGR, currentYearsLeft + mid);
    if (Math.abs(proj - targetINR) / targetINR < 0.001) break;
    if (proj < targetINR) lo = mid; else hi = mid;
    if (hi - lo < 1 / 12) break; // 1 month precision
  }

  const extraYears = (lo + hi) / 2;
  return Math.ceil(extraYears * 12); // return months
}

/**
 * Lever 3: Achievable corpus at current SIP and CAGR.
 * Simply computes the projection — useful for flexible goals.
 */
export function achievableCorpus(currentCorpus, currentMonthlySIP, annualCAGR, yearsLeft) {
  return projectCorpus(currentCorpus, currentMonthlySIP, annualCAGR, yearsLeft);
}

/**
 * Lever 4: One-time lump sum needed today to close the gap.
 * The lump sum grows at CAGR for the remaining period.
 * lumpSum × (1 + cagr)^years = gap → lumpSum = gap / (1 + cagr)^years
 */
export function lumpSumNeeded(currentCorpus, currentMonthlySIP, annualCAGR, yearsLeft, targetINR) {
  const projected = projectCorpus(currentCorpus, currentMonthlySIP, annualCAGR, yearsLeft);
  if (projected >= targetINR) return 0;
  const gap = targetINR - projected;
  if (yearsLeft <= 0) return gap;
  return Math.ceil(gap / Math.pow(1 + annualCAGR / 100, yearsLeft));
}

/**
 * Lever 5: What CAGR would be needed if nothing else changes?
 * Just a wrapper around requiredCAGR with a feasibility check.
 * Returns null if required CAGR > 50% or if less than 10 years remain.
 * 
 * Note: This lever is ONLY suggested as last resort for long-horizon goals.
 */
export function higherReturnProjection(currentCorpus, currentMonthlySIP, yearsLeft, targetINR) {
  if (yearsLeft < 10) return null; // never suggest higher risk for short horizons
  const needed = requiredCAGR(currentCorpus, currentMonthlySIP, targetINR, yearsLeft);
  if (needed === null || needed > 15) return null; // cap at 15% — above that is gambling
  return needed;
}

/**
 * Off-Track Lever Priority by goal type (Brief §4.3).
 * Returns an ordered array of lever keys.
 */
function leverPriorityForGoalType(goalType) {
  switch (goalType) {
    case 'education':
      return ['increaseSIP', 'lumpSum', 'extendTimeline', /* never reduceTaret */];
    case 'retirement':
      return ['increaseSIP', 'extendTimeline', 'lumpSum', 'higherReturn'];
    case 'emergency':
      return ['increaseSIP', 'lumpSum']; // no timeline extension, no reduce, must stay debt-only
    case 'house':
      return ['increaseSIP', 'extendTimeline', 'lumpSum', 'reduceTarget'];
    case 'wedding':
      return ['increaseSIP', 'extendTimeline', 'reduceTarget', 'lumpSum'];
    case 'car':
      return ['reduceTarget', 'increaseSIP', 'extendTimeline'];
    case 'travel':
      return ['reduceTarget', 'extendTimeline', 'increaseSIP'];
    default:
      return ['increaseSIP', 'extendTimeline', 'lumpSum', 'reduceTarget', 'higherReturn'];
  }
}

/**
 * Compute all lever values for an off-track goal.
 * Only includes levers that are applicable for this goal type.
 * 
 * @returns {Array<{key, label, value, unit, description}>}
 */
export function computeOffTrackLevers(goal, totalMonthlySIP, yearsLeft, targetINR, projected) {
  const { currentCorpus = 0, assumedCAGR, goalType } = goal;
  const isFixed = GOAL_TYPES[goalType]?.isFixed;
  const priority = leverPriorityForGoalType(goalType);

  // SW-16: the gap is measured against the COMPOSITE projection (`projected`), which already
  // includes RD/FD instruments. The levers below close THIS gap with an EXTRA MF SIP / lump
  // sum at the goal's equity rate. Previously they recomputed from projectCorpus(corpus, SIP)
  // and ignored instruments — so an FD/RD-funded goal looked like it had saved ₹0.
  const gap = targetINR - projected;

  const leverCalculators = {
    increaseSIP: () => {
      if (gap <= 0 || yearsLeft <= 0) return null;
      // Extra monthly SIP whose future value (annuity-due, proper compounding) closes the gap.
      const r = annualToMonthlyRate(assumedCAGR);
      const n = Math.round(yearsLeft * 12);
      if (n <= 0) return null;
      const sipMult = r === 0 ? n : ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
      const extra = Math.ceil(gap / sipMult);
      if (extra <= 0) return null;
      return {
        key: 'increaseSIP',
        label: 'Increase Monthly SIP',
        value: extra,
        unit: '₹/month',
        description: `Add ₹${extra.toLocaleString('en-IN')} per month to your SIPs for this goal.`,
      };
    },
    extendTimeline: () => {
      // Don't suggest for emergency fund or truly fixed-deadline goals with short horizon
      if (goalType === 'emergency') return null;
      // SW-16: extending time only helps if there's an ongoing MF contribution to keep growing.
      // A goal funded purely by RD/FD (no MF SIP/corpus) can't be helped by waiting longer.
      if (currentCorpus === 0 && totalMonthlySIP === 0) return null;
      const extraMonths = extraMonthsNeeded(currentCorpus, totalMonthlySIP, assumedCAGR, yearsLeft, targetINR);
      if (extraMonths === null || extraMonths <= 0) return null;
      const extraYrs = Math.floor(extraMonths / 12);
      const extraMo = extraMonths % 12;
      const timeStr = extraYrs > 0
        ? `${extraYrs}Y ${extraMo > 0 ? extraMo + 'M' : ''}`
        : `${extraMo}M`;
      // Sensitivity: flag if extending retirement
      const caveat = goalType === 'retirement'
        ? ' (This means delaying your retirement — consider carefully.)'
        : '';
      return {
        key: 'extendTimeline',
        label: 'Extend Timeline',
        value: extraMonths,
        unit: 'months',
        description: `Extend your goal deadline by ${timeStr.trim()}.${caveat}`,
      };
    },
    reduceTarget: () => {
      if (isFixed === true) return null; // never for education, retirement, emergency
      // What you'll actually reach = the composite projection (incl. RD/FD instruments).
      const achievableLakh = Math.round(projected / 100000);
      const targetLakh = Math.round(targetINR / 100000);
      if (achievableLakh >= targetLakh) return null;
      const contextMap = {
        car: 'Consider a different model or buying pre-owned.',
        travel: 'Consider a different destination or shorter trip.',
        house: 'Consider a different area or smaller property.',
        wedding: 'Review scope — some elements may be adjustable.',
      };
      return {
        key: 'reduceTarget',
        label: 'Reduce Target',
        value: achievableLakh,
        unit: 'lakhs achievable',
        description: `At current pace, you'll reach ~₹${achievableLakh}L (target: ₹${targetLakh}L). ${contextMap[goalType] || ''}`,
      };
    },
    lumpSum: () => {
      // A one-time investment today, grown at the equity rate, that closes the composite gap.
      if (gap <= 0) return null;
      const needed = yearsLeft <= 0 ? Math.ceil(gap) : Math.ceil(gap / Math.pow(1 + assumedCAGR / 100, yearsLeft));
      if (needed <= 0) return null;
      return {
        key: 'lumpSum',
        label: 'Deploy Lump Sum',
        value: needed,
        unit: '₹ one-time',
        description: `A one-time investment of ₹${needed.toLocaleString('en-IN')} today would close the gap.`,
      };
    },
    higherReturn: () => {
      // SW-16: raising the equity return only matters if there's MF money to grow.
      if (currentCorpus === 0 && totalMonthlySIP === 0) return null;
      const neededRate = higherReturnProjection(currentCorpus, totalMonthlySIP, yearsLeft, targetINR);
      if (neededRate === null) return null;
      if (neededRate <= assumedCAGR) return null; // already assuming enough
      return {
        key: 'higherReturn',
        label: 'Accept Higher Risk',
        value: neededRate,
        unit: '% CAGR needed',
        description: `Requires ${neededRate}% CAGR instead of ${assumedCAGR}%. Only viable with 10+ year horizon. Last resort.`,
      };
    },
  };

  const levers = [];
  for (const leverKey of priority) {
    const calc = leverCalculators[leverKey];
    if (!calc) continue;
    const result = calc();
    if (result) levers.push(result);
  }
  return levers;
}

// ─── Goal Health Computation (combines everything) ─────────────────

/**
 * Compute complete health snapshot for a single goal.
 * This is the main function that GoalCard.jsx should call.
 * 
 * @param {object} goal - Goal object per Brief §4.1 schema
 * @param {object} fundConfigs - Map of fundId → {monthlySIP, sipDate, alertEnabled}
 *                               (from goal.funds)
 * @returns {object} Full health snapshot
 */
// ─── SW-16: Composite (multi-instrument) goal projection ───────────
// A goal can be funded by a MIX of instruments, each with its OWN return:
//   - MF SIP   — goal.funds[fid] = { monthlySIP, sipDate, rate? }  (rate defaults to goal CAGR)
//   - RD       — goal.instruments[] = { type:'RD', monthly, rate, startDate, maturityDate, maturityAmount? }
//   - FD       — goal.instruments[] = { type:'FD', principal, rate, startDate, maturityDate, maturityAmount? }
// Legacy goals (funds without `rate`, no instruments) project IDENTICALLY to the old
// single-CAGR model, because Σ FV(sip_i @ same rate) == FV(Σ sip_i @ rate).
//
// Per-instrument projection is financially correct for composite goals: a 1-year car goal
// backed by an RD/FD is projected at its fixed rate, not an equity CAGR — so derisking
// warnings and "am I in the right instruments?" context are accurate.

// Fractional years between two ISO dates (can be negative if `to` is before `from`).
function yearsBetween(fromStr, toStr) {
  if (!fromStr || !toStr) return 0;
  const from = new Date(fromStr), to = new Date(toStr);
  if (isNaN(from) || isNaN(to)) return 0;
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000);
}

// Maturity amount of an RD/FD: explicit override if the user entered the contracted figure,
// otherwise computed from contribution + rate over its full term (start → maturity).
export function instrumentMaturityAmount(inst) {
  if (inst.maturityAmount != null && inst.maturityAmount !== '') return Number(inst.maturityAmount);
  const term = yearsBetween(inst.startDate, inst.maturityDate);
  if (term <= 0) return inst.type === 'FD' ? Number(inst.principal || 0) : 0;
  if (inst.type === 'FD') return futureValueLumpSum(Number(inst.principal || 0), Number(inst.rate || 0), term);
  if (inst.type === 'RD') return futureValueSIP(Number(inst.monthly || 0), Number(inst.rate || 0), term);
  return 0;
}

// Value an RD/FD instrument contributes to the goal AT the goal's target date.
// - Matures on/before target  → its maturity amount, held flat to target (conservative:
//   we don't assume reinvestment of a matured deposit).
// - Matures after target       → its accrued value at the target date (project to yearsLeft).
export function instrumentValueAtTarget(inst, yearsLeft, targetDateStr) {
  const now = new Date().toISOString().slice(0, 10);
  const maturesAfterTarget = yearsBetween(now, inst.maturityDate) > yearsLeft;
  if (!maturesAfterTarget) return instrumentMaturityAmount(inst);
  // Still running at the target date — accrue only up to the target horizon.
  if (inst.type === 'FD') return futureValueLumpSum(Number(inst.principal || 0), Number(inst.rate || 0), yearsLeft);
  if (inst.type === 'RD') return futureValueSIP(Number(inst.monthly || 0), Number(inst.rate || 0), yearsLeft);
  return 0;
}

// Value an MF SIP contributes to the goal AT the target date, honouring an optional
// contribution window (startDate / endDate).
//
// WHY (SW-16b): a SIP may have started in the past or be scheduled to STOP before the goal
// matures (e.g. "I'll run this SIP for 5 more years, but the goal is 10 years out"). The old
// model assumed every SIP runs from now to the target. Now:
//   • startDate in the FUTURE → contributions only begin then (no contribution before).
//   • startDate today/in the PAST → contributes from now (past contributions are already
//     captured in currentCorpus, which grows via the lump-sum term — so we never double-count).
//   • endDate before target → contributions stop at endDate; the amount accumulated by then
//     grows as a lump sum at the same rate until the target date.
//   • no startDate → treated as "from now"; no endDate → "runs to target". This makes the
//     function identical to the old futureValueSIP(...) for legacy goals (backward-compatible).
function mfSipValueAtTarget(f, yearsLeft, mfRate) {
  const m = Number(f.monthlySIP || 0);
  const r = Number(f.rate ?? mfRate);
  if (m <= 0 || yearsLeft <= 0) return 0;
  const now = new Date().toISOString().slice(0, 10);

  // When (in years from now) the SIP starts contributing. Past/today → 0.
  let startYears = f.startDate ? yearsBetween(now, f.startDate) : 0;
  if (startYears < 0) startYears = 0;
  if (startYears >= yearsLeft) return 0; // starts on/after the target → contributes nothing

  // When the SIP stops contributing. No endDate → runs to the target; capped at the target.
  let endYears = (f.endDate != null && f.endDate !== '') ? yearsBetween(now, f.endDate) : yearsLeft;
  if (endYears > yearsLeft) endYears = yearsLeft;
  if (endYears <= startYears) return 0; // no active contribution window in the future

  const activeYears = endYears - startYears;
  const fvAtSipEnd = futureValueSIP(m, r, activeYears); // value the moment the SIP stops
  // Grow that accumulated lump from the SIP-end date to the target date.
  return futureValueLumpSum(fvAtSipEnd, r, yearsLeft - endYears);
}

// Amount-weighted blend of the goal's EXPLICIT funding sources (MF SIPs + RD/FD), excluding the
// existing corpus. This is the goal's "contribution mix" rate — e.g. a 15k MF SIP @10% + two 10k
// RDs @7% blends to (15000·10 + 10000·7 + 10000·7)/35000 = 8.29%.
function explicitSourcesBlend(goal) {
  const mfRate = goal.assumedCAGR || GOAL_TYPES[goal.goalType]?.defaultCAGR || 10;
  let weighted = 0, weight = 0;
  const add = (amount, rate) => { weighted += amount * rate; weight += amount; };
  if (goal.funds) for (const f of Object.values(goal.funds)) add(Number(f.monthlySIP || 0), Number(f.rate ?? mfRate));
  if (Array.isArray(goal.instruments)) for (const inst of goal.instruments) {
    const amt = inst.type === 'FD' ? Number(inst.principal || 0) : Number(inst.monthly || 0);
    add(amt, Number(inst.rate || 0));
  }
  return weight > 0 ? weighted / weight : mfRate;
}

// The rate the EXISTING corpus grows at.
//
// Priority:
//   1. An explicit user override `goal.corpusRate` (e.g. the corpus is parked in an FD at a
//      known rate) — use it verbatim.
//   2. Otherwise default to the goal's contribution-mix blend (explicitSourcesBlend) — so the
//      existing corpus grows at the same blended rate as your ongoing funding, NOT the equity
//      default. (Previously it grew at `assumedCAGR` ≈ the equity rate even for an all-debt
//      goal, which over-projected the corpus and dragged the displayed blend up to ~12%.)
//   3. Fall back to the assumed/default CAGR only when there are no funding sources at all.
export function existingCorpusRate(goal) {
  if (goal.corpusRate != null && goal.corpusRate !== '') return Number(goal.corpusRate);
  return explicitSourcesBlend(goal);
}

// Project the full goal corpus at the target date by summing every funding source at its
// own return. mfRate defaults to the goal's assumed CAGR; each MF fund may override `rate`.
export function projectGoalComposite(goal, yearsLeft) {
  const mfRate = goal.assumedCAGR || GOAL_TYPES[goal.goalType]?.defaultCAGR || 10;
  const currentCorpus = goal.currentCorpus || 0;

  // Existing corpus grows at the rate of the goal's ACTUAL mix (equity rate only if the goal
  // has equity SIPs; otherwise the debt blend) — never blindly at the equity default.
  let total = futureValueLumpSum(currentCorpus, existingCorpusRate(goal), yearsLeft);

  // Each MF SIP grows at its own rate (or the goal rate if unset), over its contribution window.
  if (goal.funds) {
    for (const f of Object.values(goal.funds)) {
      total += mfSipValueAtTarget(f, yearsLeft, mfRate);
    }
  }

  // RD/FD instruments contribute their value at the target date.
  if (Array.isArray(goal.instruments)) {
    for (const inst of goal.instruments) {
      total += instrumentValueAtTarget(inst, yearsLeft, goal.targetDate);
    }
  }
  return total;
}

// Contribution-weighted blended return, for DISPLAY only (the goal's effective rate).
//
// BUG FIX: the existing corpus used to be weighted at `assumedCAGR` (the equity default ~12%)
// even for an all-debt goal, so a large corpus dragged the displayed blend up to ~12% when the
// goal actually held only RDs/FDs at 6.5–7%. It now uses existingCorpusRate() — the equity rate
// only if the goal has equity SIPs, otherwise the blend of the goal's real (debt) sources.
export function blendedReturn(goal) {
  const mfRate = goal.assumedCAGR || GOAL_TYPES[goal.goalType]?.defaultCAGR || 10;
  const corpusRate = existingCorpusRate(goal);

  let weighted = 0, weight = 0;
  const add = (amount, rate) => { weighted += amount * rate; weight += amount; };
  add(goal.currentCorpus || 0, corpusRate);
  if (goal.funds) for (const f of Object.values(goal.funds)) add(Number(f.monthlySIP || 0), Number(f.rate ?? mfRate));
  if (Array.isArray(goal.instruments)) for (const inst of goal.instruments) {
    const amt = inst.type === 'FD' ? Number(inst.principal || 0) : Number(inst.monthly || 0);
    add(amt, Number(inst.rate || 0));
  }
  return weight > 0 ? Math.round((weighted / weight) * 10) / 10 : mfRate;
}

export function computeGoalHealth(goal) {
  const yearsLeft = computeYearsLeft(goal.targetDate);
  const totalMonthlySIP = getTotalMonthlySIP(goal);
  const targetINR = (goal.targetLakh || 0) * 100000;
  const currentCorpus = goal.currentCorpus || 0;
  const assumedCAGR = goal.assumedCAGR || GOAL_TYPES[goal.goalType]?.defaultCAGR || 10;

  // SW-16: composite projection (per-instrument returns). For legacy all-MF goals with no
  // per-fund rate and no instruments, this equals the old projectCorpus(...) exactly.
  const projected = projectGoalComposite(goal, yearsLeft);
  const onTrackPct = onTrackPercent(projected, targetINR);
  const status = healthStatus(onTrackPct);

  // Required CAGR — only compute, display is controlled by GoalCard (DEC-014)
  const reqCAGR = requiredCAGR(currentCorpus, totalMonthlySIP, targetINR, yearsLeft);

  // Off-track levers — only compute if amber or red
  const levers = status !== 'green'
    ? computeOffTrackLevers(goal, totalMonthlySIP, yearsLeft, targetINR, projected)
    : [];

  // Corpus staleness
  const staleness = corpusStaleness(goal.corpusUpdatedAt);
  const daysSinceUpdate = daysSinceCorpusUpdate(goal.corpusUpdatedAt);

  // Equity cutoff warning
  const goalTypeDef = GOAL_TYPES[goal.goalType];
  const equityCutoffYears = goalTypeDef?.equityCutoffYears ?? 3;
  const shouldDerisk = yearsLeft <= equityCutoffYears;

  // Emergency fund equity warning
  const hasEquityFunds = goal.goalType === 'emergency' && checkEquityMapped(goal);

  return {
    goalId: goal.id,
    yearsLeft: Math.round(yearsLeft * 10) / 10, // 1 decimal
    monthsLeft: Math.round(yearsLeft * 12),
    totalMonthlySIP,
    projected: Math.round(projected),
    projectedLakh: Math.round(projected / 100000 * 10) / 10,
    targetINR,
    onTrackPct: Math.round(onTrackPct * 10) / 10,
    status,
    reqCAGR,           // null if on-track or infeasible; show per DEC-014
    levers,            // empty if green
    staleness,         // 'fresh' | 'amber' | 'red'
    daysSinceUpdate,
    shouldDerisk,      // true if within equity cutoff window
    equityCutoffYears,
    hasEquityWarning: hasEquityFunds,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Sum of all monthly SIPs across all funds mapped to a goal.
 */
export function getTotalMonthlySIP(goal) {
  if (!goal.funds) return 0;
  return Object.values(goal.funds).reduce((sum, f) => sum + (f.monthlySIP || 0), 0);
}

/**
 * Check if any equity fund is mapped to an emergency goal.
 * This is a warning — emergency funds should be debt/liquid only.
 * 
 * Note: This is a simplified check. It flags based on the fund's
 * category in the hardcoded fund config. Caller should pass fund
 * metadata if available, or this checks goal.funds keys against
 * known non-debt categories.
 */
function checkEquityMapped(goal) {
  // This will be enriched when fund config is available.
  // For now, it's a flag that GoalCard can use.
  // The actual check should compare fund IDs against the fund config's
  // category field (smallcap, midcap, etc. are equity; arbitrage is OK).
  return false; // placeholder — enriched when integrated with App.jsx fund config
}

// ─── Goal CRUD Helpers ─────────────────────────────────────────────

/**
 * Create a new goal object with all required fields (Brief §4.1).
 */
export function createGoal({
  label,
  goalType,
  emoji,
  startDate,
  totalYears,
  targetLakh,
  currentCorpus = 0,
  assumedCAGR,
  // Optional override for the rate the EXISTING corpus grows at (e.g. parked in an FD).
  // null/undefined → existingCorpusRate() defaults it to the goal's blended contribution rate.
  corpusRate = null,
  funds = {},
  // SW-16: a goal can be funded by a MIX of instruments. `instruments` is an array of
  // RD/FD deposits (each with its own fixed `rate`), and each MF entry in `funds` may
  // carry an optional per-fund `rate`. These are persisted verbatim — the projection
  // engine (projectGoalComposite) reads them. Defaults keep legacy single-CAGR goals identical.
  instruments = [],
}) {
  const typeDef = GOAL_TYPES[goalType];
  if (!typeDef) throw new Error(`Unknown goal type: ${goalType}`);

  const start = startDate || new Date().toISOString().slice(0, 10);
  const targetDate = computeTargetDate(start, totalYears || typeDef.defaultHorizonYears);
  const now = new Date().toISOString().slice(0, 10);

  return {
    id: crypto.randomUUID(),
    label: label || typeDef.label,
    emoji: emoji || typeDef.emoji,
    goalType,
    startDate: start,
    targetDate,
    totalYears: totalYears || typeDef.defaultHorizonYears,
    currentCorpus: currentCorpus || 0,
    corpusUpdatedAt: currentCorpus > 0 ? now : null,
    targetLakh: targetLakh || 0,
    assumedCAGR: assumedCAGR ?? typeDef.defaultCAGR,
    corpusRate: corpusRate ?? null,
    // Preserve per-fund rate: funds is { fid: { monthlySIP, sipDate, rate? } }.
    funds: funds || {},
    instruments: Array.isArray(instruments) ? instruments : [],
    status: GOAL_STATUSES.ACTIVE,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Update an existing goal. Returns a new object (immutable pattern).
 * Automatically updates corpusUpdatedAt if currentCorpus changes.
 */
export function updateGoal(existingGoal, updates) {
  // Shallow merge: any field present in `updates` overwrites the existing goal.
  // SW-16: this naturally carries through `funds` (incl. per-fund `rate`) and the
  // `instruments` array when the form passes them — no special handling needed.
  const updated = { ...existingGoal, ...updates };

  // If corpus changed, update the timestamp
  if (updates.currentCorpus !== undefined && updates.currentCorpus !== existingGoal.currentCorpus) {
    updated.corpusUpdatedAt = new Date().toISOString().slice(0, 10);
  }

  // If totalYears or startDate changed, recompute targetDate
  if (updates.totalYears !== undefined || updates.startDate !== undefined) {
    updated.targetDate = computeTargetDate(
      updated.startDate,
      updated.totalYears
    );
  }

  return updated;
}

/**
 * Compute target date from start date + total years.
 *
 * Supports FRACTIONAL years (e.g. 1.5 → +1 year +6 months). `Date.setFullYear`
 * silently truncates a fractional year argument, so we split the horizon into whole
 * years + rounded months and apply them separately. Exported so the dashboard's
 * legacy-goal bridge and the form's live preview compute the target date identically.
 */
export function computeTargetDate(startDateStr, totalYears) {
  const d = new Date(startDateStr);
  const years = Number(totalYears) || 0;
  const wholeYears = Math.trunc(years);
  const extraMonths = Math.round((years - wholeYears) * 12);
  d.setFullYear(d.getFullYear() + wholeYears);
  d.setMonth(d.getMonth() + extraMonths);
  return d.toISOString().slice(0, 10);
}

// ─── Persistence (localStorage) ────────────────────────────────────

/**
 * Load goals from localStorage with schema migration if needed.
 */
export function loadGoals() {
  try {
    const version = parseInt(localStorage.getItem(STORAGE_KEY_VERSION) || '0', 10);
    const raw = localStorage.getItem(STORAGE_KEY_GOALS);

    if (!raw) return [];

    const parsed = JSON.parse(raw);

    if (version < SCHEMA_VERSION) {
      const migrated = migrateGoals(parsed, version);
      saveGoals(migrated);
      return migrated;
    }

    return parsed;
  } catch (e) {
    console.error('Failed to load goals from localStorage:', e);
    return [];
  }
}

/**
 * Save goals to localStorage with current schema version.
 */
export function saveGoals(goals) {
  try {
    localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
    localStorage.setItem(STORAGE_KEY_VERSION, String(SCHEMA_VERSION));
  } catch (e) {
    console.error('Failed to save goals to localStorage:', e);
  }
}

// ─── Schema Migration (v3 → v4) ───────────────────────────────────

/**
 * Migrate goals from v3 hardcoded format to v4 schema.
 * 
 * v3 format (hardcoded in App.jsx): goals were not stored as structured
 * objects — they were implicit in the fund config's `goals[]` array
 * (e.g., goals: ['Retirement', 'Kids Education']).
 * 
 * v4 format: full Goal objects per Brief §4.1.
 * 
 * Migration strategy:
 * - If data looks like v3 (array of strings or simple objects), convert to v4
 * - If data is already v4-shaped (has 'goalType'), pass through
 * - Unknown formats: return empty array (safe fallback)
 */
export function migrateGoals(data, fromVersion) {
  if (!Array.isArray(data)) return [];

  // Already v4+
  if (fromVersion >= SCHEMA_VERSION) return data;

  // v3 or earlier: could be an array of simple goal objects
  // with {label, yearsLeft, targetLakh, funds} but missing
  // goalType, startDate, status, etc.
  return data.map((g) => {
    // If it already has goalType + id, it's close to v4
    if (g.id && g.goalType && g.targetDate) return g;

    // Infer goal type from label
    const inferredType = inferGoalType(g.label || g.name || '');

    // Convert yearsLeft (stored in v3) to startDate + targetDate
    const yearsLeft = g.yearsLeft || g.totalYears || GOAL_TYPES[inferredType]?.defaultHorizonYears || 10;
    const now = new Date();
    const startDate = g.startDate || now.toISOString().slice(0, 10);
    // Estimate original start date by subtracting elapsed time
    // Since we don't know exactly, use today as start and yearsLeft as totalYears
    const targetDate = computeTargetDate(now.toISOString().slice(0, 10), yearsLeft);

    return {
      id: g.id || crypto.randomUUID(),
      label: g.label || g.name || GOAL_TYPES[inferredType]?.label || 'Goal',
      emoji: g.emoji || GOAL_TYPES[inferredType]?.emoji || '🎯',
      goalType: inferredType,
      startDate,
      targetDate,
      totalYears: yearsLeft, // best approximation
      currentCorpus: g.currentCorpus || 0,
      corpusUpdatedAt: g.corpusUpdatedAt || null,
      targetLakh: g.targetLakh || g.target || 0,
      assumedCAGR: g.assumedCAGR || GOAL_TYPES[inferredType]?.defaultCAGR || 10,
      funds: g.funds || {},
      status: g.status || GOAL_STATUSES.ACTIVE,
      createdAt: g.createdAt || new Date().toISOString(),
    };
  });
}

/**
 * Best-effort inference of goal type from a label string.
 */
function inferGoalType(label) {
  const lower = label.toLowerCase();
  if (lower.includes('retire')) return 'retirement';
  if (lower.includes('education') || lower.includes('kid') || lower.includes('child')) return 'education';
  if (lower.includes('car') || lower.includes('vehicle')) return 'car';
  if (lower.includes('house') || lower.includes('home') || lower.includes('flat')) return 'house';
  if (lower.includes('travel') || lower.includes('vacation') || lower.includes('trip')) return 'travel';
  if (lower.includes('wedding') || lower.includes('marriage')) return 'wedding';
  if (lower.includes('emergency') || lower.includes('rainy')) return 'emergency';
  return 'retirement'; // conservative default
}

// ─── Formatters (for display) ──────────────────────────────────────

/**
 * Format INR amount in lakhs with 1 decimal place.
 */
export function formatLakh(amountINR) {
  const lakhs = amountINR / 100000;
  if (lakhs >= 100) return `₹${Math.round(lakhs)}L`;
  return `₹${Math.round(lakhs * 10) / 10}L`;
}

/**
 * Format years left as "XY YM" or "X months".
 */
export function formatTimeLeft(yearsLeft) {
  if (yearsLeft <= 0) return 'Past due';
  const totalMonths = Math.round(yearsLeft * 12);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}M`;
  if (months === 0) return `${years}Y`;
  return `${years}Y ${months}M`;
}

/**
 * Format INR with Indian number system (commas).
 */
export function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ─── Validation ────────────────────────────────────────────────────

/**
 * Validate a goal object before saving. Returns array of error strings.
 * Empty array = valid.
 */
export function validateGoal(goal) {
  const errors = [];

  if (!goal.label || goal.label.trim().length === 0) {
    errors.push('Goal name is required.');
  }

  if (!goal.goalType || !GOAL_TYPES[goal.goalType]) {
    errors.push('Please select a valid goal type.');
  }

  if (!goal.targetLakh || goal.targetLakh <= 0) {
    errors.push('Target amount must be greater than zero.');
  }

  if (!goal.totalYears || goal.totalYears <= 0) {
    errors.push('Time horizon must be greater than zero.');
  }

  if (goal.totalYears > 40) {
    errors.push('Time horizon seems too long (>40 years). Please verify.');
  }

  if (goal.assumedCAGR !== undefined) {
    if (goal.assumedCAGR < 0 || goal.assumedCAGR > 20) {
      errors.push('Assumed CAGR should be between 0% and 20%. Above 15% is aggressive.');
    }
  }

  if (goal.currentCorpus < 0) {
    errors.push('Current corpus cannot be negative.');
  }

  // Emergency fund should not have equity
  // (This is a soft warning, not a hard error — handled in GoalCard)

  return errors;
}

// ─── Export all goal types as an ordered array for the form ────────
export const GOAL_TYPE_OPTIONS = Object.values(GOAL_TYPES);

// ─── Index-Based CAGR Suggestion (SW-1 enhancement) ──────────────
//
// When a user links specific mutual funds to a goal, we can derive a
// better CAGR assumption than the generic goal-type default.
//
// Approach:
//   1. Each fund maps to an equity index (smallcap → Nifty SC250, etc.)
//   2. Look up that index's historical average CAGR at a standard
//      horizon bucket — always rounding UP (ceiling) for conservatism
//   3. Subtract 0.5% as an additional conservatism buffer
//   4. If multiple funds: weight by monthly SIP amount
//      (equal weight if all SIPs are zero — e.g. fund just linked, no amount yet)
//
// Ceiling bucket rule:
//   8Y goal → 10Y bucket   (not 7Y — next bucket UP)
//   6Y goal → 7Y bucket
//   4Y goal → 5Y bucket
//   11–14Y  → 15Y bucket
//   >20Y    → 20Y bucket   (capped)
//
// This ensures we never use a shorter (more optimistic) history window
// than the actual goal horizon demands.

/**
 * Standard horizon buckets available for CAGR lookup.
 * Ceiling logic: always pick the next bucket equal-to-or-greater-than goal years.
 */
export const CAGR_HORIZON_BUCKETS = [1, 3, 5, 7, 10, 15, 20];

/**
 * Conservative discount applied on top of historical index CAGR.
 * Rationale: past index returns don't guarantee future performance;
 * this small buffer helps projections stay realistic.
 */
export const CONSERVATIVE_CAGR_DISCOUNT = 0.5; // percentage points, subtracted at computation

/**
 * Historical average CAGR estimates per index, per horizon bucket.
 *
 * These are approximate long-run averages derived from NSE India index
 * factsheets as of 2025. NOT point-to-point returns (which are
 * misleading) — they represent reasonable forward-looking expectations
 * based on multi-year historical performance across market cycles.
 *
 * Index keys must match the 'index' field on FUNDS[] entries in App.jsx:
 *   'largecap'  → Nifty 50
 *   'midcap'    → Nifty Midcap 150
 *   'smallcap'  → Nifty Smallcap 250
 *   'arbitrage' → Arbitrage / liquid category (near-debt returns)
 *
 * CONSERVATIVE_CAGR_DISCOUNT (0.5%) is subtracted at computation time — not stored here.
 * Review and update these values annually. Last reviewed: May 2026.
 * Source: NSE India index factsheets, AMFI historical data.
 *
 *                           1Y    3Y     5Y     7Y    10Y   15Y   20Y
 */
export const INDEX_HISTORICAL_CAGR = {
  largecap:  { 1: 11,  3: 11,  5: 11.5, 7: 12,  10: 12,  15: 12.5, 20: 13  }, // Nifty 50
  midcap:    { 1: 12,  3: 13,  5: 14,   7: 14.5, 10: 15,  15: 15,   20: 15  }, // Nifty Midcap 150
  smallcap:  { 1: 11,  3: 13,  5: 13.5, 7: 14,  10: 14,  15: 14.5, 20: 15  }, // Nifty Smallcap 250
  arbitrage: { 1: 7,   3: 7,   5: 7,    7: 7,   10: 7,   15: 7,    20: 7   }, // Arbitrage / liquid
};

/**
 * Return the ceiling horizon bucket for a given years-remaining value.
 * Always rounds UP to the next standard bucket — conservative bias.
 *
 * Examples: 8Y → 10, 6Y → 7, 4Y → 5, 11Y → 15, 1Y → 1, 0.5Y → 1, 21Y → 20
 *
 * @param {number} years - Years remaining to goal target date (can be fractional)
 * @returns {number} One of [1, 3, 5, 7, 10, 15, 20]
 */
export function getHorizonBucket(years) {
  for (const bucket of CAGR_HORIZON_BUCKETS) {
    if (years <= bucket) return bucket;
  }
  return 20; // cap — beyond 20Y, use 20Y history
}

/**
 * Compute the suggested CAGR for a goal based on its linked funds.
 *
 * Algorithm:
 *   1. Find ceiling horizon bucket for yearsLeft
 *   2. For each linked fund: look up index CAGR at that bucket, subtract discount
 *   3. Weight each fund's adjusted CAGR by its monthly SIP
 *      (fall back to equal weight if all SIPs are 0)
 *   4. Return weighted average rounded to 1 decimal place
 *
 * Returns null if:
 *   - No funds linked, OR
 *   - None of the linked funds have a recognised index
 *
 * Caller should fall back to GOAL_TYPES[goalType].defaultCAGR when null.
 *
 * @param {object} selectedFunds  - { fundId: { monthlySIP, sipDate, alertEnabled } }
 * @param {number} yearsLeft      - Goal horizon in years (fractional OK)
 * @param {Array}  trackedFunds   - [{ id, name, category, index }] — must include index field
 * @returns {number|null}
 */
export function computeSuggestedCAGR(selectedFunds, yearsLeft, trackedFunds) {
  if (!selectedFunds || !trackedFunds || yearsLeft <= 0) return null;

  const bucket = getHorizonBucket(yearsLeft);

  // Build list of eligible entries: fund must have a recognised index (or be Arbitrage category)
  const eligible = [];
  for (const [fundId, fundCfg] of Object.entries(selectedFunds)) {
    const meta = trackedFunds.find(f => f.id === fundId);
    if (!meta) continue;

    // Resolve index key: use fund's index field directly, or infer 'arbitrage' from category
    const indexKey = meta.index
      || (meta.category?.toLowerCase().includes('arbitrage') ? 'arbitrage' : null);
    if (!indexKey || !INDEX_HISTORICAL_CAGR[indexKey]) continue;

    const rawCagr = INDEX_HISTORICAL_CAGR[indexKey][bucket];
    if (rawCagr == null) continue;

    eligible.push({
      fundId,
      sip: Math.max(0, fundCfg.monthlySIP || 0),
      adjustedCagr: rawCagr - CONSERVATIVE_CAGR_DISCOUNT,
    });
  }

  if (eligible.length === 0) return null;

  // Weight by SIP amount; if all SIPs are zero (funds just linked, no amounts entered yet),
  // use equal weighting so the suggestion still updates meaningfully.
  const totalSIP = eligible.reduce((sum, e) => sum + e.sip, 0);
  const equalWeight = totalSIP === 0;

  let weightedSum = 0;
  for (const e of eligible) {
    const w = equalWeight ? 1 / eligible.length : e.sip / totalSIP;
    weightedSum += e.adjustedCagr * w;
  }

  return Math.round(weightedSum * 10) / 10; // 1 decimal place
}

// ─── Dip Prioritisation: Conviction Scoring (SW-3) ───────────────
// When multiple funds show "Buy Dip" signals simultaneously and the user
// has a lump sum to deploy, we need to rank them by conviction — i.e.,
// which dip is most worth buying into right now?
//
// The score is a weighted composite of 5 factors on a 0–100 scale.
// Each factor captures a different dimension of the investment opportunity:
//
//   Factor             Weight   Why it matters
//   ──────────────     ──────   ─────────────────────────────────────────
//   Dip Depth          30%      Deeper dip = better entry price relative to recent avg
//   Market P/E         20%      Cheap overall market = higher probability of recovery
//   Drawdown from 52W  15%      Deep drawdown from peak = mean reversion opportunity
//   Goal Horizon       20%      Longer horizon = more time to recover if dip continues
//   Goal Health        15%      Off-track goals need the capital more urgently
//
// IMPORTANT EXCLUSIONS:
// - Emergency fund goals ALWAYS get score 0 (no equity ever — Brief §4.2)
// - Goals with < 2 years remaining get score 0 (capital preservation zone)
// - Arbitrage/debt funds are excluded upstream (only equity dips are scored)

/**
 * Score a single fund–goal pair for dip conviction.
 *
 * Think of this like a "should I buy this dip?" scorecard.
 * Higher score = stronger case for deploying lump sum into this fund for this goal.
 *
 * @param {object} params
 * @param {number} params.dipPercent      - How far below rolling avg (positive number, e.g. 8.2 for -8.2%)
 * @param {number} params.marketPE        - Current P/E ratio for the fund's index (e.g. 22.5)
 * @param {number} params.drawdownPercent - How far below 52-week high (positive number, e.g. 15 for -15%)
 * @param {number} params.yearsLeft       - Years remaining to goal target date
 * @param {number} params.onTrackPct      - Goal health: how on-track the goal is (0–200%)
 * @param {string} params.goalType        - One of the 7 goal types (car, house, etc.)
 * @returns {number} Conviction score 0–100 (0 = do not invest, 100 = maximum conviction)
 */
export function computeConvictionScore({
  dipPercent,
  marketPE,
  drawdownPercent,
  yearsLeft,
  onTrackPct,
  goalType,
}) {
  // ── HARD EXCLUSIONS ──────────────────────────────────────────────
  // Emergency funds must NEVER hold equity (Brief §4.2, GOAL_TYPES.emergency).
  // This is a non-negotiable financial safety rule.
  if (goalType === 'emergency') return 0;

  // Goals within 2 years of target are in the "capital preservation" zone.
  // Buying equity dips this close to the deadline risks permanent loss
  // of capital right when the money is needed. (See goalContext() in App.jsx
  // where dipMultiplier=0 for yearsLeft<=2.)
  if (yearsLeft < 2) return 0;

  // ── FACTOR 1: DIP DEPTH (30% weight) ────────────────────────────
  // Deeper dips = better entry price. A fund that's 10% below its rolling
  // average is a stronger signal than one that's 3% below.
  // We cap at 15% because beyond that, the dip might signal fundamental
  // problems rather than a buying opportunity. Linear scale 0–100.
  const MAX_DIP_THRESHOLD = 15; // percent below rolling average
  const dipScore = Math.min((Math.abs(dipPercent) / MAX_DIP_THRESHOLD) * 100, 100);

  // ── FACTOR 2: MARKET P/E CONTEXT (20% weight) ──────────────────
  // P/E ratio tells us whether the broad market is cheap or expensive.
  // When the whole market is cheap (low P/E), dips are more likely to
  // recover — you're buying at a structurally good valuation.
  // When expensive (high P/E), even a dipped fund might fall further.
  //
  // Thresholds are for Nifty 50 (largecap). Small/mid-cap P/E ratios
  // are passed in already adjusted by the caller from PE_BANDS.
  // Using simple cutoffs rather than the per-index bands here because
  // the conviction score needs a single comparable scale across all funds.
  let peScore;
  if (marketPE == null) {
    // No P/E data available — use neutral score (don't penalise or boost)
    peScore = 50;
  } else if (marketPE < 18) {
    // Cheap market: high confidence that dips will recover
    peScore = 100;
  } else if (marketPE <= 22) {
    // Fair value: moderate confidence
    peScore = 60;
  } else {
    // Expensive market: low confidence — dips may deepen
    peScore = 20;
  }

  // ── FACTOR 3: DRAWDOWN FROM 52-WEEK HIGH (15% weight) ──────────
  // A fund that's 20% below its 52-week high represents a bigger discount
  // than one that's only 5% off. This captures the "how cheap is it relative
  // to its recent peak?" dimension.
  // Capped at 30% because beyond that, something structural may be wrong.
  const MAX_DRAWDOWN_THRESHOLD = 30; // percent below 52W high
  const drawdownScore = Math.min(
    (Math.abs(drawdownPercent || 0) / MAX_DRAWDOWN_THRESHOLD) * 100,
    100
  );

  // ── FACTOR 4: GOAL HORIZON (20% weight) ─────────────────────────
  // Longer horizon = more time for equity to recover from short-term dips.
  // A retirement goal 22 years away can afford aggressive dip-buying.
  // A car goal 3 years away should be cautious — less time to recover.
  //
  // Score tiers match the goalContext() horizon bands in App.jsx:
  //   >15Y = 100 (long term, aggressive)
  //   10-15Y = 80 (long term, moderate)
  //   5-10Y = 50 (medium term, selective)
  //   2-5Y = 20 (short term, cautious)
  //   <2Y = 0 (already excluded above)
  let horizonScore;
  if (yearsLeft > 15) horizonScore = 100;
  else if (yearsLeft > 10) horizonScore = 80;
  else if (yearsLeft > 5) horizonScore = 50;
  else horizonScore = 20; // 2-5 years

  // ── FACTOR 5: GOAL HEALTH (15% weight) ──────────────────────────
  // Off-track (red/amber) goals benefit MORE from a well-timed lump sum
  // because they need extra capital to catch up to their target.
  // On-track (green) goals still benefit, but with less urgency.
  //
  // This creates a "triage" effect: when you have limited lump sum,
  // direct it toward the goal that needs it most.
  let healthScore;
  if (onTrackPct < 70) {
    // Red: critically off-track — needs capital urgently
    healthScore = 100;
  } else if (onTrackPct < 90) {
    // Amber: needs attention — lump sum would help significantly
    healthScore = 70;
  } else {
    // Green: on-track — lump sum is a bonus, not a necessity
    healthScore = 30;
  }

  // ── WEIGHTED COMPOSITE ──────────────────────────────────────────
  // Weights sum to 1.0. Chosen to prioritise signal quality (dip depth)
  // while ensuring goal context shapes the recommendation.
  const score =
    dipScore * 0.30 +
    peScore * 0.20 +
    drawdownScore * 0.15 +
    horizonScore * 0.20 +
    healthScore * 0.15;

  // Round to 1 decimal place for clean display
  return Math.round(score * 10) / 10;
}

/**
 * Allocate a lump sum across multiple fund–goal pairs proportionally
 * to their conviction scores.
 *
 * The logic is simple: each entry gets a share of the total proportional
 * to its conviction score. If only one fund has a Buy Dip signal, it gets
 * 100% of the lump sum.
 *
 * Amounts are rounded to nearest ₹500 for practical SIP/lump-sum amounts
 * (most Indian fund platforms use ₹500 increments).
 *
 * @param {Array<{score: number, fundId: string, goalId: string}>} scoredEntries
 * @param {number} totalLumpSum - Total available amount in INR
 * @returns {Array<{...entry, suggestedAmount: number}>} Entries with suggested amounts
 */
export function allocateLumpSum(scoredEntries, totalLumpSum) {
  // Filter out zero-score entries (emergency, imminent goals, etc.)
  const eligible = scoredEntries.filter(e => e.score > 0);
  if (eligible.length === 0 || totalLumpSum <= 0) return [];

  const totalScore = eligible.reduce((sum, e) => sum + e.score, 0);

  // Allocate proportionally, round to ₹500, track remainder for correction
  let allocated = eligible.map(entry => ({
    ...entry,
    suggestedAmount: Math.round((entry.score / totalScore) * totalLumpSum / 500) * 500,
  }));

  // Correct rounding errors: ensure total allocated = total lump sum.
  // Add/subtract the difference to the highest-conviction entry.
  const totalAllocated = allocated.reduce((sum, e) => sum + e.suggestedAmount, 0);
  const diff = totalLumpSum - totalAllocated;
  if (diff !== 0 && allocated.length > 0) {
    // Sort by score descending, adjust the top entry
    allocated.sort((a, b) => b.score - a.score);
    allocated[0].suggestedAmount += diff;
  }

  return allocated;
}
