import { cacheGet, cachePut } from './db'

export const DATA_URL: string = import.meta.env.VITE_DATA_URL ?? './data/'

export class OfflineError extends Error {
  constructor(message = 'Offline and no cached data available') {
    super(message)
    this.name = 'OfflineError'
    Object.setPrototypeOf(this, OfflineError.prototype)
  }
}

export interface Fetched<T> { data: T; fetchedAt: string; stale: boolean }

export async function fetchJson<T>(path: string): Promise<Fetched<T>> {
  const url = DATA_URL + path
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as T
    const fetchedAt = new Date().toISOString()
    try { await cachePut(url, { body: data, fetchedAt }) } catch { /* cache failure must not break a good fetch */ }
    return { data, fetchedAt, stale: false }
  } catch (err) {
    const cached = await cacheGet(url).catch(() => undefined)
    if (cached) return { data: cached.body as T, fetchedAt: cached.fetchedAt, stale: true }
    throw new OfflineError(err instanceof Error ? err.message : undefined)
  }
}
