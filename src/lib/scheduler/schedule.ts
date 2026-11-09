import { openWindows, type Window } from './time'

export const START_ID = 'start'

export type SkipReason = 'over_drive_limit' | 'no_daylight' | 'outside_trip'

export type SchedStop = {
  id: string
  dwellMinutes: number
  priority: 1 | 2 | 3
  lockedDay: string | null
  lockedPosition: number | null
}

export type ScheduleContext = {
  days: string[]
  travel: (from: string, to: string) => number
  maxDriveMinutes: number
  lunchStart: number
  lunchEnd: number
  daylight: Record<string, { sunrise: number; sunset: number }>
}

export type PlanLeg = {
  id: string
  driveMinutes: number
  arrivalMinute: number
  departureMinute: number
}

export type TimedRoute = {
  ok: boolean
  reason: SkipReason | null
  stops: PlanLeg[]
  driveMinutes: number
  returnDriveMinutes: number
}

export type PlanStop = PlanLeg & { locked: boolean }

export type PlanDay = {
  date: string
  stops: PlanStop[]
  driveMinutes: number
  returnDriveMinutes: number
  ok: boolean
  reason: SkipReason | null
}

export type Plan = {
  days: PlanDay[]
  unscheduled: { id: string; reason: SkipReason }[]
}

function windowsFor(ctx: ScheduleContext, day: string): Window[] {
  const light = ctx.daylight[day]
  if (!light) return []
  return openWindows(light.sunrise, light.sunset, ctx.lunchStart, ctx.lunchEnd)
}

function take(ready: number, duration: number, windows: Window[]): { start: number; end: number } | null {
  for (const window of windows) {
    const start = Math.max(ready, window.start)
    if (start + duration <= window.end) return { start, end: start + duration }
  }
  return null
}

/** Clock times for a fixed order. Driving includes the return to the start. */
export function timeRoute(
  ctx: ScheduleContext,
  day: string,
  stopIds: string[],
  dwellOf: (id: string) => number,
): TimedRoute {
  const windows = windowsFor(ctx, day)
  let ready = windows[0]?.start ?? 8 * 60
  let overflow = windows.length === 0
  let driveSum = 0
  let location = START_ID
  const stops: PlanLeg[] = []

  for (const id of stopIds) {
    const drive = Math.max(0, Math.round(ctx.travel(location, id)))
    driveSum += drive
    const driveFit = take(ready, drive, windows)
    if (!driveFit) overflow = true
    const arrived = driveFit ? driveFit.end : ready + drive
    const dwell = Math.max(1, Math.round(dwellOf(id)))
    const dwellFit = take(driveFit ? driveFit.end : arrived, dwell, windows)
    if (!dwellFit) overflow = true
    const arrivalMinute = dwellFit ? dwellFit.start : arrived
    const departureMinute = dwellFit ? dwellFit.end : arrivalMinute + dwell
    stops.push({ id, driveMinutes: drive, arrivalMinute, departureMinute })
    ready = departureMinute
    location = id
  }

  const returnDriveMinutes = Math.max(0, Math.round(ctx.travel(location, START_ID)))
  driveSum += returnDriveMinutes
  if (!take(ready, returnDriveMinutes, windows)) overflow = true

  const overDrive = driveSum > ctx.maxDriveMinutes
  const ok = !overflow && !overDrive
  const reason: SkipReason | null = ok ? null : overDrive ? 'over_drive_limit' : 'no_daylight'
  return { ok, reason, stops, driveMinutes: driveSum, returnDriveMinutes }
}

function dwellMap(stops: SchedStop[]): (id: string) => number {
  const dwell = new Map(stops.map((stop) => [stop.id, stop.dwellMinutes]))
  return (id) => dwell.get(id) ?? 10
}

function asDays(planDays: Map<string, string[]>, ctx: ScheduleContext, locked: Set<string>, dwellOf: (id: string) => number): PlanDay[] {
  return ctx.days.map((date) => {
    const ids = planDays.get(date) ?? []
    const timed = timeRoute(ctx, date, ids, dwellOf)
    return {
      date,
      driveMinutes: timed.driveMinutes,
      returnDriveMinutes: timed.returnDriveMinutes,
      ok: timed.ok,
      reason: timed.reason,
      stops: timed.stops.map((stop) => ({ ...stop, locked: locked.has(stop.id) })),
    }
  })
}

/**
 * Assign stops to days. Locked stops stay on their day and in their order.
 * Must-see houses are placed first. Each other house joins the day that
 * already has the closest stop, so a trip splits into sensible areas.
 */
export function buildPlan(ctx: ScheduleContext, stops: SchedStop[]): Plan {
  const days = [...ctx.days]
  const routes = new Map<string, string[]>(days.map((day) => [day, []]))
  const known = new Set(stops.map((stop) => stop.id))
  const locked = new Set<string>()
  const lockedOnDay = new Map<string, SchedStop[]>()
  const unscheduled: { id: string; reason: SkipReason }[] = []
  const dwellOf = dwellMap(stops)

  for (const stop of stops) {
    if (!stop.lockedDay) continue
    if (!routes.has(stop.lockedDay)) {
      unscheduled.push({ id: stop.id, reason: 'outside_trip' })
      continue
    }
    locked.add(stop.id)
    const group = lockedOnDay.get(stop.lockedDay) ?? []
    group.push(stop)
    lockedOnDay.set(stop.lockedDay, group)
  }

  for (const [day, group] of lockedOnDay) {
    const ordered = group
      .slice()
      .sort(
        (a, b) =>
          (a.lockedPosition ?? 0) - (b.lockedPosition ?? 0) || a.id.localeCompare(b.id),
      )
      .map((stop) => stop.id)
    routes.set(day, ordered)
  }

  const free = stops
    .filter((stop) => !stop.lockedDay && known.has(stop.id))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        ctx.travel(START_ID, a.id) - ctx.travel(START_ID, b.id) ||
        a.id.localeCompare(b.id),
    )

  const nearestDay = (day: string, stopId: string): number => {
    const current = routes.get(day) ?? []
    if (current.length === 0) return ctx.travel(START_ID, stopId)
    return Math.min(...current.map((id) => ctx.travel(id, stopId)))
  }

  const place = (stop: SchedStop): SkipReason | null => {
    let sawDrive = false
    let sawDaylight = false
    const ranked = days
      .map((day) => ({ day, near: nearestDay(day, stop.id) }))
      .sort((a, b) => a.near - b.near || a.day.localeCompare(b.day))
    for (const { day } of ranked) {
      const current = routes.get(day) ?? []
      const base = timeRoute(ctx, day, current, dwellOf)
      if (!base.ok && current.length > 0) {
        if (base.reason === 'over_drive_limit') sawDrive = true
        if (base.reason === 'no_daylight') sawDaylight = true
        continue
      }
      let bestIndex = -1
      let bestAdded = Number.POSITIVE_INFINITY
      for (let index = 0; index <= current.length; index += 1) {
        const next = current.slice()
        next.splice(index, 0, stop.id)
        const timed = timeRoute(ctx, day, next, dwellOf)
        if (!timed.ok) {
          if (timed.reason === 'over_drive_limit') sawDrive = true
          if (timed.reason === 'no_daylight') sawDaylight = true
          continue
        }
        const added = timed.driveMinutes - (base.ok ? base.driveMinutes : 0)
        if (added < bestAdded) {
          bestAdded = added
          bestIndex = index
        }
      }
      if (bestIndex >= 0) {
        routes.get(day)?.splice(bestIndex, 0, stop.id)
        return null
      }
    }
    return sawDrive ? 'over_drive_limit' : sawDaylight ? 'no_daylight' : 'no_daylight'
  }

  for (const stop of free) {
    const reason = place(stop)
    if (reason) unscheduled.push({ id: stop.id, reason })
  }

  return { days: asDays(routes, ctx, locked, dwellOf), unscheduled }
}

export function layOut(
  ctx: ScheduleContext,
  routes: Record<string, string[]>,
  locked: Set<string>,
  dwellOf: (id: string) => number,
  unscheduled: { id: string; reason: SkipReason }[],
): Plan {
  const planDays = new Map(ctx.days.map((day) => [day, routes[day] ?? []]))
  return { days: asDays(planDays, ctx, locked, dwellOf), unscheduled }
}
