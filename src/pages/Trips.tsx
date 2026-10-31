import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { buttonPrimary, buttonSecondary } from '../components/ui'
import { formatTripDate, romeToday } from '../lib/dates'
import { listTrips, type Trip } from '../lib/trips/api'
import { m, fill } from '../i18n/t'

function sortTrips(trips: Trip[]): Trip[] {
  const today = romeToday()
  return [...trips].sort((a, b) => {
    const aPast = a.endDate < today
    const bPast = b.endDate < today
    if (aPast !== bPast) return aPast ? 1 : -1
    if (aPast && bPast) return b.startDate.localeCompare(a.startDate)
    return a.startDate.localeCompare(b.startDate)
  })
}

function listingCount(count: number): string {
  return count === 1 ? m.trips.listingsCountOne : fill(m.trips.listingsCount, { count: String(count) })
}

export default function Trips() {
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    document.title = `${m.trips.title} · ${m.appName}`
  }, [])

  useEffect(() => {
    let cancelled = false
    listTrips()
      .then((rows) => {
        if (!cancelled) setTrips(sortTrips(rows))
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-stone-900">{m.trips.title}</h1>
          <Link to="/trips/new" className={`${buttonPrimary} sm:w-auto`}>
            {m.trips.create}
          </Link>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
            <p>{m.trips.loadError}</p>
            <button type="button" className={`${buttonSecondary} mt-3`} onClick={() => { setError(false); setTrips(null); setReloadKey((key) => key + 1) }}>
              {m.common.tryAgain}
            </button>
          </div>
        )}

        {trips === null && !error && <p className="mt-6 text-stone-600">{m.common.loading}</p>}

        {trips && trips.length === 0 && (
          <p className="mt-6 rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-600">
            {m.trips.empty}
          </p>
        )}

        {trips && trips.length > 0 && (
          <ul className="mt-6 flex flex-col gap-3">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link
                  to={`/trips/${trip.id}`}
                  className="block rounded-lg border border-stone-200 bg-white px-4 py-4 hover:border-stone-400"
                >
                  <span className="block text-lg font-medium text-stone-900">{trip.name}</span>
                  <span className="mt-1 block text-sm text-stone-600">
                    {fill(m.trips.dateRange, {
                      start: formatTripDate(trip.startDate),
                      end: formatTripDate(trip.endDate),
                    })}
                  </span>
                  <span className="mt-1 block text-sm text-stone-500">{listingCount(trip.listingCount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
