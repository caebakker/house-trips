import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsAdmin } from '../auth/useIsAdmin'
import { AppHeader } from '../components/AppHeader'
import { AdminOptOutScreen } from '../components/AdminOptOutScreen'
import { buttonSecondary } from '../components/ui'
import { decideOptOut, fetchOptOutQueue, restoreOptOut, type OptOutRequest } from '../lib/optout/api'
import { m } from '../i18n/t'

export default function AdminOptOuts() {
  const { isAdmin, checked } = useIsAdmin()
  const [items, setItems] = useState<OptOutRequest[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    document.title = `${m.optOutAdmin.title} · ${m.appName}`
  }, [])

  useEffect(() => {
    if (!checked || !isAdmin) return
    let cancelled = false
    setError(false)
    fetchOptOutQueue()
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
          <p className="text-stone-700">{m.optOutAdmin.forbidden}</p>
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
          <p className="text-red-800">{m.optOutAdmin.loadError}</p>
          <button type="button" className={`${buttonSecondary} mt-4`} onClick={() => setReloadKey((key) => key + 1)}>
            {m.common.tryAgain}
          </button>
        </main>
      </div>
    )
  }

  return (
    <AdminOptOutScreen
      items={items}
      onDecide={async (request, decision) => {
        await decideOptOut(request, decision)
        setItems((current) => {
          const rows = current ?? []
          if (decision === 'rejected') return rows.filter((row) => row.id !== request.id)
          return rows.map((row) => (row.id === request.id ? { ...row, status: 'approved' } : row))
        })
      }}
      onRestore={async (request) => {
        await restoreOptOut(request.id)
        setItems((current) => (current ?? []).filter((row) => row.id !== request.id))
      }}
    />
  )
}
