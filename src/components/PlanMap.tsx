import { useEffect, useRef } from 'react'
import { LngLatBounds, Map, Marker, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circleRing } from '../lib/map/circle'
import { mapStyleUrl } from '../lib/map/style'
import { m, fill } from '../i18n/t'

export type PlanMapStop = {
  id: string
  number: number | null
  comuneName: string
  zoneLat: number
  zoneLng: number
  radiusM: number
  pin: { lat: number; lng: number; kind: 'unlocked' | 'given' } | null
  showZone: boolean
}

type Props = {
  stops: PlanMapStop[]
  start: { lat: number; lng: number } | null
  route: { lat: number; lng: number }[]
  selectedId: string | null
  onSelect: (id: string) => void
  picking: boolean
  onPick: (lat: number, lng: number) => void
}

type ZoneFeature = {
  type: 'Feature'
  properties: { id: string; selected: boolean }
  geometry: { type: 'Polygon'; coordinates: number[][][] }
}

function zones(stops: PlanMapStop[], selectedId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: stops
      .filter((stop) => stop.showZone)
      .map(
        (stop): ZoneFeature => ({
          type: 'Feature',
          properties: { id: stop.id, selected: stop.id === selectedId },
          geometry: { type: 'Polygon', coordinates: [circleRing(stop.zoneLng, stop.zoneLat, stop.radiusM)] },
        }),
      ),
  }
}

function routeLine(route: { lat: number; lng: number }[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: route.map((point) => [point.lng, point.lat]),
    },
  }
}

function markerButton(stop: PlanMapStop, selected: boolean, onSelect: (id: string) => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  const number = stop.number == null ? '' : String(stop.number)
  if (stop.pin?.kind === 'unlocked') {
    button.className = `flex ${selected ? 'h-8 w-8' : 'h-7 w-7'} items-center justify-center rounded-full border-2 border-white bg-teal-800 text-xs font-semibold text-white shadow`
    button.textContent = number || '•'
  } else if (stop.pin) {
    button.className = `flex ${selected ? 'h-8 w-8' : 'h-7 w-7'} items-center justify-center rounded-full border-2 border-white bg-stone-900 text-xs font-semibold text-white shadow`
    button.textContent = number
  } else {
    button.className = `max-w-40 truncate rounded px-1.5 py-0.5 text-xs font-medium shadow ${
      selected ? 'bg-amber-900 text-white' : 'bg-white text-stone-800'
    }`
    button.textContent = number ? `${number}. ${stop.comuneName}` : stop.comuneName
  }
  button.setAttribute(
    'aria-label',
    fill(m.trip.listingLabel, { number: number || '?', comune: stop.comuneName }),
  )
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onSelect(stop.id)
  })
  return button
}

/** Street map only. The line is one day's order, using points the buyer is allowed to see. */
export function PlanMap({ stops, start, route, selectedId, onSelect, picking, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Marker[]>([])
  const onSelectRef = useRef(onSelect)
  const onPickRef = useRef(onPick)
  const pickingRef = useRef(picking)
  const boundsKeyRef = useRef('')
  onSelectRef.current = onSelect
  onPickRef.current = onPick
  pickingRef.current = picking

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = new Map({
      container,
      style: mapStyleUrl(),
      center: [7.9, 44.7],
      zoom: 8,
      attributionControl: { compact: window.matchMedia('(max-width: 640px)').matches },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
    })
    mapRef.current = map
    map.on('load', () => {
      map.addSource('zones', { type: 'geojson', data: zones([], null) })
      map.addSource('route', { type: 'geojson', data: routeLine([]) })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#1c1917', 'line-width': 3, 'line-opacity': 0.85 },
      })
      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': '#b45309',
          'fill-opacity': ['case', ['==', ['get', 'selected'], true], 0.4, 0.22],
        },
      })
      map.addLayer({
        id: 'zones-line',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': ['case', ['==', ['get', 'selected'], true], '#7c2d12', '#c2410c'],
          'line-width': ['case', ['==', ['get', 'selected'], true], 2.5, 1.5],
        },
      })
      map.on('click', (event) => {
        if (pickingRef.current) onPickRef.current(event.lngLat.lat, event.lngLat.lng)
      })
      map.on('click', 'zones-fill', (event: MapLayerMouseEvent) => {
        if (pickingRef.current) return
        const id = event.features?.[0]?.properties?.id
        if (typeof id === 'string') onSelectRef.current(id)
      })
      map.on('mouseenter', 'zones-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'zones-fill', () => {
        map.getCanvas().style.cursor = pickingRef.current ? 'crosshair' : ''
      })
      map.resize()
    })
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (mapRef.current !== map) return
      const zoneSource = map.getSource('zones')
      const lineSource = map.getSource('route')
      if (zoneSource?.type === 'geojson') (zoneSource as GeoJSONSource).setData(zones(stops, selectedId))
      if (lineSource?.type === 'geojson') (lineSource as GeoJSONSource).setData(routeLine(route))
      map.getCanvas().style.cursor = picking ? 'crosshair' : ''

      markersRef.current.forEach((marker) => marker.remove())
      const next: Marker[] = []
      if (start) {
        const element = document.createElement('div')
        element.className = 'rounded-full border-2 border-stone-900 bg-white px-2 py-1 text-xs font-semibold text-stone-900 shadow'
        element.textContent = m.plan.startMarker
        next.push(new Marker({ element, anchor: 'center' }).setLngLat([start.lng, start.lat]).addTo(map))
      }
      for (const stop of stops) {
        const at = stop.pin ?? { lat: stop.zoneLat, lng: stop.zoneLng }
        next.push(
          new Marker({
            element: markerButton(stop, stop.id === selectedId, (id) => onSelectRef.current(id)),
            anchor: 'center',
          })
            .setLngLat([at.lng, at.lat])
            .addTo(map),
        )
      }
      markersRef.current = next

      const boundsKey = [
        start ? `${start.lat},${start.lng}` : '',
        ...stops.map((stop) => `${stop.id}:${stop.pin?.lat ?? stop.zoneLat}:${stop.pin?.lng ?? stop.zoneLng}`),
      ].join('|')
      if ((stops.length > 0 || start) && boundsKey !== boundsKeyRef.current) {
        boundsKeyRef.current = boundsKey
        const bounds = new LngLatBounds()
        if (start) bounds.extend([start.lng, start.lat])
        for (const point of route) bounds.extend([point.lng, point.lat])
        for (const stop of stops) {
          if (stop.showZone) {
            for (const [lng, lat] of circleRing(stop.zoneLng, stop.zoneLat, stop.radiusM, 16)) bounds.extend([lng, lat])
          }
          if (stop.pin) bounds.extend([stop.pin.lng, stop.pin.lat])
        }
        if (!bounds.isEmpty()) {
          const padding = map.getContainer().clientWidth < 480 ? 28 : 48
          map.fitBounds(bounds, { padding, maxZoom: 12, duration: 0 })
        }
      }
    }
    if (map.isStyleLoaded() && map.getSource('zones')) apply()
    else map.once('load', apply)
  }, [stops, start, route, selectedId, picking])

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={m.plan.mapHeading}
      className="h-full w-full overflow-hidden rounded-lg bg-stone-200"
    />
  )
}
