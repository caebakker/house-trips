import { inItalyBounds } from '../geo/italy'
import { straightLineMatrix, type MatrixPoint, type TravelMatrix } from './straightLine'

const ORS_URL = 'https://api.openrouteservice.org/v2/matrix/driving-car'

/**
 * Free Standard plan: 500 matrix requests a day, 40 a minute, and 3,500
 * origin-destination pairs in one request. A single call with at most 50
 * locations stays under that (50 x 50 = 2,500). Larger trips are tiled at
 * 25 by 25. Beyond 75 locations we do not call ORS at all.
 */
export const ORS_SINGLE_MAX = 50
export const ORS_TILE = 25
export const ORS_HARD_MAX = 75

export type RouteRequest = {
  tripId: string
  locations: MatrixPoint[]
}

const ID_PATTERN = /^[A-Za-z0-9-]{1,80}$/
const TRIP_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseRouteRequest(body: unknown): RouteRequest | null {
  if (!body || typeof body !== 'object') return null
  const record = body as { tripId?: unknown; locations?: unknown }
  if (typeof record.tripId !== 'string' || !TRIP_PATTERN.test(record.tripId)) return null
  if (!Array.isArray(record.locations) || record.locations.length < 1 || record.locations.length > ORS_HARD_MAX) {
    return null
  }
  const locations: MatrixPoint[] = []
  const seen = new Set<string>()
  for (const item of record.locations) {
    if (!item || typeof item !== 'object') return null
    const point = item as { id?: unknown; lat?: unknown; lng?: unknown }
    if (typeof point.id !== 'string' || !ID_PATTERN.test(point.id) || seen.has(point.id)) return null
    if (typeof point.lat !== 'number' || typeof point.lng !== 'number' || !inItalyBounds(point.lat, point.lng)) {
      return null
    }
    seen.add(point.id)
    locations.push({ id: point.id, lat: point.lat, lng: point.lng })
  }
  return { tripId: record.tripId, locations }
}

function chunks(count: number, size: number): number[][] {
  const groups: number[][] = []
  for (let index = 0; index < count; index += size) {
    const group: number[] = []
    for (let cursor = index; cursor < Math.min(count, index + size); cursor += 1) group.push(cursor)
    groups.push(group)
  }
  return groups
}

/** Tile pairs for a matrix larger than one ORS call. Each tile is at most 25 by 25. */
export function matrixTiles(count: number): Array<{ sources: number[]; destinations: number[] }> {
  const groups = chunks(count, ORS_TILE)
  const tiles: Array<{ sources: number[]; destinations: number[] }> = []
  for (const sources of groups) {
    for (const destinations of groups) tiles.push({ sources, destinations })
  }
  return tiles
}

function minutesFromSeconds(body: unknown, rows: number, cols: number): number[][] | null {
  if (!body || typeof body !== 'object' || !('durations' in body)) return null
  const durations = (body as { durations?: unknown }).durations
  if (!Array.isArray(durations) || durations.length !== rows) return null
  const minutes: number[][] = []
  for (const row of durations) {
    if (!Array.isArray(row) || row.length !== cols) return null
    const converted: number[] = []
    for (const cell of row) {
      if (typeof cell !== 'number' || !Number.isFinite(cell) || cell < 0) return null
      converted.push(cell === 0 ? 0 : Math.max(1, Math.round(cell / 60)))
    }
    minutes.push(converted)
  }
  return minutes
}

async function postMatrix(
  locations: [number, number][],
  sources: number[] | null,
  destinations: number[] | null,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<number[][] | null> {
  const payload: Record<string, unknown> = { locations, metrics: ['duration'] }
  if (sources) payload.sources = sources
  if (destinations) payload.destinations = destinations
  const response = await fetchImpl(ORS_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) return null
  const rows = sources ? sources.length : locations.length
  const cols = destinations ? destinations.length : locations.length
  return minutesFromSeconds(await response.json(), rows, cols)
}

/**
 * Road minutes from ORS, or null when the key is missing, the trip is too
 * big, or ORS does not answer. The caller then uses the straight-line matrix.
 * Coordinates are whatever the caller already decided the buyer may see.
 */
export async function orsMatrix(
  points: MatrixPoint[],
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<number[][] | null> {
  const key = apiKey.trim()
  if (!key || points.length === 0 || points.length > ORS_HARD_MAX) return null
  const blank = points.map(() => points.map(() => 0))

  if (points.length <= ORS_SINGLE_MAX) {
    const locations = points.map((point) => [point.lng, point.lat] as [number, number])
    return postMatrix(locations, null, null, key, fetchImpl)
  }

  for (const tile of matrixTiles(points.length)) {
    const used = [...new Set([...tile.sources, ...tile.destinations])]
    const local = new Map(used.map((global, index) => [global, index]))
    const locations = used.map((index) => [points[index].lng, points[index].lat] as [number, number])
    const sources = tile.sources.map((index) => local.get(index) ?? 0)
    const destinations = tile.destinations.map((index) => local.get(index) ?? 0)
    const block = await postMatrix(locations, sources, destinations, key, fetchImpl)
    if (!block) return null
    tile.sources.forEach((source, sourceIndex) => {
      tile.destinations.forEach((destination, destinationIndex) => {
        blank[source][destination] = block[sourceIndex]?.[destinationIndex] ?? 0
      })
    })
  }
  return blank
}

export async function matrixForPoints(
  points: MatrixPoint[],
  apiKey: string | undefined,
  fetchImpl: typeof fetch,
): Promise<TravelMatrix> {
  const fallback = straightLineMatrix(points)
  if (!apiKey?.trim()) return fallback
  const minutes = await orsMatrix(points, apiKey, fetchImpl)
  if (!minutes) return fallback
  return { source: 'openrouteservice', ids: points.map((point) => point.id), minutes }
}
