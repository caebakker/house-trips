import { lazy, Suspense, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsAdmin } from '../auth/useIsAdmin'
import { AppHeader } from '../components/AppHeader'

const AdminQueueScreen = lazy(() =>
  import('../components/AdminQueueScreen').then((module) => ({ default: module.AdminQueueScreen })),
)
import { buttonSecondary } from '../components/ui'
import { fetchNearby, fetchQueue, resolveVerification, type QueueItem } from '../lib/admin/api'
import { m } from '../i18n/t'

export default function AdminQueue() {
  const { isAdmin, checked } = useIsAdmin()
  const [items, setItems] = useState<QueueItem[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    document.title = `${m.admin.title} · ${m.appName}`
  }, [])

  useEffect(() => {
    if (!checked || !isAdmin) return
    let cancelled = false
    setError(false)
    fetchQueue()
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [checked, isAdmin, reloadKey])

  if (!checked || (isAdmin && items === null && !error)) {
    return (
      <div className="min-h-svh bg-stone-50">
        <AppHeader />
        <p className="p-6 text-stone-600">{m.common.loading}</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-stone-50">
        <AppHeader />
        <main className="mx-auto max-w-lg px-4 py-8">
          <p className="text-stone-700">{m.admin.forbidden}</p>
          <Link to="/trips" className={`${buttonSecondary} mt-4`}>
            {m.admin.back}
          </Link>
        </main>
      </div>
    )
  }

  if (error || items === null) {
    return (
      <div className="min-h-svh bg-stone-50">
        <AppHeader />
        <main className="mx-auto max-w-lg px-4 py-8">
          <p className="text-red-800">{m.admin.loadError}</p>
          <button type="button" className={`${buttonSecondary} mt-4`} onClick={() => setReloadKey((key) => key + 1)}>
            {m.common.tryAgain}
          </button>
        </main>
      </div>
    )
  }

  return (
    <Suspense fallback={<p className="p-6 text-stone-600">{m.common.loading}</p>}>
      <AdminQueueScreen
        items={items}
        loadNearby={(row) =>
          fetchNearby(row.givenLat ?? row.approxLat, row.givenLng ?? row.approxLng, row.listingId)
        }
        onResolve={async (input) => {
          await resolveVerification(input)
          setItems((current) => (current ?? []).filter((row) => row.id !== input.requestId))
        }}
      />
    </Suspense>
  )
}
