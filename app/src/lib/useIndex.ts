import { createContext, useContext } from 'react'
import type { IndexEntry } from '../../../shared/types'

export interface IndexState {
  index: IndexEntry[]
  byId: Map<string, IndexEntry>
  fetchedAt: string | null
  stale: boolean
  error: 'offline' | null
  refresh(): Promise<void>
}

export const IndexContext = createContext<IndexState | null>(null)

export function useIndex(): IndexState {
  const v = useContext(IndexContext)
  if (!v) throw new Error('useIndex must be used inside IndexProvider')
  return v
}
