import type { Comune } from '../comuni/data'
import { fold } from '../text/fold'
import { inItalyBounds } from './italy'

export type AddressHit = {
  lat: number
  lng: number
  label: string
  city: string
  county: string
}

type PhotonProperties = {
  name?: string
  housenumber?: string
  street?: string
  city?: string
  county?: string
  locality?: string
  countrycode?: string
}

type PhotonFeature = {
  geometry?: { coordinates?: unknown }
  properties?: PhotonProperties
}

const PHOTON_URL = 'https://photon.komoot.io/api/'

export function labelForAddress(properties: PhotonProperties | undefined): string {
  if (!properties) return ''
  const street = [properties.housenumber, properties.street].filter(Boolean).join(' ')
  const place = properties.city || properties.locality || properties.county || ''
  const primary = street || properties.name || ''
  return [primary, place].filter(Boolean).join(', ')
}

function asFeatureList(body: unknown): PhotonFeature[] {
  if (!body || typeof body !== 'object' || !('features' in body)) return []
  const features = (body as { features?: unknown }).features
  return Array.isArray(features) ? (features as PhotonFeature[]) : []
}

/** Keep Italian hits inside the coordinate bounds the database accepts. */
export function addressHitsFromPhoton(body: unknown): AddressHit[] {
  const hits: AddressHit[] = []
  const seen = new Set<string>()
  for (const feature of asFeatureList(body)) {
    const coords = feature.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lng = coords[0]
    const lat = coords[1]
    if (typeof lng !== 'number' || typeof lat !== 'number' || !inItalyBounds(lat, lng)) continue
    const country = feature.properties?.countrycode
    if (country && country.toUpperCase() !== 'IT') continue
    const label = labelForAddress(feature.properties)
    if (!label) continue
    const key = `${label}|${lat.toFixed(5)}|${lng.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({
      lat,
      lng,
      label,
      city: feature.properties?.city ?? '',
      county: feature.properties?.county ?? '',
    })
  }
  return hits
}

function placeScore(hit: AddressHit, comune: Comune): number {
  const city = fold(hit.city)
  const county = fold(hit.county)
  const name = fold(comune.name)
  const province = fold(comune.province)
  let score = 0
  if (city && (city === name || city.startsWith(name) || name.startsWith(city))) score += 4
  if (county && county === province) score += 2
  return score
}

/** Prefer the comune the buyer already picked, then the province. */
export function rankAddressHits(hits: AddressHit[], comune: Comune): AddressHit[] {
  return hits
    .map((hit, index) => ({ hit, index, score: placeScore(hit, comune) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.hit)
}

/**
 * Look up an address the buyer typed, biased toward the chosen comune.
 * OpenStreetMap data via the public Photon API. The buyer confirms the pin.
 */
export async function lookupAddress(address: string, comune: Comune): Promise<AddressHit[]> {
  const query = `${address.trim()}, ${comune.name}, ${comune.province}, Italy`
  const url = new URL(PHOTON_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('lat', String(comune.lat))
  url.searchParams.set('lon', String(comune.lng))
  url.searchParams.set('limit', '5')
  url.searchParams.set('lang', 'en')

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('address lookup failed')
  const body: unknown = await response.json()
  return rankAddressHits(addressHitsFromPhoton(body), comune).slice(0, 5)
}
