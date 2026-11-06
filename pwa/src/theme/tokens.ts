/**
 * Aerokin Design Tokens - Minimal True Black (OLED)
 *
 * Strict Dieter Rams / Swiss minimalism.
 * Pure Black #000000, 1px borders, Signal Orange #FF5A1F accent (<5% screen area).
 */

export interface ColorTokens {
  bg: string;
  surface: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentPressed: string;
  success: string;
  error: string;
}

export const COLORS: ColorTokens = {
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
    caption: '12px', // text-xs
    body: '14px', // text-sm
    subhead: '16px', // text-base
    title: '20px', // text-xl
    display: '28px', // text-2xl
  },
} as const;
