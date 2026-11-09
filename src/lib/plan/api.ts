import type { Json } from '../../types/database'
import { supabase } from '../supabase'
import { parseStoredPlan, type StoredPlan } from './stored'

export type TripStart = {
  label: string
  lat: number
  lng: number
  lunchStartMinute: number
  lunchEndMinute: number
}

export type UnlockedPin = {
  tripListingId: string
  lat: number
  lng: number
}

export async function fetchTripStart(tripId: string): Promise<TripStart | null> {
  const { data, error } = await supabase
    .from('trip_starts')
    .select('label, lat, lng, lunch_start_minute, lunch_end_minute')
    .eq('trip_id', tripId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    label: data.label,
    lat: data.lat,
    lng: data.lng,
    lunchStartMinute: data.lunch_start_minute,
    lunchEndMinute: data.lunch_end_minute,
  }
}

export async function saveTripStart(tripId: string, start: TripStart): Promise<void> {
  const { error } = await supabase.from('trip_starts').upsert(
    {
      trip_id: tripId,
      label: start.label,
      lat: start.lat,
      lng: start.lng,
      lunch_start_minute: start.lunchStartMinute,
      lunch_end_minute: start.lunchEndMinute,
    },
    { onConflict: 'trip_id' },
  )
  if (error) throw error
}

export async function fetchLatestPlan(tripId: string): Promise<StoredPlan | null> {
  const { data, error } = await supabase
    .from('schedules')
    .select('plan')
    .eq('trip_id', tripId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return parseStoredPlan(data.plan)
}

export async function savePlan(tripId: string, plan: StoredPlan): Promise<void> {
  const { error } = await supabase.rpc('save_schedule', {
    p_trip_id: tripId,
    p_plan: plan as unknown as Json,
  })
  if (error) throw error
}

export async function fetchUnlockedPins(tripId: string): Promise<UnlockedPin[]> {
  const { data, error } = await supabase.rpc('buyer_unlocked_pins', { p_trip_id: tripId })
  if (error) throw error
  return (data ?? []).map((row) => ({
    tripListingId: row.trip_listing_id,
    lat: row.lat,
    lng: row.lng,
  }))
}
