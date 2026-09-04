/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Sophisticated Warm Tech Palette (Warm Charcoal / Espresso / Stone)
        dark: {
          950: '#0c0a09', // Deepest warm charcoal / near-black (stone-950)
          900: '#141210', // Rich warm espresso background
          850: '#1c1917', // Elevated warm surface (stone-900)
          800: '#26221f', // Card elevation / active hover
          750: '#332c27', // Subtle warm border accent
          700: '#443a34', // Hover & highlighted border
          600: '#574c44', // Muted warm border
          500: '#78716c', // Stone-500 muted text
          400: '#a8a29e', // Stone-400 secondary text
          300: '#d6d3d1', // Stone-300 bright text
          200: '#e7e5e4', // Stone-200 warm white
          100: '#f5f5f4', // Stone-100 cream white
        },
        // Warm Tech Accents (Amber, Warm Gold, Burnt Orange, Copper, Cream)
        brand: {
          amber: '#F59E0B',      // Primary warm amber
          gold: '#FBBF24',       // Radiant warm gold
          orange: '#EA580C',     // Burnt orange / copper
          copper: '#D97706',     // Metallic rich copper
          terracotta: '#C2410C', // Deep warm terracotta
          cream: '#FEF3C7',      // Warm cream / ivory
          emerald: '#10B981',    // Warm tech green (healthy/savings)
          rose: '#EF4444',       // Warm ruby / coral danger
          purple: '#EA580C',     // Warm accent map
          cyan: '#F59E0B',       // Warm amber alias for primary accent
          blue: '#EA580C',       // Warm copper alias for secondary accent
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(245, 158, 11, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)' },
        }
      }
    },
  },
  plugins: [],
}
