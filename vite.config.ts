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
  server: {
    proxy: {
      // Dev only. Production uses the admin-checked Netlify function.
      '/api/cadastral-wms': {
        target: 'https://wms.cartografia.agenziaentrate.gov.it',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cadastral-wms/, '/inspire/wms/ows01.php'),
      },
    },
  },
})
