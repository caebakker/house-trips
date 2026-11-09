import type { Json } from '../../types/database'
import { supabase } from '../supabase'
import { classifyOptOutUrls } from './urls'

export type OptOutRequest = {
  id: string
  listingUrls: string[]
  comune: string | null
  contactEmail: string | null
  createdAt: string
}

export type OptOutSubmit = {
  urls: string[]
  comune: string
  email: string
  confirmed: boolean
  company: string
}

function record(value: Json): Record<string, Json | undefined> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value
}

function text(value: Json | undefined): string | null {
  return typeof value === 'string' && value ? value : null
}

function urlList(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export async function submitSellerOptOut(input: OptOutSubmit): Promise<void> {
  const { error } = await supabase.rpc('submit_seller_opt_out', {
    p_listing_urls: input.urls,
    p_comune: input.comune.trim() ? input.comune.trim() : undefined,
    p_contact_email: input.email.trim() ? input.email.trim() : undefined,
    p_confirmed: input.confirmed,
    p_company: input.company,
  })
  if (error) throw error
}

export function submitFailure(message: string): 'urls' | 'email' | 'comune' | 'confirm' | 'slow' | 'save' {
  if (message.includes('invalid urls')) return 'urls'
  if (message.includes('invalid email')) return 'email'
  if (message.includes('invalid comune')) return 'comune'
  if (message.includes('not confirmed')) return 'confirm'
  if (message.includes('slow down')) return 'slow'
  return 'save'
}

export async function fetchOptOutQueue(): Promise<OptOutRequest[]> {
  const { data, error } = await supabase.rpc('admin_opt_out_queue')
  if (error) throw error
  if (!Array.isArray(data)) return []
  const rows: OptOutRequest[] = []
  for (const value of data) {
    const row = record(value)
    if (!row) continue
    const id = text(row.id)
    const createdAt = text(row.created_at)
    const listingUrls = urlList(row.listing_urls)
    if (!id || !createdAt || listingUrls.length === 0) continue
    rows.push({
      id,
      listingUrls,
      comune: text(row.comune),
      contactEmail: text(row.contact_email),
      createdAt,
    })
  }
  return rows
}

export async function decideOptOut(
  request: OptOutRequest,
  decision: 'approved' | 'rejected',
): Promise<void> {
  const canonical = decision === 'approved' ? classifyOptOutUrls(request.listingUrls).canonical : []
  if (decision === 'approved' && canonical.length === 0) {
    throw new Error('invalid urls')
  }
  const { error } = await supabase.rpc('decide_seller_opt_out', {
    p_request_id: request.id,
    p_decision: decision,
    p_canonical_urls: decision === 'approved' ? canonical : undefined,
  })
  if (error) throw error
}
