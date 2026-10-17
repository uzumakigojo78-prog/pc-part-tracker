import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builds, DEFAULT_SETTINGS, onChange, replaceAll, resetDbForTests, settings, watchlist } from './db'
import type { Build, WatchItem } from './db'

const w = (partId: string): WatchItem => ({ partId, model: `M-${partId}`, addedAt: '2026-01-01T00:00:00Z', priceWhenAdded: 100, targetPrice: null })
const b = (buildId: string): Build => ({ buildId, name: buildId, slots: { cpu: 'c1' }, updatedAt: '2026-01-01T00:00:00Z' })

beforeEach(async () => { await resetDbForTests() })

describe('db', () => {
  it('watchlist put/all/remove round-trip', async () => {
    await watchlist.put(w('a'))
    await watchlist.put(w('b'))
    expect((await watchlist.all()).map((x) => x.partId).sort()).toEqual(['a', 'b'])
    await watchlist.remove('a')
    expect(await watchlist.all()).toEqual([w('b')])
  })
  it('builds put/all/remove round-trip', async () => {
    await builds.put(b('x'))
    expect(await builds.all()).toEqual([b('x')])
    await builds.remove('x')
    expect(await builds.all()).toEqual([])
  })
  it('settings default and merge', async () => {
    expect(await settings.get()).toEqual(DEFAULT_SETTINGS)
    const s = await settings.set({ backupFrequency: 'daily' })
    expect(s).toEqual({ ...DEFAULT_SETTINGS, backupFrequency: 'daily' })
    expect(await settings.set({ backupTime: '10:00' })).toEqual({ ...DEFAULT_SETTINGS, backupFrequency: 'daily', backupTime: '10:00' })
    expect(await settings.get()).toEqual({ ...DEFAULT_SETTINGS, backupFrequency: 'daily', backupTime: '10:00' })
  })
  it('replaceAll leaves no previous rows', async () => {
    await watchlist.put(w('old'))
    await builds.put(b('old'))
    await replaceAll([w('new')], [b('new')])
    expect((await watchlist.all()).map((x) => x.partId)).toEqual(['new'])
    expect((await builds.all()).map((x) => x.buildId)).toEqual(['new'])
  })
  it('onChange fires after put, remove, replaceAll; unsubscribe stops it', async () => {
    const cb = vi.fn()
    const off = onChange(cb)
    await watchlist.put(w('a'))
    expect(cb).toHaveBeenCalledTimes(1)
    await watchlist.remove('a')
    expect(cb).toHaveBeenCalledTimes(2)
    await builds.put(b('x'))
    await builds.remove('x')
    expect(cb).toHaveBeenCalledTimes(4)
    await replaceAll([], [])
    expect(cb).toHaveBeenCalledTimes(5)
    off()
    await watchlist.put(w('z'))
    expect(cb).toHaveBeenCalledTimes(5)
  })
})
