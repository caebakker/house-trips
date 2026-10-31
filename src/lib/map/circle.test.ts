import { describe, expect, it } from 'vitest'
import { circleRing, haversineMetres } from './circle'

describe('circleRing', () => {
  it('closes the ring and sits on the requested radius', () => {
    const radius = 5000
    const ring = circleRing(7.55, 44.39, radius, 64)
    expect(ring).toHaveLength(65)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    const north = ring[0]
    const distance = haversineMetres(7.55, 44.39, north[0], north[1])
    expect(distance).toBeGreaterThan(radius * 0.98)
    expect(distance).toBeLessThan(radius * 1.02)
  })
})
