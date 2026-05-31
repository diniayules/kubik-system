import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData } from '../types'
import { fetchAppData, persistChanges } from './db'

type UseAppData = {
  data: AppData | null
  loading: boolean
  error: string | null
  /** Optimistic, write-through setter. Updates local state immediately,
   *  then persists the diff to Supabase. On failure it re-syncs from the DB. */
  setData: (next: AppData) => void
  reload: () => void
}

/**
 * Loads the full AppData from Supabase once the user is authenticated and
 * keeps it in sync. `userId` should be the authenticated user's id (used to
 * stamp created_by on inserts); pass null while unauthenticated.
 */
export function useAppData(
  userId: string | null,
  onError?: (msg: string) => void,
): UseAppData {
  const [data, setDataState] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const dataRef = useRef<AppData | null>(null)
  dataRef.current = data

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fresh = await fetchAppData()
      setDataState(fresh)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat data'
      setError(msg)
      onError?.(msg)
    } finally {
      setLoading(false)
    }
    // onError is intentionally excluded — callers pass an inline fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!userId) {
      setDataState(null)
      setLoading(false)
      return
    }
    void load()
  }, [userId, load])

  const setData = useCallback(
    (next: AppData) => {
      const prev = dataRef.current
      setDataState(next)
      if (!prev || !userId) return
      void persistChanges(prev, next, userId).catch((e) => {
        const msg = e instanceof Error ? e.message : 'Gagal menyimpan perubahan'
        onError?.(msg)
        // Re-sync from the source of truth so the UI doesn't drift after a
        // rejected write (e.g. an RLS denial).
        void load()
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [userId, load],
  )

  return { data, loading, error, setData, reload: load }
}
