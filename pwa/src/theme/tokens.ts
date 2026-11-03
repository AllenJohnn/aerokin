/**
 * AEROKIN Machined Hardware Remote Theme Tokens
 * 
 * Supports two deliberate hardware presets:
 * 1. DECEPTICON (Default): Gunmetal surfaces, brushed steel neutrals, metallic purple primary, optic red active/alert.
 * 2. AERO: Deep aerospace midnight surfaces, violet primary, electric cyan active.
 */

export type ThemePreset = 'decepticon' | 'aero';

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceHighlight: string;
  border: string;
  borderSubtle: string;
  borderMilled: string;
  borderEngraved: string;
  text: string;
  textMuted: string;
  textDim: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primarySubtle: string;
  opticRed: string;
  opticRedGlow: string;
  active: string;
  activeGlow: string;
  oledBg: string;
  oledBorder: string;
  oledText: string;
  ledGreen: string;
  ledAmber: string;
  ledRed: string;
  wheelStrip: string;
  wheelDetent: string;
}

export const THEMES: Record<ThemePreset, ThemeColors> = {
  decepticon: {
    bg: '#0A0B0E',
    surface: '#12141B',
    surfaceRaised: '#181B24',
    surfaceSunken: '#0E1015',
    surfaceHighlight: '#222634',
    border: 'rgba(255, 255, 255, 0.08)',
    borderSubtle: 'rgba(255, 255, 255, 0.04)',
    borderMilled: 'rgba(255, 255, 255, 0.14)',
    borderEngraved: 'rgba(0, 0, 0, 0.85)',
    text: '#F0F2F6',
    textMuted: '#848C9E',
    textDim: '#4B5263',
    primary: '#8B5CF6',
    primaryHover: '#A78BFA',
    primaryActive: '#7C3AED',
    primarySubtle: 'rgba(139, 92, 246, 0.15)',
    opticRed: '#FF2E2E',
    opticRedGlow: 'rgba(255, 46, 46, 0.45)',
    active: '#FF2E2E',
    activeGlow: 'rgba(255, 46, 46, 0.45)',
    oledBg: '#08090C',
    oledBorder: 'rgba(255, 255, 255, 0.06)',
    oledText: '#A78BFA',
    ledGreen: '#10B981',
    ledAmber: '#F59E0B',
    ledRed: '#FF2E2E',
    wheelStrip: '#13151D',
    wheelDetent: 'rgba(255, 255, 255, 0.1)',
  },
  aero: {
    bg: '#07070B',
    surface: '#101118',
    surfaceRaised: '#181A25',
    surfaceSunken: '#0B0C12',
    surfaceHighlight: '#232637',
    border: 'rgba(255, 255, 255, 0.08)',
    borderSubtle: 'rgba(255, 255, 255, 0.04)',
    borderMilled: 'rgba(255, 255, 255, 0.14)',
    borderEngraved: 'rgba(0, 0, 0, 0.85)',
    text: '#F5F5F7',
    textMuted: '#8A8A96',
    textDim: '#4F4F5B',
    primary: '#7C5CFF',
    primaryHover: '#957CFF',
    primaryActive: '#6845FF',
    primarySubtle: 'rgba(124, 92, 255, 0.15)',
    opticRed: '#F43F5E',
    opticRedGlow: 'rgba(244, 63, 94, 0.45)',
    active: '#22D3EE',
    activeGlow: 'rgba(34, 211, 238, 0.45)',
    oledBg: '#06070B',
    oledBorder: 'rgba(34, 211, 238, 0.15)',
    oledText: '#22D3EE',
    ledGreen: '#22D3EE',
    ledAmber: '#FBBF24',
    ledRed: '#F43F5E',
    wheelStrip: '#10121C',
    wheelDetent: 'rgba(34, 211, 238, 0.15)',
  },
};

export const MECHANICAL_EFFECTS = {
  bevel: 'inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.8)',
  insetWell: 'inset 0 2px 4px rgba(0, 0, 0, 0.75), inset 0 0 1px rgba(0, 0, 0, 0.9)',
  tactileButton: '0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 1px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
  buttonPressed: 'inset 0 2px 5px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(255, 255, 255, 0.05)',
  knurledRim: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 6px)',
} as const;
