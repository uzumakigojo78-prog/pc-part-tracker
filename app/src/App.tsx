import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { IndexEntry } from '../../shared/types'
import { fetchJson } from './lib/data'
import { IndexContext } from './lib/useIndex'
import type { IndexState } from './lib/useIndex'
import SearchPage from './features/search/SearchPage'
import PartPage from './features/search/PartPage'

export function IndexProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<IndexState, 'refresh' | 'byId'>>({ index: [], fetchedAt: null, stale: false, error: null, loading: true })

  const refresh = useCallback(async () => {
    try {
      const r = await fetchJson<IndexEntry[]>('index.json')
      setState({ index: r.data, fetchedAt: r.fetchedAt, stale: r.stale, error: null, loading: false })
    } catch {
      setState(s => ({ ...s, error: 'offline', loading: false }))
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo<IndexState>(
    () => ({ ...state, byId: new Map(state.index.map(e => [e.id, e])), refresh }),
    [state, refresh],
  )
  return <IndexContext.Provider value={value}>{children}</IndexContext.Provider>
}

// Placeholders: replaced by later tasks (build, watchlist, settings).
const Soon = ({ title }: { title: string }) => (
  <div className="page"><h1>{title}</h1><p className="muted">Coming soon.</p></div>
)

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const TABS = [
  { to: '/search', label: 'Search', d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5' },
  { to: '/build', label: 'Build', d: 'M4 6h16v12H4zM8 10h8M8 14h5' },
  { to: '/watchlist', label: 'Watchlist', d: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  { to: '/settings', label: 'Settings', d: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4' },
]

export default function App() {
  return (
    <HashRouter>
      <IndexProvider>
        <nav aria-label="Main" className="tabbar">
          {TABS.map(t => (
            <NavLink key={t.to} to={t.to} className="tab">
              <Icon d={t.d} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
        <main>
          <Routes>
            <Route path="/" element={<Navigate to="/search" replace />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/part/:id" element={<PartPage />} />
            <Route path="/build" element={<Soon title="Build" />} />
            <Route path="/build/:buildId" element={<Soon title="Build" />} />
            <Route path="/watchlist" element={<Soon title="Watchlist" />} />
            <Route path="/settings" element={<Soon title="Settings" />} />
            <Route path="*" element={<Navigate to="/search" replace />} />
          </Routes>
        </main>
      </IndexProvider>
    </HashRouter>
  )
}
