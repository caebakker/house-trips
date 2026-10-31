import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { m } from '../i18n/t'

export function AppHeader() {
  const { session } = useAuth()

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <Link to="/trips" className="text-base font-semibold text-stone-900">
        {m.appName}
      </Link>
      <nav className="flex items-center gap-4 text-sm">
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
