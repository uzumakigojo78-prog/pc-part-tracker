import { useEffect, useRef } from 'react'
import { onChange, settings } from '../../lib/db'
import { useIndex } from '../../lib/useIndex'
import { collectBackup, isNative, syncNative } from '../../platform'

/** Keeps the native backup snapshot current for the whole app (not just while Settings is open). */
export default function NativeSync() {
  const { byId, loading } = useIndex()
  const ref = useRef(byId)
  ref.current = byId
  useEffect(() => {
    if (!isNative() || loading) return // wait for the index so build rows have part data
    const run = async () => { try { await syncNative(await settings.get(), await collectBackup(ref.current)) } catch { /* retried on next change */ } }
    void run()
    let t: ReturnType<typeof setTimeout> | undefined
    const off = onChange(() => { clearTimeout(t); t = setTimeout(() => void run(), 500) })
    return () => { off(); clearTimeout(t) }
  }, [loading])
  return null
}
