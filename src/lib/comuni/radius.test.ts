import { describe, expect, it } from 'vitest'
import { approxRadiusMetres } from './radius'

describe('approxRadiusMetres', () => {
  it('uses 5 km when the area is missing', () => {
    expect(approxRadiusMetres(null)).toBe(5000)
    expect(approxRadiusMetres(undefined)).toBe(5000)
    expect(approxRadiusMetres(0)).toBe(5000)
    expect(approxRadiusMetres(Number.NaN)).toBe(5000)
  })

  it('clamps tiny and huge comuni', () => {
    expect(approxRadiusMetres(0.1)).toBe(1500)
    expect(approxRadiusMetres(1288)).toBe(20000)
  })

  it('uses the radius of a circle with the same area', () => {
    const area = 13.24
    const expected = Math.round(Math.sqrt((area * 1_000_000) / Math.PI))
    expect(approxRadiusMetres(area)).toBe(expected)
  })
})
