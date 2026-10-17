import { useEffect, useState } from 'react'
import { onChange, settings } from '../../lib/db'
import type { Settings } from '../../lib/db'
import { isBackupDue } from '../../lib/schedule'
import { useIndex } from '../../lib/useIndex'
import { isNative } from '../../platform'
import { runBackup } from './runBackup'

export default function BackupBanner() {
  const { byId } = useIndex()
  const [s, setS] = useState<Settings | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)
  useEffect(() => {
    const load = () => { void settings.get().then(setS) }
    load()
    const off = onChange(load)
    // A resumed PWA must re-check whether a backup became due while hidden.
    const vis = () => { if (document.visibilityState === 'visible') setTick((n) => n + 1) }
    document.addEventListener('visibilitychange', vis)
    return () => { off(); document.removeEventListener('visibilitychange', vis) }
  }, [])
  if (isNative() || !s || !isBackupDue(s, new Date())) return null
  return (
    <div className="card" role="status">
      <button type="button" disabled={busy} onClick={() => { setError(''); setBusy(true); runBackup(byId).catch(() => setError('Backup failed.')).finally(() => setBusy(false)) }}>Backup due — Export now</button>
      {error && <span role="alert"> {error}</span>}
    </div>
  )
}
