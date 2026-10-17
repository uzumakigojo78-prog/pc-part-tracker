import type { IndexEntry } from '../../../shared/types'
import type { Build } from './db'

export const SLOTS = ['cpu', 'cooler', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'case'] as const
export type Slot = (typeof SLOTS)[number]

export function buildTotal(b: Build, index: Map<string, IndexEntry>): { total: number; missing: Slot[] } {
  let total = 0
  const missing: Slot[] = []
  for (const slot of SLOTS) {
    const id = b.slots[slot]
    if (!id) continue
    const price = index.get(id)?.lowestPrice ?? null
    if (price === null) missing.push(slot)
    else total += price
  }
  return { total: Math.round(total * 100) / 100, missing }
}

/** "Build N" with N = count+1, bumped past any existing name. */
export function nextBuildName(existing: { name: string }[]): string {
  const names = new Set(existing.map(b => b.name))
  let n = existing.length + 1
  while (names.has(`Build ${n}`)) n++
  return `Build ${n}`
}
