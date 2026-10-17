import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

beforeEach(async () => { await resetDbForTests(); vi.mocked(platform.isNative).mockReturnValue(false) })
afterEach(() => { cleanup() })

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
    await new Promise(r => setTimeout(r, 30))
    expect(screen.queryByText(/Backup due/)).toBeNull()
  })

  it('never shown on native', async () => {
    vi.mocked(platform.isNative).mockReturnValue(true)
    await settings.set({ backupFrequency: 'daily', lastBackupAt: daysAgo(5) })
    renderBanner()
    await new Promise(r => setTimeout(r, 30))
    expect(screen.queryByText(/Backup due/)).toBeNull()
  })
})
