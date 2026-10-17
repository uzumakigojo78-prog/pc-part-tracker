import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import 'fake-indexeddb/auto'
import { builds, resetDbForTests, settings, watchlist } from '../../lib/db'
import { IndexContext } from '../../lib/useIndex'
import type { IndexState } from '../../lib/useIndex'
import { exportBackup } from '../../lib/csv'
import * as platform from '../../platform'
import SettingsPage from './SettingsPage'

vi.mock('../../platform', async (orig) => ({
  ...(await orig<typeof import('../../platform')>()),
  isNative: vi.fn(() => false),
  saveBackup: vi.fn(async () => 'downloaded' as const),
}))

const refresh = vi.fn(async () => {})
function renderPage() {
  const state: IndexState = { index: [], byId: new Map(), fetchedAt: '2026-01-02T03:04:05Z', stale: false, error: null, loading: false, refresh }
  render(<IndexContext.Provider value={state}><SettingsPage /></IndexContext.Provider>)
}
const csv = (name: string, text: string) => new File([text], name, { type: 'text/csv' })

beforeEach(async () => { await resetDbForTests(); vi.mocked(platform.saveBackup).mockResolvedValue('downloaded'); vi.mocked(platform.isNative).mockReturnValue(false) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('SettingsPage', () => {
  it('persists frequency and time', async () => {
    renderPage()
    await userEvent.selectOptions(await screen.findByLabelText('Backup frequency'), 'weekly')
    await waitFor(async () => expect((await settings.get()).backupFrequency).toBe('weekly'))
    const t = screen.getByLabelText('Backup time')
    expect(t.getAttribute('type')).toBe('time')
    fireEvent.change(t, { target: { value: '07:30' } })
    await waitFor(async () => expect((await settings.get()).backupTime).toBe('07:30'))
  })

  it('native shows approximately', async () => {
    vi.mocked(platform.isNative).mockReturnValue(true)
    await settings.set({ backupFrequency: 'daily' })
    renderPage()
    expect((await screen.findByText(/Next backup:/)).textContent).toContain('approximately')
  })

  it('Export now saves and records ok', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Export now' }))
    await waitFor(async () => expect((await settings.get()).lastBackupStatus).toBe('ok'))
    expect(platform.saveBackup).toHaveBeenCalled()
    expect((await settings.get()).lastBackupAt).toBeTruthy()
  })

  it('failed export shows toast and failed status', async () => {
    vi.mocked(platform.saveBackup).mockRejectedValue(new Error('boom'))
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Export now' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Backup failed')
    expect(await screen.findByText('Last backup failed')).toBeTruthy()
    expect((await settings.get()).lastBackupStatus).toBe('failed')
  })

  it('cancelled share changes nothing', async () => {
    vi.mocked(platform.saveBackup).mockRejectedValue(new platform.BackupCancelledError())
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Export now' }))
    await waitFor(() => expect(platform.saveBackup).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
    expect((await settings.get()).lastBackupAt).toBeNull()
    expect((await settings.get()).lastBackupStatus).toBeNull()
  })

  it('bad import lists errors and does not replace', async () => {
    await watchlist.put({ partId: 'keep', model: 'keep', addedAt: '', priceWhenAdded: null, targetPrice: null })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    const input = await screen.findByLabelText('Import backup')
    await userEvent.upload(input, [csv('watchlist.csv', 'partId,model,addedAt,priceWhenAdded,targetPrice\r\nx,x,,abc,'), csv('builds.csv', 'buildName,slot,partId,model,price')])
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()
    expect((await watchlist.all()).map(x => x.partId)).toEqual(['keep'])
  })

  it('missing builds.csv is an error', async () => {
    renderPage()
    await userEvent.upload(await screen.findByLabelText('Import backup'), csv('watchlist.csv', 'x'))
    expect((await screen.findByRole('alert')).textContent).toContain('builds.csv')
  })

  it('valid import confirms then replaces', async () => {
    const files = exportBackup(
      [{ partId: 'cpu1', model: 'CPU 1', addedAt: '2026-01-01', priceWhenAdded: 100, targetPrice: null }],
      [{ buildId: 'b1', name: 'Mine', slots: { cpu: 'cpu1' }, updatedAt: '' }],
      new Map(), {})
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await userEvent.upload(await screen.findByLabelText('Import backup'), [csv('watchlist.csv', files['watchlist.csv']), csv('builds.csv', files['builds.csv'])])
    await waitFor(async () => expect((await watchlist.all()).map(x => x.partId)).toEqual(['cpu1']))
    expect(confirm).toHaveBeenCalledWith('Replace your watchlist and builds?')
    expect((await builds.all()).map(b => b.name)).toEqual(['Mine'])
  })

  it('shows refresh time and Refresh now works', async () => {
    renderPage()
    expect((await screen.findByText(/Data last refreshed/)).textContent).toContain('2026')
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }))
    expect(refresh).toHaveBeenCalled()
  })
})
