import { Link } from 'react-router-dom'
import { m } from '../i18n/t'

export function AgencyNotice({ showTermsLink = true }: { showTermsLink?: boolean }) {
  return (
    <aside className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
      <p>{m.legal.notice}</p>
      {showTermsLink && (
        <Link to="/terms" className="mt-2 inline-block font-medium text-amber-950 underline">
          {m.legal.termsLink}
        </Link>
      )}
    </aside>
  )
}
