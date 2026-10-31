import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre's worker is loaded from the package itself. Vite's dep
  // optimiser looks for that worker in the wrong place and the trip map
  // fails to load in dev.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
