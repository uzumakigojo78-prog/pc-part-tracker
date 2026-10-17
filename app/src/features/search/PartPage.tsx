import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { HistoryPoint, PartDetail } from '../../../../shared/types'
import { fetchJson } from '../../lib/data'
import { builds, onChange, watchlist } from '../../lib/db'
import type { Build, WatchItem } from '../../lib/db'
import { SLOTS, nextBuildName } from '../../lib/build'
import type { Slot } from '../../lib/build'
import { CATEGORY_NAMES, RETAILER_NAMES, formatPrice, specLabel, specValue } from '../../lib/format'
import { useIndex } from '../../lib/useIndex'
import PriceChart from './PriceChart'

function Stars({ rating, count }: { rating: number | null; count: number | null }) {
  if (rating === null) return <span className="muted">No ratings yet</span>
  const full = Math.round(rating)
  return (
    <span aria-label={`Rated ${rating.toFixed(1)} out of 5${count ? ` from ${count} ratings` : ''}`}>
      <span aria-hidden="true" className="stars">{'★'.repeat(full)}{'☆'.repeat(5 - full)}</span>{' '}
      <span aria-hidden="true">{rating.toFixed(1)}{count ? ` (${count})` : ''}</span>
    </span>
  )
}

export default function PartPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { byId } = useIndex()
  const validId = /^[a-z0-9-]+$/.test(id)
  const [part, setPart] = useState<PartDetail | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [failed, setFailed] = useState(false)
  const [watching, setWatching] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  useEffect(() => {
    if (!validId) return
    let live = true
    setPart(null); setFailed(false); setHistory([])
    fetchJson<PartDetail>(`parts/${id}.json`)
      .then(r => { if (live) setPart(r.data) })
      .catch(() => { if (live) setFailed(true) })
    // A missing history file (404) is normal: treat as no history.
    fetchJson<HistoryPoint[]>(`history/${id}.json`)
      .then(r => { if (live && Array.isArray(r.data)) setHistory(r.data) })
      .catch(() => {})
    return () => { live = false }
  }, [id])

  const loadWatch = useCallback(() => {
    void watchlist.all().then(all => setWatching(all.some(w => w.partId === id)))
  }, [id])
  useEffect(() => { loadWatch(); return onChange(loadWatch) }, [loadWatch])

  if (!validId) return <div className="page"><Link to="/search">← Back to search</Link><h1>Part not found</h1></div>
  if (failed) return <div className="page"><Link to="/search">← Back</Link><p className="card">Couldn't load this part. Check your connection and try again.</p></div>
  if (!part) return <div className="page"><p className="muted">Loading…</p></div>

  const entry = byId.get(part.id)
  const offerPrices = part.offers.map(o => o.price).filter(p => Number.isFinite(p))
  const lowest = entry?.lowestPrice ?? (offerPrices.length ? Math.min(...offerPrices) : null)
  const slot = SLOTS.find(s => s === part.category) as Slot | undefined

  async function toggleWatch() {
    if (!part) return
    if (watching) await watchlist.remove(part.id)
    else {
      const w: WatchItem = { partId: part.id, model: `${part.brand} ${part.model}`, addedAt: new Date().toISOString(), priceWhenAdded: lowest, targetPrice: null }
      await watchlist.put(w)
    }
  }

  return (
    <div className="page">
      <button className="back" onClick={() => { if (location.key !== 'default') navigate(-1); else navigate('/search') }}>← Back</button>
      <h1>{part.brand} {part.model}</h1>
      <p className="muted">{CATEGORY_NAMES[part.category]}</p>
      {part.image && <img className="hero" src={part.image} alt={`${part.brand} ${part.model}`} />}
      <p><Stars rating={entry?.rating ?? null} count={entry?.ratingCount ?? null} /></p>
      <div className="actions">
        <button className="btn" aria-pressed={watching} onClick={() => void toggleWatch()}>{watching ? 'Unwatch' : 'Watch'}</button>
        {slot && <button className="btn secondary" onClick={() => setSheet(true)}>Add to build</button>}
      </div>
      {added && <p role="status" className="banner">{added}</p>}

      <h2>Offers</h2>
      {part.offers.length === 0 ? <p className="muted">No offers yet</p> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Retailer</th><th>Price</th><th>Stock</th><th><span className="sr-only">Link</span></th></tr></thead>
            <tbody>
              {part.offers.map(o => (
                <tr key={o.retailer + o.url}>
                  <td>{RETAILER_NAMES[o.retailer] ?? o.retailer}</td>
                  <td>{formatPrice(o.price)}</td>
                  <td>{o.inStock ? 'In stock' : 'Out of stock'}</td>
                  <td><a href={o.url} target="_blank" rel="noopener noreferrer">View<span className="sr-only"> at {RETAILER_NAMES[o.retailer] ?? o.retailer}</span></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Price history</h2>
      <div className="card"><PriceChart history={history} /></div>

      <h2>Specs</h2>
      {Object.keys(part.specs).length === 0 ? <p className="muted">No specs listed</p> : (
        <div className="card table-wrap">
          <table><tbody>
            {Object.entries(part.specs).map(([k, v]) => <tr key={k}><th scope="row">{specLabel(k)}</th><td>{specValue(k, v)}</td></tr>)}
          </tbody></table>
        </div>
      )}

      {sheet && slot && (
        <AddToBuildSheet
          partId={part.id} slot={slot}
          onClose={() => setSheet(false)}
          onDone={msg => { setSheet(false); setAdded(msg) }}
        />
      )}
    </div>
  )
}

function AddToBuildSheet({ partId, slot, onClose, onDone }: {
  partId: string; slot: Slot; onClose: () => void; onDone: (msg: string) => void
}) {
  const navigate = useNavigate()
  const [list, setList] = useState<Build[]>([])
  useEffect(() => { void builds.all().then(setList) }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function addTo(b: Build) {
    await builds.put({ ...b, slots: { ...b.slots, [slot]: partId }, updatedAt: new Date().toISOString() })
    onDone(`Added to ${b.name}.`)
  }
  async function newBuild() {
    const b: Build = { buildId: crypto.randomUUID(), name: nextBuildName(list), slots: { [slot]: partId }, updatedAt: new Date().toISOString() }
    await builds.put(b)
    navigate(`/build/${b.buildId}`)
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={e => e.stopPropagation()}>
        <h2 id="sheet-title">Add to build</h2>
        <ul className="list">
          {list.map(b => (
            <li key={b.buildId}><button className="row card" onClick={() => void addTo(b)}>{b.name}</button></li>
          ))}
          <li><button className="row card" onClick={() => void newBuild()}>+ New build</button></li>
        </ul>
        <button className="btn secondary" autoFocus onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
