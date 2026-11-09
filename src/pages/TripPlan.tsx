import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { PlanWorkspace, type ViewStop } from '../components/PlanWorkspace'
import { buttonSecondary } from '../components/ui'
import { fetchLatestPlan, fetchTripStart, fetchUnlockedPins, savePlan, saveTripStart, type TripStart } from '../lib/plan/api'
import type { StoredPlan } from '../lib/plan/stored'
import { loadTravelMatrix } from '../lib/routing/client'
import { getTrip, listTripListings, type Trip, type TripListing } from '../lib/trips/api'
import { m } from '../i18n/t'

function asPriority(value: number): 1 | 2 | 3 {
  if (value === 1) return 1
  if (value === 3) return 3
  return 2
}

function toStop(listing: TripListing, dwell: number, pins: Map<string, { lat: number; lng: number }>): ViewStop {
  const unlocked = pins.get(listing.id) ?? null
  const given = listing.givenLat != null && listing.givenLng != null ? { lat: listing.givenLat, lng: listing.givenLng } : null
  return {
    id: listing.id,
    comuneName: listing.comuneName,
    priority: asPriority(listing.priority),
    dwellMinutes: listing.dwellMinutes ?? dwell,
    radiusM: listing.approxRadiusM,
    zoneLat: listing.approxLat,
    zoneLng: listing.approxLng,
    givenAddress: unlocked ? null : listing.givenAddress,
    given: unlocked ? null : given,
    unlocked,
    url: listing.canonicalUrl,
    portal: listing.portal,
  }
}

export default function TripPlan() {
  const { tripId } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<ViewStop[] | null>(null)
  const [start, setStart] = useState<TripStart | null>(null)
  const [plan, setPlan] = useState<StoredPlan | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    document.title = trip ? `${m.plan.title} · ${trip.name}` : m.appName
  }, [trip])

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    setError(false)
    setMissing(false)
    Promise.all([getTrip(tripId), listTripListings(tripId), fetchTripStart(tripId), fetchLatestPlan(tripId), fetchUnlockedPins(tripId)])
      .then(([loadedTrip, listings, loadedStart, loadedPlan, pins]) => {
        if (cancelled) return
        if (!loadedTrip) {
          setMissing(true)
          setTrip(null)
          return
        }
        const pinMap = new Map(pins.map((pin) => [pin.tripListingId, { lat: pin.lat, lng: pin.lng }]))
        setTrip(loadedTrip)
        setStops(
          listings
            .filter((listing) => listing.status !== 'unavailable')
            .map((listing) => toStop(listing, loadedTrip.dwellMinutes, pinMap)),
        )
        setStart(loadedStart)
        setPlan(loadedPlan)
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [tripId, reloadKey])

  async function onStart(next: TripStart) {
    if (!tripId) return
    setSaveError(null)
    try {
      await saveTripStart(tripId, next)
    } catch (err) {
      console.error(err)
      setSaveError(m.plan.saveError)
    }
  }

  async function onPlan(next: StoredPlan) {
    if (!tripId) return
    setSaveError(null)
    try {
      await savePlan(tripId, next)
    } catch (err) {
      console.error(err)
      setSaveError(m.plan.saveError)
    }
  }

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <Link to={tripId ? `/trips/${tripId}` : '/trips'} className="text-sm text-stone-600 hover:text-stone-900">
          {m.plan.back}
        </Link>
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
            <p>{m.plan.loadError}</p>
            <button type="button" className={`${buttonSecondary} mt-3`} onClick={() => setReloadKey((key) => key + 1)}>
              {m.common.tryAgain}
            </button>
          </div>
        )}
        {missing && <p className="mt-6 text-stone-600">{m.trip.notFound}</p>}
        {!trip && !missing && !error && <p className="mt-6 text-stone-600">{m.common.loading}</p>}
        {trip && stops && (
          <div className="mt-3">
            <PlanWorkspace
              tripName={trip.name}
              startDate={trip.startDate}
              endDate={trip.endDate}
              maxDriveMinutes={trip.maxDriveMinutes}
              stops={stops}
              initialStart={start}
              initialLunchStart={start?.lunchStartMinute ?? plan?.lunchStartMinute ?? 750}
              initialLunchEnd={start?.lunchEndMinute ?? plan?.lunchEndMinute ?? 900}
              initialPlan={plan}
              resolveMatrix={(points) => loadTravelMatrix(trip.id, points)}
              onStart={(next) => void onStart(next)}
              onPlan={(next) => void onPlan(next)}
              saveError={saveError}
            />
          </div>
        )}
      </main>
    </div>
  )
}
