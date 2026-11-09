import { describe, expect, it } from 'vitest'
import { canonicalOptOutUrls, classifyOptOutUrls, optOutEmailOk } from './urls'

describe('canonicalOptOutUrls', () => {
  it('collapses portal links and drops blank lines', () => {
    const result = canonicalOptOutUrls(
      'http://immobiliare.it/en/annunci/116128813/?utm_source=ig\n\nhttps://www.idealista.it/immobile/24811320',
    )
    expect(result).toEqual({
      urls: ['https://www.immobiliare.it/annunci/116128813', 'https://www.idealista.it/immobile/24811320'],
    })
  })

  it('rejects an empty field, too many links, and a link that is not a url', () => {
    expect(canonicalOptOutUrls('  \n')).toEqual({ error: 'empty' })
    expect(canonicalOptOutUrls(Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`).join('\n'))).toEqual({
      error: 'too_many',
    })
    expect(canonicalOptOutUrls('https://example.com/ok\nnot a link')).toEqual({
      error: 'invalid',
      invalid: 'not a link',
    })
  })
})

describe('classifyOptOutUrls', () => {
  it('matches a messy pasted link to the canonical listing url', () => {
    expect(
      classifyOptOutUrls([
        'http://immobiliare.it/en/annunci/116128813/?utm_source=ig&fbclid=abc',
        'https://www.immobiliare.it/annunci/116128813',
      ]),
    ).toEqual({
      canonical: ['https://www.immobiliare.it/annunci/116128813'],
      unmatched: [],
    })
  })
})

describe('optOutEmailOk', () => {
  it('allows a blank email and rejects a broken one', () => {
    expect(optOutEmailOk('')).toBe(true)
    expect(optOutEmailOk('owner@example.com')).toBe(true)
    expect(optOutEmailOk('owner@example')).toBe(false)
  })
})
