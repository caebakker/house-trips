import type { Json } from '../../types/database'
import { supabase } from '../supabase'
import { compareQueue } from '../verification/status'

export type QueueItem = {
  id: string
  createdAt: string
  listingId: string
  tripListingId: string
  tripName: string
  tripStart: string
  tripEnd: string
  buyerEmail: string
  comuneName: string
  approxLat: number
  approxLng: number
  approxRadiusM: number
  givenAddress: string | null
  givenLat: number | null
  givenLng: number | null
  listingUrl: string
  portal: string | null
  linkedPropertyId: string | null
  linkedLat: number | null
  linkedLng: number | null
}

export type NearbyHouse = {
  id: string
  lat: number
  lng: number
  distanceM: number
  label: string
}

export type GrantRow = {
  email: string
  delta: number
  note: string | null
  createdAt: string
}

export type ResolveInput = {
  requestId: string
  outcome: 'found' | 'not_found'
  lat: number | null
  lng: number | null
  propertyId: string | null
  note: string
}

function record(value: Json): Record<string, Json | undefined> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value
}

function text(value: Json | undefined): string | null {
  return typeof value === 'string' && value ? value : null
}

function num(value: Json | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseQueueItem(value: Json): QueueItem | null {
  const row = record(value)
  if (!row) return null
  const id = text(row.id)
  const createdAt = text(row.created_at)
  const listingId = text(row.listing_id)
  const tripListingId = text(row.trip_listing_id)
  const tripName = text(row.trip_name)
  const tripStart = text(row.trip_start)
  const tripEnd = text(row.trip_end)
  const buyerEmail = text(row.buyer_email)
  const comuneName = text(row.comune_name)
  const approxLat = num(row.approx_lat)
  const approxLng = num(row.approx_lng)
  const approxRadiusM = num(row.approx_radius_m)
  const listingUrl = text(row.listing_url)
  if (
    !id ||
    !createdAt ||
    !listingId ||
    !tripListingId ||
    !tripName ||
    !tripStart ||
    !tripEnd ||
    !buyerEmail ||
    !comuneName ||
    approxLat == null ||
    approxLng == null ||
    approxRadiusM == null ||
    !listingUrl
  ) {
    return null
  }
  return {
    id,
    createdAt,
    listingId,
    tripListingId,
    tripName,
    tripStart,
    tripEnd,
    buyerEmail,
    comuneName,
    approxLat,
    approxLng,
    approxRadiusM,
    givenAddress: text(row.given_address),
    givenLat: num(row.given_lat),
    givenLng: num(row.given_lng),
    listingUrl,
    portal: text(row.portal),
    linkedPropertyId: text(row.linked_property_id),
    linkedLat: num(row.linked_lat),
    linkedLng: num(row.linked_lng),
  }
}

export async function fetchQueue(): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('admin_verification_queue')
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map(parseQueueItem).filter((item): item is QueueItem => item !== null).sort(compareQueue)
}

export async function fetchNearby(lat: number, lng: number, listingId: string): Promise<NearbyHouse[]> {
  const { data, error } = await supabase.rpc('admin_properties_near', {
    p_lat: lat,
    p_lng: lng,
    p_listing_id: listingId,
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  const houses: NearbyHouse[] = []
  for (const value of data) {
    const row = record(value)
    if (!row) continue
    const id = text(row.id)
    const houseLat = num(row.lat)
    const houseLng = num(row.lng)
    const distanceM = num(row.distance_m)
    const label = text(row.label)
    if (!id || houseLat == null || houseLng == null || distanceM == null || !label) continue
    houses.push({ id, lat: houseLat, lng: houseLng, distanceM, label })
  }
  return houses
}

export async function resolveVerification(input: ResolveInput): Promise<void> {
  const { error } = await supabase.rpc('resolve_verification', {
    p_request_id: input.requestId,
    p_outcome: input.outcome,
    p_lat: input.lat ?? undefined,
    p_lng: input.lng ?? undefined,
    p_property_id: input.propertyId ?? undefined,
    p_note: input.note.trim() ? input.note.trim() : undefined,
  })
  if (error) throw error
}

export async function grantCredits(email: string, amount: number, note: string): Promise<number> {
  const { data, error } = await supabase.rpc('grant_credits', {
    p_email: email.trim(),
    p_amount: amount,
    p_note: note.trim() ? note.trim() : undefined,
  })
  if (error) throw error
  if (typeof data !== 'number') throw new Error('save')
  return data
}

export async function adminCreditBalance(email: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_credit_balance', { p_email: email.trim() })
  if (error) throw error
  if (typeof data !== 'number') throw new Error('save')
  return data
}

export async function fetchRecentGrants(): Promise<GrantRow[]> {
  const { data, error } = await supabase.rpc('admin_recent_grants')
  if (error) throw error
  if (!Array.isArray(data)) return []
  const rows: GrantRow[] = []
  for (const value of data) {
    const row = record(value)
    if (!row) continue
    const email = text(row.email)
    const delta = num(row.delta)
    const createdAt = text(row.created_at)
    if (!email || delta == null || !createdAt) continue
    rows.push({ email, delta, note: text(row.note), createdAt })
  }
  return rows
}

export function adminFailure(message: string): 'none' | 'amount' | 'outside' | 'pin' | 'save' {
  if (message.includes('no such person')) return 'none'
  if (message.includes('invalid amount') || message.includes('note too long')) return 'amount'
  if (message.includes('pin outside')) return 'outside'
  if (message.includes('pin required') || message.includes('unknown house')) return 'pin'
  return 'save'
}
