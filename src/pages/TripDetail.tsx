import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AgencyNotice } from '../components/AgencyNotice'
import { AppHeader } from '../components/AppHeader'
import { TripMap, type MapStop } from '../components/TripMap'
import { buttonPrimary, buttonQuiet, buttonSecondary } from '../components/ui'
import { formatHours, formatTripDate } from '../lib/dates'
import { portalLabel, priorityLabel } from '../lib/listings/portal'
import { getTrip, listTripListings, removeTripListing, type Trip, type TripListing } from '../lib/trips/api'
import { m, fill } from '../i18n/t'

function sortListings(listings: TripListing[]): TripListing[] {
  return [...listings].sort(
    (a, b) =>
      a.priority - b.priority ||
      a.comuneName.localeCompare(b.comuneName, 'it') ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

function phoneHref(phone: string): string | null {
  if (!/^[0-9+().\s-]{3,50}$/.test(phone)) return null
  return `tel:${phone.replace(/\s/g, '')}`
}

export default function TripDetail() {
  const { tripId } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [listings, setListings] = useState<TripListing[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    document.title = trip ? `${trip.name} · ${m.appName}` : m.appName
  }, [trip])

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    setMissing(false)
    setError(false)
    Promise.all([getTrip(tripId), listTripListings(tripId)])
      .then(([loadedTrip, loadedListings]) => {
        if (cancelled) return
        if (!loadedTrip) {
          setMissing(true)
          setTrip(null)
          setListings(null)
          return
        }
        setTrip(loadedTrip)
        setListings(sortListings(loadedListings))
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [tripId, reloadKey])

  const stops: MapStop[] = useMemo(
    () =>
      (listings ?? []).map((listing, index) => ({
        id: listing.id,
        number: index + 1,
        comuneName: listing.comuneName,
        lat: listing.approxLat,
        lng: listing.approxLng,
        radiusM: listing.approxRadiusM,
        pin:
          listing.givenLat != null && listing.givenLng != null
            ? { lat: listing.givenLat, lng: listing.givenLng }
            : null,
      })),
    [listings],
  )

  useEffect(() => {
    if (!selectedId) return
    document.getElementById(`listing-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  async function onRemove(id: string) {
    setRemoveError(null)
    try {
      const removed = await removeTripListing(id)
      if (!removed) {
        setRemoveError(m.trip.removeError)
        return
      }
      setListings((current) => current?.filter((listing) => listing.id !== id) ?? null)
      setTrip((current) =>
        current ? { ...current, listingCount: Math.max(0, current.listingCount - 1) } : current,
      )
      setConfirmRemoveId(null)
      if (selectedId === id) setSelectedId(null)
    } catch (err) {
      console.error(err)
      setRemoveError(m.trip.removeError)
    }
  }

  const driveLine =
    trip && formatHours(trip.maxDriveMinutes) === '1'
      ? m.trip.driveSummaryOne
      : trip
        ? fill(m.trip.driveSummary, { hours: formatHours(trip.maxDriveMinutes) })
        : ''

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <Link to="/trips" className="text-sm text-stone-600 hover:text-stone-900">
          {m.trip.back}
        </Link>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
            <p>{m.trip.loadError}</p>
            <button type="button" className={`${buttonSecondary} mt-3`} onClick={() => setReloadKey((key) => key + 1)}>
              {m.common.tryAgain}
            </button>
          </div>
        )}

        {missing && <p className="mt-6 text-stone-600">{m.trip.notFound}</p>}

        {!trip && !missing && !error && <p className="mt-6 text-stone-600">{m.common.loading}</p>}

        {trip && listings && (
          <>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-stone-900">{trip.name}</h1>
                <p className="mt-1 text-sm text-stone-600">
                  {fill(m.trips.dateRange, {
                    start: formatTripDate(trip.startDate),
                    end: formatTripDate(trip.endDate),
                  })}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {driveLine}. {fill(m.trip.dwellSummary, { minutes: String(trip.dwellMinutes) })}.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link to={`/trips/${trip.id}/edit`} className={buttonSecondary}>
                  {m.trip.edit}
                </Link>
                <Link to={`/trips/${trip.id}/listings/new`} className={`${buttonPrimary} w-full sm:w-auto`}>
                  {m.trip.addListing}
                </Link>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
              <section className="order-2 lg:order-1">
                <h2 className="text-lg font-semibold text-stone-900">{m.trip.listingsHeading}</h2>
                {listings.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-stone-300 p-6 text-center text-stone-600">
                    {m.trip.empty}
                  </p>
                ) : (
                  <ol className="mt-3 flex flex-col gap-3">
                    {listings.map((listing, index) => {
                      const hasPin = listing.givenLat != null && listing.givenLng != null
                      const portal = portalLabel(listing.portal, listing.canonicalUrl)
                      const phone = listing.agentPhone ? phoneHref(listing.agentPhone) : null
                      const selected = selectedId === listing.id
                      return (
                        <li key={listing.id}>
                          <article
                            id={`listing-${listing.id}`}
                            onClick={() => setSelectedId(listing.id)}
                            className={`rounded-lg border bg-white px-4 py-3 ${
                              selected ? 'border-amber-700 ring-1 ring-amber-700' : 'border-stone-200'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                                  hasPin ? 'bg-stone-900' : 'bg-amber-800'
                                }`}
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-base font-medium text-stone-900">{listing.comuneName}</h3>
                                <p className="text-sm text-stone-500">
                                  {portal}, {priorityLabel(listing.priority)}
                                </p>
                                <p className="mt-1 text-sm text-stone-700">
                                  {hasPin ? m.trip.addressYouAdded : m.trip.approximateArea}
                                </p>
                                {listing.givenAddress && (
                                  <p className="text-sm text-stone-700">{listing.givenAddress}</p>
                                )}
                                {(listing.agentName || listing.agentEmail || listing.agentPhone) && (
                                  <p className="mt-1 text-sm text-stone-600">
                                    {listing.agentName}
                                    {listing.agentName && (listing.agentEmail || listing.agentPhone) ? ', ' : ''}
                                    {listing.agentEmail && (
                                      <a className="underline" href={`mailto:${listing.agentEmail}`}>
                                        {listing.agentEmail}
                                      </a>
                                    )}
                                    {listing.agentEmail && listing.agentPhone ? ', ' : ''}
                                    {listing.agentPhone &&
                                      (phone ? (
                                        <a className="underline" href={phone}>
                                          {listing.agentPhone}
                                        </a>
                                      ) : (
                                        listing.agentPhone
                                      ))}
                                  </p>
                                )}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <a
                                    href={listing.canonicalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={buttonQuiet}
                                    aria-label={fill(m.trip.openListingLabel, {
                                      portal,
                                      comune: listing.comuneName,
                                    })}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {m.trip.openListing}
                                  </a>
                                  <Link
                                    to={`/trips/${trip.id}/listings/${listing.id}/edit`}
                                    className={buttonQuiet}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {m.trip.editListing}
                                  </Link>
                                  <button
                                    type="button"
                                    className={buttonQuiet}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setConfirmRemoveId(listing.id)
                                    }}
                                  >
                                    {m.trip.removeListing}
                                  </button>
                                </div>
                                {confirmRemoveId === listing.id && (
                                  <div className="mt-2 rounded-lg bg-red-50 p-3">
                                    <p className="text-sm text-red-900">{m.trip.confirmRemove}</p>
                                    <div className="mt-2 flex gap-2">
                                      <button
                                        type="button"
                                        className={buttonSecondary}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          void onRemove(listing.id)
                                        }}
                                      >
                                        {m.trip.confirmRemoveYes}
                                      </button>
                                      <button
                                        type="button"
                                        className={buttonQuiet}
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setConfirmRemoveId(null)
                                        }}
                                      >
                                        {m.common.cancel}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        </li>
                      )
                    })}
                  </ol>
                )}
                {removeError && <p className="mt-3 text-sm text-red-700">{removeError}</p>}
              </section>

              <section className="order-1 lg:sticky lg:top-16 lg:order-2">
                <h2 className="sr-only">{m.trip.mapHeading}</h2>
                <AgencyNotice />
                <div className="mt-3 h-[42vh] min-h-60 lg:h-[min(70vh,640px)]">
                  <TripMap stops={stops} selectedId={selectedId} onSelect={setSelectedId} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{m.trip.legend}</p>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
