/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: '#FAF7F0', 50: '#FDFCF8', 100: '#F6F2E8', 200: '#EEE8DA' },
        sage: { 50: '#F3F6F2', 100: '#E8EFE8', 200: '#D3E0D5', 300: '#B5CBB9', 400: '#8FAE96' },
        primary: {
          50: '#EAF3EF', 100: '#D2E7DE', 200: '#A6CFBE', 300: '#6FAE95', 400: '#3D8A6E',
          500: '#1F6F55', 600: '#155C46', 700: '#0F4A39', 800: '#0C3B2E', 900: '#0A2F25',
        },
        forest: '#14352A',
        gold: { 50: '#FBF6EA', 100: '#F3E8CC', 200: '#E8D4A6', 300: '#D9BE85', 500: '#B8944A', 600: '#9A7A3A', 700: '#7A5F2B' },
        ink: { DEFAULT: '#262A27', soft: '#4A514C', muted: '#6B726C' },
        line: { DEFAULT: '#E7E2D7', strong: '#D8D1C2' },
        clay: { 50: '#FBF0EC', 100: '#F5DDD4', 500: '#B4533F', 600: '#9A4333', 700: '#7C3528' },
        amber: { 50: '#FDF5E6', 100: '#F8E7C3', 500: '#C08A2B', 600: '#9F7020', 700: '#7D5718' },
        slateblue: { 50: '#EEF1F6', 100: '#DCE2EC', 500: '#5A6B8C', 600: '#4A5974' },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        arabic: ['"Noto Naskh Arabic"', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,53,42,0.04), 0 1px 3px rgba(20,53,42,0.06)',
        lift: '0 8px 24px -8px rgba(20,53,42,0.18)',
        pop: '0 20px 50px -12px rgba(10,47,37,0.30)',
      },
      borderRadius: { xl2: '1.125rem' },
      screens: { xs: '400px' },
    },
  },
  plugins: [],
}
