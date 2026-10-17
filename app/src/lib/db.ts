import { deleteDB, openDB } from 'idb'
import type { IDBPDatabase } from 'idb'
import type { Slot } from './build'

export interface WatchItem { partId: string; model: string; addedAt: string; priceWhenAdded: number | null; targetPrice: number | null }
export interface Build { buildId: string; name: string; slots: Partial<Record<Slot, string>>; updatedAt: string }
export interface Settings {
  backupFrequency: 'off' | 'daily' | 'weekly'
  backupTime: string
  lastBackupAt: string | null
  lastBackupStatus: 'ok' | 'failed' | null
}
export interface CacheEntry { body: unknown; fetchedAt: string }

export const DEFAULT_SETTINGS: Settings = { backupFrequency: 'off', backupTime: '09:00', lastBackupAt: null, lastBackupStatus: null }

const DB_NAME = 'pc-part-tracker'
let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('watchlist', { keyPath: 'partId' })
      db.createObjectStore('builds', { keyPath: 'buildId' })
      db.createObjectStore('settings')
      db.createObjectStore('cache')
    },
  })
  return dbPromise
}

/** Test helper: closes the connection and deletes the database. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
  listeners.clear()
  await deleteDB(DB_NAME)
}

const listeners = new Set<() => void>()
export function onChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const notify = () => { for (const cb of [...listeners]) cb() }

export const watchlist = {
  async all(): Promise<WatchItem[]> { return (await getDb()).getAll('watchlist') },
  async put(w: WatchItem): Promise<void> { await (await getDb()).put('watchlist', w); notify() },
  async remove(partId: string): Promise<void> { await (await getDb()).delete('watchlist', partId); notify() },
}

export const builds = {
  async all(): Promise<Build[]> { return (await getDb()).getAll('builds') },
  async put(b: Build): Promise<void> { await (await getDb()).put('builds', b); notify() },
  async remove(buildId: string): Promise<void> { await (await getDb()).delete('builds', buildId); notify() },
}

export const settings = {
  async get(): Promise<Settings> {
    const s = (await (await getDb()).get('settings', 'settings')) as Partial<Settings> | undefined
    return { ...DEFAULT_SETTINGS, ...s }
  },
  async set(p: Partial<Settings>): Promise<Settings> {
    const db = await getDb()
    const tx = db.transaction('settings', 'readwrite')
    const cur = { ...DEFAULT_SETTINGS, ...((await tx.store.get('settings')) as Partial<Settings> | undefined) }
    const next = { ...cur, ...p }
    await tx.store.put(next, 'settings')
    await tx.done
    return next
  },
}

export async function replaceAll(w: WatchItem[], b: Build[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['watchlist', 'builds'], 'readwrite')
  await Promise.all([
    tx.objectStore('watchlist').clear(),
    tx.objectStore('builds').clear(),
  ])
  for (const x of w) tx.objectStore('watchlist').put(x)
  for (const x of b) tx.objectStore('builds').put(x)
  await tx.done
  notify()
}

export async function cacheGet(url: string): Promise<CacheEntry | undefined> {
  return (await getDb()).get('cache', url)
}
export async function cachePut(url: string, entry: CacheEntry): Promise<void> {
  await (await getDb()).put('cache', entry, url)
}
