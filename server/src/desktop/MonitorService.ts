import koffi from 'koffi';
import { MonitorInfo, MonitorBounds } from './types.js';

const isWin = process.platform === 'win32';

let user32: any = null;
let shcore: any = null;
let SetProcessDpiAwarenessContextFn: any = null;
let GetSystemMetricsFn: any = null;
let GetMonitorInfoWFn: any = null;
let EnumDisplayMonitorsFn: any = null;
let GetDpiForMonitorFn: any = null;

let RECT: any = null;
let MONITORINFOEXW: any = null;
let MonitorEnumProc: any = null;

const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SM_CXVIRTUALSCREEN = 78;
const SM_CYVIRTUALSCREEN = 79;
const SM_CMONITORS = 80;

if (isWin) {
  try {
    user32 = koffi.load('user32.dll');

    try {
      SetProcessDpiAwarenessContextFn = user32.func(
        'bool __stdcall SetProcessDpiAwarenessContext(intptr_t value)'
      );
      // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 is ((DPI_AWARENESS_CONTEXT)-4)
      SetProcessDpiAwarenessContextFn(-4);
    } catch {}

    GetSystemMetricsFn = user32.func('int __stdcall GetSystemMetrics(int nIndex)');

    RECT = koffi.struct('RECT', {
      left: 'long',
      top: 'long',
      right: 'long',
      bottom: 'long',
    });

    MONITORINFOEXW = koffi.struct('MONITORINFOEXW', {
      cbSize: 'uint32',
      rcMonitor: RECT,
      rcWork: RECT,
      dwFlags: 'uint32',
      szDevice: koffi.array('uint16', 32),
    });

    GetMonitorInfoWFn = user32.func(
      'bool __stdcall GetMonitorInfoW(intptr_t hMonitor, _Inout_ MONITORINFOEXW *lpmi)'
    );
    MonitorEnumProc = koffi.proto(
      'bool __stdcall MonitorEnumProc(intptr_t hMonitor, intptr_t hdcMonitor, RECT *lprcMonitor, intptr_t dwData)'
    );
    EnumDisplayMonitorsFn = user32.func(
      'bool __stdcall EnumDisplayMonitors(intptr_t hdc, intptr_t lprcClip, MonitorEnumProc *lpfnEnum, intptr_t dwData)'
    );

    try {
      shcore = koffi.load('shcore.dll');
      GetDpiForMonitorFn = shcore.func(
        'int __stdcall GetDpiForMonitor(intptr_t hmonitor, int dpiType, _Out_ uint32_t *dpiX, _Out_ uint32_t *dpiY)'
      );
    } catch {}
  } catch (err) {
    console.warn('[MonitorService] Failed to load user32/shcore bindings:', err);
  }
}

export class MonitorService {
  private static cachedMonitors: MonitorInfo[] | null = null;
  private static lastCacheTime = 0;

  /**
   * Ensures process is configured for Per-Monitor V2 DPI awareness.
   */
  public static ensureDpiAwareness(): void {
    if (SetProcessDpiAwarenessContextFn) {
      try {
        SetProcessDpiAwarenessContextFn(-4);
      } catch {}
    }
  }

  /**
   * Returns virtual desktop bounds across all connected displays.
   */
  public static getVirtualDesktopBounds(): MonitorBounds {
    if (GetSystemMetricsFn) {
      try {
        const x = GetSystemMetricsFn(SM_XVIRTUALSCREEN);
        const y = GetSystemMetricsFn(SM_YVIRTUALSCREEN);
        const width = GetSystemMetricsFn(SM_CXVIRTUALSCREEN) || 1920;
        const height = GetSystemMetricsFn(SM_CYVIRTUALSCREEN) || 1080;
        return { x, y, width, height };
      } catch {}
    }
    return { x: 0, y: 0, width: 1920, height: 1080 };
  }

  /**
   * Enumerate all active displays on Windows.
   */
  public static listMonitors(forceRefresh = false): MonitorInfo[] {
    const now = Date.now();
    if (!forceRefresh && this.cachedMonitors && now - this.lastCacheTime < 2000) {
      return this.cachedMonitors;
    }

    const monitors: MonitorInfo[] = [];

    if (EnumDisplayMonitorsFn && GetMonitorInfoWFn) {
      let idx = 0;
      try {
        const enumCallback = koffi.register((hMonitor: any) => {
          const info: any = { cbSize: 104 };
          if (GetMonitorInfoWFn(hMonitor, info)) {
            const devName = Buffer.from(Uint16Array.from(info.szDevice).buffer)
              .toString('utf16le')
              .replace(/\0.*$/, '');

            let dpiScale = 1.0;
            if (GetDpiForMonitorFn) {
              const xHolder = [0];
              const yHolder = [0];
              try {
                if (GetDpiForMonitorFn(hMonitor, 0, xHolder, yHolder) === 0) {
                  dpiScale = Math.round((xHolder[0] / 96) * 100) / 100;
                }
              } catch {}
            }

            const isPrimary = (info.dwFlags & 1) !== 0;
            monitors.push({
              id: `mon_${idx++}`,
              name: devName || `Display ${idx}`,
              bounds: {
                x: info.rcMonitor.left,
                y: info.rcMonitor.top,
                width: info.rcMonitor.right - info.rcMonitor.left,
                height: info.rcMonitor.bottom - info.rcMonitor.top,
              },
              workArea: {
                x: info.rcWork.left,
                y: info.rcWork.top,
                width: info.rcWork.right - info.rcWork.left,
                height: info.rcWork.bottom - info.rcWork.top,
              },
              dpiScale,
              isPrimary,
            });
          }
          return true;
        }, koffi.pointer(MonitorEnumProc));

        EnumDisplayMonitorsFn(0, 0, enumCallback, 0);
      } catch (e) {
        console.warn('[MonitorService] Monitor enumeration error:', e);
      }
    }

    if (monitors.length === 0) {
      // Fallback single display
      const v = this.getVirtualDesktopBounds();
      monitors.push({
        id: 'mon_0',
        name: 'Primary Display',
        bounds: { x: v.x, y: v.y, width: v.width, height: v.height },
        dpiScale: 1.0,
        isPrimary: true,
      });
    }

    this.cachedMonitors = monitors;
    this.lastCacheTime = now;
    return monitors;
  }

  /**
   * Retrieves specific monitor by ID or returns the primary monitor.
   */
  public static getMonitor(monitorId?: string): MonitorInfo {
    const list = this.listMonitors();
    if (monitorId) {
      const found = list.find((m) => m.id === monitorId);
      if (found) return found;
    }
    const primary = list.find((m) => m.isPrimary);
    return primary || list[0];
  }

  /**
   * Pure coordinate transformation method:
   * Maps normalized (0..1) coordinates relative to a target monitor into:
   * - `screenX`, `screenY`: physical screen coordinates (supports multi-monitor negative offsets).
   * - `virtualNormX`, `virtualNormY`: SendInput absolute coordinates normalized to [0, 65535].
   */
  public static mapNormalizedToVirtual(
    normX: number,
    normY: number,
    monitor: MonitorInfo,
    virtualDesktop: MonitorBounds
  ): {
    screenX: number;
    screenY: number;
    virtualNormX: number;
    virtualNormY: number;
  } {
    // Clamp incoming normalized touch coordinates strictly to [0, 1]
    const clampedX = Math.max(0, Math.min(1, normX));
    const clampedY = Math.max(0, Math.min(1, normY));

    // Physical monitor coordinates
    const screenX = Math.round(monitor.bounds.x + clampedX * (monitor.bounds.width - 1));
    const screenY = Math.round(monitor.bounds.y + clampedY * (monitor.bounds.height - 1));

    // Virtual desktop normalization (0..65535) for MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
    const vWidth = Math.max(1, virtualDesktop.width);
    const vHeight = Math.max(1, virtualDesktop.height);

    const virtualNormX = Math.max(
      0,
      Math.min(65535, Math.round(((screenX - virtualDesktop.x) * 65535) / vWidth))
    );
    const virtualNormY = Math.max(
      0,
      Math.min(65535, Math.round(((screenY - virtualDesktop.y) * 65535) / vHeight))
    );

    return {
      screenX,
      screenY,
      virtualNormX,
      virtualNormY,
    };
  }
}
