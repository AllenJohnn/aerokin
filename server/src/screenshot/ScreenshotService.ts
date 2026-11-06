/**
 * AEROKIN Fast Native Win32 Screen Capture Service
 *
 * Captures one-shot screenshots using Win32 GDI BitBlt + DIBits and Sharp.
 * Handles locked screen / secure desktop detection, cursor inclusion,
 * monitor / active window selection, and downscaling for 8 MB size safety.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import koffi from 'koffi';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScreenshotOptions {
  target?: 'all' | 'active_window' | 'monitor';
  monitorId?: string;
  includeCursor?: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  mimeType?: 'image/jpeg' | 'image/png';
  data?: string; // base64
  width?: number;
  height?: number;
  sizeBytes?: number;
  downscaled?: boolean;
  note?: string;
  error?: string;
}

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024; // 8 MB

// Win32 GDI / User32 Bindings
let user32: any = null;
let gdi32: any = null;

let GetDCFn: any = null;
let ReleaseDCFn: any = null;
let GetSystemMetricsFn: any = null;
let CreateCompatibleDCFn: any = null;
let CreateCompatibleBitmapFn: any = null;
let SelectObjectFn: any = null;
let BitBltFn: any = null;
let DeleteObjectFn: any = null;
let DeleteDCFn: any = null;
let GetDIBitsFn: any = null;
let OpenInputDesktopFn: any = null;
let CloseDesktopFn: any = null;
let GetForegroundWindowFn: any = null;
let GetWindowRectFn: any = null;
let GetCursorInfoFn: any = null;
let DrawIconFn: any = null;

function getSharp() {
  return sharp;
}

if (process.platform === 'win32') {
  try {
    user32 = koffi.load('user32.dll');
    gdi32 = koffi.load('gdi32.dll');

    GetDCFn = user32.func('intptr_t __stdcall GetDC(intptr_t hWnd)');
    ReleaseDCFn = user32.func('int __stdcall ReleaseDC(intptr_t hWnd, intptr_t hDC)');
    GetSystemMetricsFn = user32.func('int __stdcall GetSystemMetrics(int nIndex)');
    CreateCompatibleDCFn = gdi32.func('intptr_t __stdcall CreateCompatibleDC(intptr_t hDC)');
    CreateCompatibleBitmapFn = gdi32.func(
      'intptr_t __stdcall CreateCompatibleBitmap(intptr_t hDC, int cx, int cy)'
    );
    SelectObjectFn = gdi32.func('intptr_t __stdcall SelectObject(intptr_t hDC, intptr_t h)');
    BitBltFn = gdi32.func(
      'bool __stdcall BitBlt(intptr_t hdc, int x, int y, int cx, int cy, intptr_t hdcSrc, int x1, int y1, uint32_t rop)'
    );
    DeleteObjectFn = gdi32.func('bool __stdcall DeleteObject(intptr_t ho)');
    DeleteDCFn = gdi32.func('bool __stdcall DeleteDC(intptr_t hdc)');
    GetDIBitsFn = gdi32.func(
      'int __stdcall GetDIBits(intptr_t hdc, intptr_t hbm, uint start, uint cLines, _Out_ uint8_t *lpvBits, _Inout_ uint8_t *lpbmi, uint usage)'
    );

    OpenInputDesktopFn = user32.func(
      'intptr_t __stdcall OpenInputDesktop(uint32_t dwFlags, bool fInherit, uint32_t dwDesiredAccess)'
    );
    CloseDesktopFn = user32.func('bool __stdcall CloseDesktop(intptr_t hDesktop)');
    GetForegroundWindowFn = user32.func('intptr_t __stdcall GetForegroundWindow()');
    GetWindowRectFn = user32.func(
      'bool __stdcall GetWindowRect(intptr_t hWnd, _Out_ uint8_t *lpRect)'
    );
    GetCursorInfoFn = user32.func('bool __stdcall GetCursorInfo(_Inout_ uint8_t *pci)');
    DrawIconFn = user32.func('bool __stdcall DrawIcon(intptr_t hDC, int X, int Y, intptr_t hIcon)');
  } catch (err) {
    console.warn('[Screenshot] Failed to initialize koffi user32/gdi32 bindings:', err);
  }
}

/**
 * Checks if the PC is currently on a secure desktop (locked screen or UAC prompt).
 */
export function checkIsSecureScreen(): boolean {
  if (process.platform !== 'win32' || !OpenInputDesktopFn) return false;
  try {
    const DESKTOP_SWITCHDESKTOP = 0x0100;
    const hDesk = OpenInputDesktopFn(0, false, DESKTOP_SWITCHDESKTOP);
    if (!hDesk) {
      return true; // Screen locked, login screen, or UAC prompt active
    }
    if (CloseDesktopFn) CloseDesktopFn(hDesk);
    return false;
  } catch {
    return false;
  }
}

export class ScreenshotService {
  /**
   * Captures a single screenshot based on provided options.
   */
  public async capture(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    if (process.platform !== 'win32') {
      return {
        success: false,
        error: 'Screen capture is currently supported on Windows hosts only.',
      };
    }

    if (checkIsSecureScreen()) {
      return {
        success: false,
        error: 'PC is on a secure screen',
      };
    }

    if (
      !GetDCFn ||
      !CreateCompatibleDCFn ||
      !CreateCompatibleBitmapFn ||
      !BitBltFn ||
      !GetDIBitsFn
    ) {
      return {
        success: false,
        error: 'Native Win32 GDI capture interfaces are unavailable.',
      };
    }

    const sharp = await getSharp();
    if (!sharp) {
      return {
        success: false,
        error: 'Image encoder (sharp) is unavailable on host server.',
      };
    }

    try {
      const target = options.target || 'all';

      // 1. Determine bounding rectangle
      let captureX = 0;
      let captureY = 0;
      let captureW = GetSystemMetricsFn(0); // SM_CXSCREEN
      let captureH = GetSystemMetricsFn(1); // SM_CYSCREEN

      // SM_XVIRTUALSCREEN = 76, SM_YVIRTUALSCREEN = 77, SM_CXVIRTUALSCREEN = 78, SM_CYVIRTUALSCREEN = 79
      const virtX = GetSystemMetricsFn(76);
      const virtY = GetSystemMetricsFn(77);
      const virtW = GetSystemMetricsFn(78);
      const virtH = GetSystemMetricsFn(79);

      if (target === 'all' && virtW > 0 && virtH > 0) {
        captureX = virtX;
        captureY = virtY;
        captureW = virtW;
        captureH = virtH;
      } else if (target === 'active_window' && GetForegroundWindowFn && GetWindowRectFn) {
        const hwnd = GetForegroundWindowFn();
        if (hwnd) {
          const rectBuf = Buffer.alloc(16);
          if (GetWindowRectFn(hwnd, rectBuf)) {
            const left = rectBuf.readInt32LE(0);
            const top = rectBuf.readInt32LE(4);
            const right = rectBuf.readInt32LE(8);
            const bottom = rectBuf.readInt32LE(12);
            const w = right - left;
            const h = bottom - top;
            if (w > 0 && h > 0) {
              captureX = left;
              captureY = top;
              captureW = w;
              captureH = h;
            }
          }
        }
      }

      // Ensure dimensions are even and positive
      captureW = Math.max(2, Math.floor(captureW / 2) * 2);
      captureH = Math.max(2, Math.floor(captureH / 2) * 2);

      // 2. Perform GDI BitBlt
      const hdcScreen = GetDCFn(0);
      if (!hdcScreen) {
        return { success: false, error: 'Failed to obtain desktop device context (DC).' };
      }

      const hdcMem = CreateCompatibleDCFn(hdcScreen);
      const hBitmap = CreateCompatibleBitmapFn(hdcScreen, captureW, captureH);
      const hOld = SelectObjectFn(hdcMem, hBitmap);

      const SRCCOPY = 0x00cc0020;
      const bltOk = BitBltFn(
        hdcMem,
        0,
        0,
        captureW,
        captureH,
        hdcScreen,
        captureX,
        captureY,
        SRCCOPY
      );

      // 3. Optionally draw mouse cursor
      if (options.includeCursor && GetCursorInfoFn && DrawIconFn) {
        try {
          const ciBuf = Buffer.alloc(24);
          ciBuf.writeUInt32LE(24, 0); // cbSize
          if (GetCursorInfoFn(ciBuf)) {
            const flags = ciBuf.readUInt32LE(4);
            const hCursor = ciBuf.readBigInt64LE(8);
            const ptX = ciBuf.readInt32LE(16);
            const ptY = ciBuf.readInt32LE(20);
            const CURSOR_SHOWING = 1;
            if (flags === CURSOR_SHOWING && hCursor) {
              DrawIconFn(hdcMem, ptX - captureX, ptY - captureY, Number(hCursor));
            }
          }
        } catch {
          // Non-fatal if cursor drawing fails
        }
      }

      // 4. Extract raw BGRA bits
      const bmi = Buffer.alloc(40);
      bmi.writeUInt32LE(40, 0); // biSize
      bmi.writeInt32LE(captureW, 4); // biWidth
      bmi.writeInt32LE(-captureH, 8); // biHeight top-down
      bmi.writeUInt16LE(1, 12); // biPlanes
      bmi.writeUInt16LE(32, 14); // biBitCount (32-bit BGRA)
      bmi.writeUInt32LE(0, 16); // BI_RGB

      const rawBits = Buffer.alloc(captureW * captureH * 4);
      GetDIBitsFn(hdcMem, hBitmap, 0, captureH, rawBits, bmi, 0);

      // Clean up GDI handles immediately
      SelectObjectFn(hdcMem, hOld);
      DeleteObjectFn(hBitmap);
      DeleteDCFn(hdcMem);
      ReleaseDCFn(0, hdcScreen);

      if (!bltOk) {
        return { success: false, error: 'BitBlt transfer failed.' };
      }

      // 5. Encode via Sharp (BGRA -> JPEG)
      let currentW = captureW;
      let currentH = captureH;
      let downscaled = false;
      let note: string | undefined = undefined;

      let encodedBuffer = await sharp(rawBits, {
        raw: {
          width: currentW,
          height: currentH,
          channels: 4,
        },
      })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      // 6. Safety check: Downscale if larger than 8 MB limit
      while (encodedBuffer.length > MAX_SCREENSHOT_BYTES && currentW > 400 && currentH > 300) {
        downscaled = true;
        currentW = Math.round(currentW / 2);
        currentH = Math.round(currentH / 2);
        note = `Downscaled to ${currentW}x${currentH} to fit 8 MB limit.`;

        encodedBuffer = await sharp(encodedBuffer)
          .resize(currentW, currentH)
          .jpeg({ quality: 80 })
          .toBuffer();
      }

      return {
        success: true,
        mimeType: 'image/jpeg',
        data: encodedBuffer.toString('base64'),
        width: currentW,
        height: currentH,
        sizeBytes: encodedBuffer.length,
        downscaled,
        note,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Screenshot capture failed with an unexpected error.',
      };
    }
  }
}
