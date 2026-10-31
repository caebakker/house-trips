import raw from '../../data/comuni.json' with { type: 'json' }

export type Comune = {
  istat: string
  name: string
  nameAlt: string | null
  province: string
  provinceCode: string
  lat: number
  lng: number
  areaKm2: number
}

type Row = [string, string, string, string, string, number, number, number]

export const comuni: Comune[] = (raw as Row[]).map((row) => ({
  istat: row[0],
  name: row[1],
  nameAlt: row[2] ? row[2] : null,
  province: row[3],
  provinceCode: row[4],
  lat: row[5],
  lng: row[6],
  areaKm2: row[7],
}))

const byIstat = new Map(comuni.map((comune) => [comune.istat, comune]))

export function findComune(istat: string): Comune | null {
  return byIstat.get(istat) ?? null
}

export function comuneLabel(comune: Comune): string {
  return `${comune.name}, ${comune.province} (${comune.provinceCode})`
}
