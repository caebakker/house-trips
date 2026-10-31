import { describe, expect, it } from 'vitest'
import { canonicaliseListingUrl } from './canonical'

function canonical(input: string): string | null {
  return canonicaliseListingUrl(input)?.canonicalUrl ?? null
}

describe('canonicaliseListingUrl', () => {
  it('collapses Immobiliare.it links to the announcement id', () => {
    const messy =
      'http://immobiliare.it/en/annunci/116128813/?utm_source=ig&utm_medium=cpc&fbclid=abc#photos'
    const clean = 'https://www.immobiliare.it/annunci/116128813/'
    expect(canonical(messy)).toBe('https://www.immobiliare.it/annunci/116128813')
    expect(canonical(clean)).toBe(canonical(messy))
    expect(canonicaliseListingUrl(messy)?.portal).toBe('immobiliare')
    expect(canonical('https://www.immobiliare.it/annunci/116128813')).toBe(canonical(messy))
    expect(canonical('WWW.IMMOBILIARE.IT/annunci/116128813')).toBe(canonical(messy))
  })

  it('collapses Idealista.it links to the property id', () => {
    const messy = 'https://www.idealista.it/en/immobile/24811320/foto/?gclid=abc&utm_campaign=spring'
    const other = 'https://m.idealista.it/immobile/24811320?utm_source=email'
    expect(canonical(messy)).toBe('https://www.idealista.it/immobile/24811320')
    expect(canonical(other)).toBe(canonical(messy))
    expect(canonicaliseListingUrl(messy)?.portal).toBe('idealista')
  })

  it('collapses Casa.it links, including the .html form', () => {
    const html = 'https://www.casa.it/immobili/82715349.html?utm_source=newsletter&utm_medium=email'
    const slash = 'http://casa.it/immobili/82715349/?fbclid=zzz'
    expect(canonical(html)).toBe('https://www.casa.it/immobili/82715349')
    expect(canonical(slash)).toBe(canonical(html))
    expect(canonicaliseListingUrl(html)?.portal).toBe('casa')
  })

  it('keeps different listing ids apart', () => {
    expect(canonical('https://www.immobiliare.it/annunci/1')).not.toBe(
      canonical('https://www.immobiliare.it/annunci/2'),
    )
    expect(canonical('https://www.idealista.it/immobile/1')).not.toBe(
      canonical('https://www.casa.it/immobili/1'),
    )
  })

  it('canonicalises generic URLs without treating them as a portal', () => {
    const left = 'https://www.Example.com/path/?b=2&utm_medium=email&a=1#section'
    const right = 'http://example.com/path?a=1&b=2'
    expect(canonical(left)).toBe('https://example.com/path?a=1&b=2')
    expect(canonical(right)).toBe(canonical(left))
    expect(canonicaliseListingUrl(left)?.portal).toBe('')
  })

  it('keeps meaningful query parameters and drops tracking ones', () => {
    expect(canonical('https://example.com/search?q=house&fbclid=abc&ref=newsletter')).toBe(
      'https://example.com/search?q=house&ref=newsletter',
    )
  })

  it('treats a portal search page as a generic URL', () => {
    expect(canonical('https://www.immobiliare.it/vendita-case/cuneo/?utm_source=share')).toBe(
      'https://immobiliare.it/vendita-case/cuneo',
    )
    expect(canonicaliseListingUrl('https://www.immobiliare.it/vendita-case/cuneo/')?.portal).toBe('')
  })

  it('is stable when run again on its own result', () => {
    const inputs = [
      'https://www.immobiliare.it/annunci/55/?utm_source=x',
      'https://www.idealista.it/immobile/55/',
      'https://www.casa.it/immobili/55.html',
      'https://www.example.com/a/b/?z=1&y=2',
    ]
    for (const input of inputs) {
      const once = canonicaliseListingUrl(input)
      expect(once).not.toBeNull()
      expect(canonical(once!.canonicalUrl)).toBe(once!.canonicalUrl)
    }
  })

  it('rejects values that are not http(s) links', () => {
    expect(canonicaliseListingUrl('')).toBeNull()
    expect(canonicaliseListingUrl('   ')).toBeNull()
    expect(canonicaliseListingUrl('not a url')).toBeNull()
    expect(canonicaliseListingUrl('ftp://example.com/file')).toBeNull()
    expect(canonicaliseListingUrl('javascript:alert(1)')).toBeNull()
    expect(canonicaliseListingUrl('https://user:pass@example.com/secret')).toBeNull()
    expect(canonicaliseListingUrl(`https://example.com/${'a'.repeat(2000)}`)).toBeNull()
  })
})
