// goalUtils.test.js — Tests for the Project Artha goal/financial engine.
//
// REWRITTEN (Sprint 3): now imports the REAL functions from ./goalUtils.js.
// Previously this file COPIED every function inline ("copied for standalone testing")
// and tested the copies — so the actual financial math (compounding, projections,
// required CAGR, conviction scoring) had ZERO regression protection. A bug in the real
// module could not be caught. These tests now exercise the shipped code directly.
//
// Financial values are validated against hand-computed expected results.

import { describe, it, expect } from 'vitest'
import {
  annualToMonthlyRate,
  futureValueLumpSum,
  futureValueSIP,
  projectCorpus,
  requiredCAGR,
  additionalSIPNeeded,
  lumpSumNeeded,
  healthStatus,
  computeConvictionScore,
  allocateLumpSum,
  getHorizonBucket,
  computeSuggestedCAGR,
  projectGoalComposite,
  existingCorpusRate,
  instrumentMaturityAmount,
  instrumentValueAtTarget,
  blendedReturn,
  createGoal,
  updateGoal,
  computeGoalHealth,
  computeTargetDate,
} from './goalUtils.js'

// ISO date `years` from now (negative = past). For instrument maturity/target tests.
const isoIn = (years) => new Date(Date.now() + years * 365.25 * 86400000).toISOString().slice(0, 10)

// Assert `actual` is within `tolPct` percent of `expected`.
function expectClose(actual, expected, tolPct) {
  const diff = Math.abs(actual - expected)
  const pctDiff = expected !== 0 ? (diff / Math.abs(expected)) * 100 : diff
  expect(pctDiff, `expected ~${expected}, got ${actual} (${pctDiff.toFixed(3)}% off)`).toBeLessThanOrEqual(tolPct)
}

describe('annualToMonthlyRate — proper compounding (design principle #9)', () => {
  it('12% annual → ~0.949% monthly', () => expectClose(annualToMonthlyRate(12) * 100, 0.9489, 1))
  it('0% annual → 0% monthly', () => expect(annualToMonthlyRate(0)).toBe(0))
  it('7% annual → ~0.565% monthly', () => expectClose(annualToMonthlyRate(7) * 100, 0.5654, 2))
})

describe('futureValueLumpSum', () => {
  it('₹1L at 12% for 20Y ≈ ₹9.65L', () => expectClose(futureValueLumpSum(100000, 12, 20), 964629, 0.5))
  it('₹5L at 10% for 10Y ≈ ₹12.97L', () => expectClose(futureValueLumpSum(500000, 10, 10), 1296871, 0.5))
  it('₹0 corpus → ₹0', () => expect(futureValueLumpSum(0, 12, 20)).toBe(0))
  it('0 years → returns present value', () => expect(futureValueLumpSum(100000, 12, 0)).toBe(100000))
})

describe('futureValueSIP — annuity-due, proper compounding', () => {
  it('₹10K/mo at 12% for 20Y ≈ ₹92.0L', () => expectClose(futureValueSIP(10000, 12, 20), 9198574, 1))
  it('₹5K/mo at 10% for 10Y ≈ ₹10.1L', () => expectClose(futureValueSIP(5000, 10, 10), 1007288, 2))
  it('₹0 SIP → ₹0', () => expect(futureValueSIP(0, 12, 20)).toBe(0))
  it('0 years → ₹0', () => expect(futureValueSIP(10000, 12, 0)).toBe(0))
  it('₹10K/mo at 0% for 5Y = ₹6L (pure savings)', () => expect(futureValueSIP(10000, 0, 5)).toBe(600000))
})

describe('projectCorpus — combined lump sum + SIP', () => {
  it('retirement projection (₹3L + ₹15K/mo @12% 22Y) is in a sane range', () => {
    const proj = projectCorpus(300000, 15000, 12, 22)
    expect(proj).toBeGreaterThan(20000000)
    expect(proj).toBeLessThan(30000000)
  })
  it('emergency 1Y projection ≈ ₹90K', () => expectClose(projectCorpus(50000, 3000, 7, 1), 90400, 3))
})

describe('requiredCAGR', () => {
  it('already-met target → 0%', () => expect(requiredCAGR(10000000, 0, 10000000, 10)).toBe(0))
  it('₹1Cr in 15Y from ₹1L + ₹10K/mo → reasonable (10–20%)', () => {
    const r = requiredCAGR(100000, 10000, 10000000, 15)
    expect(r).not.toBeNull()
    expect(r).toBeGreaterThan(10)
    expect(r).toBeLessThan(20)
  })
  it('infeasible target → null', () => expect(requiredCAGR(0, 1000, 100000000, 5)).toBeNull())
  it('0 years left → null', () => expect(requiredCAGR(0, 10000, 10000000, 0)).toBeNull())
})

describe('additionalSIPNeeded — closes the gap', () => {
  it('on-track goal → ₹0', () => expect(additionalSIPNeeded(10000000, 0, 12, 10, 5000000)).toBe(0))
  it('computed extra SIP actually reaches the target', () => {
    const s = additionalSIPNeeded(0, 0, 12, 10, 5000000)
    expectClose(futureValueSIP(s, 12, 10), 5000000, 2)
  })
})

describe('lumpSumNeeded — closes the gap', () => {
  it('on-track goal → ₹0', () => expect(lumpSumNeeded(10000000, 0, 12, 10, 5000000)).toBe(0))
  it('computed lump sum grows to the target', () => {
    const ls = lumpSumNeeded(0, 0, 12, 10, 5000000)
    expectClose(ls, 5000000 / Math.pow(1.12, 10), 1)
  })
})

describe('healthStatus — Green ≥90, Amber 70–90, Red <70', () => {
  it('95% → green', () => expect(healthStatus(95)).toBe('green'))
  it('90% → green (boundary)', () => expect(healthStatus(90)).toBe('green'))
  it('89% → amber', () => expect(healthStatus(89)).toBe('amber'))
  it('70% → amber (boundary)', () => expect(healthStatus(70)).toBe('amber'))
  it('69% → red', () => expect(healthStatus(69)).toBe('red'))
  it('30% → red', () => expect(healthStatus(30)).toBe('red'))
})

describe('lever consistency — SIP and lump sum both close the gap', () => {
  it('additional SIP and lump sum each reach ≥99% of target', () => {
    const corpus = 200000, sip = 5000, cagr = 12, years = 15, target = 10000000
    const projected = projectCorpus(corpus, sip, cagr, years)
    expect(target).toBeGreaterThan(projected) // precondition: there is a gap
    const extraSIP = additionalSIPNeeded(corpus, sip, cagr, years, target)
    expect(projectCorpus(corpus, sip + extraSIP, cagr, years)).toBeGreaterThanOrEqual(target * 0.99)
    const lump = lumpSumNeeded(corpus, sip, cagr, years, target)
    expect(projectCorpus(corpus + lump, sip, cagr, years)).toBeGreaterThanOrEqual(target * 0.99)
  })
})

describe('computeConvictionScore — SW-3 5-factor model', () => {
  const base = { dipPercent: 8, marketPE: 20, drawdownPercent: 10, yearsLeft: 15, onTrackPct: 80, goalType: 'retirement' }
  it('deeper dip scores higher', () => {
    expect(computeConvictionScore({ ...base, dipPercent: 12 })).toBeGreaterThan(computeConvictionScore({ ...base, dipPercent: 3 }))
  })
  it('emergency fund → 0 (no equity ever)', () => {
    expect(computeConvictionScore({ ...base, goalType: 'emergency' })).toBe(0)
  })
  it('imminent goal (<2Y) → 0 (capital preservation)', () => {
    expect(computeConvictionScore({ ...base, yearsLeft: 1.5, goalType: 'car' })).toBe(0)
  })
  it('best case (deep + cheap + long + off-track) ≥ 80', () => {
    expect(computeConvictionScore({ dipPercent: 15, marketPE: 16, drawdownPercent: 25, yearsLeft: 22, onTrackPct: 60, goalType: 'retirement' })).toBeGreaterThanOrEqual(80)
  })
  it('worst viable case scores low but non-zero', () => {
    const s = computeConvictionScore({ dipPercent: 3, marketPE: 30, drawdownPercent: 2, yearsLeft: 3, onTrackPct: 95, goalType: 'car' })
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(30)
  })
  it('cheap market scores higher than expensive', () => {
    expect(computeConvictionScore({ ...base, marketPE: 16 })).toBeGreaterThan(computeConvictionScore({ ...base, marketPE: 30 }))
  })
  it('off-track goal scores higher than on-track', () => {
    expect(computeConvictionScore({ ...base, onTrackPct: 60 })).toBeGreaterThan(computeConvictionScore({ ...base, onTrackPct: 95 }))
  })
})

describe('allocateLumpSum — SW-3', () => {
  const entries = [
    { fundId: 'a', goalId: 'g1', score: 80 },
    { fundId: 'b', goalId: 'g2', score: 40 },
    { fundId: 'c', goalId: 'g3', score: 20 },
  ]
  it('allocations sum exactly to the lump sum', () => {
    const allocated = allocateLumpSum(entries, 100000)
    expect(allocated.reduce((s, e) => s + e.suggestedAmount, 0)).toBe(100000)
  })
  it('higher score gets a larger allocation', () => {
    const allocated = allocateLumpSum(entries, 100000)
    const hi = allocated.find(e => e.fundId === 'a')
    const lo = allocated.find(e => e.fundId === 'c')
    expect(hi.suggestedAmount).toBeGreaterThan(lo.suggestedAmount)
  })
  it('single dip fund gets 100% of lump sum', () => {
    const single = allocateLumpSum([{ fundId: 'x', goalId: 'g1', score: 75 }], 50000)
    expect(single).toHaveLength(1)
    expect(single[0].suggestedAmount).toBe(50000)
  })
  it('zero-score entries are excluded', () => {
    const withZero = allocateLumpSum([
      { fundId: 'a', goalId: 'g1', score: 60 },
      { fundId: 'b', goalId: 'g2', score: 0 },
    ], 50000)
    expect(withZero).toHaveLength(1)
    expect(withZero[0].suggestedAmount).toBe(50000)
  })
  it('empty entries or zero lump sum → empty allocation', () => {
    expect(allocateLumpSum([], 100000)).toHaveLength(0)
    expect(allocateLumpSum(entries, 0)).toHaveLength(0)
  })
})

describe('getHorizonBucket — ceiling logic', () => {
  const cases = [[1,1],[0.5,1],[2,3],[3,3],[4,5],[5,5],[6,7],[7,7],[8,10],[9,10],[10,10],[11,15],[14,15],[15,15],[16,20],[20,20],[25,20],[40,20]]
  it.each(cases)('getHorizonBucket(%s) → %s', (input, expected) => {
    expect(getHorizonBucket(input)).toBe(expected)
  })
})

describe('computeSuggestedCAGR — index-weighted, conservative discount', () => {
  const funds = [
    { id: 'sc1', name: 'Small Cap A', category: 'Small Cap',  index: 'smallcap' },
    { id: 'mc1', name: 'Mid Cap A',   category: 'Mid Cap',    index: 'midcap'   },
    { id: 'lc1', name: 'Large Cap A', category: 'Large Cap',  index: 'largecap' },
    { id: 'arb', name: 'Arbitrage A', category: 'Arbitrage',  index: null       },
  ]
  it('single smallcap 10Y → 13.5', () => expect(computeSuggestedCAGR({ sc1: { monthlySIP: 5000 } }, 10, funds)).toBe(13.5))
  it('single midcap 15Y → 14.5', () => expect(computeSuggestedCAGR({ mc1: { monthlySIP: 3000 } }, 15, funds)).toBe(14.5))
  it('largecap 8Y uses 10Y bucket (ceiling) → 11.5', () => expect(computeSuggestedCAGR({ lc1: { monthlySIP: 2000 } }, 8, funds)).toBe(11.5))
  it('equal SIP small+mid 10Y → 14.0', () => expect(computeSuggestedCAGR({ sc1: { monthlySIP: 5000 }, mc1: { monthlySIP: 5000 } }, 10, funds)).toBe(14.0))
  it('3:1 small:large 10Y → 13.0', () => expect(computeSuggestedCAGR({ sc1: { monthlySIP: 6000 }, lc1: { monthlySIP: 2000 } }, 10, funds)).toBe(13.0))
  it('arbitrage fund (null index via category) 10Y → 6.5', () => expect(computeSuggestedCAGR({ arb: { monthlySIP: 3000 } }, 10, funds)).toBe(6.5))
  it('all zero SIPs → equal weight fallback 14.0', () => expect(computeSuggestedCAGR({ sc1: { monthlySIP: 0 }, mc1: { monthlySIP: 0 } }, 10, funds)).toBe(14.0))
  it('no funds → null', () => expect(computeSuggestedCAGR({}, 10, funds)).toBeNull())
  it('unknown fundId → null', () => expect(computeSuggestedCAGR({ ghost: { monthlySIP: 5000 } }, 10, funds)).toBeNull())
  it('0.5Y horizon uses bucket 1 → 10.5', () => expect(computeSuggestedCAGR({ sc1: { monthlySIP: 1000 } }, 0.5, funds)).toBe(10.5))
  it('yearsLeft=0 → null', () => expect(computeSuggestedCAGR({ sc1: { monthlySIP: 1000 } }, 0, funds)).toBeNull())
  it('6Y → bucket 7 (ceiling) → 14.0', () => expect(computeSuggestedCAGR({ mc1: { monthlySIP: 5000 } }, 6, funds)).toBe(14.0))
})

describe('SW-16 composite projection — per-instrument returns (MF + RD + FD)', () => {
  it('projectGoalComposite equals legacy projectCorpus for an all-MF goal (backward-compat)', () => {
    const goal = { assumedCAGR: 12, currentCorpus: 300000, funds: { a: { monthlySIP: 10000 }, b: { monthlySIP: 5000 } } }
    const legacy = projectCorpus(300000, 15000, 12, 20)
    expectClose(projectGoalComposite(goal, 20), legacy, 0.001)
  })

  it('each MF SIP can carry its own rate', () => {
    const goal = { assumedCAGR: 12, currentCorpus: 0, funds: { a: { monthlySIP: 5000, rate: 14 }, b: { monthlySIP: 5000, rate: 10 } } }
    const expected = futureValueSIP(5000, 14, 10) + futureValueSIP(5000, 10, 10)
    expectClose(projectGoalComposite(goal, 10), expected, 0.001)
  })

  it('FD maturity computed from principal + rate + term', () => {
    // ₹3L at 7% for 2 years = 300000 × 1.07² ≈ ₹3,43,470
    expectClose(instrumentMaturityAmount({ type: 'FD', principal: 300000, rate: 7, startDate: '2025-03-01', maturityDate: '2027-03-01' }), 343470, 0.5)
  })

  it('explicit maturityAmount override wins over computation', () => {
    expect(instrumentMaturityAmount({ type: 'FD', principal: 300000, rate: 7, startDate: '2025-03-01', maturityDate: '2027-03-01', maturityAmount: 330000 })).toBe(330000)
  })

  it('RD maturity exceeds total contributions', () => {
    const m = instrumentMaturityAmount({ type: 'RD', monthly: 30000, rate: 7, startDate: isoIn(0), maturityDate: isoIn(2.5) })
    expect(m).toBeGreaterThan(30000 * 30) // > ~30 monthly contributions
  })

  it('instrument maturing BEFORE target contributes its maturity amount (held flat)', () => {
    const inst = { type: 'FD', principal: 100000, rate: 7, startDate: isoIn(-1), maturityDate: isoIn(1), maturityAmount: 200000 }
    expect(instrumentValueAtTarget(inst, 5, isoIn(5))).toBe(200000)
  })

  it('instrument maturing AFTER target contributes its accrued value at the target', () => {
    const inst = { type: 'FD', principal: 100000, rate: 7, startDate: isoIn(-1), maturityDate: isoIn(10) }
    // matures after the 5Y target → accrue only to 5Y: 100000 × 1.07⁵
    expectClose(instrumentValueAtTarget(inst, 5, isoIn(5)), futureValueLumpSum(100000, 7, 5), 0.5)
  })

  it('projectGoalComposite sums MF SIP + FD instrument', () => {
    const goal = {
      assumedCAGR: 12, currentCorpus: 0,
      funds: { a: { monthlySIP: 5000, rate: 12 } },
      instruments: [{ type: 'FD', principal: 100000, rate: 7, startDate: isoIn(-1), maturityDate: isoIn(10) }],
      targetDate: isoIn(5),
    }
    const expected = futureValueSIP(5000, 12, 5) + futureValueLumpSum(100000, 7, 5)
    expectClose(projectGoalComposite(goal, 5), expected, 0.5)
  })

  it('off-track levers measure the gap against the composite projection (incl. instruments)', () => {
    // Car goal: ₹27L target in ~1.5Y, funded ENTIRELY by an FD maturing before target.
    // No MF SIP, no MF corpus. Projection ≈ FD maturity (~₹23L), so the gap is ~₹4L, NOT ₹27L.
    const goal = {
      goalType: 'car', assumedCAGR: 10, currentCorpus: 0, targetLakh: 27,
      targetDate: isoIn(1.5), funds: {},
      instruments: [{ type: 'FD', principal: 2000000, rate: 8.25, startDate: isoIn(-0.5), maturityDate: isoIn(1), maturityAmount: 2300000 }],
    }
    const h = computeGoalHealth(goal)
    expect(h.projected).toBeGreaterThan(2000000)          // composite sees the FD (~₹23L), not 0
    const sipLever = h.levers.find(l => l.key === 'increaseSIP')
    const reduceLever = h.levers.find(l => l.key === 'reduceTarget')
    // Extra SIP closes only the ~₹4L gap → a few tens of thousands/mo, NOT ₹1L+/mo.
    if (sipLever) expect(sipLever.value).toBeLessThan(50000)
    // "Reach" reflects the real projection (~₹23L), not ₹0L.
    if (reduceLever) expect(reduceLever.value).toBeGreaterThan(20)
  })

  it('blendedReturn is contribution-weighted across instruments', () => {
    // MF SIP ₹10k @13% + RD ₹10k @7% → blended 10%
    const goal = { assumedCAGR: 13, currentCorpus: 0, funds: { a: { monthlySIP: 10000, rate: 13 } }, instruments: [{ type: 'RD', monthly: 10000, rate: 7 }] }
    expect(blendedReturn(goal)).toBe(10)
  })
})

describe('SW-16 CRUD — createGoal / updateGoal preserve funds[].rate and instruments', () => {
  it('createGoal persists per-fund rate and the instruments array', () => {
    const g = createGoal({
      label: 'Car', goalType: 'car', totalYears: 4, targetLakh: 10,
      funds: { hdfcsc: { monthlySIP: 5000, sipDate: 5, rate: 13.5 } },
      instruments: [{ id: 'rd1', type: 'RD', label: 'My RD', monthly: 8000, rate: 7, startDate: '2026-01-01', maturityDate: '2028-01-01' }],
    })
    // per-fund rate survives verbatim
    expect(g.funds.hdfcsc.rate).toBe(13.5)
    // instruments array survives verbatim
    expect(Array.isArray(g.instruments)).toBe(true)
    expect(g.instruments).toHaveLength(1)
    expect(g.instruments[0]).toMatchObject({ type: 'RD', monthly: 8000, rate: 7 })
  })

  it('createGoal defaults instruments to an empty array when none supplied', () => {
    const g = createGoal({ label: 'Trip', goalType: 'travel', totalYears: 2, targetLakh: 5 })
    expect(g.instruments).toEqual([])
  })

  it('updateGoal carries through new instruments + per-fund rate without dropping them', () => {
    const base = createGoal({ label: 'House', goalType: 'house', totalYears: 7, targetLakh: 100, funds: {} })
    const updated = updateGoal(base, {
      funds: { mirae: { monthlySIP: 10000, rate: 12 } },
      instruments: [{ id: 'fd1', type: 'FD', label: 'Bank FD', principal: 200000, rate: 7.2, startDate: '2026-01-01', maturityDate: '2031-01-01' }],
    })
    expect(updated.funds.mirae.rate).toBe(12)
    expect(updated.instruments).toHaveLength(1)
    expect(updated.instruments[0]).toMatchObject({ type: 'FD', principal: 200000, rate: 7.2 })
    // unrelated fields preserved
    expect(updated.goalType).toBe('house')
    expect(updated.targetLakh).toBe(100)
  })

  it('a goal WITH an RD instrument projects higher than the same goal without it', () => {
    // computeGoalHealth uses projectGoalComposite, so an added RD must increase the projection.
    const target = isoIn(5)
    const withoutRD = createGoal({ label: 'Edu', goalType: 'education', totalYears: 5, targetLakh: 50,
      funds: { hdfcsc: { monthlySIP: 5000, rate: 12 } } })
    withoutRD.targetDate = target
    const withRD = { ...withoutRD, instruments: [
      { id: 'rd1', type: 'RD', monthly: 10000, rate: 7, startDate: isoIn(0), maturityDate: isoIn(10) },
    ] }
    const hNo = computeGoalHealth(withoutRD)
    const hYes = computeGoalHealth(withRD)
    expect(hYes.projected).toBeGreaterThan(hNo.projected)
  })
})

describe('computeTargetDate — fractional years map to whole years + months', () => {
  it('a whole-year horizon advances only the year', () => {
    expect(computeTargetDate('2026-01-15', 2)).toBe('2028-01-15')
  })

  it('1.5 years adds 1 year + 6 months (the bug truncated the .5)', () => {
    // setFullYear(+1.5) silently truncates to +1; the fix splits into +1y +6m.
    expect(computeTargetDate('2026-01-15', 1.5)).toBe('2027-07-15')
  })

  it('0.25 years adds ~3 months', () => {
    expect(computeTargetDate('2026-01-15', 0.25)).toBe('2026-04-15')
  })

  it('a fractional addition that rolls past December crosses the year boundary', () => {
    // Nov 2026 + 0.25y (3 months) → Feb 2027.
    expect(computeTargetDate('2026-11-15', 0.25)).toBe('2027-02-15')
  })
})

describe('SW-16b — MF SIP contribution window (start / optional end date)', () => {
  const goalWith = (fundExtra) => ({
    goalType: 'retirement', assumedCAGR: 12, currentCorpus: 0,
    funds: { a: { monthlySIP: 10000, rate: 12, ...fundExtra } },
  })

  it('no start/end dates → identical to the old full-horizon SIP projection (backward-compatible)', () => {
    // The whole point of backward-compat: legacy goals must project EXACTLY as before.
    const proj = projectGoalComposite(goalWith({}), 10)
    expectClose(proj, futureValueSIP(10000, 12, 10), 0.001)
  })

  it('a SIP that ENDS before the target projects the same as: SIP for the active years, then grow as a lump to target', () => {
    // SIP runs for ~5 of the 10 years, then the accumulated amount grows for the remaining 5.
    const proj = projectGoalComposite(goalWith({ endDate: isoIn(5) }), 10)
    const expected = futureValueLumpSum(futureValueSIP(10000, 12, 5), 12, 5)
    expectClose(proj, expected, 1.5) // ~1.5% tolerance absorbs 365.25-day rounding
  })

  it('ending a SIP early yields LESS than running it to target, but more than zero', () => {
    const full = projectGoalComposite(goalWith({}), 10)
    const early = projectGoalComposite(goalWith({ endDate: isoIn(5) }), 10)
    expect(early).toBeLessThan(full)
    expect(early).toBeGreaterThan(0)
  })

  it('a SIP that STARTS in the future contributes only over its remaining active years', () => {
    // Starts in ~3 years, runs to the 10-year target → ~7 active years, grown 0 more.
    const proj = projectGoalComposite(goalWith({ startDate: isoIn(3) }), 10)
    expectClose(proj, futureValueSIP(10000, 12, 7), 1.5)
    expect(proj).toBeLessThan(projectGoalComposite(goalWith({}), 10)) // less than from-now
  })

  it('a SIP that already ended (end date in the past) adds no future contribution', () => {
    // Its accrued value is assumed to live in currentCorpus, so future contribution is 0.
    const proj = projectGoalComposite(goalWith({ endDate: isoIn(-1) }), 10)
    expect(proj).toBe(0)
  })
})

describe('existing corpus grows at the goal\'s real mix, not the equity default', () => {
  it('existingCorpusRate uses the equity (assumed) rate when the goal HAS equity SIPs', () => {
    const eq = { goalType: 'retirement', assumedCAGR: 12, currentCorpus: 1000000,
      funds: { a: { monthlySIP: 10000, rate: 12 } } }
    expect(existingCorpusRate(eq, 10)).toBe(12)
  })

  it('existingCorpusRate uses the DEBT rate when the goal has only RD/FD (no equity SIPs)', () => {
    const rd = { goalType: 'retirement', assumedCAGR: 12, currentCorpus: 1000000, funds: {},
      instruments: [{ type: 'RD', monthly: 10000, rate: 7, startDate: isoIn(0), maturityDate: isoIn(10) }] }
    // One debt source @7% → corpus rate is 7%, NOT the 12% assumed equity default.
    expectClose(existingCorpusRate(rd, 10), 7, 0.001)
  })

  it('blendedReturn for an all-RD goal with a big corpus is ~the debt rate, not the equity default (the reported bug)', () => {
    // Mirrors the screenshot: ₹99L corpus + RDs at 6.5–7%. Used to show ~12%; must show ~6.6%.
    const goal = {
      goalType: 'retirement', assumedCAGR: 12, currentCorpus: 9900000, targetDate: isoIn(24), funds: {},
      instruments: [
        { type: 'RD', monthly: 45000, rate: 6.5, startDate: isoIn(0), maturityDate: isoIn(24) },
        { type: 'RD', monthly: 15000, rate: 7,   startDate: isoIn(0), maturityDate: isoIn(24) },
      ],
    }
    const b = blendedReturn(goal)
    expect(b).toBeGreaterThan(6)
    expect(b).toBeLessThan(8)   // ← fails on the old code (corpus@12% dragged it to ~12%)
  })

  it('projectGoalComposite does NOT grow an all-debt corpus at the equity rate', () => {
    const goal = {
      goalType: 'retirement', assumedCAGR: 12, currentCorpus: 9900000, targetDate: isoIn(10), funds: {},
      instruments: [{ type: 'RD', monthly: 45000, rate: 6.5, startDate: isoIn(0), maturityDate: isoIn(10) }],
    }
    const projected = projectGoalComposite(goal, 10)
    const expected = futureValueLumpSum(9900000, 6.5, 10) + futureValueSIP(45000, 6.5, 10)
    expectClose(projected, expected, 2)
    // Sanity: strictly less than if the corpus had (wrongly) grown at the 12% equity default.
    expect(projected).toBeLessThan(futureValueLumpSum(9900000, 12, 10) + futureValueSIP(45000, 6.5, 10))
  })

  it('defaults the corpus rate to the amount-weighted blend of a mixed goal (the 8.29% example)', () => {
    // 15k MF SIP @10% + two 10k RDs @7% → (15000·10 + 10000·7 + 10000·7)/35000 = 8.2857%.
    const goal = {
      goalType: 'retirement', assumedCAGR: 10, currentCorpus: 500000,
      funds: { a: { monthlySIP: 15000, rate: 10 } },
      instruments: [
        { type: 'RD', monthly: 10000, rate: 7, startDate: isoIn(0), maturityDate: isoIn(10) },
        { type: 'RD', monthly: 10000, rate: 7, startDate: isoIn(0), maturityDate: isoIn(10) },
      ],
    }
    expectClose(existingCorpusRate(goal), 8.2857, 0.1)
  })

  it('a corpusRate override is used verbatim (e.g. corpus parked in an FD)', () => {
    const goal = {
      goalType: 'retirement', assumedCAGR: 10, currentCorpus: 500000, corpusRate: 8.5,
      funds: { a: { monthlySIP: 15000, rate: 10 } },
      instruments: [{ type: 'RD', monthly: 10000, rate: 7, startDate: isoIn(0), maturityDate: isoIn(10) }],
    }
    expect(existingCorpusRate(goal)).toBe(8.5) // NOT the blended ~8.8%
  })

  it('the corpusRate override flows into the projection', () => {
    const base = {
      goalType: 'retirement', assumedCAGR: 10, currentCorpus: 1000000, targetDate: isoIn(10),
      funds: {}, instruments: [{ type: 'RD', monthly: 10000, rate: 7, startDate: isoIn(0), maturityDate: isoIn(10) }],
    }
    const atDefault = projectGoalComposite(base, 10)                       // corpus @7 (the RD blend)
    const atOverride = projectGoalComposite({ ...base, corpusRate: 9 }, 10) // corpus @9
    expect(atOverride).toBeGreaterThan(atDefault)
    expectClose(atOverride, futureValueLumpSum(1000000, 9, 10) + futureValueSIP(10000, 7, 10), 2)
  })
})
