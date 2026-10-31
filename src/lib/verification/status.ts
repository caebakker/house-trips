export type VerificationDbStatus = 'queued' | 'in_review' | 'found' | 'not_found'

export type BuyerVerificationStatus = 'none' | 'requested' | 'found' | 'not_found'

export type VerificationStamp = {
  status: string
  createdAt: string
}

/** Buyers see requested, found, or not found. Queued and in review are both requested. */
export function buyerVerificationStatus(
  listingStatus: string,
  rows: VerificationStamp[],
): BuyerVerificationStatus {
  if (listingStatus === 'verified') return 'found'
  const open = rows.find((row) => row.status === 'queued' || row.status === 'in_review')
  if (open) return 'requested'
  const latest = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!latest) return listingStatus === 'not_found' ? 'not_found' : 'none'
  if (latest.status === 'found') return 'found'
  if (latest.status === 'not_found') return 'not_found'
  return 'none'
}

export function verificationFailure(message: string): 'no_credits' | 'already' | 'save' {
  if (message.includes('no credits')) return 'no_credits'
  if (message.includes('already requested') || message.includes('already found')) return 'already'
  return 'save'
}

export type QueueSortable = {
  tripStart: string
  createdAt: string
}

/** Soonest trip date first, then the older request. */
export function compareQueue(a: QueueSortable, b: QueueSortable): number {
  return a.tripStart.localeCompare(b.tripStart) || a.createdAt.localeCompare(b.createdAt)
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return ''
  if (metres < 1000) return `${Math.round(metres)} metres`
  const km = metres / 1000
  const text = km >= 10 ? String(Math.round(km)) : km.toFixed(1)
  return `${text} km`
}
