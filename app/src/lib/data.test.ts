import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATA_URL, fetchJson, OfflineError } from './data'
import { resetDbForTests } from './db'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response

beforeEach(async () => { await resetDbForTests() })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('fetchJson', () => {
  it('ok response is not stale', async () => {
    const f = vi.fn().mockResolvedValue(ok({ a: 1 }))
    vi.stubGlobal('fetch', f)
    const r = await fetchJson<{ a: number }>('index.json')
    expect(r.data).toEqual({ a: 1 })
    expect(r.stale).toBe(false)
    expect(Number.isNaN(Date.parse(r.fetchedAt))).toBe(false)
    expect(f).toHaveBeenCalledWith(DATA_URL + 'index.json')
  })
  it('network error with cache returns stale cached data and time', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(ok({ a: 1 })))
    const first = await fetchJson('index.json')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const r = await fetchJson('index.json')
    expect(r).toEqual({ data: { a: 1 }, fetchedAt: first.fetchedAt, stale: true })
  })
  it('network error without cache rejects OfflineError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const p = fetchJson('index.json')
    await expect(p).rejects.toBeInstanceOf(OfflineError)
    await expect(p).rejects.toMatchObject({ name: 'OfflineError' })
  })
  it('HTTP 500 is treated like a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ a: 1 })))
    await fetchJson('x.json')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fail(500)))
    expect((await fetchJson('x.json')).stale).toBe(true)
    await expect(fetchJson('y.json')).rejects.toBeInstanceOf(OfflineError)
  })
})
