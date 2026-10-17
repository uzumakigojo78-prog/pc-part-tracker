import { describe, expect, it } from 'vitest'
import { exportBackup, parseBackup, parseCsv, toCsv } from './csv'
import type { Build, WatchItem } from './db'
import type { HistoryPoint, IndexEntry } from '../../../shared/types'

const MODEL = 'Corsair 32GB (2x16GB) "Vengeance", DDR5\nRGB'

const entry = (id: string, model: string, lowestPrice: number | null): IndexEntry => ({
  id, category: 'ram', brand: 'X', model, lowestPrice, lowestRetailer: null, rating: null, ratingCount: null, updatedAt: '2026-01-01',
})

const watch: WatchItem[] = [
  { partId: 'b', model: MODEL, addedAt: '2026-02-01T00:00:00Z', priceWhenAdded: 120.5, targetPrice: 99 },
  { partId: 'a', model: 'CPU A', addedAt: '2026-01-01T00:00:00Z', priceWhenAdded: null, targetPrice: null },
]
const blds: Build[] = [
  { buildId: '1', name: 'Zed', slots: { cpu: 'a', ram: 'b' }, updatedAt: 'x' },
  { buildId: '2', name: 'Alpha', slots: { gpu: 'untracked' }, updatedAt: 'x' },
]
const index = new Map<string, IndexEntry>([['a', entry('a', 'CPU A', 200)], ['b', entry('b', MODEL, null)], ['other', entry('other', 'O', 5)]])
const history: Record<string, HistoryPoint[]> = {
  a: [{ date: '2026-01-01', retailer: 'amazon', price: 200 }],
  other: [{ date: '2026-01-01', retailer: 'ebay', price: 5 }],
}

describe('toCsv / parseCsv', () => {
  it('quotes special fields and doubles quotes', () => {
    expect(toCsv([['a,b', 'c"d', 'e\nf', 'g\rh', 'plain', null, 3]])).toBe('"a,b","c""d","e\nf","g\rh",plain,,3')
  })
  it('round-trips tricky fields', () => {
    const rows = [['x', MODEL, ''], ['1', '2', '3']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
  it('accepts LF, trailing newline, BOM', () => {
    expect(parseCsv('﻿a,b\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']])
  })
  it('does not throw on unterminated quote', () => {
    expect(parseCsv('a,"bc')).toEqual([['a', 'bc']])
  })
})

describe('exportBackup', () => {
  const out = exportBackup(watch, blds, index, history)
  it('has exact headers', () => {
    expect(out['watchlist.csv'].split('\r\n')[0]).toBe('partId,model,addedAt,priceWhenAdded,targetPrice')
    expect(out['builds.csv'].split('\r\n')[0]).toBe('buildName,slot,partId,model,price')
    expect(out['price_history.csv'].split('\r\n')[0]).toBe('partId,date,retailer,price')
  })
  it('builds rows use index data, empty when untracked', () => {
    const rows = parseCsv(out['builds.csv'])
    expect(rows[1]).toEqual(['Alpha', 'gpu', 'untracked', '', ''])
    expect(rows).toContainEqual(['Zed', 'cpu', 'a', 'CPU A', '200'])
    expect(rows).toContainEqual(['Zed', 'ram', 'b', MODEL, ''])
  })
  it('history only has watched parts', () => {
    const rows = parseCsv(out['price_history.csv'])
    expect(rows.slice(1)).toEqual([['a', '2026-01-01', 'amazon', '200']])
  })
  it('round-trips through parseBackup', () => {
    const r = parseBackup(out['watchlist.csv'], out['builds.csv'])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.watchlist).toEqual([...watch].sort((x, y) => x.addedAt.localeCompare(y.addedAt)))
    const sorted = [...blds].sort((x, y) => x.name.localeCompare(y.name))
    expect(r.builds.map((x) => [x.name, x.slots])).toEqual(sorted.map((x) => [x.name, x.slots]))
  })
})

describe('parseBackup errors', () => {
  const H = 'partId,model,addedAt,priceWhenAdded,targetPrice'
  const BH = 'buildName,slot,partId,model,price'
  const good = `${H}\r\na,A,2026-01-01T00:00:00Z,1,\r\n`
  const goodB = `${BH}\r\n`
  it('wrong header', () => {
    const r = parseBackup('nope\r\n', goodB)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('watchlist.csv header')
  })
  it('bad number at row 3, no data', () => {
    const r = parseBackup(`${H}\r\na,A,2026-01-01,1,\r\nb,B,2026-01-01,abc,\r\n`, goodB)
    expect(r).toEqual({ ok: false, errors: [expect.stringContaining('watchlist.csv row 3')] })
  })
  it('unknown slot, duplicate slot, empty build name', () => {
    const r = parseBackup(good, `${BH}\r\nB,fan,x,,\r\nB,cpu,x,,\r\nB,cpu,y,,\r\n,cpu,z,,\r\n`)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toHaveLength(3)
      expect(r.errors[0]).toContain('builds.csv row 2')
      expect(r.errors[1]).toContain('builds.csv row 4')
      expect(r.errors[2]).toContain('builds.csv row 5')
    }
  })
  it('duplicate partId, bad date, negative price collected together', () => {
    const r = parseBackup(`${H}\r\na,A,2026-01-01,1,\r\na,A,notadate,-1,\r\n`, goodB)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })
})
