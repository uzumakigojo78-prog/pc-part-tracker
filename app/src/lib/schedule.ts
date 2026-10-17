import type { Settings } from './db'

function atTime(base: Date, hhmm: string): Date {
  let match = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!match || +match[1] > 23 || +match[2] > 59) match = /^(\d{2}):(\d{2})$/.exec('09:00')
  const d = new Date(base)
  d.setHours(+match![1], +match![2], 0, 0)
  return d
}

export function nextBackupAt(s: Settings, now: Date): Date | null {
  if (s.backupFrequency === 'off') return null
  const last = s.lastBackupAt ? new Date(s.lastBackupAt) : null
  if (!last || Number.isNaN(last.getTime())) return atTime(now, s.backupTime)
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
