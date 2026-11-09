import { canonicaliseListingUrl } from '../urls/canonical'

export const MAX_OPT_OUT_URLS = 10

export function listingLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function optOutEmailOk(value: string): boolean {
  const email = value.trim()
  if (!email) return true
  return email.length <= 320 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
}

/** URLs to store, already passed through the listing canonicaliser. */
export function canonicalOptOutUrls(value: string): { urls: string[] } | { error: 'empty' | 'too_many' | 'invalid'; invalid?: string } {
  const lines = listingLines(value)
  if (lines.length === 0) return { error: 'empty' }
  if (lines.length > MAX_OPT_OUT_URLS) return { error: 'too_many' }

  const urls: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const parsed = canonicaliseListingUrl(line)
    if (!parsed) return { error: 'invalid', invalid: line }
    if (seen.has(parsed.canonicalUrl)) continue
    seen.add(parsed.canonicalUrl)
    urls.push(parsed.canonicalUrl)
  }
  return { urls }
}

/** Admin approval re-canonicalises whatever was stored, so a pasted tracking link matches the listing row. */
export function classifyOptOutUrls(rawUrls: string[]): { canonical: string[]; unmatched: string[] } {
  const canonical: string[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()
  for (const raw of rawUrls) {
    const parsed = canonicaliseListingUrl(raw)
    if (!parsed) {
      unmatched.push(raw)
      continue
    }
    if (seen.has(parsed.canonicalUrl)) continue
    seen.add(parsed.canonicalUrl)
    canonical.push(parsed.canonicalUrl)
  }
  return { canonical, unmatched }
}
