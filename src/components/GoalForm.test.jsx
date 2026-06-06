// GoalForm.test.jsx — SW-16 integration test.
//
// Mounts the REAL GoalForm component, fills the goal fields, adds a REAL RD instrument
// via the unified "Funding sources" list, clicks the REAL Create button, and asserts the
// saved goal object carries the instrument — AND that the REAL projection engine
// (computeGoalHealth → projectGoalComposite) reflects it (projected corpus increases).
//
// This is the kind of test that catches UI-wiring bugs unit tests miss: if the RD row
// never rendered, or the row→schema transform dropped instruments, this fails.
//
// Run with: npm test

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GoalForm from './GoalForm'
import { computeGoalHealth } from '../goalUtils'

const TRACKED = [
  { id: 'hdfcsc', name: 'HDFC Small Cap', category: 'Small Cap', index: 'smallcap' },
]

function setNumber(el, value) {
  fireEvent.change(el, { target: { value: String(value) } })
}

describe('GoalForm — SW-16 composite funding (RD instrument)', () => {
  it('adds an RD instrument and the saved goal carries it + projects higher', () => {
    const onSave = vi.fn()
    render(
      <GoalForm
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
        existingGoal={null}
        trackedFunds={TRACKED}
      />
    )

    // Fill required goal fields: target + horizon (defaults to retirement/22Y otherwise).
    setNumber(screen.getByPlaceholderText(/for ₹1 Cr/i), 50) // target ₹50 L
    setNumber(screen.getByLabelText(/Horizon/i), 5)          // 5 year horizon

    // Add an RD funding source row.
    fireEvent.click(screen.getByRole('button', { name: /\+ RD/i }))

    // The RD row exposes labelled inputs. Fill monthly contribution + rate + dates.
    setNumber(screen.getByLabelText(/Monthly contribution/i), 10000)
    setNumber(screen.getByLabelText(/^Rate$/i), 7)
    fireEvent.change(screen.getByLabelText(/Start date/i), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText(/Maturity date/i), { target: { value: '2031-01-01' } })

    // Save.
    fireEvent.click(screen.getByRole('button', { name: /Create Goal/i }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0][0]

    // The saved goal carries the RD instrument.
    expect(Array.isArray(saved.instruments)).toBe(true)
    const rd = saved.instruments.find(i => i.type === 'RD')
    expect(rd).toBeTruthy()
    expect(rd.monthly).toBe(10000)
    expect(rd.rate).toBe(7)
    expect(rd.maturityDate).toBe('2031-01-01')

    // The projection engine reflects the RD: projected > 0 (an empty goal would be 0).
    const health = computeGoalHealth(saved)
    expect(health.projected).toBeGreaterThan(0)

    // And removing the RD from the saved goal lowers the projection — proves the
    // instrument is actually contributing to projectGoalComposite, not ignored.
    const withoutRD = { ...saved, instruments: [] }
    expect(computeGoalHealth(withoutRD).projected).toBeLessThan(health.projected)
  })

  it('saving an MF row persists the per-fund rate', () => {
    const onSave = vi.fn()
    render(
      <GoalForm isOpen={true} onClose={() => {}} onSave={onSave} existingGoal={null} trackedFunds={TRACKED} />
    )
    setNumber(screen.getByPlaceholderText(/for ₹1 Cr/i), 50)
    setNumber(screen.getByLabelText(/Horizon/i), 10)

    fireEvent.click(screen.getByRole('button', { name: /\+ MF SIP/i }))
    // Pick the fund (prefills rate with the index suggestion), set SIP + an explicit rate.
    fireEvent.change(screen.getByLabelText(/^Fund$/i), { target: { value: 'hdfcsc' } })
    setNumber(screen.getByLabelText(/Monthly SIP/i), 5000)
    setNumber(screen.getByLabelText(/Expected return/i), 14)

    fireEvent.click(screen.getByRole('button', { name: /Create Goal/i }))
    const saved = onSave.mock.calls[0][0]
    expect(saved.funds.hdfcsc).toBeTruthy()
    expect(saved.funds.hdfcsc.monthlySIP).toBe(5000)
    expect(saved.funds.hdfcsc.rate).toBe(14)
  })
})
