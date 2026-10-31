import { useEffect, useRef } from 'react'
import { LngLatBounds, Map, Marker, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circleRing } from '../lib/map/circle'
import { mapStyleUrl } from '../lib/map/style'
import { m, fill } from '../i18n/t'

export type MapStop = {
  id: string
  number: number
  comuneName: string
  lat: number
  lng: number
  radiusM: number
  /** Present only when the buyer typed an address and confirmed a pin. */
  pin: { lat: number; lng: number } | null
}

type Props = {
  stops: MapStop[]
  selectedId: string | null
  onSelect: (id: string) => void
}

type GeoFeature = {
  type: 'Feature'
  properties: { id: string; selected: boolean }
  geometry: { type: 'Polygon'; coordinates: number[][][] }
}

function zones(stops: MapStop[], selectedId: string | null): { type: 'FeatureCollection'; features: GeoFeature[] } {
  return {
    type: 'FeatureCollection',
    features: stops.map((stop) => ({
      type: 'Feature',
      properties: { id: stop.id, selected: stop.id === selectedId },
      geometry: { type: 'Polygon', coordinates: [circleRing(stop.lng, stop.lat, stop.radiusM)] },
    })),
  }
}

function markerButton(stop: MapStop, selected: boolean, onSelect: (id: string) => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  if (stop.pin) {
    const size = selected ? 'h-8 w-8' : 'h-7 w-7'
    button.className = `flex ${size} items-center justify-center rounded-full border-2 border-white bg-stone-900 text-xs font-semibold text-white shadow`
    button.textContent = String(stop.number)
  } else {
    button.className = `max-w-40 truncate rounded px-1.5 py-0.5 text-xs font-medium shadow ${
      selected ? 'bg-amber-900 text-white' : 'bg-white text-stone-800'
    }`
    button.textContent = `${stop.number}. ${stop.comuneName}`
  }
  button.setAttribute(
    'aria-label',
    fill(m.trip.listingLabel, { number: String(stop.number), comune: stop.comuneName }),
  )
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onSelect(stop.id)
  })
  return button
}

/**
 * Street map only. Shaded circles are comune centres. Pins are addresses the
 * buyer typed. Verified coordinates are not drawn in this milestone.
 */
export function TripMap({ stops, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const markersRef = useRef<Marker[]>([])
  const onSelectRef = useRef(onSelect)
  const stopsKeyRef = useRef('')
  onSelectRef.current = onSelect

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new Map({
      container,
      style: mapStyleUrl(),
      center: [12.5, 42.2],
      zoom: 5,
      attributionControl: { compact: window.matchMedia('(max-width: 640px)').matches },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
    })
    mapRef.current = map

    map.on('load', () => {
      map.addSource('zones', { type: 'geojson', data: zones([], null) })
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
      map.on('click', 'zones-fill', (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.id
        if (typeof id === 'string') onSelectRef.current(id)
      })
      map.on('mouseenter', 'zones-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'zones-fill', () => {
        map.getCanvas().style.cursor = ''
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
      const source = map.getSource('zones')
      if (!source || source.type !== 'geojson') return
      ;(source as GeoJSONSource).setData(zones(stops, selectedId))

      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = stops.map((stop) => {
        const at = stop.pin ?? { lat: stop.lat, lng: stop.lng }
        const marker = new Marker({
          element: markerButton(stop, stop.id === selectedId, (id) => onSelectRef.current(id)),
          anchor: 'center',
        })
          .setLngLat([at.lng, at.lat])
          .addTo(map)
        return marker
      })

      const stopsKey = stops.map((stop) => `${stop.id}:${stop.radiusM}:${stop.pin?.lat ?? ''}:${stop.pin?.lng ?? ''}`).join('|')
      if (stops.length > 0 && stopsKey !== stopsKeyRef.current) {
        stopsKeyRef.current = stopsKey
        const bounds = new LngLatBounds()
        for (const stop of stops) {
          for (const [lng, lat] of circleRing(stop.lng, stop.lat, stop.radiusM, 24)) {
            bounds.extend([lng, lat])
          }
          if (stop.pin) bounds.extend([stop.pin.lng, stop.pin.lat])
        }
        const padding = map.getContainer().clientWidth < 480 ? 28 : 48
        map.fitBounds(bounds, { padding, maxZoom: 12, duration: 0 })
      }
    }

    if (map.isStyleLoaded() && map.getSource('zones')) apply()
    else map.once('load', apply)
  }, [stops, selectedId])

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={m.trip.mapHeading}
      className="h-full w-full overflow-hidden rounded-lg bg-stone-200"
    />
  )
}
