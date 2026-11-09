import { useEffect, useRef } from 'react'
import { LngLatBounds, Map, Marker, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circleRing } from '../lib/map/circle'
import { registerCadastralProtocol } from '../lib/map/cadastralProtocol'
import { adminImagery } from '../lib/map/imagery'
import { supabase } from '../lib/supabase'
import { m, fill } from '../i18n/t'

export type LocatePin = { lat: number; lng: number }

type Props = {
  viewKey: string
  zone: { lat: number; lng: number; radiusM: number }
  givenPin: LocatePin | null
  droppedPin: LocatePin | null
  linkedPin: LocatePin | null
  showCadastre: boolean
  onDropPin: (pin: LocatePin) => void
}

function imageryStyle(): StyleSpecification {
  const imagery = adminImagery()
  return {
    version: 8,
    sources: {
      imagery: {
        type: 'raster',
        tiles: [imagery.url],
        tileSize: 256,
        attribution: imagery.attribution,
      },
    },
    layers: [{ id: 'imagery', type: 'raster', source: 'imagery' }],
  }
}

function zoneData(zone: Props['zone']) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [circleRing(zone.lng, zone.lat, zone.radiusM)],
        },
      },
    ],
  }
}

function pinElement(className: string, label: string): HTMLDivElement {
  const element = document.createElement('div')
  element.className = className
  element.title = label
  element.setAttribute('aria-label', label)
  return element
}

/**
 * Admin-only satellite map. Buyers never mount this component.
 * Parcel lines come from the Agenzia delle Entrate WMS, reprojected per tile
 * because that service has no Web Mercator CRS.
 */
export function AdminLocateMap({
  viewKey,
  zone,
  givenPin,
  droppedPin,
  linkedPin,
  showCadastre,
  onDropPin,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const onDropRef = useRef(onDropPin)
  const dragRef = useRef(false)
  const markersRef = useRef<Marker[]>([])
  const imagery = adminImagery()
  onDropRef.current = onDropPin

  useEffect(() => {
    registerCadastralProtocol(async () => {
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    })
    const container = containerRef.current
    if (!container) return

    const map = new Map({
      container,
      style: imageryStyle(),
      center: [zone.lng, zone.lat],
      zoom: 14,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxZoom: 19,
    })
    mapRef.current = map
    map.getCanvas().style.cursor = 'crosshair'

    map.on('load', () => {
      map.addSource('zone', { type: 'geojson', data: zoneData(zone) })
      map.addLayer({
        id: 'zone-line',
        type: 'line',
        source: 'zone',
        paint: {
          'line-color': '#fbbf24',
          'line-width': 2,
          'line-dasharray': [2, 1.5],
        },
      })
      map.resize()
    })

    map.on('click', (event) => {
      if (dragRef.current) return
      onDropRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng })
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
    // The map is created once. Later effects move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      if (!map.getSource('cadastre') && showCadastre) {
        map.addSource('cadastre', {
          type: 'raster',
          tiles: ['cadastral://{z}/{x}/{y}'],
          tileSize: 256,
          minzoom: 14,
          maxzoom: 19,
          attribution: 'Agenzia delle Entrate, CC BY 4.0',
        })
        map.addLayer({
          id: 'cadastre',
          type: 'raster',
          source: 'cadastre',
          minzoom: 15,
          paint: { 'raster-opacity': 0.45 },
        })
      }
      if (map.getLayer('cadastre') && !showCadastre) map.removeLayer('cadastre')
      if (map.getSource('cadastre') && !showCadastre) map.removeSource('cadastre')
    }
    // isStyleLoaded() stays false while imagery tiles are still arriving, and
    // the load event has often already fired by the time the overlay is toggled.
    const run = () => {
      try {
        apply()
      } catch (err) {
        console.error(err)
      }
    }
    run()
    const waiting =
      (showCadastre && !map.getSource('cadastre')) || (!showCadastre && Boolean(map.getSource('cadastre')))
    if (waiting) map.once('idle', run)
  }, [showCadastre])

  const givenLat = givenPin?.lat ?? null
  const givenLng = givenPin?.lng ?? null
  const droppedLat = droppedPin?.lat ?? null
  const droppedLng = droppedPin?.lng ?? null
  const linkedLat = linkedPin?.lat ?? null
  const linkedLng = linkedPin?.lng ?? null

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const source = map.getSource('zone')
      const area = { lat: zone.lat, lng: zone.lng, radiusM: zone.radiusM }
      if (source && source.type === 'geojson') (source as GeoJSONSource).setData(zoneData(area))
      if (givenLat != null && givenLng != null) {
        map.jumpTo({ center: [givenLng, givenLat], zoom: 17 })
      } else {
        const bounds = new LngLatBounds()
        for (const [lng, lat] of circleRing(area.lng, area.lat, area.radiusM, 24)) {
          bounds.extend([lng, lat])
        }
        map.fitBounds(bounds, { padding: 36, maxZoom: 15, duration: 0 })
      }
    }
    if (map.isStyleLoaded() && map.getSource('zone')) apply()
    else map.once('load', apply)
  }, [viewKey, zone.lat, zone.lng, zone.radiusM, givenLat, givenLng])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      const add = (marker: Marker) => {
        markersRef.current.push(marker)
      }
      if (givenLat != null && givenLng != null) {
        add(
          new Marker({
            element: pinElement(
              'h-3 w-3 rounded-full border-2 border-white bg-amber-400 shadow',
              m.admin.givenPin,
            ),
            anchor: 'center',
          })
            .setLngLat([givenLng, givenLat])
            .addTo(map),
        )
      }
      if (linkedLat != null && linkedLng != null) {
        add(
          new Marker({
            element: pinElement(
              'h-5 w-5 rounded-full border-2 border-amber-300 bg-white shadow',
              m.admin.linkedPin,
            ),
            anchor: 'center',
          })
            .setLngLat([linkedLng, linkedLat])
            .addTo(map),
        )
      }
      if (droppedLat != null && droppedLng != null) {
        const marker = new Marker({
          element: pinElement(
            'h-6 w-6 rounded-full border-2 border-white bg-stone-900 shadow',
            m.admin.droppedPin,
          ),
          anchor: 'center',
          draggable: true,
        })
          .setLngLat([droppedLng, droppedLat])
          .addTo(map)
        marker.on('dragstart', () => {
          dragRef.current = true
        })
        marker.on('dragend', () => {
          const ll = marker.getLngLat()
          onDropRef.current({ lat: ll.lat, lng: ll.lng })
          window.setTimeout(() => {
            dragRef.current = false
          }, 0)
        })
        add(marker)
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [givenLat, givenLng, droppedLat, droppedLng, linkedLat, linkedLng])

  return (
    <div className="flex h-full flex-col">
      <div
        ref={containerRef}
        role="region"
        aria-label={m.admin.mapLabel}
        className="min-h-0 w-full flex-1 overflow-hidden rounded-lg bg-stone-800"
      />
      <p className="mt-2 text-xs leading-relaxed text-stone-600">
        {fill(m.admin.imageryLine, { attribution: imagery.attribution })}
        {showCadastre ? ` ${m.admin.cadastreLine}` : ''}
      </p>
    </div>
  )
}
