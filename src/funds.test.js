// funds.test.js — SW-15: dynamic fund universe (add / archive / effective list).
//
// Imports the REAL funds.js module (no inline copies). Verifies the merge/archive
// logic that App.jsx relies on: archived funds drop out of the effective list but
// their data is never destroyed (soft-delete only).

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FUNDS,
  mergeFunds,
  effectiveFunds,
  addFund,
  archiveFund,
  restoreFund,
} from './funds.js'

const EMPTY = { added: [], archivedIds: [] }

describe('SW-15 fund universe — seed list', () => {
  it('effectiveFunds with empty overlay returns all seed funds', () => {
    expect(effectiveFunds(EMPTY)).toHaveLength(DEFAULT_FUNDS.length)
  })
})

describe('SW-15 — add fund', () => {
  it('adds a user fund to the effective list with a derived id and searchQ default', () => {
    const overlay = addFund(EMPTY, { name: 'Quant Active Fund', category: 'Multi Cap', index: 'nifty500' })
    const eff = effectiveFunds(overlay)
    expect(eff).toHaveLength(DEFAULT_FUNDS.length + 1)
    const added = eff.find(f => f.name === 'Quant Active Fund')
    expect(added).toBeTruthy()
    expect(added.id).toBe('quantactivefund') // slug from name, max 16 chars
    expect(added.searchQ).toBe('Quant Active Fund') // defaults to name
    expect(added.index).toBe('nifty500')
  })

  it('ignores an empty fund name', () => {
    const overlay = addFund(EMPTY, { name: '   ', category: 'Flexi Cap' })
    expect(overlay.added).toHaveLength(0)
  })
})

describe('SW-15 — archive (soft-delete) excludes a fund from the effective list', () => {
  it('archiving a seed fund removes it from effectiveFunds but NOT from mergeFunds', () => {
    const overlay = archiveFund(EMPTY, 'niscf')
    const eff = effectiveFunds(overlay)
    // dropped from the effective (pickable/scoreable) list
    expect(eff.find(f => f.id === 'niscf')).toBeUndefined()
    expect(eff).toHaveLength(DEFAULT_FUNDS.length - 1)
    // but still present (with archived:true) in the full universe — data retained
    const all = mergeFunds(overlay)
    const archived = all.find(f => f.id === 'niscf')
    expect(archived).toBeTruthy()
    expect(archived.archived).toBe(true)
  })

  it('archiving a user-added fund also drops it from the effective list', () => {
    let overlay = addFund(EMPTY, { name: 'Test Fund', category: 'Small Cap', index: 'smallcap' })
    const id = overlay.added[0].id
    overlay = archiveFund(overlay, id)
    expect(effectiveFunds(overlay).find(f => f.id === id)).toBeUndefined()
    // still recoverable
    expect(mergeFunds(overlay).find(f => f.id === id)?.archived).toBe(true)
  })

  it('restore brings an archived fund back into the effective list', () => {
    let overlay = archiveFund(EMPTY, 'sbisc')
    expect(effectiveFunds(overlay).find(f => f.id === 'sbisc')).toBeUndefined()
    overlay = restoreFund(overlay, 'sbisc')
    expect(effectiveFunds(overlay).find(f => f.id === 'sbisc')).toBeTruthy()
  })
})
