/**
 * Aerokin Design Tokens - Minimal True Black (OLED)
 */

export const colors = {
  bg: '#000000',
  surface: '#0A0A0A',
  raised: '#121212',
  border: '#1F1F1F',
  text: '#F5F5F5',
  muted: '#8A8A8A',
  accent: '#FF5A1F',
  accentPressed: '#E64A12',
  success: '#3DDC84',
  error: '#FF453A',
} as const;

export const radii = {
  card: '16px',
  pad: '16px',
  button: '12px',
  pill: '9999px',
} as const;

export const motion = {
  spring: {
    stiffness: 400,
    damping: 34,
  },
  duration: 180,
  pressScale: 0.97,
} as const;

export const typography = {
  fonts: {
    sans: '"Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  sizes: {
    caption: '12px',
    body: '14px',
    subhead: '16px',
    title: '20px',
    display: '28px',
  },
} as const;

export const tokens = {
  colors,
  radii,
  motion,
  typography,
} as const;

export default tokens;
