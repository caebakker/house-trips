const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function validTripName(name: string): boolean {
  const trimmed = name.trim()
  return trimmed.length >= 1 && trimmed.length <= 120
}

export function tripSpanError(start: string, end: string): 'order' | 'span' | null {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) return 'order'
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000
  if (!Number.isFinite(days) || days > 60) return 'span'
  return null
}

/** Hours the buyer typed, stored as whole minutes between 30 and 720. */
export function hoursToDriveMinutes(value: string): number | null {
  const hours = Number(value.trim().replace(',', '.'))
  if (!Number.isFinite(hours)) return null
  const minutes = Math.round(hours * 60)
  if (minutes < 30 || minutes > 720) return null
  return minutes
}

export function parseDwellMinutes(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const minutes = Number(trimmed)
  if (minutes < 1 || minutes > 240) return null
  return minutes
}
