import { beforeEach, expect, test, vi } from 'vitest'
import type { IndexEntry } from '../../../shared/types'
import type { WatchItem } from '../lib/db'

type Handler = (resolve: (v?: unknown) => void, reject: (e?: unknown) => void, args?: unknown) => void
const handlers: Record<string, Handler> = {}
let kv: Record<string, string>
const schedule = vi.fn()
const fetchMock = vi.fn()

const item: WatchItem = { partId: 'gpu-1', model: 'Acme RTX 9000', addedAt: '2026-10-01T00:00:00Z', priceWhenAdded: 600, targetPrice: 550 }
const entry = (price: number): IndexEntry => ({ id: 'gpu-1', category: 'gpu', brand: 'Acme', model: 'RTX 9000', lowestPrice: price, lowestRetailer: 'amazon', rating: null, ratingCount: null, updatedAt: '2026-10-16' } as IndexEntry)
const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
const fire = (event: string, args?: unknown) => new Promise((resolve, reject) => handlers[event](resolve, reject, args))

beforeEach(async () => {
  kv = {}
  schedule.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('CapacitorKV', { get: (k: string) => (k in kv ? { value: kv[k] } : { value: null }), set: (k: string, v: string) => { kv[k] = v }, remove: (k: string) => { delete kv[k] } })
  vi.stubGlobal('CapacitorNotifications', { schedule })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('addEventListener', (e: string, h: Handler) => { handlers[e] = h })
  vi.resetModules()
  await import('./runner')
})

test('notifies once for a watched item below target, not again at the same price', async () => {
  await fire('syncWatchlist', { watchlist: [item], dataUrl: 'https://x.test/data/' })
  fetchMock.mockImplementation(() => ok([entry(500)]))
  await fire('refreshPrices')
  expect(fetchMock).toHaveBeenCalledWith('https://x.test/data/index.json')
  expect(schedule).toHaveBeenCalledTimes(1)
  const [notes] = schedule.mock.calls[0]
  expect(notes).toHaveLength(1)
  expect(notes[0].body).toContain('Acme RTX 9000')
  expect(notes[0].body).toContain('500')
  await fire('refreshPrices')
  expect(schedule).toHaveBeenCalledTimes(1)
})

test('fetch failure: no notification and KV unchanged', async () => {
  await fire('syncWatchlist', { watchlist: [item], dataUrl: 'https://x.test/data/' })
  const before = { ...kv }
  fetchMock.mockRejectedValue(new Error('offline'))
  await fire('refreshPrices').catch(() => {})
  expect(schedule).not.toHaveBeenCalled()
  expect(kv).toEqual(before)
})

test('empty KV: no fetch', async () => {
  await fire('refreshPrices')
  expect(fetchMock).not.toHaveBeenCalled()
  expect(schedule).not.toHaveBeenCalled()
})
