const CADASTRAL_LAYERS = 'CP.CadastralParcel,fabbricati'
const UPSTREAM = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php'

export type LngLatBounds = {
  west: number
  south: number
  east: number
  north: number
}

function mercatorToLat(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
}

/** Web Mercator tile bounds in WGS84 degrees. */
export function tileBoundsWgs84(x: number, y: number, z: number): LngLatBounds {
  const n = 2 ** z
  return {
    west: (x / n) * 360 - 180,
    east: ((x + 1) / n) * 360 - 180,
    north: mercatorToLat(y / n),
    south: mercatorToLat((y + 1) / n),
  }
}

/**
 * WMS 1.3.0 with EPSG:4258 uses latitude, longitude order.
 * The cadastral service does not offer Web Mercator, so each tile is requested
 * in geographic coordinates. At locating zoom the stretch is small.
 */
export function cadastralGetMapQuery(bounds: LngLatBounds): string {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: CADASTRAL_LAYERS,
    STYLES: '',
    FORMAT: 'image/png',
    TRANSPARENT: 'TRUE',
    CRS: 'EPSG:4258',
    WIDTH: '256',
    HEIGHT: '256',
    BBOX: `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`,
  })
  return params.toString()
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max
}

/** Accept only parcel/building tiles over Italy, so the proxy is not an open WMS. */
export function cadastralUpstreamUrl(requestUrl: string): string | null {
  let incoming: URL
  try {
    incoming = new URL(requestUrl)
  } catch {
    return null
  }

  const read = (name: string) => incoming.searchParams.get(name)
  if (read('SERVICE') !== 'WMS' || read('REQUEST') !== 'GetMap' || read('VERSION') !== '1.3.0') {
    return null
  }
  if (read('CRS') !== 'EPSG:4258' || read('LAYERS') !== CADASTRAL_LAYERS) return null
  if (read('FORMAT') !== 'image/png' || read('WIDTH') !== '256' || read('HEIGHT') !== '256') {
    return null
  }
  const transparent = read('TRANSPARENT')
  if (transparent !== null && transparent !== 'TRUE' && transparent !== 'true') return null

  const bbox = read('BBOX')
  if (!bbox) return null
  const parts = bbox.split(',').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null
  const [south, west, north, east] = parts
  if (south >= north || west >= east) return null
  if (north - south > 0.5 || east - west > 0.5) return null
  if (!inRange(south, 35, 48) || !inRange(north, 35, 48)) return null
  if (!inRange(west, 6, 19) || !inRange(east, 6, 19)) return null

  const upstream = new URL(UPSTREAM)
  upstream.searchParams.set('SERVICE', 'WMS')
  upstream.searchParams.set('VERSION', '1.3.0')
  upstream.searchParams.set('REQUEST', 'GetMap')
  upstream.searchParams.set('LAYERS', CADASTRAL_LAYERS)
  upstream.searchParams.set('STYLES', '')
  upstream.searchParams.set('FORMAT', 'image/png')
  upstream.searchParams.set('TRANSPARENT', 'TRUE')
  upstream.searchParams.set('CRS', 'EPSG:4258')
  upstream.searchParams.set('WIDTH', '256')
  upstream.searchParams.set('HEIGHT', '256')
  upstream.searchParams.set('BBOX', `${south},${west},${north},${east}`)
  return upstream.toString()
}
