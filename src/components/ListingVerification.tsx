import { buttonPrimary } from './ui'
import { buyerVerificationStatus, type VerificationStamp } from '../lib/verification/status'
import { m, fill } from '../i18n/t'

type Props = {
  listingStatus: string
  rows: VerificationStamp[]
  credits: number | null
  busy: boolean
  error: string | null
  onRequest: () => void
}

export function ListingVerification({ listingStatus, rows, credits, busy, error, onRequest }: Props) {
  const status = buyerVerificationStatus(listingStatus, rows)
  const canAsk = status === 'none' || status === 'not_found'
  const cost =
    credits === 1 ? m.verification.costOne : credits != null ? fill(m.verification.cost, { count: String(credits) }) : null

  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <p className="text-sm font-medium text-stone-800">{m.verification.statusLabel}</p>
      {status === 'requested' && <p className="mt-1 text-sm text-stone-700">{m.verification.requested}</p>}
      {status === 'found' && <p className="mt-1 text-sm text-stone-700">{m.verification.found}</p>}
      {status === 'not_found' && <p className="mt-1 text-sm text-stone-700">{m.verification.notFound}</p>}
      {canAsk && credits === 0 && <p className="mt-1 text-sm text-stone-600">{m.verification.noCredits}</p>}
      {canAsk && credits != null && credits > 0 && <p className="mt-1 text-sm text-stone-600">{cost}</p>}
      {canAsk && (
        <button
          type="button"
          className={`${buttonPrimary} mt-2`}
          disabled={busy || credits == null || credits < 1}
          onClick={(event) => {
            event.stopPropagation()
            onRequest()
          }}
        >
          {busy ? m.verification.finding : m.verification.find}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}
