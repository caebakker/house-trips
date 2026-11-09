/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  readonly VITE_MAP_STYLE_URL?: string
  readonly VITE_ADMIN_IMAGERY_URL?: string
  readonly VITE_ADMIN_IMAGERY_ATTRIBUTION?: string
}
