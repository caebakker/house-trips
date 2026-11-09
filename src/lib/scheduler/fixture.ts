import { straightLineMatrix, travelFromMatrix } from '../routing/straightLine'
import { START_ID } from './schedule'
import { daylightMinutes } from './time'

export type FixtureStop = {
  id: string
  name: string
  cluster: 'west' | 'east'
  priority: 1 | 2 | 3
  lat: number
  lng: number
  comuneLat: number
  comuneLng: number
  unlocked: boolean
  givenAddress: string | null
}

/** Ten Langhe listings, two days, start in Alba. West and east of the town. */
export const LANGHE_START = { lat: 44.6879, lng: 8.0309 }
export const LANGHE_DAYS = ['2026-11-10', '2026-11-11']
export const LANGHE_MAX_DRIVE = 180

export const LANGHE_STOPS: FixtureStop[] = [
  { id: 'bra', name: 'Bra', cluster: 'west', priority: 1, lat: 44.711, lng: 7.829, comuneLat: 44.7071, comuneLng: 7.825, unlocked: true, givenAddress: null },
  { id: 'sommariva', name: 'Sommariva del Bosco', cluster: 'west', priority: 2, lat: 44.7736, lng: 7.7811, comuneLat: 44.7736, comuneLng: 7.7811, unlocked: false, givenAddress: null },
  { id: 'cherasco', name: 'Cherasco', cluster: 'west', priority: 2, lat: 44.6454, lng: 7.8327, comuneLat: 44.6454, comuneLng: 7.8327, unlocked: false, givenAddress: 'Via Roma 12, Cherasco' },
  { id: 'morra', name: 'La Morra', cluster: 'west', priority: 2, lat: 44.6474, lng: 7.9318, comuneLat: 44.6474, comuneLng: 7.9318, unlocked: false, givenAddress: null },
  { id: 'barolo', name: 'Barolo', cluster: 'west', priority: 3, lat: 44.615, lng: 7.9415, comuneLat: 44.615, comuneLng: 7.9415, unlocked: false, givenAddress: null },
  { id: 'neive', name: 'Neive', cluster: 'east', priority: 2, lat: 44.7279, lng: 8.1157, comuneLat: 44.7279, comuneLng: 8.1157, unlocked: false, givenAddress: null },
  { id: 'govone', name: 'Govone', cluster: 'east', priority: 2, lat: 44.7946, lng: 8.1038, comuneLat: 44.7946, comuneLng: 8.1038, unlocked: false, givenAddress: null },
  { id: 'castiglione', name: 'Castiglione Tinella', cluster: 'east', priority: 2, lat: 44.7305, lng: 8.1918, comuneLat: 44.7305, comuneLng: 8.1918, unlocked: false, givenAddress: null },
  { id: 'santo-stefano', name: 'Santo Stefano Belbo', cluster: 'east', priority: 2, lat: 44.7045, lng: 8.2194, comuneLat: 44.7045, comuneLng: 8.2194, unlocked: false, givenAddress: null },
  { id: 'canelli', name: 'Canelli', cluster: 'east', priority: 1, lat: 44.7221, lng: 8.2829, comuneLat: 44.7221, comuneLng: 8.2829, unlocked: false, givenAddress: null },
]

export function langheContext() {
  const points = [
    { id: START_ID, ...LANGHE_START },
    ...LANGHE_STOPS.map((stop) => ({
      id: stop.id,
      lat: stop.unlocked ? stop.lat : stop.comuneLat,
      lng: stop.unlocked ? stop.lng : stop.comuneLng,
    })),
  ]
  const matrix = straightLineMatrix(points)
  const daylight: Record<string, { sunrise: number; sunset: number }> = {}
  for (const day of LANGHE_DAYS) {
    const light = daylightMinutes(day, LANGHE_START.lat, LANGHE_START.lng)
    if (!light) throw new Error(`no daylight for ${day}`)
    daylight[day] = light
  }
  return {
    days: LANGHE_DAYS,
    travel: travelFromMatrix(matrix),
    maxDriveMinutes: LANGHE_MAX_DRIVE,
    lunchStart: 12 * 60 + 30,
    lunchEnd: 15 * 60,
    daylight,
  }
}
