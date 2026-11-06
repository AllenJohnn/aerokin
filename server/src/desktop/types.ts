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

export type QualityPresetName = 'ultra' | 'high' | 'balanced' | 'fast' | 'tiny' | 'low';

export interface QualityPresetConfig {
  name: QualityPresetName;
  scale: number; // 1.0, 0.75, 0.50, 0.40
  fps: number; // 60, 30, 15
  jpegQuality: number; // 2 (high quality, low compression) to 8 (lower quality, fast)
  bitrateKbps: number; // Target H.264 bitrate in Kbps
}

export const QUALITY_PRESETS: Record<QualityPresetName, QualityPresetConfig> = {
  ultra: {
    name: 'ultra',
    scale: 1.0,
    fps: 60,
    jpegQuality: 2,
    bitrateKbps: 6000,
  },
  high: {
    name: 'high',
    scale: 1.0,
    fps: 30,
    jpegQuality: 3,
    bitrateKbps: 3500,
  },
  balanced: {
    name: 'balanced',
    scale: 0.75,
    fps: 30,
    jpegQuality: 5,
    bitrateKbps: 2000,
  },
  fast: {
    name: 'fast',
    scale: 0.5,
    fps: 30,
    jpegQuality: 7,
    bitrateKbps: 1000,
  },
  tiny: {
    name: 'tiny',
    scale: 0.4,
    fps: 15,
    jpegQuality: 8,
    bitrateKbps: 500,
  },
  low: {
    name: 'low',
    scale: 0.5,
    fps: 15,
    jpegQuality: 8,
    bitrateKbps: 500,
  },
};

export type DesktopSessionState = 'stopped' | 'starting' | 'active' | 'secure_screen' | 'error';

export type CaptureBackend = 'ddagrab' | 'gdigrab' | 'testsrc';
export type VideoCodec = 'h264' | 'mjpeg';
export type H264Encoder = 'h264_nvenc' | 'h264_mf' | 'libx264';

export interface DesktopStats {
  fps: number;
  bitrateKbps: number;
  latencyMs?: number;
  latencyP50?: number;
  latencyP95?: number;
  decodeMs?: number;
  paintMs?: number;
  droppedFrames: number;
  frameSequence: number;
  width: number;
  height: number;
  backend?: CaptureBackend;
  codec?: VideoCodec;
  encoder?: H264Encoder;
  activeTier?: QualityPresetName;
}
