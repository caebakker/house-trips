/** OpenFreeMap Bright: OSM vector streets, no API key, no satellite layer. */
export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'

const BLOCKED_STYLE = /satellite|imagery|aerial|orthophoto/i

/**
 * Buyers only ever see a street map. An empty setting uses OpenFreeMap.
 * A URL that looks like imagery falls back to the street style.
 */
export function resolveMapStyleUrl(configured: string | undefined | null): string {
  const url = configured?.trim() ?? ''
  if (!url || BLOCKED_STYLE.test(url)) return DEFAULT_MAP_STYLE_URL
  return url
}

export function mapStyleUrl(): string {
  return resolveMapStyleUrl(import.meta.env.VITE_MAP_STYLE_URL)
}
