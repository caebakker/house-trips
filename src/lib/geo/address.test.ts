import { describe, expect, it } from 'vitest'
import type { Comune } from '../comuni/data'
import { addressHitsFromPhoton, rankAddressHits } from './address'

const cuneo: Comune = {
  istat: '004078',
  name: 'Cuneo',
  nameAlt: null,
  province: 'Cuneo',
  provinceCode: 'CN',
  lat: 44.39,
  lng: 7.55,
  areaKm2: 119,
}

const body = {
  features: [
    {
      geometry: { coordinates: [7.93415, 44.69736] },
      properties: {
        name: 'Via Roma',
        city: "Santa Vittoria d'Alba",
        county: 'Cuneo',
        countrycode: 'IT',
      },
    },
    {
      geometry: { coordinates: [7.5539, 44.39491] },
      properties: {
        housenumber: '1',
        street: 'Via Roma',
        city: 'Cuneo',
        county: 'Cuneo',
        countrycode: 'IT',
      },
    },
    {
      geometry: { coordinates: [2.35, 48.86] },
      properties: { name: 'Paris', city: 'Paris', countrycode: 'FR' },
    },
  ],
}

describe('address lookup parsing', () => {
  it('keeps Italian hits and prefers the chosen comune', () => {
    const hits = addressHitsFromPhoton(body)
    expect(hits.map((hit) => hit.city)).toEqual(["Santa Vittoria d'Alba", 'Cuneo'])
    expect(hits[1]?.label).toBe('1 Via Roma, Cuneo')
    const ranked = rankAddressHits(hits, cuneo)
    expect(ranked[0]?.city).toBe('Cuneo')
  })
})
