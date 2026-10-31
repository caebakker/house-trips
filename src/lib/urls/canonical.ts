export type Portal = 'immobiliare' | 'idealista' | 'casa' | ''

export type CanonicalListing = {
  /** Clean URL stored on the listing and opened from the trip. */
  url: string
  canonicalUrl: string
  portal: Portal
}

const TRACKING_EXACT = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'mkt_tok',
  'yclid',
  's_kwcid',
  'vero_id',
  'oly_anon_id',
  'oly_enc_id',
  '_hsenc',
  '_hsmi',
  'hsa_acc',
  'hsa_cam',
  'hsa_grp',
  'hsa_ad',
  'hsa_src',
  'hsa_tgt',
  'hsa_kw',
  'hsa_mt',
  'hsa_net',
  'hsa_ver',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_reader',
  'utm_viz_id',
  'utm_pubreferrer',
  'utm_swu',
  'utm_referrer',
  'ref_src',
  'ref_url',
  'ncid',
  'nr_email_referer',
])

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase()
  return TRACKING_EXACT.has(key) || key.startsWith('utm_') || key.startsWith('hsa_')
}

function bareHost(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.+$/, '')
  return host.startsWith('www.') ? host.slice(4) : host
}

function isHost(hostname: string, root: string): boolean {
  return hostname === root || hostname.endsWith(`.${root}`)
}

function listingId(pathname: string, pattern: RegExp): string | null {
  const match = pattern.exec(pathname)
  return match ? match[1] : null
}

function genericCanonical(parsed: URL): string {
  const host = bareHost(parsed.hostname)
  const port = parsed.port && parsed.port !== '80' && parsed.port !== '443' ? `:${parsed.port}` : ''
  let path = parsed.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.replace(/\/+$/, '')
  if (path === '/') path = ''

  const params = [...parsed.searchParams.entries()].filter(([key]) => !isTrackingParam(key))
  params.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  const search = new URLSearchParams()
  for (const [key, value] of params) search.append(key, value)
  const query = search.toString()

  return `https://${host}${port}${path}${query ? `?${query}` : ''}`
}

/**
 * Stable identity for a pasted listing link.
 * Portal listings collapse to the public id. Everything else loses the
 * fragment, tracking parameters, default port and a leading www.
 */
export function canonicaliseListingUrl(input: string): CanonicalListing | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 2000) return null

  let candidate = trimmed
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) candidate = `https://${candidate}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null

  const host = bareHost(parsed.hostname)
  if (!host || !host.includes('.')) return null

  if (isHost(host, 'immobiliare.it')) {
    const id = listingId(parsed.pathname, /\/annunci\/(\d+)/i)
    if (id) {
      const canonicalUrl = `https://www.immobiliare.it/annunci/${id}`
      return { url: canonicalUrl, canonicalUrl, portal: 'immobiliare' }
    }
  }

  if (isHost(host, 'idealista.it')) {
    const id = listingId(parsed.pathname, /\/immobile\/(\d+)/i)
    if (id) {
      const canonicalUrl = `https://www.idealista.it/immobile/${id}`
      return { url: canonicalUrl, canonicalUrl, portal: 'idealista' }
    }
  }

  if (isHost(host, 'casa.it')) {
    const id = listingId(parsed.pathname, /\/immobili\/(\d+)/i)
    if (id) {
      const canonicalUrl = `https://www.casa.it/immobili/${id}`
      return { url: canonicalUrl, canonicalUrl, portal: 'casa' }
    }
  }

  const canonicalUrl = genericCanonical(parsed)
  return { url: canonicalUrl, canonicalUrl, portal: '' }
}
