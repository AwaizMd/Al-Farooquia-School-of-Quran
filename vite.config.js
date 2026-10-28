import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.js'], include: ['src/**/*.test.{js,jsx}'], testTimeout: 30000 },
  // Same-origin /api in development so session cookies stay first-party.
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          motion: ['framer-motion', 'lenis'],
        },
      },
    },
  },
})
