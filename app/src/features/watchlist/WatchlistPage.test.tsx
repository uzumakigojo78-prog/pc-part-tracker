import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import 'fake-indexeddb/auto'
import type { IndexEntry } from '../../../../shared/types'
import { resetDbForTests, watchlist } from '../../lib/db'
import { IndexContext } from '../../lib/useIndex'
import type { IndexState } from '../../lib/useIndex'
import { formatPrice } from '../../lib/format'
import WatchlistPage from './WatchlistPage'

const e = (id: string, lowestPrice: number | null): IndexEntry =>
  ({ id, category: 'cpu', brand: 'B', model: id, lowestPrice, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '' })
const index = [e('cpu1', 450), e('cpu2', 100)]
const w = (partId: string, priceWhenAdded: number | null, targetPrice: number | null = null) =>
  ({ partId, model: partId, addedAt: '', priceWhenAdded, targetPrice })

function renderPage() {
  const state: IndexState = { index, byId: new Map(index.map(i => [i.id, i])), fetchedAt: null, stale: false, error: null, loading: false, refresh: vi.fn(async () => {}) }
  render(<IndexContext.Provider value={state}><MemoryRouter><WatchlistPage /></MemoryRouter></IndexContext.Provider>)
}

beforeEach(async () => { await resetDbForTests() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('WatchlistPage', () => {
  it('shows prices, drop change and link', async () => {
    await watchlist.put(w('cpu1', 500))
    renderPage()
    const row = (await screen.findByRole('link', { name: 'cpu1' })).closest('li')!
    expect(row.textContent).toContain(formatPrice(450))
    expect(row.textContent).toContain(formatPrice(500))
    const change = screen.getByText('−$50.00 (−10.0%)')
    expect(change.className).toMatch(/drop/)
    expect(screen.getByRole('link', { name: 'cpu1' }).getAttribute('href')).toBe('/part/cpu1')
  })

  it('rise gets rise styling; null change shows dash', async () => {
    await watchlist.put(w('cpu2', 80))
    await watchlist.put(w('cpu1', null))
    renderPage()
    const rise = await screen.findByText('+$20.00 (+25.0%)')
    expect(rise.className).toMatch(/rise/)
    expect(screen.getByText('—').className).toMatch(/muted/)
  })

  it('Target hit and No longer tracked', async () => {
    await watchlist.put(w('cpu1', 500, 450))
    await watchlist.put(w('gone', 10))
    renderPage()
    expect(await screen.findByText('Target hit')).toBeTruthy()
    expect(screen.getByText('No longer tracked')).toBeTruthy()
  })

  it('saves target on blur; blank clears', async () => {
    await watchlist.put(w('cpu1', 500))
    renderPage()
    const input = await screen.findByLabelText('Target price for cpu1')
    expect(input.getAttribute('inputmode')).toBe('decimal')
    await userEvent.type(input, '400')
    await userEvent.tab()
    await waitFor(async () => expect((await watchlist.all())[0].targetPrice).toBe(400))
    await userEvent.clear(input)
    await userEvent.type(input, '{Enter}')
    await waitFor(async () => expect((await watchlist.all())[0].targetPrice).toBeNull())
  })

  it('rejects negative and non-numeric target', async () => {
    await watchlist.put(w('cpu1', 500, 300))
    renderPage()
    const input = await screen.findByLabelText('Target price for cpu1')
    await userEvent.clear(input)
    await userEvent.type(input, '-5')
    await userEvent.tab()
    expect(screen.getByRole('alert').textContent).toMatch(/valid/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'abc')
    await userEvent.tab()
    expect(screen.getByRole('alert')).toBeTruthy()
    expect((await watchlist.all())[0].targetPrice).toBe(300)
  })

  it('Remove asks to confirm', async () => {
    await watchlist.put(w('cpu1', 500))
    renderPage()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const btn = await screen.findByRole('button', { name: /Remove cpu1/ })
    await userEvent.click(btn)
    expect((await watchlist.all()).length).toBe(1)
    await userEvent.click(btn)
    await waitFor(async () => expect((await watchlist.all()).length).toBe(0))
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('empty state links to search', async () => {
    renderPage()
    expect((await screen.findByRole('link', { name: /search/i })).getAttribute('href')).toBe('/search')
  })
})
