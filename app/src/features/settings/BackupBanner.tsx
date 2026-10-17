import { useEffect, useState } from 'react'
import { settings } from '../../lib/db'
import type { Settings } from '../../lib/db'
import { isBackupDue } from '../../lib/schedule'
import { useIndex } from '../../lib/useIndex'
import { isNative } from '../../platform'
import { SETTINGS_EVENT, runBackup } from './runBackup'

export default function BackupBanner() {
  const { byId } = useIndex()
  const [s, setS] = useState<Settings | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const load = () => { void settings.get().then(setS) }
    load()
    window.addEventListener(SETTINGS_EVENT, load)
    return () => window.removeEventListener(SETTINGS_EVENT, load)
  }, [])
  if (isNative() || !s || !isBackupDue(s, new Date())) return null
  return (
    <div className="card" role="status">
      <button type="button" onClick={() => { setError(''); runBackup(byId).catch(() => setError('Backup failed.')) }}>Backup due — Export now</button>
      {error && <span role="alert"> {error}</span>}
    </div>
  )
}
