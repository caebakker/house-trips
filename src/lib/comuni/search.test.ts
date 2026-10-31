import { describe, expect, it } from 'vitest'
import { searchComuni } from './search'

describe('searchComuni', () => {
  it('matches names without accents', () => {
    expect(searchComuni('aglie').some((comune) => comune.name === 'Agliè')).toBe(true)
    expect(searchComuni('mondovi')[0]?.name).toBe('Mondovì')
  })

  it('matches the other official language', () => {
    expect(searchComuni('bozen')[0]?.name).toBe('Bolzano')
  })

  it('finds the merged comune from either old name', () => {
    expect(searchComuni('castegnero')[0]?.name).toBe('Castegnero Nanto')
    expect(searchComuni('nanto')[0]?.istat).toBe('024129')
  })

  it('puts the comune itself ahead of others in that province', () => {
    expect(searchComuni('cuneo')[0]?.name).toBe('Cuneo')
    expect(searchComuni('roma')[0]?.name).toBe('Roma')
  })

  it('returns nothing for a short or unknown query', () => {
    expect(searchComuni('')).toEqual([])
    expect(searchComuni('a')).toEqual([])
    expect(searchComuni('zzzzzzzz')).toEqual([])
  })
})
