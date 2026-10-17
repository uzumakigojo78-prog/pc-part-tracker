// Background Runner script (bundled to public/runners/runner.js). No DOM, no IndexedDB: state lives in CapacitorKV.
import type { IndexEntry } from '../../../shared/types'
import type { WatchItem } from '../lib/db'
import { alertsFor } from '../lib/watch'

type Resolve = (v?: unknown) => void
type Reject = (e?: unknown) => void
interface RunnerGlobals {
  addEventListener(event: string, handler: (resolve: Resolve, reject: Reject, args: unknown) => void): void
  CapacitorKV: { get(key: string): { value: string | null } | null | undefined; set(key: string, value: string): void }
  CapacitorNotifications: { schedule(n: { id: number; title: string; body: string }[]): void }
}
const g = globalThis as unknown as RunnerGlobals

interface Synced { watchlist: WatchItem[]; dataUrl: string }

const read = <T>(key: string): T | null => {
  const v = g.CapacitorKV.get(key)?.value
  return v ? (JSON.parse(v) as T) : null
}

// Stable 32-bit id per part so a newer alert replaces the older one.
const noteId = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h }

async function refreshPrices(): Promise<void> {
  const synced = read<Synced>('synced')
  if (!synced?.watchlist.length) return
  const res = await fetch(synced.dataUrl + 'index.json')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const index = new Map((await res.json() as IndexEntry[]).map((e) => [e.id, e]))
  const lastNotified = read<Record<string, number>>('lastNotified') ?? {}
  const alerts = alertsFor(synced.watchlist, index, lastNotified)
  if (!alerts.length) return
  g.CapacitorNotifications.schedule(alerts.map((w) => {
    const price = index.get(w.partId)!.lowestPrice! // alertsFor only returns items with a current price
    lastNotified[w.partId] = price
    return { id: noteId(w.partId), title: 'Price drop', body: `${w.model} is now $${price.toFixed(2)}` }
  }))
  g.CapacitorKV.set('lastNotified', JSON.stringify(lastNotified))
}

g.addEventListener('syncWatchlist', (resolve, reject, args) => {
  try { g.CapacitorKV.set('synced', JSON.stringify(args as Synced)); resolve() } catch (e) { reject(e) }
})

g.addEventListener('refreshPrices', (resolve, reject) => {
  refreshPrices().then(() => resolve(), reject)
})
