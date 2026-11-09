import { describe, expect, it } from 'vitest'
import { cadastralGetMapQuery, cadastralUpstreamUrl, tileBoundsWgs84 } from './cadastral'

describe('tileBoundsWgs84', () => {
  it('covers the world on the zoom 0 tile', () => {
    const bounds = tileBoundsWgs84(0, 0, 0)
    expect(bounds.west).toBe(-180)
    expect(bounds.east).toBe(180)
    expect(bounds.north).toBeGreaterThan(85)
    expect(bounds.south).toBeLessThan(-85)
  })

  it('places Turin inside a high zoom tile', () => {
    const z = 16
    const n = 2 ** z
    const lng = 7.68
    const lat = 45.07
    const x = Math.floor(((lng + 180) / 360) * n)
    const latRad = (lat * Math.PI) / 180
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    )
    const bounds = tileBoundsWgs84(x, y, z)
    expect(bounds.west).toBeLessThanOrEqual(lng)
    expect(bounds.east).toBeGreaterThan(lng)
    expect(bounds.south).toBeLessThanOrEqual(lat)
    expect(bounds.north).toBeGreaterThan(lat)
  })
})

describe('cadastral WMS query', () => {
  it('asks for parcels in latitude, longitude order', () => {
    const query = cadastralGetMapQuery({ west: 7.65, south: 45.05, east: 7.67, north: 45.06 })
    const params = new URLSearchParams(query)
    expect(params.get('CRS')).toBe('EPSG:4258')
    expect(params.get('LAYERS')).toBe('CP.CadastralParcel,fabbricati')
    expect(params.get('BBOX')).toBe('45.05,7.65,45.06,7.67')
    expect(params.get('WIDTH')).toBe('256')
  })

  it('builds an upstream URL only for an Italy parcel tile', () => {
    const query = cadastralGetMapQuery({ west: 7.65, south: 45.05, east: 7.67, north: 45.06 })
    const upstream = cadastralUpstreamUrl(`https://guidocasa.test/api/cadastral-wms?${query}`)
    expect(upstream).toContain('wms.cartografia.agenziaentrate.gov.it')
    expect(upstream).toContain('BBOX=45.05%2C7.65%2C45.06%2C7.67')
  })

  it('rejects a world bbox, a foreign CRS, and other layers', () => {
    expect(
      cadastralUpstreamUrl(
        'https://guidocasa.test/api/cadastral-wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=CP.CadastralParcel,fabbricati&FORMAT=image/png&CRS=EPSG:4258&WIDTH=256&HEIGHT=256&BBOX=10,10,50,20',
      ),
    ).toBeNull()
    const query = cadastralGetMapQuery({ west: 7.65, south: 45.05, east: 7.67, north: 45.06 })
    const params = new URLSearchParams(query)
    params.set('CRS', 'EPSG:3857')
    expect(cadastralUpstreamUrl(`https://guidocasa.test/api/cadastral-wms?${params}`)).toBeNull()
    params.set('CRS', 'EPSG:4258')
    params.set('LAYERS', 'province')
    expect(cadastralUpstreamUrl(`https://guidocasa.test/api/cadastral-wms?${params}`)).toBeNull()
  })
})
