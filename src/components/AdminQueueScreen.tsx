import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { AdminLocateMap, type LocatePin } from './AdminLocateMap'
import { buttonPrimary, buttonQuiet, buttonSecondary, inputClass } from './ui'
import type { NearbyHouse, QueueItem, ResolveInput } from '../lib/admin/api'
import { adminFailure } from '../lib/admin/api'
import { inItalyBounds } from '../lib/geo/italy'
import { formatTripDate } from '../lib/dates'
import { portalLabel } from '../lib/listings/portal'
import { formatDistance } from '../lib/verification/status'
import { m, fill } from '../i18n/t'

type Props = {
  items: QueueItem[]
  loadNearby: (item: QueueItem) => Promise<NearbyHouse[]>
  onResolve: (input: ResolveInput) => Promise<void>
}

export function AdminQueueScreen({ items, loadNearby, onResolve }: Props) {
  const [index, setIndex] = useState(0)
  const [note, setNote] = useState('')
  const [pin, setPin] = useState<LocatePin | null>(null)
  const [linkedId, setLinkedId] = useState<string | null>(null)
  const [houses, setHouses] = useState<NearbyHouse[]>([])
  const [housesError, setHousesError] = useState(false)
  const [cadastre, setCadastre] = useState(false)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const safeIndex = Math.min(index, Math.max(items.length - 1, 0))
  const item = items[safeIndex] ?? null
  const itemId = item?.id ?? null
  const itemsRef = useRef(items)
  itemsRef.current = items
  const loadNearbyRef = useRef(loadNearby)
  loadNearbyRef.current = loadNearby
  const resolveRef = useRef<(outcome: 'found' | 'not_found') => void>(() => {})

  useEffect(() => {
    const list = itemsRef.current
    const current = list[Math.min(index, Math.max(list.length - 1, 0))]
    if (!current || current.id !== itemId) return
    setNote('')
    setPin(null)
    setLinkedId(current.linkedPropertyId)
    setError(null)
    setHousesError(false)
    let cancelled = false
    loadNearbyRef
      .current(current)
      .then((rows) => {
        if (!cancelled) setHouses(rows)
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) {
          setHouses([])
          setHousesError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [itemId, index])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLTextAreaElement) return
      if (target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio') return
      if (target instanceof HTMLSelectElement) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        resolveRef.current('found')
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        resolveRef.current('not_found')
      } else if (event.key === 'PageDown') {
        event.preventDefault()
        setIndex((current) => Math.min(current + 1, Math.max(itemsRef.current.length - 1, 0)))
      } else if (event.key === 'PageUp') {
        event.preventDefault()
        setIndex((current) => Math.max(current - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function resolve(outcome: 'found' | 'not_found') {
    if (!item || busy) return
    if (outcome === 'found') {
      if (!linkedId && !pin) {
        setError(m.admin.needPin)
        return
      }
      if (!linkedId && pin && !inItalyBounds(pin.lat, pin.lng)) {
        setError(m.admin.outside)
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      await onResolve({
        requestId: item.id,
        outcome,
        lat: linkedId ? null : (pin?.lat ?? null),
        lng: linkedId ? null : (pin?.lng ?? null),
        propertyId: linkedId,
        note,
      })
      setBanner(outcome === 'found' ? m.admin.markedFound : m.admin.markedNotFound)
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : ''
      const reason = adminFailure(message)
      setError(reason === 'outside' ? m.admin.outside : reason === 'pin' ? m.admin.needPin : m.admin.saveError)
    } finally {
      setBusy(false)
    }
  }
  resolveRef.current = (outcome) => {
    void resolve(outcome)
  }

  const linked = houses.find((house) => house.id === linkedId) ?? null
  const linkedPin: LocatePin | null = linked
    ? { lat: linked.lat, lng: linked.lng }
    : linkedId && linkedId === item?.linkedPropertyId && item.linkedLat != null && item.linkedLng != null
      ? { lat: item.linkedLat, lng: item.linkedLng }
      : null

  return (
    <div className="min-h-svh bg-stone-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-stone-900">{m.admin.title}</h1>
          <Link to="/admin/credits" className={buttonSecondary}>
            {m.nav.credits}
          </Link>
        </div>

        {banner && (
          <p className="mt-3 text-sm text-stone-700" aria-live="polite">
            {banner}
          </p>
        )}

        {items.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-stone-300 p-8 text-center text-stone-600">
            {m.admin.empty}
          </p>
        ) : (
          item && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={buttonSecondary}
                  onClick={() => setIndex((current) => Math.max(current - 1, 0))}
                  disabled={safeIndex === 0 || busy}
                >
                  {m.admin.previous}
                </button>
                <p className="px-1 text-sm font-medium text-stone-800">
                  {fill(m.admin.position, { current: String(safeIndex + 1), total: String(items.length) })}
                </p>
                <button
                  type="button"
                  className={buttonSecondary}
                  onClick={() => setIndex((current) => Math.min(current + 1, items.length - 1))}
                  disabled={safeIndex >= items.length - 1 || busy}
                >
                  {m.admin.next}
                </button>
              </div>
              <p className="mt-2 text-sm text-stone-500">{m.admin.keys}</p>

              <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                <section className="rounded-lg border border-stone-200 bg-white p-4">
                  <h2 className="text-lg font-semibold text-stone-900">{item.comuneName}</h2>
                  <p className="mt-1 text-sm text-stone-700">{item.tripName}</p>
                  <p className="text-sm text-stone-600">
                    {fill(m.trips.dateRange, {
                      start: formatTripDate(item.tripStart),
                      end: formatTripDate(item.tripEnd),
                    })}
                  </p>
                  <p className="mt-2 text-sm text-stone-600">
                    {m.admin.buyer}: {item.buyerEmail}
                  </p>
                  <p className="mt-2 text-sm text-stone-800">
                    {item.givenAddress ? `${m.admin.typedAddress}: ${item.givenAddress}` : m.admin.noAddress}
                  </p>
                  <a
                    href={item.listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${buttonSecondary} mt-3`}
                  >
                    {m.admin.openListing}
                    <span className="sr-only">, {portalLabel(item.portal, item.listingUrl)}</span>
                  </a>

                  <fieldset className="mt-4">
                    <legend className="text-sm font-medium text-stone-800">{m.admin.houses}</legend>
                    {housesError && <p className="mt-2 text-sm text-red-700">{m.admin.housesError}</p>}
                    {!housesError && houses.length === 0 && (
                      <p className="mt-2 text-sm text-stone-600">{m.admin.housesEmpty}</p>
                    )}
                    <div className="mt-2 flex flex-col gap-2">
                      {houses.map((house) => (
                        <label
                          key={house.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                            linkedId === house.id ? 'border-amber-700 bg-amber-50' : 'border-stone-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name="existing-house"
                            className="mt-1"
                            checked={linkedId === house.id}
                            onChange={() => {
                              setLinkedId(house.id)
                              setPin(null)
                              setError(null)
                            }}
                          />
                          <span>
                            {fill(m.admin.distance, {
                              label: house.label,
                              distance: formatDistance(house.distanceM),
                            })}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="mt-4 flex flex-col gap-1.5" htmlFor="admin-note">
                    <span className="text-sm font-medium text-stone-800">{m.admin.note}</span>
                    <textarea
                      id="admin-note"
                      className={`${inputClass} min-h-20`}
                      maxLength={2000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <span className="text-sm text-stone-500">{m.admin.noteHint}</span>
                  </label>
                  <p className="mt-3 text-sm text-stone-600">{m.admin.pinHint}</p>

                  {error && (
                    <p className="mt-3 text-sm text-red-700" aria-live="polite">
                      {error}
                    </p>
                  )}

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className={buttonPrimary}
                      disabled={busy}
                      onClick={() => void resolve('found')}
                    >
                      {busy ? m.admin.working : m.admin.found}
                    </button>
                    <button
                      type="button"
                      className={buttonSecondary}
                      disabled={busy}
                      onClick={() => void resolve('not_found')}
                    >
                      {m.admin.notFound}
                    </button>
                  </div>
                </section>

                <section className="lg:sticky lg:top-16">
                  <label className="mb-2 flex items-center gap-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      checked={cadastre}
                      onChange={(event) => setCadastre(event.target.checked)}
                    />
                    {m.admin.cadastre}
                  </label>
                  <p className="mb-2 text-sm text-stone-500">{m.admin.cadastreHint}</p>
                  <div className="h-[46vh] min-h-72 lg:h-[min(64vh,620px)]">
                    <AdminLocateMap
                      viewKey={item.id}
                      zone={{ lat: item.approxLat, lng: item.approxLng, radiusM: item.approxRadiusM }}
                      givenPin={
                        item.givenLat != null && item.givenLng != null
                          ? { lat: item.givenLat, lng: item.givenLng }
                          : null
                      }
                      droppedPin={pin}
                      linkedPin={linkedPin}
                      showCadastre={cadastre}
                      onDropPin={(next) => {
                        setPin(next)
                        setLinkedId(null)
                        setError(null)
                      }}
                    />
                  </div>
                </section>
              </div>

              <ol className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {items.map((row, rowIndex) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={rowIndex === safeIndex ? buttonSecondary : buttonQuiet}
                      aria-current={rowIndex === safeIndex ? 'true' : undefined}
                      onClick={() => setIndex(rowIndex)}
                    >
                      {fill(m.admin.jump, {
                        current: String(rowIndex + 1),
                        comune: row.comuneName,
                        date: formatTripDate(row.tripStart),
                      })}
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )
        )}
      </main>
    </div>
  )
}
