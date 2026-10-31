import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

export function useIsAdmin(): { isAdmin: boolean; checked: boolean } {
  const { session, loading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) {
      setIsAdmin(false)
      setChecked(true)
      return
    }
    let cancelled = false
    setChecked(false)
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (cancelled) return
      setIsAdmin(data === true && !error)
      setChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [session, loading])

  return { isAdmin, checked: !loading && checked }
}
