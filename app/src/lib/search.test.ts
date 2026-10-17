import { describe, expect, it } from 'vitest'
import type { IndexEntry } from '../../../shared/types'
import { searchParts } from './search'

const e = (id: string, category: IndexEntry['category'], brand: string, model: string, lowestPrice: number | null, rating: number | null = null): IndexEntry =>
  ({ id, category, brand, model, lowestPrice, lowestRetailer: null, rating, ratingCount: null, updatedAt: '' })

const idx = [
  e('a', 'gpu', 'NVIDIA', 'GeForce RTX 4070 Super', 600, 4.5),
  e('b', 'cpu', 'AMD', 'Ryzen 7 9800X3D', null, 4.8),
  e('c', 'cpu', 'Intel', 'Core i5 14600K', 300, null),
  e('d', 'gpu', 'AMD', 'Radeon RX 7800 XT', 450, 4.2),
]

describe('searchParts', () => {
  it('finds by model words', () => {
    expect(searchParts(idx, 'rtx 4070', null, 'relevance')[0].id).toBe('a')
  })
  it('tolerates typos', () => {
    expect(searchParts(idx, 'ryzn 9800', null, 'relevance')[0].id).toBe('b')
  })
  it('empty query returns the category', () => {
    expect(searchParts(idx, '  ', 'gpu', 'relevance').map(x => x.id)).toEqual(['a', 'd'])
    expect(searchParts(idx, '', null, 'relevance')).toHaveLength(4)
  })
  it('price sorts put null last both ways', () => {
    expect(searchParts(idx, '', 'cpu', 'price-asc').map(x => x.id)).toEqual(['c', 'b'])
    expect(searchParts(idx, '', 'cpu', 'price-desc').map(x => x.id)).toEqual(['c', 'b'])
    expect(searchParts(idx, '', null, 'price-desc').map(x => x.id)).toEqual(['a', 'd', 'c', 'b'])
  })
  it('rating sorts descending, nulls last', () => {
    expect(searchParts(idx, '', null, 'rating').map(x => x.id)).toEqual(['b', 'a', 'd', 'c'])
  })
})
