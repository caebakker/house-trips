import { getTimes } from 'suncalc'

const ROME = 'Europe/Rome'

export type Window = { start: number; end: number }

export function minutesInRome(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ROME,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return Number.NaN
  if (hour === 24) return minute
  return hour * 60 + minute
}

/** Offset of Europe/Rome at noon UTC on this calendar day, in minutes. */
export function romeOffsetMinutes(isoDate: string): number {
  return minutesInRome(new Date(`${isoDate}T12:00:00Z`)) - 12 * 60
}

/**
 * Sunrise and sunset in minutes from midnight, Europe/Rome.
 * Null when the sun does not rise and set that day.
 */
export function daylightMinutes(
  isoDate: string,
  lat: number,
  lng: number,
): { sunrise: number; sunset: number } | null {
  const times = getTimes(new Date(`${isoDate}T12:00:00Z`), lat, lng, 0, romeOffsetMinutes(isoDate))
  if (!times.sunrise || !times.sunset) return null
  const sunrise = minutesInRome(times.sunrise)
  const sunset = minutesInRome(times.sunset)
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunset <= sunrise) return null
  return { sunrise, sunset }
}

/** Daylight with the lunch closure removed. Visits do not cross the break. */
export function openWindows(
  sunrise: number,
  sunset: number,
  lunchStart: number,
  lunchEnd: number,
): Window[] {
  if (!(sunset > sunrise)) return []
  const lunchOverlaps = lunchEnd > lunchStart && lunchEnd > sunrise && lunchStart < sunset
  if (!lunchOverlaps) return [{ start: sunrise, end: sunset }]
  const windows: Window[] = []
  if (lunchStart > sunrise) windows.push({ start: sunrise, end: Math.min(lunchStart, sunset) })
  if (lunchEnd < sunset) windows.push({ start: Math.max(lunchEnd, sunrise), end: sunset })
  return windows.filter((window) => window.end > window.start)
}

export function formatClock(minute: number): string {
  const rounded = Math.round(minute)
  const day = 24 * 60
  const wrapped = ((rounded % day) + day) % day
  const hour = Math.floor(wrapped / 60)
  const mins = wrapped % 60
  return `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function formatDrive(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  if (rounded < 60) return `${rounded} min`
  const hour = Math.floor(rounded / 60)
  const mins = rounded % 60
  if (mins === 0) return hour === 1 ? '1 hour' : `${hour} hours`
  return `${hour} h ${mins} min`
}
