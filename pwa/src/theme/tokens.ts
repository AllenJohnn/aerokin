/**
 * Aerokin Design Tokens
 * 
 * Minimal, premium design system tokens.
 * Reference bar: Apple Remote app, Linear, Vercel/Geist, Raycast.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ColorTokens {
  bg: string;
  surface: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  opticRed: string;
  success: string;
  error: string;
}

export const THEME_COLORS: Record<'dark' | 'light', ColorTokens> = {
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
};

export const RADII = {
  card: '16px',
  pad: '16px',
  button: '12px',
  pill: '9999px',
} as const;

export const MOTION = {
  spring: {
    type: 'spring',
    stiffness: 400,
    damping: 34,
  },
  duration: 0.18, // 180ms within 150-250ms window
  pressScale: 0.97,
} as const;

export const TYPOGRAPHY = {
  fonts: {
    sans: '"Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  // 5 size steps
  sizes: {
    caption: '12px',  // text-xs
    body: '14px',     // text-sm
    subhead: '16px',  // text-base
    title: '20px',    // text-xl
    display: '28px',  // text-2xl
  },
} as const;
