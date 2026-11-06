import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildFfmpegArgs,
  mapMonitorToDdagrabIndex,
  CaptureOptions,
  WindowsFfmpegCaptureAdapter,
} from '../src/desktop/CaptureAdapter.js';
import { MonitorInfo, QUALITY_PRESETS, QualityPresetName } from '../src/desktop/types.js';

describe('FFmpeg Capture Argument Builder & Monitor Mapping', () => {
  const primaryMonitor: MonitorInfo = {
    id: 'mon_0',
    name: '\\\\.\\DISPLAY1',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    dpiScale: 1.25,
    isPrimary: true,
  };

  const secondaryNegativeMonitor: MonitorInfo = {
    id: 'mon_1',
    name: '\\\\.\\DISPLAY2',
    bounds: { x: -1920, y: -120, width: 1920, height: 1080 },
    dpiScale: 1.0,
    isPrimary: false,
  };

  describe('mapMonitorToDdagrabIndex', () => {
    it('maps mon_0 and mon_1 correctly', () => {
      expect(mapMonitorToDdagrabIndex(primaryMonitor)).toBe(0);
      expect(mapMonitorToDdagrabIndex(secondaryNegativeMonitor)).toBe(1);
    });

    it('maps DISPLAY name patterns when id is arbitrary', () => {
      expect(
        mapMonitorToDdagrabIndex({
          id: 'custom_id',
          name: '\\\\.\\DISPLAY1',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          dpiScale: 1.0,
          isPrimary: true,
        })
      ).toBe(0);

      expect(
        mapMonitorToDdagrabIndex({
          id: 'custom_id_2',
          name: '\\\\.\\DISPLAY3',
          bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
          dpiScale: 1.0,
          isPrimary: false,
        })
      ).toBe(2);
    });

    it('returns null for monitors without recognizable id or display name', () => {
      expect(
        mapMonitorToDdagrabIndex({
          id: 'virtual_mirror',
          name: 'Virtual Desktop Display',
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          dpiScale: 1.0,
          isPrimary: false,
        })
      ).toBeNull();
    });
  });

  describe('buildFfmpegArgs for ddagrab', () => {
    it('constructs correct ddagrab filter chain for primary display', () => {
      const options: CaptureOptions = {
        monitor: primaryMonitor,
        fps: 30,
        scale: 1.0,
        quality: 3,
      };

      const args = buildFfmpegArgs(options, 'ddagrab');

      expect(args).toContain('-nostdin');
      expect(args).toContain('-loglevel');
      expect(args).toContain('warning');
      expect(args).toContain('-fflags');
      expect(args).toContain('nobuffer');
      expect(args).toContain('-flags');
      expect(args).toContain('low_delay');
      expect(args).toContain('-f');
      expect(args).toContain('lavfi');

      const inputIdx = args.indexOf('-i');
      expect(inputIdx).toBeGreaterThan(-1);
      expect(args[inputIdx + 1]).toBe('ddagrab=framerate=30:draw_mouse=1:output_idx=0');

      const vfIdx = args.indexOf('-vf');
      expect(vfIdx).toBeGreaterThan(-1);
      expect(args[vfIdx + 1]).toBe('hwdownload,format=bgra,scale=1920:1080');

      expect(args).toContain('-c:v');
      expect(args).toContain('mjpeg');
      const qIdx = args.indexOf('-q:v');
      expect(args[qIdx + 1]).toBe('3');
      expect(args).toContain('-threads');
      expect(args).toContain('1');
      expect(args).toContain('pipe:1');
    });

    it('constructs correct ddagrab filter chain for secondary display with scaling', () => {
      const options: CaptureOptions = {
        monitor: secondaryNegativeMonitor,
        fps: 60,
        scale: 0.75,
        quality: 5,
      };

      const args = buildFfmpegArgs(options, 'ddagrab');

      const inputIdx = args.indexOf('-i');
      expect(args[inputIdx + 1]).toBe('ddagrab=framerate=60:draw_mouse=1:output_idx=1');

      const vfIdx = args.indexOf('-vf');
      expect(args[vfIdx + 1]).toBe('hwdownload,format=bgra,scale=1440:810');

      const qIdx = args.indexOf('-q:v');
      expect(args[qIdx + 1]).toBe('5');
    });
  });

  describe('buildFfmpegArgs for gdigrab', () => {
    it('constructs correct gdigrab args for primary monitor at (0, 0)', () => {
      const options: CaptureOptions = {
        monitor: primaryMonitor,
        fps: 30,
        scale: 1.0,
        quality: 3,
      };

      const args = buildFfmpegArgs(options, 'gdigrab');

      expect(args).toContain('-nostdin');
      expect(args).toContain('-f');
      const fIdx = args.indexOf('-f');
      expect(args[fIdx + 1]).toBe('gdigrab');

      const fpsIdx = args.indexOf('-framerate');
      expect(args[fpsIdx + 1]).toBe('30');

      expect(args).toContain('-draw_mouse');
      const dmIdx = args.indexOf('-draw_mouse');
      expect(args[dmIdx + 1]).toBe('1');

      const oxIdx = args.indexOf('-offset_x');
      expect(args[oxIdx + 1]).toBe('0');

      const oyIdx = args.indexOf('-offset_y');
      expect(args[oyIdx + 1]).toBe('0');

      const vsIdx = args.indexOf('-video_size');
      expect(args[vsIdx + 1]).toBe('1920x1080');

      const inputIdx = args.indexOf('-i');
      expect(args[inputIdx + 1]).toBe('desktop');

      const vfIdx = args.indexOf('-vf');
      expect(args[vfIdx + 1]).toBe('scale=1920:1080');

      const qIdx = args.indexOf('-q:v');
      expect(args[qIdx + 1]).toBe('3');
    });

    it('constructs correct gdigrab args with negative monitor offsets', () => {
      const options: CaptureOptions = {
        monitor: secondaryNegativeMonitor,
        fps: 15,
        scale: 0.5,
        quality: 8,
      };

      const args = buildFfmpegArgs(options, 'gdigrab');

      const oxIdx = args.indexOf('-offset_x');
      expect(args[oxIdx + 1]).toBe('-1920');

      const oyIdx = args.indexOf('-offset_y');
      expect(args[oyIdx + 1]).toBe('-120');

      const vsIdx = args.indexOf('-video_size');
      expect(args[vsIdx + 1]).toBe('1920x1080');

      const vfIdx = args.indexOf('-vf');
      expect(args[vfIdx + 1]).toBe('scale=960:540');

      const qIdx = args.indexOf('-q:v');
      expect(args[qIdx + 1]).toBe('8');
    });
  });

  describe('presets dimension parity and quality validation', () => {
    const presets: QualityPresetName[] = ['ultra', 'high', 'balanced', 'fast', 'tiny', 'low'];

    for (const p of presets) {
      it(`preset "${p}" builds even dimensions for both backends`, () => {
        const config = QUALITY_PRESETS[p];
        const options: CaptureOptions = {
          monitor: primaryMonitor,
          fps: config.fps,
          scale: config.scale,
          quality: config.jpegQuality,
        };

        const ddaArgs = buildFfmpegArgs(options, 'ddagrab');
        const gdiArgs = buildFfmpegArgs(options, 'gdigrab');

        const vfDda = ddaArgs[ddaArgs.indexOf('-vf') + 1];
        const vfGdi = gdiArgs[gdiArgs.indexOf('-vf') + 1];

        const matchDda = /scale=(\d+):(\d+)/.exec(vfDda);
        const matchGdi = /scale=(\d+):(\d+)/.exec(vfGdi);

        expect(matchDda).not.toBeNull();
        expect(matchGdi).not.toBeNull();

        const wDda = parseInt(matchDda![1], 10);
        const hDda = parseInt(matchDda![2], 10);
        const wGdi = parseInt(matchGdi![1], 10);
        const hGdi = parseInt(matchGdi![2], 10);

        expect(wDda % 2).toBe(0);
        expect(hDda % 2).toBe(0);
        expect(wGdi % 2).toBe(0);
        expect(hGdi % 2).toBe(0);

        expect(wDda).toBe(wGdi);
        expect(hDda).toBe(hGdi);
      });
    }
  });

  describe('Session Memory for Working Capture Backend', () => {
    beforeEach(() => {
      WindowsFfmpegCaptureAdapter.resetRememberedBackend();
    });

    it('initializes with null remembered backend', () => {
      expect(WindowsFfmpegCaptureAdapter.getRememberedBackend()).toBeNull();
    });

    it('remembers gdigrab backend once set and resets cleanly', () => {
      WindowsFfmpegCaptureAdapter.setRememberedBackend('gdigrab');
      expect(WindowsFfmpegCaptureAdapter.getRememberedBackend()).toBe('gdigrab');

      WindowsFfmpegCaptureAdapter.resetRememberedBackend();
      expect(WindowsFfmpegCaptureAdapter.getRememberedBackend()).toBeNull();
    });

    it('remembers ddagrab backend once set', () => {
      WindowsFfmpegCaptureAdapter.setRememberedBackend('ddagrab');
      expect(WindowsFfmpegCaptureAdapter.getRememberedBackend()).toBe('ddagrab');
    });
  });

  describe('Desktop 2.0 H.264 Encoder & Pipeline Arguments', () => {
    it('constructs correct h264_nvenc args with ultra-low latency flags and AUD bitstream filter', () => {
      const options: CaptureOptions = {
        monitor: primaryMonitor,
        fps: 60,
        scale: 1.0,
        quality: 2,
        codec: 'h264',
        bitrateKbps: 4000,
      };

      const args = buildFfmpegArgs(options, 'ddagrab', 'h264_nvenc');

      expect(args).toContain('-c:v');
      expect(args).toContain('h264_nvenc');
      expect(args).toContain('-tune');
      expect(args).toContain('ull');
      expect(args).toContain('-zerolatency');
      expect(args).toContain('1');
      expect(args).toContain('-preset');
      expect(args).toContain('p1');
      expect(args).toContain('-rc');
      expect(args).toContain('cbr');
      expect(args).toContain('-b:v');
      expect(args).toContain('4000k');
      expect(args).toContain('-profile:v');
      expect(args).toContain('baseline');
      expect(args).toContain('-level');
      expect(args).toContain('4.1');
      expect(args).toContain('-bsf:v');
      expect(args).toContain('h264_metadata=aud=insert');
      expect(args).toContain('-f');
      expect(args).toContain('h264');
      expect(args).toContain('pipe:1');
    });

    it('constructs correct h264_mf args for MediaFoundation hardware encoder', () => {
      const options: CaptureOptions = {
        monitor: primaryMonitor,
        fps: 30,
        scale: 0.75,
        quality: 5,
        codec: 'h264',
        bitrateKbps: 2000,
      };

      const args = buildFfmpegArgs(options, 'ddagrab', 'h264_mf');

      expect(args).toContain('-c:v');
      expect(args).toContain('h264_mf');
      expect(args).toContain('-rate_control');
      expect(args).toContain('cbr');
      expect(args).toContain('-b:v');
      expect(args).toContain('2000k');
      expect(args).toContain('-profile:v');
      expect(args).toContain('baseline');
      expect(args).toContain('-bsf:v');
      expect(args).toContain('h264_metadata=aud=insert');
    });

    it('constructs correct libx264 software fallback args', () => {
      const options: CaptureOptions = {
        monitor: primaryMonitor,
        fps: 30,
        scale: 0.5,
        quality: 7,
        codec: 'h264',
        bitrateKbps: 1000,
      };

      const args = buildFfmpegArgs(options, 'gdigrab', 'libx264');

      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
      expect(args).toContain('-preset');
      expect(args).toContain('ultrafast');
      expect(args).toContain('-tune');
      expect(args).toContain('zerolatency');
      expect(args).toContain('-b:v');
      expect(args).toContain('1000k');
      expect(args).toContain('-profile:v');
      expect(args).toContain('baseline');
      expect(args).toContain('-level');
      expect(args).toContain('4.1');
      expect(args).toContain('-bsf:v');
      expect(args).toContain('h264_metadata=aud=insert');
    });

    it('constructs correct testsrc synthetic capture args for headless and benchmark runs', () => {
      const options: CaptureOptions = {
        monitor: primaryMonitor,
        fps: 30,
        scale: 0.5,
        quality: 7,
        codec: 'h264',
        bitrateKbps: 1000,
        isTestMode: true,
      };

      const args = buildFfmpegArgs(options, 'testsrc', 'libx264');

      expect(args).toContain('-re');
      expect(args).toContain('-f');
      expect(args).toContain('lavfi');
      const iIdx = args.indexOf('-i');
      expect(args[iIdx + 1]).toContain('testsrc=size=960x540:rate=30');
    });
  });
});
