export type MatrixPoint = { id: string; lat: number; lng: number }

export type TravelMatrix = {
  source: 'openrouteservice' | 'straight_line'
  ids: string[]
  minutes: number[][]
}

/** Rural roads are longer than the straight line, and slower than a motorway. */
export const ROAD_FACTOR = 1.4
export const ASSUMED_SPEED_KMH = 45

const EARTH_KM = 6371

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = radians(b.lat - a.lat)
  const dLng = radians(b.lng - a.lng)
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h =
    sinLat * sinLat +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * sinLng * sinLng
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Minutes for the straight-line fallback. Same point is zero. Any real gap is at least 1. */
export function straightLineMinutes(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const km = haversineKm(a, b) * ROAD_FACTOR
  if (km < 0.05) return 0
  return Math.max(1, Math.round((km / ASSUMED_SPEED_KMH) * 60))
}

export function straightLineMatrix(points: MatrixPoint[]): TravelMatrix {
  return {
    source: 'straight_line',
    ids: points.map((point) => point.id),
    minutes: points.map((from) => points.map((to) => straightLineMinutes(from, to))),
  }
}

export function travelFromMatrix(matrix: TravelMatrix): (from: string, to: string) => number {
  const index = new Map(matrix.ids.map((id, position) => [id, position]))
  return (from, to) => {
    const row = index.get(from)
    const column = index.get(to)
    if (row == null || column == null) return 24 * 60
    return matrix.minutes[row]?.[column] ?? 24 * 60
  }
}
