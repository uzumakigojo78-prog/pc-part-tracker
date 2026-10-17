import { describe, expect, it } from 'vitest'
import type { IndexEntry } from '../../../shared/types'
import type { Build } from './db'
import { buildTotal } from './build'

const entry = (id: string, lowestPrice: number | null): IndexEntry =>
  ({ id, category: 'gpu', brand: 'B', model: 'M', lowestPrice, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '' })

describe('buildTotal', () => {
  it('sums prices and lists missing slots', () => {
    const b: Build = { buildId: '1', name: 'n', updatedAt: '', slots: { cpu: 'a', gpu: 'b', ram: 'c', psu: 'gone' } }
    const index = new Map([['a', entry('a', 300)], ['b', entry('b', 500.5)], ['c', entry('c', null)]])
    expect(buildTotal(b, index)).toEqual({ total: 800.5, missing: ['ram', 'psu'] })
  })
  it('empty build is zero', () => {
    expect(buildTotal({ buildId: '1', name: 'n', updatedAt: '', slots: {} }, new Map())).toEqual({ total: 0, missing: [] })
  })
})
