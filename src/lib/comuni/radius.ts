/** Circle used when the boundary area is missing. */
const FALLBACK_M = 5000

/**
 * Small comuni would disappear on a regional map, and a city the size of
 * Rome would cover its neighbours. Clamp the equivalent-area radius.
 */
const MIN_M = 1500
const MAX_M = 20000

/** Radius in metres of a circle with the same area as the comune, clamped. */
export function approxRadiusMetres(areaKm2: number | null | undefined): number {
  if (areaKm2 == null || !Number.isFinite(areaKm2) || areaKm2 <= 0) return FALLBACK_M
  const radius = Math.sqrt((areaKm2 * 1_000_000) / Math.PI)
  return Math.round(Math.min(MAX_M, Math.max(MIN_M, radius)))
}
