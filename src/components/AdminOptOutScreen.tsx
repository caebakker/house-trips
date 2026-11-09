import { useState } from 'react'
import { AppHeader } from './AppHeader'
import { buttonDanger, buttonPrimary, buttonSecondary } from './ui'
import type { OptOutRequest } from '../lib/optout/api'
import { classifyOptOutUrls } from '../lib/optout/urls'
import { formatRomeDateTime } from '../lib/dates'
import { m, fill } from '../i18n/t'

type Props = {
  items: OptOutRequest[]
  onDecide: (request: OptOutRequest, decision: 'approved' | 'rejected') => Promise<void>
  onRestore: (request: OptOutRequest) => Promise<void>
}

export function AdminOptOutScreen({ items, onDecide, onRestore }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(request: OptOutRequest, action: 'approved' | 'rejected' | 'restored') {
    setBusyId(request.id)
    setError(null)
    setNotice(null)
    try {
      if (action === 'restored') {
        await onRestore(request)
        setNotice(m.optOutAdmin.restored)
      } else {
        await onDecide(request, action)
        setNotice(action === 'approved' ? m.optOutAdmin.approved : m.optOutAdmin.rejected)
      }
    } catch (err) {
      console.error(err)
      setError(m.optOutAdmin.saveError)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-stone-900">{m.optOutAdmin.title}</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-stone-600">{m.optOutAdmin.intro}</p>
        {notice && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-950" role="status">
            {notice}
          </p>
        )}
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        {items.length === 0 ? (
          <p className="mt-8 rounded-lg border border-dashed border-stone-300 p-6 text-center text-stone-600">
            {m.optOutAdmin.empty}
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-8">
            <RequestList
              heading={m.optOutAdmin.waiting}
              items={items.filter((request) => request.status === 'pending')}
              busyId={busyId}
              onDecide={(request, decision) => void run(request, decision)}
              onRestore={() => {}}
            />
            <section>
              <h2 className="text-lg font-semibold text-stone-900">{m.optOutAdmin.approvedHeading}</h2>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">{m.optOutAdmin.restoreHint}</p>
              <RequestList
                items={items.filter((request) => request.status === 'approved')}
                busyId={busyId}
                onDecide={() => {}}
                onRestore={(request) => void run(request, 'restored')}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

function RequestList({
  heading,
  items,
  busyId,
  onDecide,
  onRestore,
}: {
  heading?: string
  items: OptOutRequest[]
  busyId: string | null
  onDecide: (request: OptOutRequest, decision: 'approved' | 'rejected') => void
  onRestore: (request: OptOutRequest) => void
}) {
  if (items.length === 0) return null
  return (
    <section>
      {heading && <h2 className="text-lg font-semibold text-stone-900">{heading}</h2>}
      <ol className="mt-3 flex flex-col gap-4">
        {items.map((request) => {
          const match = classifyOptOutUrls(request.listingUrls)
          const busy = busyId === request.id
          return (
            <li key={request.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-500">
                {fill(m.optOutAdmin.received, { when: formatRomeDateTime(request.createdAt) })}
              </p>
              <p className="mt-2 text-base text-stone-800">{request.comune ?? m.optOutAdmin.noComune}</p>
              <p className="text-sm text-stone-600">{request.contactEmail ?? m.optOutAdmin.noEmail}</p>
              {request.ownerConfirmed && <p className="mt-2 text-sm text-stone-700">{m.optOutAdmin.confirmed}</p>}
              <h3 className="mt-4 text-sm font-medium text-stone-800">{m.optOutAdmin.links}</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {request.listingUrls.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-base text-stone-900 underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
              {request.status === 'pending' &&
                match.unmatched.map((url) => (
                  <p key={url} className="mt-2 text-sm text-amber-900">
                    {fill(m.optOutAdmin.unmatched, { url })}
                  </p>
                ))}
              {request.status === 'pending' && match.canonical.length === 0 && (
                <p className="mt-2 text-sm text-amber-900">{m.optOutAdmin.needMatch}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {request.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      className={buttonPrimary}
                      disabled={busy || match.canonical.length === 0}
                      onClick={() => onDecide(request, 'approved')}
                    >
                      {busy ? m.optOutAdmin.working : m.optOutAdmin.approve}
                    </button>
                    <button
                      type="button"
                      className={buttonDanger}
                      disabled={busy}
                      onClick={() => onDecide(request, 'rejected')}
                    >
                      {m.optOutAdmin.reject}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={buttonSecondary}
                    disabled={busy}
                    onClick={() => onRestore(request)}
                  >
                    {busy ? m.optOutAdmin.working : m.optOutAdmin.restore}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
