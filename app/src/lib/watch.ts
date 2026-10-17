import type { IndexEntry } from '../../../shared/types'
import type { WatchItem } from './db'

export interface WatchStatus {
  current: number | null; change: number | null; changePct: number | null
  belowTarget: boolean; untracked: boolean
}

export function watchStatus(w: WatchItem, entry: IndexEntry | undefined): WatchStatus {
  if (!entry) return { current: null, change: null, changePct: null, belowTarget: false, untracked: true }
  const current = entry.lowestPrice
  let change: number | null = null
  let changePct: number | null = null
  if (current !== null && w.priceWhenAdded !== null) {
    change = Math.round((current - w.priceWhenAdded) * 100) / 100
    if (w.priceWhenAdded > 0) changePct = Math.round((current - w.priceWhenAdded) / w.priceWhenAdded * 1000) / 10
  }
  const belowTarget = w.targetPrice != null && current !== null && current <= w.targetPrice
  return { current, change, changePct, belowTarget, untracked: false }
}

/** Items worth notifying about: price below the last notified price (or no record yet) AND (belowTarget OR below priceWhenAdded). */
export function alertsFor(items: WatchItem[], index: Map<string, IndexEntry>, lastNotified: Record<string, number>): WatchItem[] {
  return items.filter(w => {
    const s = watchStatus(w, index.get(w.partId))
    if (s.untracked || s.current === null) return false
    const last = lastNotified[w.partId]
    if (last !== undefined && !(s.current < last)) return false
    return s.belowTarget || (w.priceWhenAdded !== null && w.priceWhenAdded > 0 && s.current < w.priceWhenAdded)
  })
}
