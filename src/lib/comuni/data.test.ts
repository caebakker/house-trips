import { describe, expect, it } from 'vitest'
import { comuni, findComune } from './data'
import { approxRadiusMetres } from './radius'
import { inItalyBounds } from '../geo/italy'

describe('comuni dataset', () => {
  it('matches the 21 February 2026 ISTAT list', () => {
    expect(comuni).toHaveLength(7894)
    expect(new Set(comuni.map((comune) => comune.istat)).size).toBe(7894)
  })

  it('stays inside the coordinate checks on trip listings', () => {
    for (const comune of comuni) {
      expect(comune.istat).toMatch(/^[0-9]{6}$/)
      expect(comune.provinceCode).toMatch(/^[A-Z]{2}$/)
      expect(inItalyBounds(comune.lat, comune.lng)).toBe(true)
      const radius = approxRadiusMetres(comune.areaKm2)
      expect(radius).toBeGreaterThanOrEqual(1500)
      expect(radius).toBeLessThanOrEqual(20000)
    }
  })

  it('places known towns on the right spot', () => {
    const aglie = findComune('001001')
    expect(aglie?.name).toBe('Agliè')
    expect(aglie?.provinceCode).toBe('TO')
    expect(aglie!.lat).toBeCloseTo(45.36, 1)
    expect(aglie!.lng).toBeCloseTo(7.77, 1)

    const merged = findComune('024129')
    expect(merged?.name).toBe('Castegnero Nanto')
    expect(merged!.lat).toBeGreaterThan(45)
    expect(merged!.lat).toBeLessThan(46)
    expect(merged!.lng).toBeGreaterThan(11)
    expect(merged!.lng).toBeLessThan(12)

    expect(findComune('058091')?.name).toBe('Roma')
    expect(findComune('018082')).toBeNull()
  })
})
