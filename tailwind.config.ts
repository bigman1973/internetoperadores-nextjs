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
          50: '#FFF5ED',
          100: '#FFE8D4',
          200: '#FFCDA8',
          300: '#FFAB71',
          400: '#FF7E38',
          500: '#FF5300',
          600: '#E64A00',
          700: '#BF3D00',
          800: '#983200',
          900: '#7A2B00',
          950: '#421300',
        },
      },
    },
  },
  plugins: [],
}

export default config
