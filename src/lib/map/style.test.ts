import { describe, expect, it } from 'vitest'
import { DEFAULT_MAP_STYLE_URL, resolveMapStyleUrl } from './style'

describe('resolveMapStyleUrl', () => {
  it('defaults to the OpenFreeMap street style', () => {
    expect(resolveMapStyleUrl(undefined)).toBe(DEFAULT_MAP_STYLE_URL)
    expect(resolveMapStyleUrl('  ')).toBe(DEFAULT_MAP_STYLE_URL)
    expect(DEFAULT_MAP_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/bright')
  })

  it('keeps another street style', () => {
    const streets = 'https://api.maptiler.com/maps/streets-v2/style.json?key=test'
    expect(resolveMapStyleUrl(streets)).toBe(streets)
  })

  it('refuses imagery styles', () => {
    expect(resolveMapStyleUrl('https://tiles.example.com/styles/satellite')).toBe(DEFAULT_MAP_STYLE_URL)
    expect(resolveMapStyleUrl('https://example.com/aerial-v2.json')).toBe(DEFAULT_MAP_STYLE_URL)
    expect(resolveMapStyleUrl('https://example.com/orthophoto')).toBe(DEFAULT_MAP_STYLE_URL)
  })
})
