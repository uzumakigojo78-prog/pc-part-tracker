import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import 'fake-indexeddb/auto'
import type { IndexEntry } from '../../../../shared/types'
import { builds, resetDbForTests } from '../../lib/db'
import { IndexContext } from '../../lib/useIndex'
import type { IndexState } from '../../lib/useIndex'
import { formatPrice } from '../../lib/format'
import BuilderPage from './BuilderPage'

const sceneFails = vi.hoisted(() => ({ on: false }))
vi.mock('./BuildScene', () => ({ default: () => { if (sceneFails.on) throw new Error('no webgl'); return <div>scene</div> } }))
vi.mock('../../lib/data', () => ({ fetchJson: vi.fn(async () => { throw new Error('offline') }) }))

const e = (id: string, category: IndexEntry['category'], lowestPrice: number | null): IndexEntry =>
  ({ id, category, brand: 'B', model: id, lowestPrice, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '' })
const index = [e('cpu1', 'cpu', 200), e('gpu1', 'gpu', 500.5)]

function renderAt(url: string) {
  const state: IndexState = { index, byId: new Map(index.map(i => [i.id, i])), fetchedAt: null, stale: false, error: null, loading: false, refresh: vi.fn(async () => {}) }
  render(
    <IndexContext.Provider value={state}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/build" element={<BuilderPage />} />
          <Route path="/build/:buildId" element={<BuilderPage />} />
        </Routes>
      </MemoryRouter>
    </IndexContext.Provider>,
  )
}

beforeEach(async () => {
  sceneFails.on = false; await resetDbForTests() })
afterEach(cleanup)

describe('BuilderPage', () => {
  it('New build creates Build 1 then Build 2', async () => {
    renderAt('/build')
    await userEvent.click(await screen.findByRole('button', { name: 'New build' }))
    expect(await screen.findByRole('heading', { name: 'Build 1' })).toBeTruthy()
    await userEvent.click(screen.getByRole('link', { name: /all builds/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'New build' }))
    expect(await screen.findByRole('heading', { name: 'Build 2' })).toBeTruthy()
  })

  it('rejects blank rename', async () => {
    await builds.put({ buildId: 'b1', name: 'Mine', slots: {}, updatedAt: '' })
    renderAt('/build/b1')
    await userEvent.click(await screen.findByRole('button', { name: 'Rename' }))
    const input = screen.getByLabelText('Build name')
    await userEvent.clear(input)
    await userEvent.type(input, '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(screen.getByRole('alert').textContent).toMatch(/empty/i)
    expect((await builds.all())[0].name).toBe('Mine')
  })

  it('total sums known parts; missing part flagged and excluded', async () => {
    await builds.put({ buildId: 'b1', name: 'Mine', slots: { cpu: 'cpu1', gpu: 'gpu1', psu: 'gone' }, updatedAt: '' })
    renderAt('/build/b1')
    expect(await screen.findByText(/No longer tracked/)).toBeTruthy()
    expect(screen.getByText(`Total: ${formatPrice(700.5)}`)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Choose/ }).length).toBe(5)
  })

  it('Remove clears a slot', async () => {
    await builds.put({ buildId: 'b1', name: 'Mine', slots: { cpu: 'cpu1' }, updatedAt: '' })
    renderAt('/build/b1')
    await userEvent.click(await screen.findByRole('button', { name: /Remove/ }))
    await waitFor(async () => expect((await builds.all())[0].slots.cpu).toBeUndefined())
  })

  it('delete asks for confirmation first', async () => {
    await builds.put({ buildId: 'b1', name: 'Mine', slots: {}, updatedAt: '' })
    renderAt('/build')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    await userEvent.click(await screen.findByRole('button', { name: /Delete Mine/ }))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect((await builds.all()).length).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: /Delete Mine/ }))
    await waitFor(async () => expect((await builds.all()).length).toBe(0))
  })

  it('keeps the slot list when the 3D scene throws', async () => {
    sceneFails.on = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await builds.put({ buildId: 'b1', name: 'Mine', slots: { cpu: 'cpu1' }, updatedAt: '' })
    renderAt('/build/b1')
    expect(await screen.findByText('3D preview unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remove CPU/ })).toBeTruthy()
  })
})
