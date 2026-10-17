import Fuse from 'fuse.js'
import type { Category, IndexEntry } from '../../../shared/types'

export type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'rating'

function nullsLast(get: (e: IndexEntry) => number | null, dir: 1 | -1) {
  return (a: IndexEntry, b: IndexEntry) => {
    const x = get(a), y = get(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    return (x - y) * dir
  }
}

export function searchParts(index: IndexEntry[], q: string, category: Category | null, sort: SortKey): IndexEntry[] {
  const pool = category ? index.filter(e => e.category === category) : index
  const query = q.trim()
  let out: IndexEntry[]
  if (!query) {
    out = [...pool]
  } else {
    const docs = pool.map(e => ({ e, full: `${e.brand} ${e.model}` }))
    const fuse = new Fuse(docs, { keys: ['e.brand', 'e.model', 'full'], threshold: 0.4 })
    out = fuse.search(query).map(r => r.item.e)
  }
  if (sort === 'price-asc') out.sort(nullsLast(e => e.lowestPrice, 1))
  else if (sort === 'price-desc') out.sort(nullsLast(e => e.lowestPrice, -1))
  else if (sort === 'rating') out.sort(nullsLast(e => e.rating, -1))
  return out
}
