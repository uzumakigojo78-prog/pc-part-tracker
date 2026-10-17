import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import 'fake-indexeddb/auto'
import { resetDbForTests, settings } from '../../lib/db'
import { IndexContext } from '../../lib/useIndex'
import type { IndexState } from '../../lib/useIndex'
import * as platform from '../../platform'
import BackupBanner from './BackupBanner'

vi.mock('../../platform', async (orig) => ({
  ...(await orig<typeof import('../../platform')>()),
  isNative: vi.fn(() => false),
  saveBackup: vi.fn(async () => 'downloaded' as const),
}))

function renderBanner() {
  const state: IndexState = { index: [], byId: new Map(), fetchedAt: null, stale: false, error: null, loading: false, refresh: vi.fn(async () => {}) }
  render(<IndexContext.Provider value={state}><BackupBanner /></IndexContext.Provider>)
}
// Lets the banner's settings.get() resolve and its setState flush before asserting absence.
const flushSettings = async () => { await settings.get(); await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

beforeEach(async () => { await resetDbForTests(); vi.mocked(platform.isNative).mockReturnValue(false) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('BackupBanner', () => {
  it('daily backup 5 days ago shows exactly one banner; export hides it', async () => {
    await settings.set({ backupFrequency: 'daily', lastBackupAt: daysAgo(5) })
    renderBanner()
    const btn = await screen.findByRole('button', { name: 'Backup due — Export now' })
    expect(screen.getAllByText(/Backup due/)).toHaveLength(1)
    await userEvent.click(btn)
    await waitFor(() => expect(screen.queryByText(/Backup due/)).toBeNull())
  })

  it('hidden when off or not due', async () => {
    await settings.set({ backupFrequency: 'weekly', lastBackupAt: daysAgo(1) })
    renderBanner()
    await flushSettings()
    expect(screen.queryByText(/Backup due/)).toBeNull()
  })

  it('never shown on native', async () => {
    vi.mocked(platform.isNative).mockReturnValue(true)
    await settings.set({ backupFrequency: 'daily', lastBackupAt: daysAgo(5) })
    renderBanner()
    await flushSettings()
    expect(screen.queryByText(/Backup due/)).toBeNull()
  })

  it('button is disabled while exporting (no double share)', async () => {
    let release!: () => void
    vi.mocked(platform.saveBackup).mockReturnValue(new Promise((r) => { release = () => r('downloaded') }))
    await settings.set({ backupFrequency: 'daily', lastBackupAt: daysAgo(5) })
    renderBanner()
    const btn = await screen.findByRole('button', { name: 'Backup due — Export now' })
    await userEvent.click(btn)
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(true))
    await userEvent.click(btn)
    release()
    await waitFor(() => expect(screen.queryByText(/Backup due/)).toBeNull())
    expect(platform.saveBackup).toHaveBeenCalledTimes(1)
  })

  it('appears when the app becomes visible and a backup is due', async () => {
    await settings.set({ backupFrequency: 'daily', lastBackupAt: new Date().toISOString() })
    renderBanner()
    await flushSettings()
    expect(screen.queryByText(/Backup due/)).toBeNull()
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 3 * 86400000 })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText(/Backup due/)).toBeTruthy()
  })
})

it('overlapping runBackup calls save once', async () => {
  const { runBackup } = await import('./runBackup')
  let release!: () => void
  vi.mocked(platform.saveBackup).mockClear()
  vi.mocked(platform.saveBackup).mockReturnValue(new Promise((r) => { release = () => r('downloaded') }))
  const a = runBackup(new Map()), b = runBackup(new Map())
  expect(a).toBe(b)
  release()
  await Promise.all([a, b])
  expect(platform.saveBackup).toHaveBeenCalledTimes(1)
})
