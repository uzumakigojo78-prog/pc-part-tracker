import { describe, expect, it } from 'vitest'
import type { IndexEntry } from '../../../shared/types'
import type { WatchItem } from './db'
import { alertsFor, watchStatus } from './watch'

const entry = (id: string, lowestPrice: number | null): IndexEntry =>
  ({ id, category: 'gpu', brand: 'B', model: 'M', lowestPrice, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '' })
const item = (partId: string, priceWhenAdded: number | null, targetPrice: number | null): WatchItem =>
  ({ partId, model: 'M', addedAt: '', priceWhenAdded, targetPrice })

describe('watchStatus', () => {
  it('untracked when entry undefined', () => {
    expect(watchStatus(item('x', 500, null), undefined)).toEqual({ current: null, change: null, changePct: null, belowTarget: false, untracked: true })
  })
  it('computes change', () => {
    const s = watchStatus(item('x', 500, null), entry('x', 450))
    expect(s.change).toBe(-50)
    expect(s.changePct).toBe(-10)
    expect(s.untracked).toBe(false)
  })
  it('null when priceWhenAdded or current null', () => {
    expect(watchStatus(item('x', null, null), entry('x', 450)).change).toBeNull()
    expect(watchStatus(item('x', 500, null), entry('x', null)).changePct).toBeNull()
  })
  it('priceWhenAdded 0 gives null changePct', () => {
    const s = watchStatus(item('x', 0, null), entry('x', 10))
    expect(s.change).toBe(10)
    expect(s.changePct).toBeNull()
  })
  it('belowTarget is inclusive', () => {
    expect(watchStatus(item('x', 500, 460), entry('x', 460)).belowTarget).toBe(true)
    expect(watchStatus(item('x', 500, 460), entry('x', 461)).belowTarget).toBe(false)
  })
})

describe('alertsFor', () => {
  const w = [item('x', 500, 460)]
  const ix = (p: number | null) => new Map([['x', entry('x', p)]])
  it('alerts once, not on repeat', () => {
    expect(alertsFor(w, ix(450), {})).toHaveLength(1)
    expect(alertsFor(w, ix(450), { x: 450 })).toHaveLength(0)
  })
  it('alerts again when price drops further', () => {
    expect(alertsFor(w, ix(440), { x: 450 })).toHaveLength(1)
  })
  it('alerts when below priceWhenAdded without target', () => {
    expect(alertsFor([item('x', 500, null)], ix(490), {})).toHaveLength(1)
    expect(alertsFor([item('x', 500, null)], ix(510), {})).toHaveLength(0)
  })
  it('never alerts untracked or null price', () => {
    expect(alertsFor(w, new Map(), {})).toHaveLength(0)
    expect(alertsFor(w, ix(null), {})).toHaveLength(0)
  })
})
