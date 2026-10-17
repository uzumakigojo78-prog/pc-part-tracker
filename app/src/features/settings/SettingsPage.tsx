import { useEffect, useRef, useState } from 'react'
import { onChange, replaceAll, settings } from '../../lib/db'
import type { Settings } from '../../lib/db'
import { parseBackup } from '../../lib/csv'
import { nextBackupAt } from '../../lib/schedule'
import { useIndex } from '../../lib/useIndex'
import { collectBackup, isNative, syncNative } from '../../platform'
import { runBackup, saveSettings } from './runBackup'

export default function SettingsPage() {
  const { byId, fetchedAt, refresh } = useIndex()
  const [s, setS] = useState<Settings | null>(null)
  const [toast, setToast] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const byIdRef = useRef(byId)
  byIdRef.current = byId

  useEffect(() => {
    const load = () => { void settings.get().then(setS) }
    load()
    return onChange(() => {
      load()
      if (isNative()) void settings.get().then(async (cur) => syncNative(cur, await collectBackup(byIdRef.current)))
    })
  }, [])

  if (!s) return <div className="page"><h1>Settings</h1></div>

  const update = async (p: Partial<Settings>) => setS(await saveSettings(p))
  const next = nextBackupAt(s, new Date())
  const nextText = next ? `${isNative() ? 'approximately ' : ''}${next.toLocaleString()}` : 'off'

  async function exportNow() {
    setToast(null)
    try {
      if ((await runBackup(byId)) === 'ok') setToast({ kind: 'status', text: 'Backup saved.' })
    } catch {
      setToast({ kind: 'alert', text: 'Backup failed.' })
    }
    setS(await settings.get())
  }

  async function importFiles(files: FileList | null) {
    setImportErrors([])
    if (!files?.length) return
    const find = (n: string) => Array.from(files).find((f) => f.name.toLowerCase() === n)
    const w = find('watchlist.csv'), b = find('builds.csv')
    if (!w || !b) { setImportErrors(['Select both watchlist.csv and builds.csv.']); return }
    const parsed = parseBackup(await w.text(), await b.text())
    if (!parsed.ok) { setImportErrors(parsed.errors); return }
    if (!window.confirm('Replace your watchlist and builds?')) return
    await replaceAll(parsed.watchlist, parsed.builds)
    setToast({ kind: 'status', text: 'Backup imported.' })
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <section className="card">
        <h2>Backup</h2>
        <label>Backup frequency{' '}
          <select value={s.backupFrequency} onChange={(e) => void update({ backupFrequency: e.target.value as Settings['backupFrequency'] })}>
            <option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
          </select>
        </label>
        <label>Backup time{' '}
          <input type="time" value={s.backupTime} onChange={(e) => e.target.value && void update({ backupTime: e.target.value })} />
        </label>
        <p>Next backup: {nextText}</p>
        <button type="button" onClick={() => void exportNow()}>Export now</button>
        <p className={s.lastBackupStatus === 'failed' ? 'rise' : 'muted'}>
          {s.lastBackupStatus === 'failed' ? 'Last backup failed' : s.lastBackupAt ? `Last backup: ${new Date(s.lastBackupAt).toLocaleString()}` : 'No backup yet'}
        </p>
        <label>Import backup{' '}
          <input ref={fileRef} type="file" multiple accept=".csv,text/csv" onChange={(e) => { void importFiles(e.target.files).finally(() => { if (fileRef.current) fileRef.current.value = '' }) }} />
        </label>
        {importErrors.length > 0 && <ul role="alert">{importErrors.map((m, i) => <li key={i}>{m}</li>)}</ul>}
      </section>
      <section className="card">
        <h2>Data</h2>
        <p className="muted">Data last refreshed: {fetchedAt ? new Date(fetchedAt).toLocaleString() : 'never'}</p>
        <button type="button" onClick={() => void refresh()}>Refresh now</button>
      </section>
      {toast && <div role={toast.kind}>{toast.text}</div>}
    </div>
  )
}
