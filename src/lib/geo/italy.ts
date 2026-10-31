/** Inclusive bounds used by the trip_listings coordinate checks. */
export function inItalyBounds(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 35 && lat <= 48 && lng >= 6 && lng <= 19
}
