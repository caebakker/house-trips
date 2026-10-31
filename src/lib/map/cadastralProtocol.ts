import { addProtocol } from 'maplibre-gl'
import { cadastralGetMapQuery, tileBoundsWgs84 } from './cadastral'

let ready = false
let getToken: () => Promise<string | null> = async () => null

/** One protocol for the admin map. The token getter is replaced on each mount. */
export function registerCadastralProtocol(provider: () => Promise<string | null>): void {
  getToken = provider
  if (ready) return
  ready = true
  addProtocol('cadastral', async (params, abortController) => {
    const match = params.url.match(/^cadastral:\/\/(\d+)\/(\d+)\/(\d+)/)
    if (!match) throw new Error('bad cadastral tile')
    const z = Number(match[1])
    const x = Number(match[2])
    const y = Number(match[3])
    const query = cadastralGetMapQuery(tileBoundsWgs84(x, y, z))
    const headers = new Headers()
    const token = await getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(`/api/cadastral-wms?${query}`, {
      headers,
      signal: abortController.signal,
    })
    if (!response.ok) throw new Error(`cadastral ${response.status}`)
    return { data: await response.arrayBuffer() }
  })
}
