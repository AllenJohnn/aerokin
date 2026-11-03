/**
 * AEROKIN Design System Design Tokens
 * 
 * "Move the air. Move your PC."
 */

export const colors = {
  bg: '#07070B',
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceHover: 'rgba(255, 255, 255, 0.08)',
  surfaceActive: 'rgba(255, 255, 255, 0.12)',
  border: 'rgba(255, 255, 255, 0.08)',
  borderBright: 'rgba(255, 255, 255, 0.16)',
  borderFocus: 'rgba(124, 92, 255, 0.45)',
  text: '#F5F5F7',
  muted: '#8A8A96',
  accent: {
    violet: '#7C5CFF',
    cyan: '#22D3EE',
    gradient: 'linear-gradient(135deg, #7C5CFF 0%, #22D3EE 100%)',
    gradientH: 'linear-gradient(90deg, #7C5CFF 0%, #22D3EE 100%)',
  },
  status: {
    online: '#22D3EE',
    active: '#7C5CFF',
    idle: '#8A8A96',
    warning: '#FBBF24',
    error: '#F43F5E',
  },
} as const;

export const shadows = {
  glowSm: '0 0 16px -2px rgba(124, 92, 255, 0.35), 0 0 8px -2px rgba(34, 211, 238, 0.25)',
  glowMd: '0 0 28px -4px rgba(124, 92, 255, 0.45), 0 0 14px -2px rgba(34, 211, 238, 0.35)',
  glowLg: '0 0 48px -6px rgba(124, 92, 255, 0.55), 0 0 24px -4px rgba(34, 211, 238, 0.45)',
  glowCyan: '0 0 24px -2px rgba(34, 211, 238, 0.45)',
  glowViolet: '0 0 24px -2px rgba(124, 92, 255, 0.45)',
  glass: '0 12px 36px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
  glassSm: '0 4px 16px 0 rgba(0, 0, 0, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
} as const;

export const motion = {
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  durations: {
    fast: '200ms',
    standard: '300ms',
    emphasis: '400ms',
    slow: '500ms',
    fluid: '600ms',
  },
} as const;

export const typography = {
  fonts: {
    sans: '"Geist Sans", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  tracking: {
    tightest: '-0.04em',
    tighter: '-0.025em',
    tight: '-0.015em',
    mono: '0.08em',
  },
} as const;

export const tokens = {
  colors,
  shadows,
  motion,
  typography,
} as const;

export default tokens;
