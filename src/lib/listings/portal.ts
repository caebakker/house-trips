import { m } from '../../i18n/t'

export function portalLabel(portal: string | null, url: string): string {
  if (portal === 'immobiliare') return m.portals.immobiliare
  if (portal === 'idealista') return m.portals.idealista
  if (portal === 'casa') return m.portals.casa
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return m.portals.other
  }
}

export function priorityLabel(priority: number): string {
  if (priority === 1) return m.listingForm.priority1
  if (priority === 3) return m.listingForm.priority3
  return m.listingForm.priority2
}
