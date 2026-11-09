import { handleRouteMatrix } from '../../src/lib/routing/handle.ts'

type NetlifyGlobals = {
  Netlify?: { env: { get(name: string): string | undefined } }
}

/** Road times for a trip the caller belongs to. ORS_API_KEY never reaches the browser. */
export default function routeMatrix(req: Request): Promise<Response> {
  const env = (globalThis as NetlifyGlobals).Netlify?.env
  return handleRouteMatrix(req, {
    env: (name) => env?.get(name),
    fetch: globalThis.fetch.bind(globalThis),
  })
}
