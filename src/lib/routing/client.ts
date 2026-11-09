import { supabase } from '../supabase'
import { straightLineMatrix, type MatrixPoint, type TravelMatrix } from './straightLine'

function isMatrix(value: unknown, points: MatrixPoint[]): value is TravelMatrix {
  if (!value || typeof value !== 'object') return false
  const record = value as { source?: unknown; ids?: unknown; minutes?: unknown }
  if (record.source !== 'openrouteservice' && record.source !== 'straight_line') return false
  if (!Array.isArray(record.ids) || record.ids.length !== points.length) return false
  if (!Array.isArray(record.minutes) || record.minutes.length !== points.length) return false
  return record.ids.every((id, index) => id === points[index]?.id)
}

/** Ask the Netlify function for road times. Any failure uses the straight-line matrix. */
export async function loadTravelMatrix(tripId: string, points: MatrixPoint[]): Promise<TravelMatrix> {
  const fallback = straightLineMatrix(points)
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return fallback
    const response = await fetch('/api/route-matrix', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId, locations: points }),
    })
    if (!response.ok) return fallback
    const body: unknown = await response.json()
    return isMatrix(body, points) ? body : fallback
  } catch {
    return fallback
  }
}
