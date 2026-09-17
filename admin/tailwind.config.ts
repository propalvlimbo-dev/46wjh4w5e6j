import type { Config } from 'tailwindcss'
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#09090B',
        card: '#111113',
        hover: '#17171A',
        border: '#1F1F23',
        borderStrong: '#2A2A2F',
        text: '#EDEDED',
        muted: '#71717A',
        pink: '#FF6FA5'
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    }
  },
  plugins: []
} satisfies Config