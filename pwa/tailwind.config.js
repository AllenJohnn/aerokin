import designSystemPreset from '../design-system/tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [designSystemPreset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../design-system/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        hw: {
          bg: 'var(--hw-bg)',
          surface: 'var(--hw-surface)',
          'surface-raised': 'var(--hw-surface-raised)',
          'surface-sunken': 'var(--hw-surface-sunken)',
          'surface-hl': 'var(--hw-surface-hl)',
          border: 'var(--hw-border)',
          'border-subtle': 'var(--hw-border-subtle)',
          'border-milled': 'var(--hw-border-milled)',
          text: 'var(--hw-text)',
          'text-muted': 'var(--hw-text-muted)',
          'text-dim': 'var(--hw-text-dim)',
          primary: 'var(--hw-primary)',
          'primary-hover': 'var(--hw-primary-hover)',
          'optic-red': 'var(--hw-optic-red)',
          active: 'var(--hw-active)',
          'oled-bg': 'var(--hw-oled-bg)',
          'oled-text': 'var(--hw-oled-text)',
          'led-green': 'var(--hw-led-green)',
          'led-amber': 'var(--hw-led-amber)',
          'led-red': 'var(--hw-led-red)',
        },
      },
      fontFamily: {
        display: ['"Chakra Petch"', '"Oxanium"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Geist Mono"', 'monospace'],
        sans: ['"Geist Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'hw-bevel': 'inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.8)',
        'hw-well': 'inset 0 2px 4px rgba(0, 0, 0, 0.75), inset 0 0 1px rgba(0, 0, 0, 0.9)',
        'hw-btn': '0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 1px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        'hw-btn-pressed': 'inset 0 2px 5px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
    },
  },
  plugins: [],
};
