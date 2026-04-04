/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vouch: {
          purple: '#8b5cf6',
          'purple-light': '#a78bfa',
          'purple-dark': '#6d28d9',
          cyan: '#06b6d4',
          'cyan-light': '#22d3ee',
          emerald: '#10b981',
          'emerald-light': '#34d399',
          amber: '#f59e0b',
          red: '#ef4444',
          bg: '#050510',
          'bg-secondary': '#0d0d1a',
          'bg-card': 'rgba(255,255,255,0.03)',
          'border': 'rgba(255,255,255,0.08)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(139,92,246,0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(139,92,246,0.6), 0 0 40px rgba(139,92,246,0.2)' },
        },
      },
      backgroundImage: {
        'gradient-vouch': 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
        'gradient-dark': 'linear-gradient(135deg, #0d0d1a 0%, #050510 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(6,182,212,0.05) 100%)',
      },
    },
  },
  plugins: [],
};
