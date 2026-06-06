// Integration test for GoalDashboard (SW-14 goal status lifecycle).
//
// This is the kind of test the one-shot build SKIPPED — it mounts the REAL
// component tree (GoalDashboard → GoalCard) in a jsdom DOM, clicks real buttons,
// and asserts what the user actually sees. It would have caught BOTH SW-14 bugs
// found during live testing:
//   1. "Achieved" button was missing on legacy goals (onStatusChange=undefined)
//   2. Restoring an achieved goal hid the Pause/Achieved buttons (status never reset)
//
// Run with: npm test

import { useState } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import GoalDashboard from './GoalDashboard'

// window.confirm isn't implemented in jsdom — auto-accept every confirm dialog.
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  localStorage.clear()
})

// Harness mimics App.jsx: it OWNS abandonedIds and feeds archive/restore back in,
// exactly like the real parent. Without this round-trip the archive view never updates.
function Harness({ initialConfig }) {
  const [abandonedIds, setAbandonedIds] = useState([])
  return (
    <GoalDashboard
      goalsConfig={initialConfig}
      funds={[]}
      onUpdateGoalsConfig={() => {}}
      abandonedIds={abandonedIds}
      onArchive={(id) => setAbandonedIds((prev) => [...prev, id])}
      onRestore={(id) => setAbandonedIds((prev) => prev.filter((x) => x !== id))}
    />
  )
}

// A single legacy goal in the existing goalsConfig format (artha_config_v1 shape).
const CONFIG = {
  retirement: {
    label: 'Retirement',
    emoji: '🎯',
    yearsLeft: 20,
    targetLakh: 500,
    funds: {},
    sipDates: {},
  },
}

describe('GoalDashboard — SW-14 status lifecycle on legacy goals', () => {
  it('renders the Achieved button on a legacy goal (bug #1)', () => {
    render(<Harness initialConfig={CONFIG} />)
    // Before the fix, onStatusChange was undefined for legacy goals, so this button
    // never rendered. This assertion fails on the buggy version.
    expect(screen.getByRole('button', { name: /Achieved/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument()
  })

  it('marking Achieved moves the goal into the Archived section', () => {
    render(<Harness initialConfig={CONFIG} />)
    fireEvent.click(screen.getByRole('button', { name: /Achieved/i }))

    // Goal leaves the active grid; an archived section appears with count 1.
    const archiveToggle = screen.getByRole('button', { name: /Archived goals \(1\)/i })
    expect(archiveToggle).toBeInTheDocument()

    // Expand the archive and confirm a Restore button is available.
    fireEvent.click(archiveToggle)
    expect(screen.getByRole('button', { name: /Restore/i })).toBeInTheDocument()
  })

  it('restoring an achieved goal brings back Pause + Achieved buttons (bug #2)', () => {
    render(<Harness initialConfig={CONFIG} />)

    // Achieve → archive → restore
    fireEvent.click(screen.getByRole('button', { name: /Achieved/i }))
    fireEvent.click(screen.getByRole('button', { name: /Archived goals \(1\)/i }))
    fireEvent.click(screen.getByRole('button', { name: /Restore/i }))

    // After restore, the goal is active again. Before the fix its persisted status was
    // still 'achieved', so neither Pause nor Achieved rendered. Both must be back now.
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Achieved/i })).toBeInTheDocument()
  })
})

// SW-16: end-to-end persistence — add an RD instrument via the real form, save, then
// REMOUNT GoalDashboard (simulating a reload) and confirm the instrument round-tripped
// through localStorage (the goal's projection still reflects the RD).
describe('GoalDashboard — SW-16 RD instrument persists across reload', () => {
  function setNumber(el, value) { fireEvent.change(el, { target: { value: String(value) } }) }

  it('an RD added in the form survives a remount (saved to localStorage)', () => {
    // First mount: open form, create a NEW goal with an RD funding source.
    const { unmount } = render(<Harness initialConfig={{}} />)
    fireEvent.click(screen.getByRole('button', { name: /New Goal/i }))

    setNumber(screen.getByPlaceholderText(/for ₹1 Cr/i), 50)
    setNumber(screen.getByLabelText(/Horizon/i), 5)
    fireEvent.click(screen.getByRole('button', { name: /\+ RD/i }))
    setNumber(screen.getByLabelText(/Monthly contribution/i), 10000)
    setNumber(screen.getByLabelText(/^Rate$/i), 7)
    fireEvent.change(screen.getByLabelText(/Start date/i), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText(/Maturity date/i), { target: { value: '2031-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: /Create Goal/i }))

    // The new goal's card shows an RD funding source.
    expect(screen.getByText(/Funding Sources/i)).toBeInTheDocument()
    expect(screen.getAllByText(/RD/).length).toBeGreaterThan(0)

    // Remount from the SAME localStorage (extra-goals + corpus stores persist).
    unmount()
    render(<Harness initialConfig={{}} />)

    // The goal (and its RD source) is still there after the "reload".
    expect(screen.getByText(/Funding Sources/i)).toBeInTheDocument()
    expect(screen.getAllByText(/RD/).length).toBeGreaterThan(0)
  })
})
