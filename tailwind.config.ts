import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#FF5300',
        secondary: '#1E3A5F',
        orange: {
          50: '#FFF6F2',
          100: '#FFE8DD',
          200: '#FFD4BF',
          300: '#FFB18C',
          400: '#FF864C',
          500: '#FF5300',
          600: '#E04900',
          700: '#BF3E00',
          800: '#993100',
          900: '#722500',
          950: '#471700',
        },
      },
    },
  },
  plugins: [],
}

export default config
