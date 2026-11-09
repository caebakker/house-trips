import { matrixForPoints, parseRouteRequest } from './ors'

export type EnvLookup = (name: string) => string | undefined

function bearer(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function callerIsMember(token: string, tripId: string, env: EnvLookup, fetchImpl: typeof fetch): Promise<boolean> {
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL')
  const key = env('SUPABASE_PUBLISHABLE_KEY') ?? env('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!url || !key) return false
  const response = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/is_trip_member`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_trip_id: tripId }),
  })
  if (!response.ok) return false
  const body: unknown = await response.json()
  return body === true
}

/**
 * Authenticated trip members only. The ORS key stays here. With no key, or
 * when ORS fails, the response is the straight-line matrix.
 */
export async function handleRouteMatrix(
  req: Request,
  deps: { env: EnvLookup; fetch: typeof fetch },
): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const token = bearer(req)
  if (!token) return json({ error: 'sign_in' }, 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const parsed = parseRouteRequest(body)
  if (!parsed) return json({ error: 'bad_request' }, 400)

  const allowed = await callerIsMember(token, parsed.tripId, deps.env, deps.fetch)
  if (!allowed) return json({ error: 'not_allowed' }, 403)

  const matrix = await matrixForPoints(parsed.locations, deps.env('ORS_API_KEY'), deps.fetch)
  return json(matrix)
}
