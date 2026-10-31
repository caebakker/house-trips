import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useIsAdmin } from '../auth/useIsAdmin'
import { CREDITS_CHANGED, fetchCreditBalance } from '../lib/verification/api'
import { m, fill } from '../i18n/t'

export function AppHeader() {
  const { session } = useAuth()
  const { isAdmin, checked } = useIsAdmin()
  const [credits, setCredits] = useState<number | null>(null)

  useEffect(() => {
    if (!session || !checked || isAdmin) {
      setCredits(null)
      return
    }
    let cancelled = false
    const load = () => {
      fetchCreditBalance()
        .then((value) => {
          if (!cancelled) setCredits(value)
        })
        .catch((err: unknown) => {
          console.error(err)
          if (!cancelled) setCredits(null)
        })
    }
    load()
    window.addEventListener(CREDITS_CHANGED, load)
    return () => {
      cancelled = true
      window.removeEventListener(CREDITS_CHANGED, load)
    }
  }, [session, checked, isAdmin])

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <Link to="/trips" className="text-base font-semibold text-stone-900">
        {m.appName}
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {checked && isAdmin && (
          <>
            <Link to="/admin/queue" className="text-stone-600 hover:text-stone-900">
              {m.nav.queue}
            </Link>
            <Link to="/admin/credits" className="text-stone-600 hover:text-stone-900">
              {m.nav.credits}
            </Link>
          </>
        )}
        {checked && !isAdmin && credits != null && (
          <span className="text-stone-600">
            {credits === 1 ? m.nav.creditOne : fill(m.nav.creditsCount, { count: String(credits) })}
          </span>
        )}
        <Link to="/terms" className="text-stone-600 hover:text-stone-900">
          {m.nav.terms}
        </Link>
        {session && (
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="text-stone-600 hover:text-stone-900"
          >
            {m.nav.signOut}
          </button>
        )}
      </nav>
    </header>
  )
}
