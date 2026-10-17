import type { IndexEntry } from '../../../../shared/types'
import { settings } from '../../lib/db'
import { BackupCancelledError, collectBackup, saveBackup } from '../../platform'

/** Exports now. Resolves 'cancelled' if the user dismissed the share sheet (settings untouched); throws on failure after recording it. */
export function runBackup(index: Map<string, IndexEntry>): Promise<'ok' | 'cancelled'> {
  // Module-level guard: banner and Settings share one in-flight backup.
  inFlight ??= doBackup(index).finally(() => { inFlight = null })
  return inFlight
}
let inFlight: Promise<'ok' | 'cancelled'> | null = null

async function doBackup(index: Map<string, IndexEntry>): Promise<'ok' | 'cancelled'> {
  try {
    await saveBackup(await collectBackup(index), new Date().toISOString().slice(0, 10))
  } catch (e) {
    if (e instanceof BackupCancelledError) return 'cancelled'
    await settings.set({ lastBackupStatus: 'failed' })
    throw e
  }
  await settings.set({ lastBackupAt: new Date().toISOString(), lastBackupStatus: 'ok' })
  return 'ok'
}
