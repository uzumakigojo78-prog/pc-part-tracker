import type { Settings } from './db'

function atTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

export function nextBackupAt(s: Settings, now: Date): Date | null {
  if (s.backupFrequency === 'off') return null
  if (!s.lastBackupAt) return atTime(now, s.backupTime)
  const last = new Date(s.lastBackupAt)
  if (s.backupFrequency === 'weekly') {
    const d = new Date(last)
    d.setDate(d.getDate() + 7)
    return atTime(d, s.backupTime)
  }
  const sameDay = atTime(last, s.backupTime)
  if (sameDay.getTime() > last.getTime()) return sameDay
  const d = new Date(last)
  d.setDate(d.getDate() + 1)
  return atTime(d, s.backupTime)
}

export function isBackupDue(s: Settings, now: Date): boolean {
  const next = nextBackupAt(s, now)
  return next !== null && next.getTime() <= now.getTime()
}
