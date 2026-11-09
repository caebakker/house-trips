export type LatLng = { lat: number; lng: number }

export type PointKind = 'unlocked' | 'given' | 'comune'

/**
 * The only coordinate the scheduler and the map may use.
 * Pass an unlocked pin only when buyer_unlocked_pins returned it.
 * Otherwise this is the address the buyer typed, or the comune centre.
 */
export function routingPoint(input: {
  unlocked: LatLng | null
  given: LatLng | null
  comune: LatLng
}): { point: LatLng; kind: PointKind } {
  if (input.unlocked) return { point: input.unlocked, kind: 'unlocked' }
  if (input.given) return { point: input.given, kind: 'given' }
  return { point: input.comune, kind: 'comune' }
}

function coord(point: LatLng): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`
}

/** Opens the pin in Apple Maps. The link is coordinates only, with no address. */
export function appleMapsUrl(point: LatLng): string {
  const value = coord(point)
  return `https://maps.apple.com/?ll=${value}&q=${value}`
}

/** Opens the pin in Google Maps. The link is coordinates only, with no address. */
export function googleMapsUrl(point: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coord(point))}`
}

/**
 * Driving directions for one day. Waypoints are the safe points already
 * shown on the map. Google's URL allows 9 waypoints.
 */
export function googleDayUrl(start: LatLng, stops: LatLng[]): string | null {
  if (stops.length === 0 || stops.length > 9) return null
  const params = new URLSearchParams({
    api: '1',
    origin: coord(start),
    destination: coord(start),
    waypoints: stops.map(coord).join('|'),
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
