import { cadastralUpstreamUrl } from '../../src/lib/map/cadastral.ts'

type NetlifyGlobals = {
  Netlify?: { env: { get(name: string): string | undefined } }
}

function readEnv(name: string): string | undefined {
  return (globalThis as NetlifyGlobals).Netlify?.env.get(name)
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return false
  const url = readEnv('SUPABASE_URL') ?? readEnv('VITE_SUPABASE_URL')
  const key = readEnv('SUPABASE_PUBLISHABLE_KEY') ?? readEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (!url || !key) return false
  const response = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!response.ok) return false
  const body: unknown = await response.json()
  return body === true
}

/** Admin-only proxy. The cadastral WMS does not send CORS headers. */
export default async function cadastralWms(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 })
  if (!(await callerIsAdmin(req))) return new Response('Forbidden', { status: 403 })
  const upstream = cadastralUpstreamUrl(req.url)
  if (!upstream) return new Response('Bad request', { status: 400 })
  const tile = await fetch(upstream, { headers: { 'User-Agent': 'Guidocasa admin map' } })
  if (!tile.ok) return new Response('Cadastral map unavailable', { status: 502 })
  return new Response(tile.body, {
    headers: {
      'Content-Type': tile.headers.get('Content-Type') ?? 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
