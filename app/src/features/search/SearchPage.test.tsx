import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { IndexEntry } from '../../../../shared/types'
import { IndexContext } from '../../lib/useIndex'
import type { IndexState } from '../../lib/useIndex'
import SearchPage from './SearchPage'

const e = (p: Partial<IndexEntry> & Pick<IndexEntry, 'id' | 'category' | 'brand' | 'model'>): IndexEntry =>
  ({ lowestPrice: null, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '2026-01-01T00:00:00Z', ...p })

const index: IndexEntry[] = [
  e({ id: 'rtx-4070', category: 'gpu', brand: 'NVIDIA', model: 'GeForce RTX 4070', lowestPrice: 589.99, lowestRetailer: 'bestbuy' }),
  e({ id: 'r5-7600', category: 'cpu', brand: 'AMD', model: 'Ryzen 5 7600' }),
]

function renderPage(over: Partial<IndexState> = {}, url = '/search') {
  const state: IndexState = {
    index, byId: new Map(index.map(i => [i.id, i])), fetchedAt: '2026-01-01T00:00:00Z',
    stale: false, error: null, loading: false, refresh: vi.fn(async () => {}), ...over,
  }
  render(
    <IndexContext.Provider value={state}>
      <MemoryRouter initialEntries={[url]}><SearchPage /></MemoryRouter>
    </IndexContext.Provider>,
  )
  return state
}

afterEach(cleanup)

describe('SearchPage', () => {
  it('shows the matching row with price and retailer', async () => {
    renderPage()
    await userEvent.type(screen.getByRole('searchbox'), '4070')
    expect(screen.getByText(/RTX 4070/)).toBeTruthy()
    expect(screen.getByText('$589.99')).toBeTruthy()
    expect(screen.getByText(/Best Buy/)).toBeTruthy()
    expect(screen.queryByText(/Ryzen/)).toBeNull()
  })

  it('filters by category chip', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'GPU' }))
    expect(screen.getByText(/RTX 4070/)).toBeTruthy()
    expect(screen.queryByText(/Ryzen/)).toBeNull()
  })

  it('offline with empty index shows retry that calls refresh', async () => {
    const s = renderPage({ index: [], byId: new Map(), error: 'offline', fetchedAt: null })
    expect(screen.getByText(/You're offline/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(s.refresh).toHaveBeenCalled()
  })

  it('shows a loading status while the index loads', () => {
    renderPage({ index: [], byId: new Map(), fetchedAt: null, loading: true })
    expect(screen.getByRole('status').textContent).toBe('Loading parts…')
    expect(screen.queryByText('No parts match.')).toBeNull()
  })

  it('stale data shows the offline banner', () => {
    renderPage({ stale: true })
    expect(screen.getByText(/Offline — showing data from/)).toBeTruthy()
  })
})
