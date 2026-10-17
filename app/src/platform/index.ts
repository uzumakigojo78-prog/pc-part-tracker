import { registerPlugin } from '@capacitor/core'
import { BackgroundRunner } from '@capacitor/background-runner'
import type { HistoryPoint, IndexEntry } from '../../../shared/types'
import { exportBackup } from '../lib/csv'
import type { BackupFiles } from '../lib/csv'
import { builds, watchlist } from '../lib/db'
import type { Settings } from '../lib/db'
import { DATA_URL, fetchJson } from '../lib/data'

export interface BackupResult { at: string | null; status: 'ok' | 'failed' | null; error?: string }
interface ScheduledBackupPlugin {
  schedule(opts: { frequency: Settings['backupFrequency']; time: string; files: BackupFiles | null }): Promise<void>
  exportNow(opts: { files: BackupFiles }): Promise<{ folder: string }>
  lastResult(): Promise<BackupResult>
}
const ScheduledBackup = registerPlugin<ScheduledBackupPlugin>('ScheduledBackup')
const RUNNER_LABEL = 'io.github.uzumakigojo78_prog.pcparttracker.prices'

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
  if (isNative()) { await ScheduledBackup.exportNow({ files }); return 'saved' }
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
    setTimeout(() => URL.revokeObjectURL(url), 1000) // revoking immediately can cancel the download
    if (f !== list[list.length - 1]) await new Promise((r) => setTimeout(r, 300)) // browsers drop rapid multi-downloads
  }
  return 'downloaded'
}

/** Native: (re)schedules the backup with the latest snapshot and hands the watchlist to the price runner. Web: no-op. */
export async function syncNative(s: Settings, files: BackupFiles | null): Promise<void> {
  if (!isNative()) return
  await ScheduledBackup.schedule({ frequency: s.backupFrequency, time: s.backupTime, files })
  await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'syncWatchlist', details: { watchlist: await watchlist.all(), dataUrl: DATA_URL } })
}

/** Native: result of the last native backup (scheduled or manual). Web: null. */
export async function lastNativeBackup(): Promise<BackupResult | null> {
  return isNative() ? ScheduledBackup.lastResult() : null
}

/** Native: asks for notification permission (no prompt if already decided). Web: no-op. */
export async function requestNotifications(): Promise<void> {
  if (isNative()) await BackgroundRunner.requestPermissions({ apis: ['notifications'] })
}
