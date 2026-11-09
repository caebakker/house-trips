import { useEffect, useMemo, useState } from 'react'
import { AgencyNotice } from './AgencyNotice'
import { PlanMap, type PlanMapStop } from './PlanMap'
import { buttonPrimary, buttonQuiet, buttonSecondary, inputClass } from './ui'
import { formatDayHeading } from '../lib/dates'
import { lookupPlace, type AddressHit } from '../lib/geo/address'
import { priorityLabel, portalLabel } from '../lib/listings/portal'
import { googleDayUrl, googleMapsUrl, appleMapsUrl, routingPoint } from '../lib/plan/points'
import { useDrivePlan, type PlanListing } from '../lib/plan/useDrivePlan'
import type { StoredPlan, StoredReason } from '../lib/plan/stored'
import type { MatrixPoint, TravelMatrix } from '../lib/routing/straightLine'
import { formatClock, formatDrive } from '../lib/scheduler/time'
import { m, fill } from '../i18n/t'

export type ViewStop = {
  id: string
  comuneName: string
  priority: 1 | 2 | 3
  dwellMinutes: number
  radiusM: number
  zoneLat: number
  zoneLng: number
  givenAddress: string | null
  given: { lat: number; lng: number } | null
  unlocked: { lat: number; lng: number } | null
  url: string
  portal: string
}

type StartPoint = { label: string; lat: number; lng: number }

type Props = {
  tripName: string
  startDate: string
  endDate: string
  maxDriveMinutes: number
  stops: ViewStop[]
  initialStart: StartPoint | null
  initialLunchStart: number
  initialLunchEnd: number
  initialPlan: StoredPlan | null
  resolveMatrix?: (points: MatrixPoint[]) => Promise<TravelMatrix>
  onStart?: (start: StartPoint & { lunchStartMinute: number; lunchEndMinute: number }) => void
  onPlan?: (plan: StoredPlan) => void
  saveError?: string | null
}

function asPriority(value: number): 1 | 2 | 3 {
  if (value === 1) return 1
  if (value === 3) return 3
  return 2
}

function reasonText(reason: StoredReason): string {
  if (reason === 'over_drive_limit') return m.plan.reasonDrive
  if (reason === 'no_daylight') return m.plan.reasonDaylight
  if (reason === 'outside_trip') return m.plan.reasonDay
  return m.plan.reasonLeft
}

function timeValue(minute: number): string {
  return formatClock(minute)
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

export function PlanWorkspace({
  tripName,
  startDate,
  endDate,
  maxDriveMinutes,
  stops,
  initialStart,
  initialLunchStart,
  initialLunchEnd,
  initialPlan,
  resolveMatrix,
  onStart,
  onPlan,
  saveError,
}: Props) {
  const [start, setStart] = useState<StartPoint | null>(initialStart)
  const [editingStart, setEditingStart] = useState(!initialStart)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<AddressHit[]>([])
  const [lookupState, setLookupState] = useState<'idle' | 'busy' | 'empty' | 'error'>('idle')
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState<StartPoint | null>(null)
  const [lunchStart, setLunchStart] = useState(initialLunchStart)
  const [lunchEnd, setLunchEnd] = useState(initialLunchEnd)
  const [lunchFromText, setLunchFromText] = useState(timeValue(initialLunchStart))
  const [lunchToText, setLunchToText] = useState(timeValue(initialLunchEnd))
  const [lunchError, setLunchError] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const listings: PlanListing[] = useMemo(
    () =>
      stops.map((stop) => ({
        id: stop.id,
        dwellMinutes: stop.dwellMinutes,
        priority: asPriority(stop.priority),
        zone: { lat: stop.zoneLat, lng: stop.zoneLng },
        given: stop.given,
        unlocked: stop.unlocked,
      })),
    [stops],
  )

  const drive = useDrivePlan({
    startDate,
    endDate,
    maxDriveMinutes,
    start,
    lunchStart,
    lunchEnd,
    listings,
    initialPlan,
    resolveMatrix,
    onPlan,
  })

  useEffect(() => {
    if (!drive.plan) return
    if (selectedDay && drive.plan.days.some((day) => day.date === selectedDay)) return
    const unlocked = drive.plan.days.find((day) =>
      day.stops.some((stop) => stops.some((item) => item.id === stop.tripListingId && item.unlocked)),
    )
    setSelectedDay(unlocked?.date ?? drive.plan.days[0]?.date ?? null)
  }, [drive.plan, selectedDay, stops])

  function commitStart(next: StartPoint) {
    setStart(next)
    setDraft(null)
    setEditingStart(false)
    setPicking(false)
    onStart?.({ ...next, lunchStartMinute: lunchStart, lunchEndMinute: lunchEnd })
  }

  function commitLunch(nextStart: number, nextEnd: number) {
    if (nextEnd <= nextStart) {
      setLunchError(true)
      return
    }
    setLunchError(false)
    setLunchStart(nextStart)
    setLunchEnd(nextEnd)
    if (start) onStart?.({ ...start, lunchStartMinute: nextStart, lunchEndMinute: nextEnd })
  }

  async function onLookup() {
    const text = query.trim()
    if (text.length < 2) return
    setLookupState('busy')
    try {
      const found = await lookupPlace(text)
      setHits(found)
      setLookupState(found.length === 0 ? 'empty' : 'idle')
    } catch (err) {
      console.error(err)
      setHits([])
      setLookupState('error')
    }
  }

  const byId = useMemo(() => new Map(stops.map((stop) => [stop.id, stop])), [stops])
  const selected = drive.plan?.days.find((day) => day.date === selectedDay) ?? drive.plan?.days[0]

  const mapStops: PlanMapStop[] = stops.map((stop) => {
    const onDay = selected?.stops.findIndex((item) => item.tripListingId === stop.id) ?? -1
    const route = routingPoint({ unlocked: stop.unlocked, given: stop.given, comune: { lat: stop.zoneLat, lng: stop.zoneLng } })
    return {
      id: stop.id,
      number: onDay >= 0 ? onDay + 1 : null,
      comuneName: stop.comuneName,
      zoneLat: stop.zoneLat,
      zoneLng: stop.zoneLng,
      radiusM: stop.radiusM,
      pin: route.kind === 'comune' ? null : { ...route.point, kind: route.kind },
      showZone: route.kind !== 'unlocked',
    }
  })

  const routeLine = selected
    ? [
        ...(start ? [start] : []),
        ...selected.stops.map((stop) => {
          const item = byId.get(stop.tripListingId)
          if (!item) return start
          return routingPoint({
            unlocked: item.unlocked,
            given: item.given,
            comune: { lat: item.zoneLat, lng: item.zoneLng },
          }).point
        }),
        ...(start ? [start] : []),
      ].filter((point): point is StartPoint => point != null)
    : []

  const dayUrl =
    start && selected
      ? googleDayUrl(
          start,
          selected.stops
            .map((stop) => byId.get(stop.tripListingId))
            .filter((item): item is ViewStop => item != null)
            .map(
              (item) =>
                routingPoint({
                  unlocked: item.unlocked,
                  given: item.given,
                  comune: { lat: item.zoneLat, lng: item.zoneLng },
                }).point,
            ),
        )
      : null

  return (
    <div>
      <h1 className="text-2xl font-semibold text-stone-900">{tripName}</h1>
      <p className="mt-1 text-sm text-stone-600">{m.plan.title}</p>
      <div className="mt-4">
        <AgencyNotice />
      </div>

      <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-base font-semibold text-stone-900">{m.plan.startHeading}</h2>
        <p className="mt-1 text-sm text-stone-600">{m.plan.startHint}</p>
        {start && !editingStart ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-stone-800">{fill(m.plan.startingFrom, { place: start.label })}</p>
            <button type="button" className={buttonQuiet} onClick={() => setEditingStart(true)}>
              {m.plan.changeStart}
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="start-place"
                className={inputClass}
                value={query}
                placeholder={m.plan.startPlaceholder}
                aria-label={m.plan.startHeading}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void onLookup()
                  }
                }}
              />
              <button type="button" className={buttonSecondary} onClick={() => void onLookup()} disabled={lookupState === 'busy'}>
                {lookupState === 'busy' ? m.plan.looking : m.plan.lookup}
              </button>
            </div>
            {lookupState === 'empty' && <p className="text-sm text-stone-600">{m.plan.lookupEmpty}</p>}
            {lookupState === 'error' && <p className="text-sm text-red-700">{m.plan.lookupError}</p>}
            {hits.length > 0 && (
              <ul className="flex flex-col gap-1">
                {hits.map((hit) => (
                  <li key={`${hit.label}-${hit.lat}`}>
                    <button
                      type="button"
                      className={`${buttonQuiet} w-full justify-start text-left`}
                      onClick={() => commitStart({ label: hit.label, lat: hit.lat, lng: hit.lng })}
                    >
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className={picking ? buttonPrimary : buttonSecondary}
              onClick={() => setPicking((value) => !value)}
            >
              {m.plan.pick}
            </button>
            {picking && <p className="text-sm text-stone-600">{m.plan.picking}</p>}
            {draft && (
              <button type="button" className={buttonPrimary} onClick={() => commitStart(draft)}>
                {m.plan.saveStart}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-stone-800" htmlFor="lunch-from">
            {m.plan.lunchFrom}
            <input
              id="lunch-from"
              className={inputClass}
              inputMode="numeric"
              autoComplete="off"
              value={lunchFromText}
              onChange={(event) => {
                setLunchFromText(event.target.value)
                const minute = parseTime(event.target.value)
                if (minute != null) commitLunch(minute, lunchEnd)
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-stone-800" htmlFor="lunch-to">
            {m.plan.lunchTo}
            <input
              id="lunch-to"
              className={inputClass}
              inputMode="numeric"
              autoComplete="off"
              value={lunchToText}
              onChange={(event) => {
                setLunchToText(event.target.value)
                const minute = parseTime(event.target.value)
                if (minute != null) commitLunch(lunchStart, minute)
              }}
            />
          </label>
        </div>
        <p className="mt-1 text-sm text-stone-500">{m.plan.lunchHint}</p>
        {lunchError && <p className="mt-1 text-sm text-red-700">{m.plan.lunchError}</p>}
      </section>

      {saveError && <p className="mt-3 text-sm text-red-700">{saveError}</p>}
      {drive.failed && <p className="mt-3 text-sm text-red-700">{m.plan.loadError}</p>}

      {!start && <p className="mt-4 text-sm text-stone-600">{m.plan.needStart}</p>}
      {start && stops.length === 0 && <p className="mt-4 text-sm text-stone-600">{m.plan.empty}</p>}

      {start && stops.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className={buttonSecondary} onClick={drive.regenerate} disabled={drive.busy}>
              {drive.busy ? m.plan.planning : m.plan.regenerate}
            </button>
            <p className="text-sm text-stone-600">{drive.source === 'openrouteservice' ? m.plan.road : m.plan.straightLine}</p>
          </div>

          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
            <section className="order-2 flex flex-col gap-4 lg:order-1">
              {drive.plan?.days.map((day) => (
                <article
                  key={day.date}
                  className={`rounded-lg border bg-white p-4 ${day.date === selected?.date ? 'border-stone-900' : 'border-stone-200'}`}
                >
                  <button type="button" className="text-left" onClick={() => setSelectedDay(day.date)}>
                    <h2 className="text-lg font-semibold text-stone-900">{formatDayHeading(day.date)}</h2>
                  </button>
                  <p className="mt-1 text-sm text-stone-600">
                    {fill(m.plan.dayDrive, { time: formatDrive(day.driveMinutes) })}
                  </p>
                  {!day.ok && <p className="mt-1 text-sm text-amber-900">{m.plan.dayOver}</p>}
                  {day.stops.length === 0 && <p className="mt-3 text-sm text-stone-600">{m.plan.dayEmpty}</p>}
                  <ol className="mt-3 flex flex-col gap-3">
                    {day.stops.map((stop, index) => {
                      const item = byId.get(stop.tripListingId)
                      if (!item) return null
                      const kind = routingPoint({
                        unlocked: item.unlocked,
                        given: item.given,
                        comune: { lat: item.zoneLat, lng: item.zoneLng },
                      }).kind
                      const about = drive.source !== 'openrouteservice' || kind !== 'unlocked'
                      const driveText = fill(
                        kind === 'comune'
                          ? index === 0
                            ? m.plan.driveCentreFromStart
                            : m.plan.driveCentre
                          : about
                            ? index === 0
                              ? m.plan.driveAboutFromStart
                              : m.plan.driveAbout
                            : index === 0
                              ? m.plan.driveFromStart
                              : m.plan.drive,
                        { time: formatDrive(stop.driveMinutes) },
                      )
                      const selectedStop = selectedId === item.id
                      return (
                        <li key={stop.tripListingId}>
                          <div
                            id={`plan-${item.id}`}
                            className={`rounded-lg border px-3 py-3 ${selectedStop ? 'border-amber-700' : 'border-stone-200'}`}
                            onClick={() => setSelectedId(item.id)}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                                  kind === 'unlocked' ? 'bg-teal-800' : kind === 'given' ? 'bg-stone-900' : 'bg-amber-800'
                                }`}
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h3 className="font-medium text-stone-900">{item.comuneName}</h3>
                                <p className="text-sm text-stone-500">
                                  {portalLabel(item.portal, item.url)}, {priorityLabel(item.priority)}
                                </p>
                                <p className="mt-1 text-sm text-stone-700">{driveText}</p>
                                <p className="text-sm text-stone-700">
                                  {fill(m.plan.arrive, {
                                    start: formatClock(stop.arrivalMinute),
                                    end: formatClock(stop.departureMinute),
                                  })}
                                </p>
                                {kind === 'unlocked' && item.unlocked && (
                                  <div className="mt-2">
                                    <p className="text-sm font-medium text-teal-900">{m.plan.unlocked}</p>
                                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                      <a className={buttonSecondary} href={appleMapsUrl(item.unlocked)} target="_blank" rel="noopener noreferrer">
                                        {m.plan.apple}
                                      </a>
                                      <a className={buttonSecondary} href={googleMapsUrl(item.unlocked)} target="_blank" rel="noopener noreferrer">
                                        {m.plan.google}
                                      </a>
                                    </div>
                                  </div>
                                )}
                                {kind === 'given' && (
                                  <p className="mt-1 text-sm text-stone-700">
                                    {m.plan.given}
                                    {item.givenAddress ? `: ${item.givenAddress}` : ''}
                                  </p>
                                )}
                                {kind === 'comune' && <p className="mt-1 text-sm text-stone-600">{m.plan.approximate}</p>}
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <a className={buttonQuiet} href={item.url} target="_blank" rel="noopener noreferrer">
                                    {m.trip.openListing}
                                  </a>
                                  <button type="button" className={buttonQuiet} onClick={() => drive.shift(item.id, -1)}>
                                    {m.plan.earlier}
                                  </button>
                                  <button type="button" className={buttonQuiet} onClick={() => drive.shift(item.id, 1)}>
                                    {m.plan.later}
                                  </button>
                                  <button
                                    type="button"
                                    className={buttonQuiet}
                                    aria-pressed={stop.locked}
                                    onClick={() => drive.toggleLock(item.id)}
                                  >
                                    {stop.locked ? m.plan.unlock : m.plan.lock}
                                  </button>
                                  <label className="flex items-center gap-2 text-sm text-stone-700">
                                    <span className="sr-only">{m.plan.move}</span>
                                    <select
                                      className="rounded-lg border border-stone-300 bg-white px-2 py-2"
                                      aria-label={m.plan.move}
                                      value={day.date}
                                      onChange={(event) => drive.move(item.id, event.target.value)}
                                    >
                                      {drive.plan?.days.map((option) => (
                                        <option key={option.date} value={option.date}>
                                          {formatDayHeading(option.date)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                  {day.stops.length > 0 && (
                    <p className="mt-3 text-sm text-stone-600">
                      {fill(
                        drive.source === 'openrouteservice' &&
                          byId.get(day.stops[day.stops.length - 1]?.tripListingId ?? '')?.unlocked
                          ? m.plan.returnLeg
                          : m.plan.returnAbout,
                        { time: formatDrive(day.returnDriveMinutes) },
                      )}
                    </p>
                  )}
                  {dayUrl && day.date === selected?.date && (
                    <a className={`${buttonQuiet} mt-2`} href={dayUrl} target="_blank" rel="noopener noreferrer">
                      {m.plan.dayGoogle}
                    </a>
                  )}
                </article>
              ))}

              {(drive.plan?.unscheduled.length ?? 0) > 0 && (
                <section className="rounded-lg border border-dashed border-stone-300 p-4">
                  <h2 className="text-base font-semibold text-stone-900">{m.plan.unscheduled}</h2>
                  <ul className="mt-2 flex flex-col gap-2">
                    {drive.plan?.unscheduled.map((item) => {
                      const stop = byId.get(item.tripListingId)
                      if (!stop) return null
                      return (
                        <li key={item.tripListingId} className="text-sm text-stone-700">
                          <span className="font-medium">{stop.comuneName}.</span> {reasonText(item.reason)}
                          <label className="ml-2">
                            <span className="sr-only">{m.plan.move}</span>
                            <select
                              className="rounded-lg border border-stone-300 bg-white px-2 py-1"
                              aria-label={m.plan.move}
                              value=""
                              onChange={(event) => {
                                if (event.target.value) drive.move(stop.id, event.target.value)
                              }}
                            >
                              <option value="">{m.plan.move}</option>
                              {drive.plan?.days.map((day) => (
                                <option key={day.date} value={day.date}>
                                  {formatDayHeading(day.date)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}
            </section>

            <section className="order-1 lg:sticky lg:top-16 lg:order-2">
              <h2 className="sr-only">{m.plan.mapHeading}</h2>
              <div className="h-40 sm:h-72 lg:h-[min(70vh,640px)]">
                <PlanMap
                  stops={mapStops}
                  start={draft ?? start}
                  route={routeLine}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  picking={picking}
                  onPick={(lat, lng) => setDraft({ label: m.plan.pinned, lat, lng })}
                />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{m.plan.legend}</p>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
