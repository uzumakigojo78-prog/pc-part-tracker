import { describe, expect, it } from 'vitest'
import type { Settings } from './db'
import { isBackupDue, nextBackupAt } from './schedule'

const s = (p: Partial<Settings>): Settings => ({ backupFrequency: 'daily', backupTime: '09:00', lastBackupAt: null, lastBackupStatus: null, ...p })
const t = (d: Date | null) => d?.getTime()

describe('nextBackupAt', () => {
  it('off -> null', () => {
    expect(nextBackupAt(s({ backupFrequency: 'off' }), new Date(2026, 9, 16, 10))).toBeNull()
  })
  it('daily, never backed up -> today at time', () => {
    const next = nextBackupAt(s({}), new Date(2026, 9, 16, 10, 0))
    expect(t(next)).toBe(new Date(2026, 9, 16, 9, 0).getTime())
    expect(isBackupDue(s({}), new Date(2026, 9, 16, 10, 0))).toBe(true)
    expect(isBackupDue(s({}), new Date(2026, 9, 16, 8, 0))).toBe(false)
  })
  it('daily, last today 09:01 -> tomorrow 09:00', () => {
    const last = new Date(2026, 9, 16, 9, 1).toISOString()
    expect(t(nextBackupAt(s({ lastBackupAt: last }), new Date(2026, 9, 16, 12)))).toBe(new Date(2026, 9, 17, 9, 0).getTime())
  })
  it('weekly -> +7 days at time', () => {
    const last = new Date(2026, 9, 10, 9, 0).toISOString()
    expect(t(nextBackupAt(s({ backupFrequency: 'weekly', lastBackupAt: last }), new Date(2026, 9, 12)))).toBe(new Date(2026, 9, 17, 9, 0).getTime())
  })
})

describe('isBackupDue', () => {
  it('due after 5 days, not after backing up now', () => {
    const now = new Date(2026, 9, 16, 12, 0)
    const old = new Date(2026, 9, 11, 12, 0).toISOString()
    expect(isBackupDue(s({ lastBackupAt: old }), now)).toBe(true)
    expect(isBackupDue(s({ lastBackupAt: now.toISOString() }), now)).toBe(false)
  })
})

describe('robustness', () => {
  it('invalid lastBackupAt acts like null', () => {
    const st = s({ lastBackupAt: 'garbage' })
    expect(t(nextBackupAt(st, new Date(2026, 9, 16, 10)))).toBe(new Date(2026, 9, 16, 9, 0).getTime())
    expect(isBackupDue(st, new Date(2026, 9, 16, 10))).toBe(true)
  })
  it('malformed backupTime falls back to 09:00', () => {
    for (const bt of ['25:00', '', '9:60', 'abc']) {
      expect(t(nextBackupAt(s({ backupTime: bt }), new Date(2026, 9, 16, 10)))).toBe(new Date(2026, 9, 16, 9, 0).getTime())
    }
  })
})
