import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { IndexProvider } from './App'
import { useIndex } from './lib/useIndex'
import type { IndexState } from './lib/useIndex'
import { OfflineError } from './lib/data'

vi.mock('./lib/data', async orig => ({ ...(await orig<typeof import('./lib/data')>()), fetchJson: vi.fn() }))
import { fetchJson } from './lib/data'
const mocked = vi.mocked(fetchJson)

afterEach(cleanup)

function probe() {
  const ref: { cur: IndexState | null } = { cur: null }
  function P() { const s = useIndex(); useEffect(() => { ref.cur = s }); return null }
  return { ref, ui: <IndexProvider><P /></IndexProvider> }
}
const entry = { id: 'a', category: 'cpu', brand: 'X', model: 'Y', lowestPrice: 1, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '' }

describe('IndexProvider', () => {
  it('offline then refresh recovers', async () => {
    mocked.mockRejectedValueOnce(new OfflineError())
    const { ref, ui } = probe()
    await act(async () => { render(ui) })
    expect(ref.cur?.error).toBe('offline')
    expect(ref.cur?.loading).toBe(false)
    mocked.mockResolvedValueOnce({ data: [entry], fetchedAt: '2026-01-01T00:00:00Z', stale: false })
    await act(async () => { await ref.cur!.refresh() })
    expect(ref.cur?.error).toBeNull()
    expect(ref.cur?.index).toHaveLength(1)
    expect(ref.cur?.byId.get('a')).toBeTruthy()
  })

  it('propagates stale and fetchedAt', async () => {
    mocked.mockResolvedValueOnce({ data: [entry], fetchedAt: '2025-12-31T00:00:00Z', stale: true })
    const { ref, ui } = probe()
    await act(async () => { render(ui) })
    expect(ref.cur?.stale).toBe(true)
    expect(ref.cur?.fetchedAt).toBe('2025-12-31T00:00:00Z')
  })
})
