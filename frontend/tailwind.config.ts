import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FFF8FB',
        pink: { DEFAULT: '#FF6FA5', soft: '#FFB6D5', deep: '#E84D8A' },
        ink: '#1A1A1A'
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-unbounded)', 'Unbounded', 'sans-serif']
      },
      backdropBlur: { xs: '2px' }
    }
  },
  plugins: []
} satisfies Config