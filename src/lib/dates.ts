/** Calendar date in Europe/Rome, as YYYY-MM-DD. */
export function romeToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now)
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** UK English calendar date. Noon UTC keeps the calendar day in Europe/Rome. */
export function formatTripDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Rome',
  }).format(new Date(`${isoDate}T12:00:00Z`))
}

export function eachDate(startIso: string, endIso: string): string[] {
  const dates: string[] = []
  let cursor = startIso
  while (cursor <= endIso && dates.length <= 61) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

export function formatDayHeading(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  }).format(new Date(`${isoDate}T12:00:00Z`))
}

/** UK English date and 24-hour time in Europe/Rome. */
export function formatRomeDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/Rome',
  }).format(new Date(iso))
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}
