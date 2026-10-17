import type { HistoryPoint, IndexEntry } from '../../../shared/types'
import { exportBackup } from '../lib/csv'
import type { BackupFiles } from '../lib/csv'
import { builds, watchlist } from '../lib/db'
import type { Settings } from '../lib/db'
import { fetchJson } from '../lib/data'

export const isNative = (): boolean =>
  typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.() // eslint-disable-line @typescript-eslint/no-explicit-any

/** Thrown by saveBackup when the user dismisses the share sheet; callers treat it as "nothing happened", not a failure. */
export class BackupCancelledError extends Error {
  constructor() { super('Backup cancelled'); this.name = 'BackupCancelledError'; Object.setPrototypeOf(this, BackupCancelledError.prototype) }
}

export async function collectBackup(index: Map<string, IndexEntry>): Promise<BackupFiles> {
  const [w, b] = await Promise.all([watchlist.all(), builds.all()])
  const history: Record<string, HistoryPoint[]> = {}
  await Promise.all(w.map(async (x) => {
    // A missing history file (404) just means no history yet.
    history[x.partId] = await fetchJson<HistoryPoint[]>(`history/${x.partId}.json`).then((r) => r.data, () => [])
  }))
  return exportBackup(w, b, index, history)
}

export async function saveBackup(files: BackupFiles, date: string): Promise<'saved' | 'shared' | 'downloaded'> {
  const list = (Object.keys(files) as (keyof BackupFiles)[]).map((n) => new File([files[n]], n, { type: 'text/csv' }))
  if (navigator.canShare?.({ files: list })) {
    try {
      await navigator.share({ files: list, title: `PC Part Tracker backup ${date}` })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw new BackupCancelledError()
      throw e
    }
  }
  for (const f of list) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    a.click()
    URL.revokeObjectURL(url)
  }
  return 'downloaded'
}

/** Web: no-op. Task 13 schedules/performs native backups here. */
export async function syncNative(_s: Settings, _files: BackupFiles | null): Promise<void> {}
