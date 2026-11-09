import { supabase } from '../supabase'
import type { VerificationDbStatus } from './status'

export type VerificationRow = {
  id: string
  tripListingId: string
  status: VerificationDbStatus
  createdAt: string
}

const STATUSES: readonly string[] = ['queued', 'in_review', 'found', 'not_found']

export async function fetchCreditBalance(): Promise<number> {
  const { data, error } = await supabase.rpc('credit_balance')
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

export async function listVerificationStatuses(tripListingIds: string[]): Promise<VerificationRow[]> {
  if (tripListingIds.length === 0) return []
  const { data, error } = await supabase
    .from('verification_requests')
    .select('id, trip_listing_id, status, created_at')
    .in('trip_listing_id', tripListingIds)
  if (error) throw error
  const rows: VerificationRow[] = []
  for (const row of data ?? []) {
    if (!STATUSES.includes(row.status)) continue
    rows.push({
      id: row.id,
      tripListingId: row.trip_listing_id,
      status: row.status as VerificationDbStatus,
      createdAt: row.created_at,
    })
  }
  return rows
}

export async function requestVerification(tripListingId: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_verification', {
    p_trip_listing_id: tripListingId,
  })
  if (error) throw error
  if (!data) throw new Error('save')
  return data
}

export const CREDITS_CHANGED = 'guidocasa-credits-changed'

export function notifyCreditsChanged(): void {
  window.dispatchEvent(new Event(CREDITS_CHANGED))
}
