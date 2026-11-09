import type { SkipReason } from '../scheduler/schedule'

export type MatrixSource = 'openrouteservice' | 'straight_line'

export type StoredReason = SkipReason | 'left_out'

export type StoredStop = {
  tripListingId: string
  locked: boolean
  driveMinutes: number
  arrivalMinute: number
  departureMinute: number
}

export type StoredDay = {
  date: string
  driveMinutes: number
  returnDriveMinutes: number
  ok: boolean
  reason: StoredReason | null
  stops: StoredStop[]
}

export type StoredPlan = {
  source: MatrixSource
  lunchStartMinute: number
  lunchEndMinute: number
  days: StoredDay[]
  unscheduled: { tripListingId: string; reason: StoredReason }[]
}

const REASONS = new Set<StoredReason>(['over_drive_limit', 'no_daylight', 'outside_trip', 'left_out'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[A-Za-z0-9-]{1,80}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function reasonOf(value: unknown): StoredReason | null {
  if (value === null) return null
  if (typeof value === 'string' && REASONS.has(value as StoredReason)) return value as StoredReason
  return null
}

function stopOf(value: unknown): StoredStop | null {
  if (!isRecord(value)) return null
  if ('lat' in value || 'lng' in value || 'coordinates' in value) return null
  if (typeof value.tripListingId !== 'string' || !ID.test(value.tripListingId)) return null
  if (typeof value.locked !== 'boolean') return null
  if (
    typeof value.driveMinutes !== 'number' ||
    typeof value.arrivalMinute !== 'number' ||
    typeof value.departureMinute !== 'number'
  ) {
    return null
  }
  return {
    tripListingId: value.tripListingId,
    locked: value.locked,
    driveMinutes: value.driveMinutes,
    arrivalMinute: value.arrivalMinute,
    departureMinute: value.departureMinute,
  }
}

function dayOf(value: unknown): StoredDay | null {
  if (!isRecord(value)) return null
  if (typeof value.date !== 'string' || !DATE.test(value.date)) return null
  if (typeof value.driveMinutes !== 'number' || typeof value.returnDriveMinutes !== 'number') return null
  if (typeof value.ok !== 'boolean') return null
  const reason = reasonOf(value.reason)
  if (value.reason !== null && reason === null) return null
  if (!Array.isArray(value.stops)) return null
  const stops: StoredStop[] = []
  for (const stop of value.stops) {
    const parsed = stopOf(stop)
    if (!parsed) return null
    stops.push(parsed)
  }
  return {
    date: value.date,
    driveMinutes: value.driveMinutes,
    returnDriveMinutes: value.returnDriveMinutes,
    ok: value.ok,
    reason,
    stops,
  }
}

/** Reject anything that is not the buyer-visible plan, including a coordinate field. */
export function parseStoredPlan(value: unknown): StoredPlan | null {
  if (!isRecord(value)) return null
  if (value.source !== 'openrouteservice' && value.source !== 'straight_line') return null
  if (typeof value.lunchStartMinute !== 'number' || typeof value.lunchEndMinute !== 'number') return null
  if (!Array.isArray(value.days) || !Array.isArray(value.unscheduled)) return null
  const days: StoredDay[] = []
  for (const day of value.days) {
    const parsed = dayOf(day)
    if (!parsed) return null
    days.push(parsed)
  }
  const unscheduled: StoredPlan['unscheduled'] = []
  for (const item of value.unscheduled) {
    if (!isRecord(item)) return null
    if (typeof item.tripListingId !== 'string' || !ID.test(item.tripListingId)) return null
    const reason = reasonOf(item.reason)
    if (!reason) return null
    unscheduled.push({ tripListingId: item.tripListingId, reason })
  }
  return {
    source: value.source,
    lunchStartMinute: value.lunchStartMinute,
    lunchEndMinute: value.lunchEndMinute,
    days,
    unscheduled,
  }
}
