import { buildPlan, layOut, type Plan, type ScheduleContext, type SchedStop } from '../scheduler/schedule'
import type { StoredPlan } from './stored'

export type StopMeta = {
  id: string
  dwellMinutes: number
  priority: 1 | 2 | 3
}

function dwellOf(stops: StopMeta[]): (id: string) => number {
  const dwell = new Map(stops.map((stop) => [stop.id, stop.dwellMinutes]))
  return (id) => dwell.get(id) ?? 10
}

export function planToStored(plan: Plan, source: StoredPlan['source'], lunchStart: number, lunchEnd: number): StoredPlan {
  return {
    source,
    lunchStartMinute: lunchStart,
    lunchEndMinute: lunchEnd,
    days: plan.days.map((day) => ({
      date: day.date,
      driveMinutes: day.driveMinutes,
      returnDriveMinutes: day.returnDriveMinutes,
      ok: day.ok,
      reason: day.reason,
      stops: day.stops.map((stop) => ({
        tripListingId: stop.id,
        locked: stop.locked,
        driveMinutes: stop.driveMinutes,
        arrivalMinute: stop.arrivalMinute,
        departureMinute: stop.departureMinute,
      })),
    })),
    unscheduled: plan.unscheduled.map((item) => ({
      tripListingId: item.id,
      reason: item.reason,
    })),
  }
}

function routesOf(plan: StoredPlan): Record<string, string[]> {
  return Object.fromEntries(plan.days.map((day) => [day.date, day.stops.map((stop) => stop.tripListingId)]))
}

function lockedSet(plan: StoredPlan): Set<string> {
  const locked = new Set<string>()
  for (const day of plan.days) {
    for (const stop of day.stops) {
      if (stop.locked) locked.add(stop.tripListingId)
    }
  }
  return locked
}

export function retimeStored(plan: StoredPlan, ctx: ScheduleContext, stops: StopMeta[]): StoredPlan {
  const known = new Set(stops.map((stop) => stop.id))
  const routes: Record<string, string[]> = {}
  for (const day of ctx.days) {
    routes[day] = (routesOf(plan)[day] ?? []).filter((id) => known.has(id))
  }
  const placed = new Set(Object.values(routes).flat())
  const unscheduled = plan.unscheduled.filter((item) => known.has(item.tripListingId) && !placed.has(item.tripListingId))
  const laid = layOut(ctx, routes, lockedSet(plan), dwellOf(stops), [])
  return {
    ...planToStored(laid, plan.source, ctx.lunchStart, ctx.lunchEnd),
    unscheduled,
  }
}

/** Keep locks, drop listings that left the trip, and hold new ones aside. */
export function reconcile(plan: StoredPlan, stops: StopMeta[], ctx: ScheduleContext): StoredPlan {
  const known = new Set(stops.map((stop) => stop.id))
  const placed = new Set<string>()
  const days = ctx.days.map((date) => {
    const existing = plan.days.find((day) => day.date === date)
    const kept = (existing?.stops ?? []).filter((stop) => known.has(stop.tripListingId) && !placed.has(stop.tripListingId))
    for (const stop of kept) placed.add(stop.tripListingId)
    return {
      date,
      driveMinutes: existing?.driveMinutes ?? 0,
      returnDriveMinutes: existing?.returnDriveMinutes ?? 0,
      ok: existing?.ok ?? true,
      reason: existing?.reason ?? null,
      stops: kept,
    }
  })
  const unscheduled = plan.unscheduled.filter((item) => known.has(item.tripListingId) && !placed.has(item.tripListingId))
  for (const item of unscheduled) placed.add(item.tripListingId)
  for (const stop of stops) {
    if (!placed.has(stop.id)) unscheduled.push({ tripListingId: stop.id, reason: 'left_out' })
  }
  return retimeStored({ ...plan, days, unscheduled }, ctx, stops)
}

export function regenerate(plan: StoredPlan | null, ctx: ScheduleContext, stops: StopMeta[], source: StoredPlan['source']): StoredPlan {
  const position = new Map<string, { day: string; index: number }>()
  for (const day of plan?.days ?? []) {
    day.stops.forEach((stop, index) => {
      if (stop.locked) position.set(stop.tripListingId, { day: day.date, index })
    })
  }
  const sched: SchedStop[] = stops.map((stop) => {
    const fixed = position.get(stop.id)
    return {
      id: stop.id,
      dwellMinutes: stop.dwellMinutes,
      priority: stop.priority,
      lockedDay: fixed?.day ?? null,
      lockedPosition: fixed?.index ?? null,
    }
  })
  return planToStored(buildPlan(ctx, sched), source, ctx.lunchStart, ctx.lunchEnd)
}

function without(plan: StoredPlan, id: string): StoredPlan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      stops: day.stops.filter((stop) => stop.tripListingId !== id),
    })),
    unscheduled: plan.unscheduled.filter((item) => item.tripListingId !== id),
  }
}

export function moveToDay(plan: StoredPlan, id: string, day: string, ctx: ScheduleContext, stops: StopMeta[]): StoredPlan {
  const current = plan.days.flatMap((item) => item.stops).find((stop) => stop.tripListingId === id)
  const locked = current?.locked ?? false
  const next = without(plan, id)
  const target = next.days.find((item) => item.date === day)
  if (!target) return plan
  target.stops.push({
    tripListingId: id,
    locked,
    driveMinutes: 0,
    arrivalMinute: 0,
    departureMinute: 0,
  })
  return retimeStored(next, ctx, stops)
}

export function shiftStop(
  plan: StoredPlan,
  id: string,
  direction: -1 | 1,
  ctx: ScheduleContext,
  stops: StopMeta[],
): StoredPlan {
  const next: StoredPlan = {
    ...plan,
    days: plan.days.map((day) => ({ ...day, stops: day.stops.map((stop) => ({ ...stop })) })),
  }
  for (const day of next.days) {
    const index = day.stops.findIndex((stop) => stop.tripListingId === id)
    const swap = index + direction
    if (index < 0 || swap < 0 || swap >= day.stops.length) continue
    const [item] = day.stops.splice(index, 1)
    day.stops.splice(swap, 0, item)
  }
  return retimeStored(next, ctx, stops)
}

export function setLocked(plan: StoredPlan, id: string, locked: boolean): StoredPlan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      stops: day.stops.map((stop) => (stop.tripListingId === id ? { ...stop, locked } : stop)),
    })),
  }
}
