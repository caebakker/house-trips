import { comuni, type Comune } from './data'
import { fold } from '../text/fold'

type Indexed = Comune & {
  foldName: string
  foldAlt: string
  haystack: string
}

const index: Indexed[] = comuni.map((comune) => {
  const foldName = fold(comune.name)
  const foldAlt = comune.nameAlt ? fold(comune.nameAlt) : ''
  const foldProvince = fold(comune.province)
  return {
    ...comune,
    foldName,
    foldAlt,
    haystack: `${foldName} ${foldAlt} ${foldProvince} ${comune.provinceCode.toLowerCase()}`.trim(),
  }
})

function rank(comune: Indexed, query: string, firstToken: string): number {
  if (comune.foldName === query || (comune.foldAlt !== '' && comune.foldAlt === query)) return 0
  if (comune.foldName.startsWith(query) || (comune.foldAlt !== '' && comune.foldAlt.startsWith(query))) {
    return 1
  }
  if (comune.foldName.startsWith(firstToken)) return 2
  return 3
}

/** Comuni whose name, other official name, or province matches the query. */
export function searchComuni(query: string, limit = 8): Comune[] {
  const folded = fold(query)
  if (folded.length < 2) return []
  const tokens = folded.split(' ').filter(Boolean)
  const matches = index.filter((comune) => tokens.every((token) => comune.haystack.includes(token)))
  matches.sort(
    (a, b) => rank(a, folded, tokens[0]) - rank(b, folded, tokens[0]) || a.name.localeCompare(b.name, 'it'),
  )
  return matches.slice(0, limit).map((comune) => ({
    istat: comune.istat,
    name: comune.name,
    nameAlt: comune.nameAlt,
    province: comune.province,
    provinceCode: comune.provinceCode,
    lat: comune.lat,
    lng: comune.lng,
    areaKm2: comune.areaKm2,
  }))
}
