import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// When Tauri CLI builds, it sets TAURI_ENV_TARGET_TRIPLE.
// Native targets need a relative base so asset paths work on file:// / tauri:// origins.
const isTauri = process.env.TAURI_ENV_TARGET_TRIPLE !== undefined

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: isTauri ? './' : '/Walleys-Analytics/',

  // Tauri dev server: use fixed port so tauri.conf.json devUrl stays in sync.
  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts':  ['recharts'],
          'vendor-pdf':     ['jspdf', 'jspdf-autotable'],
          'vendor-db':      ['dexie', 'dexie-react-hooks'],
          'vendor-parsers': ['papaparse', 'xlsx'],
        },
      },
    },
  },
})
