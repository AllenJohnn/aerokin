/**
 * AEROKIN Desktop Remote Streaming & Input Types
 */

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

export type QualityPresetName = 'ultra' | 'high' | 'balanced' | 'fast' | 'low';

export interface QualityPresetConfig {
  name: QualityPresetName;
  scale: number; // 1.0, 0.75, 0.50
  fps: number; // 60, 30, 15
  jpegQuality: number; // 2 (high quality, low compression) to 8 (lower quality, fast)
}

export const QUALITY_PRESETS: Record<QualityPresetName, QualityPresetConfig> = {
  ultra: {
    name: 'ultra',
    scale: 1.0,
    fps: 60,
    jpegQuality: 2,
  },
  high: {
    name: 'high',
    scale: 1.0,
    fps: 30,
    jpegQuality: 3,
  },
  balanced: {
    name: 'balanced',
    scale: 0.75,
    fps: 30,
    jpegQuality: 5,
  },
  fast: {
    name: 'fast',
    scale: 0.5,
    fps: 30,
    jpegQuality: 7,
  },
  low: {
    name: 'low',
    scale: 0.5,
    fps: 15,
    jpegQuality: 8,
  },
};

export type DesktopSessionState =
  | 'stopped'
  | 'starting'
  | 'active'
  | 'secure_screen'
  | 'error';

export interface DesktopStats {
  fps: number;
  bitrateKbps: number;
  latencyMs?: number;
  droppedFrames: number;
  frameSequence: number;
  width: number;
  height: number;
}
