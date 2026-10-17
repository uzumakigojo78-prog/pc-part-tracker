import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { onChange, watchlist } from '../../lib/db'
import type { WatchItem } from '../../lib/db'
import { formatPrice } from '../../lib/format'
import { useIndex } from '../../lib/useIndex'
import { watchStatus } from '../../lib/watch'

const signed = (n: number) => (n < 0 ? '−' : n > 0 ? '+' : '') + formatPrice(Math.abs(n))

function Row({ w }: { w: WatchItem }) {
  const { byId } = useIndex()
  const s = watchStatus(w, byId.get(w.partId))
  const [draft, setDraft] = useState(w.targetPrice === null ? '' : String(w.targetPrice))
  const [error, setError] = useState('')
  const focused = useRef(false)
  // Pick up external changes (restore, other tab) unless the user is mid-edit.
  useEffect(() => {
    if (!focused.current) { setDraft(w.targetPrice === null ? '' : String(w.targetPrice)); setError('') }
  }, [w.targetPrice])

  async function save() {
    const t = draft.trim()
    const n = Number(t)
    if (t !== '' && (!Number.isFinite(n) || n < 0)) { setError('Enter a valid price (0 or more).'); return }
    setError('')
    const target = t === '' ? null : n
    if (target !== w.targetPrice) await watchlist.put({ ...w, targetPrice: target })
  }

  const pct = s.changePct === null ? '' : ` (${s.changePct < 0 ? '−' : '+'}${Math.abs(s.changePct).toFixed(1)}%)`
  const cls = s.change === null ? 'muted' : s.change < 0 ? 'drop' : s.change > 0 ? 'rise' : 'muted'
  const id = `target-${w.partId}`

  return (
    <li className="card row">
      <div className="row-main">
        {s.untracked ? <span className="row-title">{w.model}</span> : <Link to={`/part/${w.partId}`} className="row-title">{w.model}</Link>}
        {s.untracked && <span className="muted">No longer tracked</span>}
        {s.belowTarget && <span className="badge">Target hit</span>}
        <label htmlFor={id} className="muted">Target price</label>
        <input id={id} className="input watch-target" aria-label={`Target price for ${w.model}`} inputMode="decimal" value={draft}
          aria-invalid={error ? true : undefined}
          onChange={e => setDraft(e.target.value)} onFocus={() => { focused.current = true }}
          onBlur={() => { focused.current = false; void save() }}
          onKeyDown={e => { if (e.key === 'Enter') void save() }} />
        {error && <span role="alert" className="error">{error}</span>}
      </div>
      <div className="row-price">
        <span className="price">{formatPrice(s.current)}</span>
        <span className="muted">Added at {formatPrice(w.priceWhenAdded)}</span>
        <span className={cls}>{s.change === null ? '—' : signed(s.change) + pct}</span>
        <button className="btn secondary" aria-label={`Remove ${w.model}`}
          onClick={() => { if (window.confirm(`Remove "${w.model}" from your watchlist?`)) void watchlist.remove(w.partId) }}>Remove</button>
      </div>
    </li>
  )
}

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[] | null>(null)
  const load = useCallback(() => { void watchlist.all().then(setItems) }, [])
  useEffect(() => { load(); return onChange(load) }, [load])

  return (
    <div className="page">
      <h1>Watchlist</h1>
      {items === null ? null : items.length === 0 ? (
        <div className="card empty"><p>Nothing watched yet.</p><Link to="/search">Search for parts to track</Link></div>
      ) : (
        <ul className="list">{items.map(w => <Row key={w.partId} w={w} />)}</ul>
      )}
    </div>
  )
}
