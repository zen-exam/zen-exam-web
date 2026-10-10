import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /api and /files are proxied to the backend so the session cookie stays same-origin.
// In production, set VITE_API_URL to the backend's URL (or rewrite /api and /files to it on your host).
const API = process.env.API_URL ?? 'http://localhost:8787'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': API,
      '/files': API,
    },
  },
})
