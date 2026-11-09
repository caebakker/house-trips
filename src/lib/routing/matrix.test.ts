import { describe, expect, it, vi } from 'vitest'
import { handleRouteMatrix } from './handle'
import { matrixTiles, orsMatrix, parseRouteRequest } from './ors'
import { straightLineMatrix, straightLineMinutes, ROAD_FACTOR, ASSUMED_SPEED_KMH, haversineKm } from './straightLine'

const tripId = '11111111-1111-4111-8111-111111111111'

function point(id: string, lat: number, lng: number) {
  return { id, lat, lng }
}

describe('straight-line fallback', () => {
  it('is zero for the same point and scales with distance', () => {
    expect(straightLineMinutes({ lat: 44.7, lng: 8 }, { lat: 44.7, lng: 8 })).toBe(0)
    const km = haversineKm({ lat: 44.7, lng: 8 }, { lat: 45.7, lng: 8 })
    const expected = Math.max(1, Math.round(((km * ROAD_FACTOR) / ASSUMED_SPEED_KMH) * 60))
    expect(straightLineMinutes({ lat: 44.7, lng: 8 }, { lat: 45.7, lng: 8 })).toBe(expected)
    expect(expected).toBeGreaterThan(60)
  })
})

describe('ORS matrix batches', () => {
  it('uses one tile group under the free-tier pair cap', () => {
    const tiles = matrixTiles(60)
    expect(tiles.length).toBe(9)
    for (const tile of tiles) {
      expect(tile.sources.length).toBeLessThanOrEqual(25)
      expect(tile.destinations.length).toBeLessThanOrEqual(25)
      expect(tile.sources.length * tile.destinations.length).toBeLessThanOrEqual(2500)
    }
  })

  it('parses one matrix response into minutes', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ durations: [[0, 120], [180, 0]] }), { status: 200 }),
    )
    const minutes = await orsMatrix(
      [point('start', 44.7, 8.03), point('bra', 44.71, 7.83)],
      'test-key',
      fetchImpl as typeof fetch,
    )
    expect(minutes).toEqual([
      [0, 2],
      [3, 0],
    ])
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const init = call[1]
    expect((init.headers as Record<string, string>).Authorization).toBe('test-key')
    const body = JSON.parse(String(init.body)) as { locations: number[][]; metrics: string[] }
    expect(body.metrics).toEqual(['duration'])
    expect(body.locations[0]).toEqual([8.03, 44.7])
  })

  it('tiles a trip that is larger than 50 locations', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        sources?: number[]
        destinations?: number[]
        locations: number[][]
      }
      const rows = body.sources?.length ?? body.locations.length
      const cols = body.destinations?.length ?? body.locations.length
      return new Response(JSON.stringify({ durations: Array.from({ length: rows }, () => Array(cols).fill(60)) }), {
        status: 200,
      })
    })
    const points = Array.from({ length: 60 }, (_, index) => point(`p${index}`, 44.7, 8 + index * 0.01))
    const minutes = await orsMatrix(points, 'test-key', fetchImpl as typeof fetch)
    expect(fetchImpl).toHaveBeenCalledTimes(9)
    expect(minutes).toHaveLength(60)
    expect(minutes?.[0][1]).toBe(1)
  })

  it('returns null when ORS rejects the call', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 429 }))
    const minutes = await orsMatrix([point('start', 44.7, 8)], 'test-key', fetchImpl as typeof fetch)
    expect(minutes).toBeNull()
  })
})

describe('route matrix endpoint', () => {
  const locations = [point('start', 44.7, 8.03), point('bra', 44.71, 7.83)]

  function request(body: unknown, token = 'token') {
    return new Request('https://guidocasa.test/api/route-matrix', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(body),
    })
  }

  it('refuses a caller who is not signed in', async () => {
    const response = await handleRouteMatrix(request({ tripId, locations }, ''), {
      env: () => undefined,
      fetch: vi.fn() as typeof fetch,
    })
    expect(response.status).toBe(401)
  })

  it('refuses a buyer who is not on the trip', async () => {
    const fetchImpl = vi.fn(async () => new Response('false', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const response = await handleRouteMatrix(request({ tripId, locations }), {
      env: (name) => (name === 'SUPABASE_URL' ? 'https://example.supabase.co' : name === 'SUPABASE_PUBLISHABLE_KEY' ? 'key' : undefined),
      fetch: fetchImpl as typeof fetch,
    })
    expect(response.status).toBe(403)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('uses straight-line minutes when no ORS key is set', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes('is_trip_member')) return new Response('true', { status: 200 })
      throw new Error('ORS should not be called')
    })
    const response = await handleRouteMatrix(request({ tripId, locations }), {
      env: (name) => {
        if (name === 'SUPABASE_URL') return 'https://example.supabase.co'
        if (name === 'SUPABASE_PUBLISHABLE_KEY') return 'key'
        return undefined
      },
      fetch: fetchImpl as typeof fetch,
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { source: string; minutes: number[][] }
    expect(body.source).toBe('straight_line')
    expect(body.minutes).toEqual(straightLineMatrix(locations).minutes)
  })

  it('rejects coordinates outside Italy', () => {
    expect(parseRouteRequest({ tripId, locations: [point('start', 51.5, -0.1)] })).toBeNull()
  })
})
