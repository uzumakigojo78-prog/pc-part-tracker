import type { IndexEntry } from '../../../../shared/types'
import { settings } from '../../lib/db'
import type { Settings } from '../../lib/db'
import { BackupCancelledError, collectBackup, saveBackup, syncNative } from '../../platform'

export const SETTINGS_EVENT = 'pct-settings-changed'

/** Persists settings, tells the banner, and syncs native schedules. */
export async function saveSettings(p: Partial<Settings>): Promise<Settings> {
  const s = await settings.set(p)
  window.dispatchEvent(new Event(SETTINGS_EVENT))
  await syncNative(s, null)
  return s
}

/** Exports now. Resolves 'cancelled' if the user dismissed the share sheet (settings untouched); throws on failure after recording it. */
export async function runBackup(index: Map<string, IndexEntry>): Promise<'ok' | 'cancelled'> {
  try {
    await saveBackup(await collectBackup(index), new Date().toISOString().slice(0, 10))
  } catch (e) {
    if (e instanceof BackupCancelledError) return 'cancelled'
    await saveSettings({ lastBackupStatus: 'failed' })
    throw e
  }
  await saveSettings({ lastBackupAt: new Date().toISOString(), lastBackupStatus: 'ok' })
  return 'ok'
}
