import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { PartDetail } from '../../../../shared/types'
import { SLOTS, buildTotal, nextBuildName } from '../../lib/build'
import type { Slot } from '../../lib/build'
import { fetchJson } from '../../lib/data'
import { builds, onChange } from '../../lib/db'
import type { Build } from '../../lib/db'
import { CATEGORY_NAMES, formatPrice } from '../../lib/format'
import { useIndex } from '../../lib/useIndex'
import { layoutFor } from './layout'

const BuildScene = lazy(() => import('./BuildScene'))

function useBuilds() {
  const [list, setList] = useState<Build[] | null>(null)
  const load = useCallback(() => { void builds.all().then(setList) }, [])
  useEffect(() => { load(); return onChange(load) }, [load])
  return list
}

export default function BuilderPage() {
  const { buildId } = useParams()
  const list = useBuilds()
  if (!list) return <div className="page"><p className="muted">Loading…</p></div>
  if (!buildId) return <BuildList list={list} />
  const build = list.find(b => b.buildId === buildId)
  if (!build) return <div className="page"><Link to="/build">← All builds</Link><h1>Build not found</h1></div>
  return <Editor build={build} />
}

function BuildList({ list }: { list: Build[] }) {
  const navigate = useNavigate()
  async function create() {
    const b: Build = { buildId: crypto.randomUUID(), name: nextBuildName(list), slots: {}, updatedAt: new Date().toISOString() }
    await builds.put(b)
    navigate(`/build/${b.buildId}`)
  }
  async function del(b: Build) {
    if (window.confirm(`Delete "${b.name}"? This can't be undone.`)) await builds.remove(b.buildId)
  }
  return (
    <div className="page">
      <h1>Build</h1>
      <button className="btn" onClick={() => void create()}>New build</button>
      {list.length === 0 && <p className="muted">No builds yet.</p>}
      <ul className="list">
        {list.map(b => (
          <li key={b.buildId} className="card slot-row">
            <Link to={`/build/${b.buildId}`} className="row-title">{b.name}</Link>
            <button className="btn secondary" aria-label={`Delete ${b.name}`} onClick={() => void del(b)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Editor({ build }: { build: Build }) {
  const { byId } = useIndex()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [specs, setSpecs] = useState<Partial<Record<Slot, Record<string, string>>>>({})

  const gpuId = build.slots.gpu
  const ramId = build.slots.ram
  useEffect(() => {
    let live = true
    setSpecs({})
    for (const [slot, id] of [['gpu', gpuId], ['ram', ramId]] as const) {
      if (!id || !/^[a-z0-9-]+$/.test(id)) continue
      // Failures keep the layout defaults.
      fetchJson<PartDetail>(`parts/${id}.json`)
        .then(r => { if (live) setSpecs(s => ({ ...s, [slot]: r.data.specs })) })
        .catch(() => {})
    }
    return () => { live = false }
  }, [gpuId, ramId])

  const { total, missing } = buildTotal(build, byId)
  const boxes = useMemo(() => {
    const filled: Partial<Record<Slot, boolean>> = {}
    for (const s of SLOTS) filled[s] = !!build.slots[s]
    return layoutFor(filled, specs)
  }, [build.slots, specs])

  const save = (b: Build) => builds.put({ ...b, updatedAt: new Date().toISOString() })
  async function saveName() {
    const n = name.trim()
    if (!n) { setError('Name can\'t be empty.'); return }
    await save({ ...build, name: n })
    setRenaming(false); setError(null)
  }
  async function removeSlot(slot: Slot) {
    const slots = { ...build.slots }
    delete slots[slot]
    await save({ ...build, slots })
  }

  return (
    <div className="page">
      <Link to="/build">← All builds</Link>
      {renaming ? (
        <form onSubmit={e => { e.preventDefault(); void saveName() }} className="actions">
          <label className="sr-only" htmlFor="build-name">Build name</label>
          <input id="build-name" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <button className="btn" type="submit">Save name</button>
          <button className="btn secondary" type="button" onClick={() => { setRenaming(false); setError(null) }}>Cancel</button>
        </form>
      ) : (
        <div className="actions">
          <h1>{build.name}</h1>
          <button className="btn secondary" onClick={() => { setName(build.name); setRenaming(true) }}>Rename</button>
        </div>
      )}
      {error && <p role="alert" className="banner">{error}</p>}

      <Suspense fallback={<p className="muted">Loading 3D preview…</p>}>
        <BuildScene boxes={boxes} />
      </Suspense>

      <ul className="list">
        {SLOTS.map(slot => {
          const id = build.slots[slot]
          const entry = id ? byId.get(id) : undefined
          return (
            <li key={slot} className="card slot-row">
              <div>
                <div className="muted">{CATEGORY_NAMES[slot]}</div>
                {!id ? (
                  <Link to={`/search?pickFor=${build.buildId}&slot=${slot}`}>Choose…<span className="sr-only"> {CATEGORY_NAMES[slot]}</span></Link>
                ) : entry ? (
                  <span className="row-title">{entry.brand} {entry.model} · {formatPrice(entry.lowestPrice)}</span>
                ) : (
                  <span className="row-title">No longer tracked</span>
                )}
              </div>
              {id && <button className="btn secondary" aria-label={`Remove ${CATEGORY_NAMES[slot]}`} onClick={() => void removeSlot(slot)}>Remove</button>}
            </li>
          )
        })}
      </ul>
      <p><strong>Total: {formatPrice(total)}</strong></p>
      {missing.length > 0 && <p className="muted">{missing.length} part(s) have no current price and aren't counted.</p>}
    </div>
  )
}
