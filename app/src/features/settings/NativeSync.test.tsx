import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { resetDbForTests, watchlist } from '../../lib/db'
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

const mount = () => {
  const state: IndexState = { index: [], byId: new Map(), fetchedAt: null, stale: false, error: null, loading: false, refresh: vi.fn(async () => {}) }
  render(<IndexContext.Provider value={state}><NativeSync /></IndexContext.Provider>)
}

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
  await new Promise(r => setTimeout(r, 700))
  expect(platform.syncNative).not.toHaveBeenCalled()
})
