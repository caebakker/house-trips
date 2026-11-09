import { describe, expect, it } from 'vitest'
import { parseStoredPlan } from './stored'
import { appleMapsUrl, googleDayUrl, googleMapsUrl, routingPoint } from './points'

describe('routing points', () => {
  const comune = { lat: 44.7, lng: 8.03 }
  const given = { lat: 44.71, lng: 8.04 }
  const unlocked = { lat: 44.701234, lng: 8.035678 }

  it('uses the comune centre when the house is not unlocked', () => {
    expect(routingPoint({ unlocked: null, given: null, comune })).toEqual({ point: comune, kind: 'comune' })
  })

  it('uses the address the buyer typed when they have not unlocked the house', () => {
    expect(routingPoint({ unlocked: null, given, comune })).toEqual({ point: given, kind: 'given' })
  })

  it('uses the unlocked pin only when one was passed in', () => {
    expect(routingPoint({ unlocked, given, comune })).toEqual({ point: unlocked, kind: 'unlocked' })
  })
})

describe('map links', () => {
  const pin = { lat: 44.701234, lng: 8.035678 }

  it('opens Apple Maps and Google Maps on the coordinates, with no address', () => {
    const apple = appleMapsUrl(pin)
    const google = googleMapsUrl(pin)
    expect(apple).toBe('https://maps.apple.com/?ll=44.701234,8.035678&q=44.701234,8.035678')
    expect(google).toContain('query=44.701234%2C8.035678')
    expect(apple).not.toMatch(/via|street|address/i)
    expect(google).not.toMatch(/via|street|address/i)
  })

  it('builds a day route from the safe points and stops after 9 waypoints', () => {
    const start = { lat: 44.69, lng: 8.03 }
    const url = googleDayUrl(start, [pin])
    expect(url).toContain('origin=44.690000%2C8.030000')
    expect(url).toContain('waypoints=44.701234%2C8.035678')
    expect(googleDayUrl(start, Array.from({ length: 10 }, () => pin))).toBeNull()
  })
})

describe('stored plans', () => {
  it('rejects a plan that carries coordinates', () => {
    expect(
      parseStoredPlan({
        source: 'straight_line',
        lunchStartMinute: 750,
        lunchEndMinute: 900,
        days: [
          {
            date: '2026-11-10',
            driveMinutes: 10,
            returnDriveMinutes: 5,
            ok: true,
            reason: null,
            stops: [{ tripListingId: 'bra', locked: false, driveMinutes: 5, arrivalMinute: 500, departureMinute: 510, lat: 44.7 }],
          },
        ],
        unscheduled: [],
      }),
    ).toBeNull()
  })
})
