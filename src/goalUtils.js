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
export const GOAL_STATUSES = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
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

  const leverCalculators = {
    increaseSIP: () => {
      const extra = additionalSIPNeeded(currentCorpus, totalMonthlySIP, assumedCAGR, yearsLeft, targetINR);
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
      const achievable = achievableCorpus(currentCorpus, totalMonthlySIP, assumedCAGR, yearsLeft);
      const achievableLakh = Math.round(achievable / 100000);
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
      const needed = lumpSumNeeded(currentCorpus, totalMonthlySIP, assumedCAGR, yearsLeft, targetINR);
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
export function computeGoalHealth(goal) {
  const yearsLeft = computeYearsLeft(goal.targetDate);
  const totalMonthlySIP = getTotalMonthlySIP(goal);
  const targetINR = (goal.targetLakh || 0) * 100000;
  const currentCorpus = goal.currentCorpus || 0;
  const assumedCAGR = goal.assumedCAGR || GOAL_TYPES[goal.goalType]?.defaultCAGR || 10;

  const projected = projectCorpus(currentCorpus, totalMonthlySIP, assumedCAGR, yearsLeft);
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
  funds = {},
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
    funds: funds || {},
    status: GOAL_STATUSES.ACTIVE,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Update an existing goal. Returns a new object (immutable pattern).
 * Automatically updates corpusUpdatedAt if currentCorpus changes.
 */
export function updateGoal(existingGoal, updates) {
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
 */
function computeTargetDate(startDateStr, totalYears) {
  const d = new Date(startDateStr);
  d.setFullYear(d.getFullYear() + totalYears);
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
