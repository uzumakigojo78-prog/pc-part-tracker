import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { HistoryPoint, RetailerId } from '../../../../shared/types'
import { RETAILER_NAMES, formatPrice } from '../../lib/format'

const RANGES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1y', days: 365 },
  { label: 'All', days: Infinity },
] as const

export default function PriceChart({ history }: { history: HistoryPoint[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1])

  const points = useMemo(() => {
    const cutoff = range.days === Infinity ? '' : new Date(Date.now() - range.days * 864e5).toISOString().slice(0, 10)
    return history.filter(p => p.date >= cutoff)
  }, [history, range])

  if (!history || history.length === 0) return <p className="muted">No price history yet</p>

  const retailers = [...new Set(points.map(p => p.retailer))] as RetailerId[]
  const byDate = new Map<string, Record<string, number | string>>()
  for (const p of points) {
    const row = byDate.get(p.date) ?? { date: p.date }
    row[p.retailer] = p.price
    byDate.set(p.date, row)
  }
  const data = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const prices = points.map(p => p.price)
  const summary = prices.length
    ? `Lowest ${formatPrice(Math.min(...prices))}, highest ${formatPrice(Math.max(...prices))} over ${range.label === 'All' ? 'all recorded time' : range.label.replace('d', ' days').replace('1y', '1 year')}.`
    : `No prices recorded in the last ${range.label}.`

  return (
    <div>
      <div className="chips" role="group" aria-label="Chart range">
        {RANGES.map(r => (
          <button key={r.label} className="chip" aria-pressed={r === range} onClick={() => setRange(r)}>{r.label}</button>
        ))}
      </div>
      <p className="small" role="status">{summary}</p>
      {data.length > 0 && (
        <div className="chart" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} minTickGap={32} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} width={52} domain={['auto', 'auto']} tickFormatter={v => `$${v}`} />
              <Tooltip
                formatter={(v, name) => [formatPrice(Number(v)), RETAILER_NAMES[String(name)] ?? String(name)]}
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              {retailers.map(r => (
                <Line key={r} type="monotone" dataKey={r} stroke={`var(--c-${r})`} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <ul className="legend" aria-label="Legend">
        {retailers.map(r => (
          <li key={r}><span className="swatch" style={{ background: `var(--c-${r})` }} aria-hidden="true" /> {RETAILER_NAMES[r]}</li>
        ))}
      </ul>
    </div>
  )
}
