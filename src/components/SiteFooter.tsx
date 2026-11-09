import { Link } from 'react-router-dom'
import { m } from '../i18n/t'

export function SiteFooter() {
  return (
    <footer className="border-t border-stone-200 bg-stone-50 px-4 py-6">
      <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2 text-sm text-stone-600">
        <Link to="/terms" className="hover:text-stone-900">
          {m.footer.terms}
        </Link>
        <Link to="/privacy/opt-out" className="hover:text-stone-900">
          {m.footer.optOut}
        </Link>
      </nav>
    </footer>
  )
}
