import { fileURLToPath } from 'node:url'

// Point Tailwind at this folder's config explicitly, so the styles build the same
// whichever directory Vite is started from.
export default {
  plugins: { tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) }, autoprefixer: {} },
}
