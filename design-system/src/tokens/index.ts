/**
 * Aerokin Design Tokens
 */

export const colors = {
  dark: {
    bg: '#09090B',
    surface: '#111113',
    raised: '#18181B',
    border: '#232326',
    text: '#FAFAFA',
    muted: '#8A8A93',
    accent: '#8B5CF6',
    accentHover: '#7C3AED',
    opticRed: '#FF3B30',
    success: '#10B981',
    error: '#EF4444',
  },
  light: {
    bg: '#FFFFFF',
    surface: '#F4F4F5',
    raised: '#E4E4E7',
    border: '#E4E4E7',
    text: '#09090B',
    muted: '#71717A',
    accent: '#8B5CF6',
    accentHover: '#7C3AED',
    opticRed: '#FF3B30',
    success: '#10B981',
    error: '#EF4444',
  },
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
