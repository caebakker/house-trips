/** Esri World Imagery. Admin locating only. Buyers never load this style. */
export const DEFAULT_ADMIN_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/** Esri requires this credit to stay visible on the map. */
export const DEFAULT_ADMIN_IMAGERY_ATTRIBUTION =
  'Powered by Esri. Esri, Maxar, Earthstar Geographics, and the GIS User Community'

export function resolveAdminImagery(
  url: string | undefined | null,
  attribution: string | undefined | null,
): { url: string; attribution: string } {
  const trimmedUrl = url?.trim() ?? ''
  const trimmedAttribution = attribution?.trim() ?? ''
  return {
    url: trimmedUrl || DEFAULT_ADMIN_IMAGERY_URL,
    attribution: trimmedAttribution || DEFAULT_ADMIN_IMAGERY_ATTRIBUTION,
  }
}

export function adminImagery(): { url: string; attribution: string } {
  return resolveAdminImagery(
    import.meta.env.VITE_ADMIN_IMAGERY_URL,
    import.meta.env.VITE_ADMIN_IMAGERY_ATTRIBUTION,
  )
}
