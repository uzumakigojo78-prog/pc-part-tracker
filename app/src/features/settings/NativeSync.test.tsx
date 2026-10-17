import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import type { IndexEntry } from '../../../../shared/types'
import { builds, resetDbForTests, watchlist } from '../../lib/db'
import { IndexContext } from '../../lib/useIndex'
import type { IndexState } from '../../lib/useIndex'
import * as platform from '../../platform'
import NativeSync from './NativeSync'

vi.mock('../../platform', async (orig) => ({
  ...(await orig<typeof import('../../platform')>()),
  isNative: vi.fn(() => true),
  syncNative: vi.fn(async () => {}),
}))

beforeEach(async () => { await resetDbForTests(); vi.mocked(platform.syncNative).mockClear(); vi.mocked(platform.isNative).mockReturnValue(true) })
afterEach(() => cleanup())

const mkState = (over: Partial<IndexState> = {}): IndexState => ({ index: [], byId: new Map(), fetchedAt: null, stale: false, error: null, loading: false, refresh: vi.fn(async () => {}), ...over })
const mount = () => render(<IndexContext.Provider value={mkState()}><NativeSync /></IndexContext.Provider>)

it('syncs on mount and once (debounced) after a change, always with files', async () => {
  mount()
  await waitFor(() => expect(platform.syncNative).toHaveBeenCalledTimes(1))
  await watchlist.put({ partId: 'a', model: 'a', addedAt: '', priceWhenAdded: null, targetPrice: null })
  await watchlist.put({ partId: 'b', model: 'b', addedAt: '', priceWhenAdded: null, targetPrice: null })
  await waitFor(() => expect(platform.syncNative).toHaveBeenCalledTimes(2), { timeout: 3000 })
  const [, files] = vi.mocked(platform.syncNative).mock.calls[1]
  expect(files?.['watchlist.csv']).toContain('a')
  expect(vi.mocked(platform.syncNative).mock.calls.every(c => c[1] !== null)).toBe(true)
})

it('does nothing on web', async () => {
  vi.mocked(platform.isNative).mockReturnValue(false)
  mount()
  await watchlist.put({ partId: 'a', model: 'a', addedAt: '', priceWhenAdded: null, targetPrice: null })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    await vi.advanceTimersByTimeAsync(1000)
    expect(platform.syncNative).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})

it('waits for the index to load before the initial sync, then includes build part data', async () => {
  await builds.put({ buildId: 'b1', name: 'Mine', slots: { cpu: 'cpu1' }, updatedAt: '' })
  const entry = { id: 'cpu1', category: 'cpu', brand: 'B', model: 'Chip 1', lowestPrice: 123, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '' } as IndexEntry
  const ui = (s: IndexState) => <IndexContext.Provider value={s}><NativeSync /></IndexContext.Provider>
  const { rerender } = render(ui(mkState({ loading: true })))
  await new Promise(r => setTimeout(r, 50)) // negative check: nothing may fire while loading
  expect(platform.syncNative).not.toHaveBeenCalled()
  rerender(ui(mkState({ index: [entry], byId: new Map([['cpu1', entry]]) })))
  await waitFor(() => expect(platform.syncNative).toHaveBeenCalledTimes(1))
  const files = vi.mocked(platform.syncNative).mock.calls[0][1]
  expect(files?.['builds.csv']).toContain('Chip 1')
  expect(files?.['builds.csv']).toContain('123')
})
