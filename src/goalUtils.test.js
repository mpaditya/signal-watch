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
  instrumentMaturityAmount,
  instrumentValueAtTarget,
  blendedReturn,
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

  it('blendedReturn is contribution-weighted across instruments', () => {
    // MF SIP ₹10k @13% + RD ₹10k @7% → blended 10%
    const goal = { assumedCAGR: 13, currentCorpus: 0, funds: { a: { monthlySIP: 10000, rate: 13 } }, instruments: [{ type: 'RD', monthly: 10000, rate: 7 }] }
    expect(blendedReturn(goal)).toBe(10)
  })
})
