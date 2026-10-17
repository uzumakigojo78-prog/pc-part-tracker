import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Category } from '../../../../shared/types'
import { builds } from '../../lib/db'
import { SLOTS } from '../../lib/build'
import type { Slot } from '../../lib/build'
import { searchParts } from '../../lib/search'
import type { SortKey } from '../../lib/search'
import { CATEGORY_NAMES, RETAILER_NAMES, formatPrice } from '../../lib/format'
import { useIndex } from '../../lib/useIndex'

const CATEGORIES = Object.keys(CATEGORY_NAMES) as Category[]

export default function SearchPage() {
  const { index, stale, fetchedAt, error, loading, refresh } = useIndex()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const pickFor = params.get('pickFor')
  const slotParam = params.get('slot')
  const slot = SLOTS.find(s => s === slotParam) as Slot | undefined
  const picking = !!pickFor && !!slot

  const [q, setQ] = useState('')
  const [chip, setChip] = useState<Category | null>(null)
  const [sort, setSort] = useState<SortKey>('relevance')
  const category: Category | null = picking ? slot : chip
  const results = searchParts(index, q, category, sort)

  async function pick(partId: string) {
    if (!picking) return
    const b = (await builds.all()).find(x => x.buildId === pickFor)
    if (b) await builds.put({ ...b, slots: { ...b.slots, [slot]: partId }, updatedAt: new Date().toISOString() })
    navigate(`/build/${pickFor}`)
  }

  return (
    <div className="page">
      <h1>{picking ? `Choose ${CATEGORY_NAMES[slot]}` : 'Search parts'}</h1>
      {stale && fetchedAt && (
        <p className="banner" role="status">Offline — showing data from {new Date(fetchedAt).toLocaleString()}</p>
      )}
      {loading ? (
        <p className="muted" role="status">Loading parts…</p>
      ) : error === 'offline' && index.length === 0 ? (
        <div className="card empty">
          <p>You're offline and there's no saved data yet.</p>
          <button className="btn" onClick={() => void refresh()}>Retry</button>
        </div>
      ) : (
        <>
          <input
            type="search" className="input" placeholder="Search CPUs, GPUs, RAM…" aria-label="Search parts"
            value={q} onChange={ev => setQ(ev.target.value)}
          />
          {!picking && (
            <div className="chips" role="group" aria-label="Category">
              <button className="chip" aria-pressed={chip === null} onClick={() => setChip(null)}>All</button>
              {CATEGORIES.map(c => (
                <button key={c} className="chip" aria-pressed={chip === c} onClick={() => setChip(chip === c ? null : c)}>
                  {CATEGORY_NAMES[c]}
                </button>
              ))}
            </div>
          )}
          <label className="sort">
            Sort{' '}
            <select value={sort} onChange={ev => setSort(ev.target.value as SortKey)}>
              <option value="relevance">Relevance</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="rating">Rating</option>
            </select>
          </label>
          {results.length === 0 ? (
            <p className="muted">No parts match.</p>
          ) : (
            <ul className="list">
              {results.map(r => {
                const body = (
                  <>
                    <span className="row-main">
                      <span className="row-title">{r.brand} {r.model}</span>
                      <span className="muted small">
                        {CATEGORY_NAMES[r.category]}
                        {r.rating !== null && ` · ★ ${r.rating.toFixed(1)}${r.ratingCount ? ` (${r.ratingCount})` : ''}`}
                      </span>
                    </span>
                    <span className="row-price">
                      <span className="price">{formatPrice(r.lowestPrice)}</span>
                      {r.lowestRetailer && <span className="muted small">{RETAILER_NAMES[r.lowestRetailer]}</span>}
                    </span>
                  </>
                )
                return (
                  <li key={r.id}>
                    {picking
                      ? <button className="row card" onClick={() => void pick(r.id)}>{body}</button>
                      : <Link className="row card" to={`/part/${r.id}`}>{body}</Link>}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
