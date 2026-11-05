export interface MonitorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorInfo {
  id: string;
  name: string;
  bounds: MonitorBounds;
  workArea?: MonitorBounds;
  dpiScale: number;
  isPrimary: boolean;
}

export type QualityPresetName = 'ultra' | 'high' | 'balanced' | 'fast' | 'tiny' | 'low';

export interface DesktopStats {
  fps: number;
  bitrateKbps: number;
  droppedFrames: number;
  frameSequence?: number;
  width?: number;
  height?: number;
  latencyMs?: number;
  backend?: 'ddagrab' | 'gdigrab';
  activeTier?: QualityPresetName;
}

export type DesktopStreamState =
  | 'connecting'
  | 'live'
  | 'secure_screen'
  | 'error'
  | 'reconnecting'
  | 'stopped';

export type DesktopInputMode = 'direct' | 'trackpad';

export interface DesktopSettings {
  defaultPreset: QualityPresetName;
  fpsCap: number;
  inputMode: DesktopInputMode;
  showStats: boolean;
  autoHideToolbar: boolean;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  defaultPreset: 'fast',
  fpsCap: 30,
  inputMode: 'direct',
  showStats: false,
  autoHideToolbar: true,
};

export const STORAGE_DESKTOP_SETTINGS_KEY = 'aerokin_desktop_settings';

export function loadDesktopSettings(): DesktopSettings {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_DESKTOP_SETTINGS_KEY);
    if (!raw) return DEFAULT_DESKTOP_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      defaultPreset: ['ultra', 'high', 'balanced', 'fast', 'tiny', 'low'].includes(parsed.defaultPreset)
        ? parsed.defaultPreset === 'low' ? 'tiny' : parsed.defaultPreset
        : 'fast',
      fpsCap: typeof parsed.fpsCap === 'number' ? Math.max(15, Math.min(60, parsed.fpsCap)) : 30,
      inputMode: parsed.inputMode === 'trackpad' ? 'trackpad' : 'direct',
      showStats: Boolean(parsed.showStats),
      autoHideToolbar: parsed.autoHideToolbar !== undefined ? Boolean(parsed.autoHideToolbar) : true,
    };
  } catch {
    return DEFAULT_DESKTOP_SETTINGS;
  }
}

export function saveDesktopSettings(settings: DesktopSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_DESKTOP_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
