import { describe, it, expect } from 'vitest';
import { MonitorService } from '../src/desktop/MonitorService.js';
import { MonitorInfo, MonitorBounds } from '../src/desktop/types.js';

describe('AEROKIN Coordinate Transformation & Multi-Monitor Math', () => {
  it('maps normalized coordinates correctly for single 1080p display', () => {
    const monitor: MonitorInfo = {
      id: 'mon_0',
      name: 'Primary Display',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      dpiScale: 1.0,
      isPrimary: true,
    };
    const virtual: MonitorBounds = { x: 0, y: 0, width: 1920, height: 1080 };

    // Top-left (0, 0)
    const tl = MonitorService.mapNormalizedToVirtual(0, 0, monitor, virtual);
    expect(tl.screenX).toBe(0);
    expect(tl.screenY).toBe(0);
    expect(tl.virtualNormX).toBe(0);
    expect(tl.virtualNormY).toBe(0);

    // Bottom-right (1, 1) -> maps to (1919, 1079), normalized ~65535
    const br = MonitorService.mapNormalizedToVirtual(1, 1, monitor, virtual);
    expect(br.screenX).toBe(1919);
    expect(br.screenY).toBe(1079);
    expect(br.virtualNormX).toBe(65501); // 1919 * 65535 / 1920
    expect(br.virtualNormY).toBe(65474); // 1079 * 65535 / 1080

    // Center (0.5, 0.5)
    const center = MonitorService.mapNormalizedToVirtual(0.5, 0.5, monitor, virtual);
    expect(center.screenX).toBe(960);
    expect(center.screenY).toBe(540);
    expect(center.virtualNormX).toBe(32768);
    expect(center.virtualNormY).toBe(32768);
  });

  it('clamps out-of-bounds coordinates strictly to [0, 1]', () => {
    const monitor: MonitorInfo = {
      id: 'mon_0',
      name: 'Primary Display',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      dpiScale: 1.25,
      isPrimary: true,
    };
    const virtual: MonitorBounds = { x: 0, y: 0, width: 1920, height: 1080 };

    // Negative coordinates
    const neg = MonitorService.mapNormalizedToVirtual(-0.5, -10, monitor, virtual);
    expect(neg.screenX).toBe(0);
    expect(neg.screenY).toBe(0);
    expect(neg.virtualNormX).toBe(0);
    expect(neg.virtualNormY).toBe(0);

    // Over-unity coordinates
    const over = MonitorService.mapNormalizedToVirtual(1.5, 999, monitor, virtual);
    expect(over.screenX).toBe(1919);
    expect(over.screenY).toBe(1079);
  });

  it('handles multi-monitor setup with secondary monitor to the right', () => {
    const mon1: MonitorInfo = {
      id: 'mon_0',
      name: 'Display 1 (Primary)',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      dpiScale: 1.0,
      isPrimary: true,
    };
    const mon2: MonitorInfo = {
      id: 'mon_1',
      name: 'Display 2 (Secondary)',
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
      dpiScale: 1.25,
      isPrimary: false,
    };
    // Total virtual desktop spans 0 to (1920 + 2560) = 4480 wide, 1440 tall
    const virtual: MonitorBounds = { x: 0, y: 0, width: 4480, height: 1440 };

    // Targeting secondary monitor top-left (0, 0)
    const resTl = MonitorService.mapNormalizedToVirtual(0, 0, mon2, virtual);
    expect(resTl.screenX).toBe(1920);
    expect(resTl.screenY).toBe(0);
    // (1920 - 0) * 65535 / 4480 = 28086
    expect(resTl.virtualNormX).toBe(28086);
    expect(resTl.virtualNormY).toBe(0);

    // Targeting secondary monitor center (0.5, 0.5)
    const resCenter = MonitorService.mapNormalizedToVirtual(0.5, 0.5, mon2, virtual);
    expect(resCenter.screenX).toBe(1920 + Math.round(0.5 * 2559)); // 1920 + 1280 = 3200
    expect(resCenter.screenY).toBe(Math.round(0.5 * 1439)); // 720
  });

  it('handles multi-monitor setup with negative coordinate offset (monitor to the left)', () => {
    // Secondary monitor is at x: -1920, primary at x: 0
    const leftMonitor: MonitorInfo = {
      id: 'mon_left',
      name: 'Left Display',
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
      dpiScale: 1.0,
      isPrimary: false,
    };
    // Virtual desktop x starts at -1920, total width 3840
    const virtual: MonitorBounds = { x: -1920, y: 0, width: 3840, height: 1080 };

    // Top-left of left monitor: screenX = -1920.
    // virtualNormX = ((-1920 - (-1920)) * 65535) / 3840 = 0
    const resTl = MonitorService.mapNormalizedToVirtual(0, 0, leftMonitor, virtual);
    expect(resTl.screenX).toBe(-1920);
    expect(resTl.screenY).toBe(0);
    expect(resTl.virtualNormX).toBe(0);
    expect(resTl.virtualNormY).toBe(0);

    // Bottom-right of left monitor: screenX = -1920 + 1919 = -1.
    // virtualNormX = ((-1 - (-1920)) * 65535) / 3840 = 1919 * 65535 / 3840 = 32750 (~50% of virtual desktop)
    const resBr = MonitorService.mapNormalizedToVirtual(1, 1, leftMonitor, virtual);
    expect(resBr.screenX).toBe(-1);
    expect(resBr.screenY).toBe(1079);
    expect(resBr.virtualNormX).toBe(32750);
  });
});
