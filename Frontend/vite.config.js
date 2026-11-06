import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const page = (name) => fileURLToPath(new URL(name, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    test: { environment: 'jsdom', setupFiles: ['src/test/setup.js'], include: ['src/**/*.test.{js,jsx}'], testTimeout: 30000 },
    // Same-origin /api in development so session cookies stay first-party.
    server: { port: Number(env.WEB_PORT) || 5173, strictPort: !!env.WEB_PORT, proxy: { '/api': env.API_PROXY_TARGET || 'http://localhost:4000' } },
    build: {
      rollupOptions: {
        // The attendance kiosk is its own small page (see src/kiosk).
        input: { main: page('index.html'), kiosk: page('kiosk.html') },
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            motion: ['framer-motion', 'lenis'],
          },
        },
      },
    },
  }
})
