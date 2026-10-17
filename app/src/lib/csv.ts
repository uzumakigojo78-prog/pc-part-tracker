import { SLOTS } from './build'
import type { Slot } from './build'
import type { Build, WatchItem } from './db'
import type { HistoryPoint, IndexEntry } from '../../../shared/types'

const field = (v: string | number | null): string => {
  const s = v === null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Rows to CSV text, CRLF-separated; null becomes an empty field. */
export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map(field).join(',')).join('\r\n')
}

/** Parses CSV text (CRLF or LF, optional BOM, quoted fields). Never throws. */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuotes = false
  let any = false // something pending in the current row
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += c
      continue
    }
    if (c === '"') { inQuotes = true; any = true }
    else if (c === ',') { row.push(cur); cur = ''; any = true }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row)
      row = []; cur = ''; any = false
    } else { cur += c; any = true }
  }
  if (any || cur !== '') { row.push(cur); rows.push(row) }
  return rows
}

export interface BackupFiles { 'watchlist.csv': string; 'builds.csv': string; 'price_history.csv': string }

const WATCH_HEADER = ['partId', 'model', 'addedAt', 'priceWhenAdded', 'targetPrice']
const BUILD_HEADER = ['buildName', 'slot', 'partId', 'model', 'price']
const HISTORY_HEADER = ['partId', 'date', 'retailer', 'price']

const byStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function exportBackup(
  w: WatchItem[], b: Build[], index: Map<string, IndexEntry>, history: Record<string, HistoryPoint[]>,
): BackupFiles {
  const watch = [...w].sort((x, y) => byStr(x.addedAt, y.addedAt))
  const watchRows = watch.map((x) => [x.partId, x.model, x.addedAt, x.priceWhenAdded, x.targetPrice])

  const buildRows: (string | number | null)[][] = []
  for (const build of [...b].sort((x, y) => byStr(x.name, y.name))) {
    for (const slot of SLOTS) {
      const partId = build.slots[slot]
      if (!partId) continue
      const e = index.get(partId)
      buildRows.push([build.name, slot, partId, e?.model ?? '', e?.lowestPrice ?? null])
    }
  }

  const histRows: (string | number | null)[][] = []
  for (const x of watch) {
    for (const p of history[x.partId] ?? []) histRows.push([x.partId, p.date, p.retailer, p.price])
  }

  return {
    'watchlist.csv': toCsv([WATCH_HEADER, ...watchRows]),
    'builds.csv': toCsv([BUILD_HEADER, ...buildRows]),
    'price_history.csv': toCsv([HISTORY_HEADER, ...histRows]),
  }
}

export type ParsedBackup = { ok: true; watchlist: WatchItem[]; builds: Build[] } | { ok: false; errors: string[] }

const headerOk = (row: string[] | undefined, expected: string[]) =>
  !!row && row.length === expected.length && expected.every((h, i) => row[i] === h)

/** Empty -> null; otherwise finite number >= 0; undefined when invalid. */
function parseOptPrice(s: string): number | null | undefined {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function parseBackup(watchlistCsv: string, buildsCsv: string): ParsedBackup {
  const errors: string[] = []
  const watchlist: WatchItem[] = []
  const builds: Build[] = []

  const wRows = parseCsv(watchlistCsv)
  if (!headerOk(wRows[0], WATCH_HEADER)) {
    errors.push(`watchlist.csv header must be: ${WATCH_HEADER.join(',')}`)
  } else {
    const seen = new Set<string>()
    wRows.slice(1).forEach((r, i) => {
      const n = i + 2
      if (r.length === 1 && r[0] === '') return // blank line
      const bad = (msg: string) => errors.push(`watchlist.csv row ${n}: ${msg}`)
      if (r.length !== WATCH_HEADER.length) return bad(`expected ${WATCH_HEADER.length} columns, got ${r.length}`)
      const [partId, model, addedAt, pw, tp] = r
      let ok = true
      if (!partId) { bad('partId is empty'); ok = false }
      else if (seen.has(partId)) { bad(`duplicate partId "${partId}"`); ok = false }
      else seen.add(partId)
      if (!addedAt || Number.isNaN(Date.parse(addedAt))) { bad(`addedAt "${addedAt}" is not a valid date`); ok = false }
      const priceWhenAdded = parseOptPrice(pw)
      if (priceWhenAdded === undefined) { bad(`priceWhenAdded "${pw}" is not a number >= 0`); ok = false }
      const targetPrice = parseOptPrice(tp)
      if (targetPrice === undefined) { bad(`targetPrice "${tp}" is not a number >= 0`); ok = false }
      if (ok) watchlist.push({ partId, model, addedAt, priceWhenAdded: priceWhenAdded ?? null, targetPrice: targetPrice ?? null })
    })
  }

  const bRows = parseCsv(buildsCsv)
  if (!headerOk(bRows[0], BUILD_HEADER)) {
    errors.push(`builds.csv header must be: ${BUILD_HEADER.join(',')}`)
  } else {
    const byName = new Map<string, Build>()
    bRows.slice(1).forEach((r, i) => {
      const n = i + 2
      if (r.length === 1 && r[0] === '') return
      const bad = (msg: string) => errors.push(`builds.csv row ${n}: ${msg}`)
      if (r.length !== BUILD_HEADER.length) return bad(`expected ${BUILD_HEADER.length} columns, got ${r.length}`)
      const [name, slot, partId] = r
      let ok = true
      if (!name) { bad('buildName is empty'); ok = false }
      if (!(SLOTS as readonly string[]).includes(slot)) { bad(`unknown slot "${slot}"`); ok = false }
      if (!partId) { bad('partId is empty'); ok = false }
      if (!ok) return
      let build = byName.get(name)
      if (!build) {
        build = { buildId: crypto.randomUUID(), name, slots: {}, updatedAt: new Date().toISOString() }
        byName.set(name, build)
        builds.push(build)
      }
      if (build.slots[slot as Slot] !== undefined) return bad(`duplicate slot "${slot}" in build "${name}"`)
      build.slots[slot as Slot] = partId
    })
  }

  return errors.length ? { ok: false, errors } : { ok: true, watchlist, builds }
}
