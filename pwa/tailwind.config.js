/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../design-system/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        border: 'var(--border)',
        foreground: 'var(--text)',
        'muted-foreground': 'var(--muted)',
        accent: {
          DEFAULT: 'var(--accent)',
          pressed: 'var(--accent-pressed)',
        },
        success: 'var(--success)',
        error: 'var(--error)',
      },
      fontFamily: {
        sans: ['"Geist Sans"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        '2xl': '16px',
        xl: '12px',
        card: '16px',
        pad: '16px',
        btn: '12px',
      },
      boxShadow: {
        sheet: '0 -4px 24px 0 rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [],
};
