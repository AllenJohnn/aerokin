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
        aerokin: {
          bg: '#07070B',
          surface: 'rgba(255, 255, 255, 0.05)',
          'surface-hover': 'rgba(255, 255, 255, 0.08)',
          'surface-active': 'rgba(255, 255, 255, 0.12)',
          border: 'rgba(255, 255, 255, 0.08)',
          'border-bright': 'rgba(255, 255, 255, 0.16)',
          'border-focus': 'rgba(124, 92, 255, 0.45)',
          text: '#F5F5F7',
          muted: '#8A8A96',
          violet: '#7C5CFF',
          cyan: '#22D3EE',
        },
      },
      fontFamily: {
        sans: ['"Geist Sans"', 'Geist', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.025em',
        tight: '-0.015em',
        'mono-wide': '0.08em',
      },
      transitionTimingFunction: {
        aerokin: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        '200': '200ms',
        '250': '250ms',
        '300': '300ms',
        '400': '400ms',
        '500': '500ms',
        '600': '600ms',
      },
      boxShadow: {
        'glow-sm': '0 0 16px -2px rgba(124, 92, 255, 0.35), 0 0 8px -2px rgba(34, 211, 238, 0.25)',
        'glow-md': '0 0 28px -4px rgba(124, 92, 255, 0.45), 0 0 14px -2px rgba(34, 211, 238, 0.35)',
        'glow-lg': '0 0 48px -6px rgba(124, 92, 255, 0.55), 0 0 24px -4px rgba(34, 211, 238, 0.45)',
        'glow-cyan': '0 0 24px -2px rgba(34, 211, 238, 0.45)',
        'glow-violet': '0 0 24px -2px rgba(124, 92, 255, 0.45)',
        'glass': '0 12px 36px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
      },
      backgroundImage: {
        'aerokin-gradient': 'linear-gradient(135deg, #7C5CFF 0%, #22D3EE 100%)',
        'aerokin-gradient-h': 'linear-gradient(90deg, #7C5CFF 0%, #22D3EE 100%)',
        'aerokin-gradient-v': 'linear-gradient(180deg, #7C5CFF 0%, #22D3EE 100%)',
        'glass-highlight': 'linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%)',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.9', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.92)' },
        },
        cometPass: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { transform: 'translateX(200%)', opacity: '0' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-glow': 'pulseGlow 2.5s cubic-bezier(0.22, 1, 0.36, 1) infinite',
        'shimmer': 'shimmer 2.5s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
    },
  },
  plugins: [],
};
