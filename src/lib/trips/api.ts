import { approxRadiusMetres } from '../comuni/radius'
import type { Comune } from '../comuni/data'
import { supabase } from '../supabase'
import { canonicaliseListingUrl } from '../urls/canonical'
import type { Database } from '../../types/database'

export type Trip = {
  id: string
  name: string
  startDate: string
  endDate: string
  maxDriveMinutes: number
  dwellMinutes: number
  listingCount: number
}

export type TripListing = {
  id: string
  priority: number
  comuneIstat: string
  comuneName: string
  approxLat: number
  approxLng: number
  approxRadiusM: number
  givenAddress: string | null
  givenLat: number | null
  givenLng: number | null
  agentName: string | null
  agentEmail: string | null
  agentPhone: string | null
  url: string
  canonicalUrl: string
  portal: string | null
  status: 'approximate' | 'address_given' | 'check_requested' | 'verified' | 'not_found'
  createdAt: string
}

export type TripInput = {
  name: string
  startDate: string
  endDate: string
  maxDriveMinutes: number
  dwellMinutes: number
}

export type ListingInput = {
  url: string
  comune: Comune
  priority: number
  givenAddress: string
  givenLat: number | null
  givenLng: number | null
  agentName: string
  agentEmail: string
  agentPhone: string
}

type TripRow = Pick<
  Database['public']['Tables']['trips']['Row'],
  'id' | 'name' | 'start_date' | 'end_date' | 'max_drive_minutes_per_day' | 'default_dwell_minutes'
>

type ListingEmbed = {
  url: string
  canonical_url: string
  portal: string | null
}

function countOf(value: unknown): number {
  if (!Array.isArray(value) || value.length === 0) return 0
  const first = value[0] as { count?: unknown }
  return typeof first.count === 'number' ? first.count : 0
}

function toTrip(row: TripRow & { trip_listings?: unknown }): Trip {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    maxDriveMinutes: row.max_drive_minutes_per_day,
    dwellMinutes: row.default_dwell_minutes,
    listingCount: countOf(row.trip_listings),
  }
}

function embedOf(value: ListingEmbed | ListingEmbed[] | null): ListingEmbed | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      'id, name, start_date, end_date, max_drive_minutes_per_day, default_dwell_minutes, trip_listings(count)',
    )
  if (error) throw error
  return (data ?? []).map((row) => toTrip(row))
}

export async function getTrip(id: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select(
      'id, name, start_date, end_date, max_drive_minutes_per_day, default_dwell_minutes, trip_listings(count)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toTrip(data) : null
}

export async function createTrip(input: TripInput): Promise<string> {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      name: input.name.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
      max_drive_minutes_per_day: input.maxDriveMinutes,
      default_dwell_minutes: input.dwellMinutes,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateTrip(id: string, input: TripInput): Promise<boolean> {
  const { data, error } = await supabase
    .from('trips')
    .update({
      name: input.name.trim(),
      start_date: input.startDate,
      end_date: input.endDate,
      max_drive_minutes_per_day: input.maxDriveMinutes,
      default_dwell_minutes: input.dwellMinutes,
    })
    .eq('id', id)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

export async function deleteTrip(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('trips').delete().eq('id', id).select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

type TripListingQueryRow = {
  id: string
  priority: number
  comune_istat: string
  comune_name: string
  approx_lat: number
  approx_lng: number
  approx_radius_m: number
  given_address: string | null
  given_lat: number | null
  given_lng: number | null
  agent_name: string | null
  agent_email: string | null
  agent_phone: string | null
  status: TripListing['status']
  created_at: string
  listings: ListingEmbed | ListingEmbed[] | null
}

function toListing(row: TripListingQueryRow): TripListing | null {
  const listing = embedOf(row.listings)
  if (!listing) return null
  return {
    id: row.id,
    priority: row.priority,
    comuneIstat: row.comune_istat,
    comuneName: row.comune_name,
    approxLat: row.approx_lat,
    approxLng: row.approx_lng,
    approxRadiusM: row.approx_radius_m,
    givenAddress: row.given_address,
    givenLat: row.given_lat,
    givenLng: row.given_lng,
    agentName: row.agent_name,
    agentEmail: row.agent_email,
    agentPhone: row.agent_phone,
    status: row.status,
    url: listing.url,
    canonicalUrl: listing.canonical_url,
    portal: listing.portal,
    createdAt: row.created_at,
  }
}

const LISTING_COLUMNS =
  'id, priority, comune_istat, comune_name, approx_lat, approx_lng, approx_radius_m, given_address, given_lat, given_lng, agent_name, agent_email, agent_phone, status, created_at, listings(url, canonical_url, portal)'

export async function listTripListings(tripId: string): Promise<TripListing[]> {
  const { data, error } = await supabase
    .from('trip_listings')
    .select(LISTING_COLUMNS)
    .eq('trip_id', tripId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? [])
    .map((row) => toListing(row as TripListingQueryRow))
    .filter((row): row is TripListing => row !== null)
}

export async function getTripListing(tripId: string, id: string): Promise<TripListing | null> {
  const { data, error } = await supabase
    .from('trip_listings')
    .select(LISTING_COLUMNS)
    .eq('trip_id', tripId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? toListing(data as TripListingQueryRow) : null
}

export type AddListingResult = { ok: true; id: string } | { ok: false; reason: 'url' | 'duplicate' | 'save' }

async function canonicalsOnTrip(tripId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('trip_listings')
    .select('listings(canonical_url)')
    .eq('trip_id', tripId)
  if (error) throw error
  const urls: string[] = []
  for (const row of data ?? []) {
    const embed = embedOf(row.listings as ListingEmbed | ListingEmbed[] | null)
    if (embed) urls.push(embed.canonical_url)
  }
  return urls
}

function listingColumns(input: ListingInput) {
  return {
    priority: input.priority,
    comune_istat: input.comune.istat,
    comune_name: input.comune.name,
    approx_lat: input.comune.lat,
    approx_lng: input.comune.lng,
    approx_radius_m: approxRadiusMetres(input.comune.areaKm2),
    given_address: blankToNull(input.givenAddress),
    given_lat: input.givenLat,
    given_lng: input.givenLng,
    agent_name: blankToNull(input.agentName),
    agent_email: blankToNull(input.agentEmail),
    agent_phone: blankToNull(input.agentPhone),
  }
}

export async function addTripListing(tripId: string, input: ListingInput): Promise<AddListingResult> {
  const canonical = canonicaliseListingUrl(input.url)
  if (!canonical) return { ok: false, reason: 'url' }

  const existing = await canonicalsOnTrip(tripId)
  if (existing.includes(canonical.canonicalUrl)) return { ok: false, reason: 'duplicate' }

  const { data: listingId, error: listingError } = await supabase.rpc('ensure_listing', {
    p_url: canonical.url,
    p_canonical_url: canonical.canonicalUrl,
    p_portal: canonical.portal,
  })
  if (listingError || !listingId) return { ok: false, reason: 'save' }

  const { data, error } = await supabase
    .from('trip_listings')
    .insert({ trip_id: tripId, listing_id: listingId, ...listingColumns(input) })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'duplicate' }
    return { ok: false, reason: 'save' }
  }
  return { ok: true, id: data.id }
}

export async function updateTripListing(id: string, input: ListingInput): Promise<boolean> {
  const { data, error } = await supabase
    .from('trip_listings')
    .update(listingColumns(input))
    .eq('id', id)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

export async function removeTripListing(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('trip_listings').delete().eq('id', id).select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
