import { useEffect, useRef, useState } from 'react'
import { eachDate } from '../dates'
import { START_ID, type ScheduleContext } from '../scheduler/schedule'
import { daylightMinutes } from '../scheduler/time'
import { straightLineMatrix, travelFromMatrix, type MatrixPoint, type TravelMatrix } from '../routing/straightLine'
import { moveToDay, reconcile, regenerate, retimeStored, setLocked, shiftStop, type StopMeta } from './edit'
import { routingPoint, type LatLng } from './points'
import type { StoredPlan } from './stored'

export type PlanListing = StopMeta & {
  zone: LatLng
  given: LatLng | null
  unlocked: LatLng | null
}

type Options = {
  startDate: string
  endDate: string
  maxDriveMinutes: number
  start: LatLng | null
  lunchStart: number
  lunchEnd: number
  listings: PlanListing[]
  initialPlan: StoredPlan | null
  resolveMatrix?: (points: MatrixPoint[]) => Promise<TravelMatrix>
  onPlan?: (plan: StoredPlan) => void
}

function pointsOf(start: LatLng, listings: PlanListing[]): MatrixPoint[] {
  return [
    { id: START_ID, lat: start.lat, lng: start.lng },
    ...listings.map((listing) => {
      const route = routingPoint({
        unlocked: listing.unlocked,
        given: listing.given,
        comune: listing.zone,
      })
      return { id: listing.id, lat: route.point.lat, lng: route.point.lng }
    }),
  ]
}

function contextOf(
  options: Options,
  travel: (from: string, to: string) => number,
): ScheduleContext {
  const days = eachDate(options.startDate, options.endDate)
  const daylight: ScheduleContext['daylight'] = {}
  const origin = options.start ?? { lat: 44.7, lng: 8 }
  for (const day of days) {
    daylight[day] = daylightMinutes(day, origin.lat, origin.lng) ?? { sunrise: 8 * 60, sunset: 17 * 60 }
  }
  return {
    days,
    travel,
    maxDriveMinutes: options.maxDriveMinutes,
    lunchStart: options.lunchStart,
    lunchEnd: options.lunchEnd,
    daylight,
  }
}

export function useDrivePlan(options: Options) {
  const [plan, setPlan] = useState<StoredPlan | null>(null)
  const [source, setSource] = useState<StoredPlan['source'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const planRef = useRef<StoredPlan | null>(null)
  const ctxRef = useRef<ScheduleContext | null>(null)
  const metaRef = useRef<StopMeta[]>([])
  const appliedPoints = useRef('')
  const onPlanRef = useRef(options.onPlan)
  const initialRef = useRef(options.initialPlan)
  const resolveRef = useRef(options.resolveMatrix)
  onPlanRef.current = options.onPlan
  resolveRef.current = options.resolveMatrix
  metaRef.current = options.listings.map((listing) => ({
    id: listing.id,
    dwellMinutes: listing.dwellMinutes,
    priority: listing.priority,
  }))

  const pointsKey = options.start
    ? pointsOf(options.start, options.listings)
        .map((point) => {
          const listing = options.listings.find((item) => item.id === point.id)
          return `${point.id}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}:${listing?.priority ?? ''}:${listing?.dwellMinutes ?? ''}`
        })
        .join('|')
    : ''
  const timingKey = `${options.startDate}|${options.endDate}|${options.maxDriveMinutes}|${options.lunchStart}|${options.lunchEnd}`

  useEffect(() => {
    if (!options.start) {
      setBusy(false)
      return
    }
    const start = options.start
    let cancelled = false
    setBusy(true)
    setFailed(false)
    const points = pointsOf(start, options.listings)
    const load = resolveRef.current ? resolveRef.current(points) : Promise.resolve(straightLineMatrix(points))
    load
      .then((matrix) => {
        if (cancelled) return
        const travel = travelFromMatrix(matrix)
        const ctx = contextOf({ ...options, start }, travel)
        ctxRef.current = ctx
        const meta = metaRef.current
        const current = planRef.current
        const next = !current
          ? initialRef.current
            ? reconcile({ ...initialRef.current, source: matrix.source }, meta, ctx)
            : regenerate(null, ctx, meta, matrix.source)
          : pointsKey !== appliedPoints.current
            ? regenerate(current, ctx, meta, matrix.source)
            : retimeStored({ ...current, source: matrix.source }, ctx, meta)
        appliedPoints.current = pointsKey
        planRef.current = next
        setPlan(next)
        setSource(matrix.source)
        onPlanRef.current?.(next)
      })
      .catch((err: unknown) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
    // The matrix is rebuilt when the route inputs change. Edits go through commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, timingKey])

  function commit(next: StoredPlan) {
    planRef.current = next
    setPlan(next)
    onPlanRef.current?.(next)
  }

  function withContext(update: (current: StoredPlan, ctx: ScheduleContext, meta: StopMeta[]) => StoredPlan) {
    const current = planRef.current
    const ctx = ctxRef.current
    if (!current || !ctx) return
    commit(update(current, ctx, metaRef.current))
  }

  return {
    plan,
    source,
    busy,
    failed,
    move(id: string, day: string) {
      withContext((current, ctx, meta) => moveToDay(current, id, day, ctx, meta))
    },
    shift(id: string, direction: -1 | 1) {
      withContext((current, ctx, meta) => shiftStop(current, id, direction, ctx, meta))
    },
    toggleLock(id: string) {
      const current = planRef.current
      if (!current) return
      const locked = current.days.some((day) => day.stops.some((stop) => stop.tripListingId === id && stop.locked))
      commit(setLocked(current, id, !locked))
    },
    regenerate() {
      withContext((current, ctx, meta) => regenerate(current, ctx, meta, current.source))
    },
  }
}
