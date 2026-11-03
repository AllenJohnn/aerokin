import koffi from 'koffi';
import path from 'node:path';

export interface Point {
  x: number;
  y: number;
}

export interface ForegroundAppInfo {
  hwnd: number;
  title: string;
  processName: string;
  fullPath: string;
}

const isWin = process.platform === 'win32';

let user32: any = null;
let kernel32: any = null;

let GetCursorPosFn: any = null;
let SetCursorPosFn: any = null;
let mouseEventFn: any = null;
let SendInputFn: any = null;
let MapVirtualKeyWFn: any = null;
let GetForegroundWindowFn: any = null;
let GetWindowTextWFn: any = null;
let GetWindowThreadProcessIdFn: any = null;
let OpenProcessFn: any = null;
let QueryFullProcessImageNameWFn: any = null;
let CloseHandleFn: any = null;

if (isWin) {
  try {
    user32 = koffi.load('user32.dll');
    kernel32 = koffi.load('kernel32.dll');

    const POINT = koffi.struct('POINT', {
      x: 'long',
      y: 'long',
    });

    GetCursorPosFn = user32.func('bool __stdcall GetCursorPos(_Out_ POINT *lpPoint)');
    SetCursorPosFn = user32.func('bool __stdcall SetCursorPos(int X, int Y)');
    mouseEventFn = user32.func('void __stdcall mouse_event(uint32_t dwFlags, uint32_t dx, uint32_t dy, uint32_t dwData, uintptr_t dwExtraInfo)');
    SendInputFn = user32.func('uint __stdcall SendInput(uint cInputs, uint8_t *pInputs, int cbSize)');
    MapVirtualKeyWFn = user32.func('uint __stdcall MapVirtualKeyW(uint uCode, uint uMapType)');

    GetForegroundWindowFn = user32.func('intptr_t __stdcall GetForegroundWindow()');
    GetWindowTextWFn = user32.func('int __stdcall GetWindowTextW(intptr_t hWnd, _Out_ uint16_t *lpString, int nMaxCount)');
    GetWindowThreadProcessIdFn = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, _Out_ uint32_t *lpdwProcessId)');

    OpenProcessFn = kernel32.func('intptr_t __stdcall OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)');
    QueryFullProcessImageNameWFn = kernel32.func('bool __stdcall QueryFullProcessImageNameW(intptr_t hProcess, uint32_t dwFlags, _Out_ uint16_t *lpExeName, _Inout_ uint32_t *lpdwSize)');
    CloseHandleFn = kernel32.func('bool __stdcall CloseHandle(intptr_t hObject)');
  } catch (err) {
    console.warn('[Win32] Failed to initialize koffi user32/kernel32 bindings:', err);
  }
}

// Win32 Input Constants
const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;

const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;

// Common Virtual Key Codes
const VK_MAP: Record<string, { vk: number; extended?: boolean }> = {
  left: { vk: 0x25, extended: true },
  up: { vk: 0x26, extended: true },
  right: { vk: 0x27, extended: true },
  down: { vk: 0x28, extended: true },
  space: { vk: 0x20 },
  enter: { vk: 0x0d },
  return: { vk: 0x0d },
  escape: { vk: 0x1b },
  shift: { vk: 0x10 },
  control: { vk: 0x11 },
  ctrl: { vk: 0x11 },
  alt: { vk: 0x12 },
  tab: { vk: 0x09 },
  backspace: { vk: 0x08 },
  delete: { vk: 0x2e, extended: true },
  home: { vk: 0x24, extended: true },
  end: { vk: 0x23, extended: true },
  pageup: { vk: 0x21, extended: true },
  pagedown: { vk: 0x22, extended: true },

  // Media Keys
  volup: { vk: 0xaf },
  voldown: { vk: 0xae },
  mute: { vk: 0xad },
  playpause: { vk: 0xb3 },
  next: { vk: 0xb0 },
  prev: { vk: 0xb1 },
  stop: { vk: 0xb2 },

  // Letters
  f: { vk: 0x46 },
  j: { vk: 0x4a },
  l: { vk: 0x4c },
  k: { vk: 0x4b },
  m: { vk: 0x4d },
};

export class Win32Input {
  public static isSupported(): boolean {
    return isWin && GetCursorPosFn !== null;
  }

  /**
   * Reads current cursor screen position
   */
  public static getCursorPosition(): Point | null {
    if (!GetCursorPosFn) return null;
    const pt: any = {};
    if (GetCursorPosFn(pt)) {
      return { x: pt.x, y: pt.y };
    }
    return null;
  }

  /**
   * Moves cursor relative to current position using GetCursorPos + SetCursorPos
   * and dispatches a zero-delta mouse_event so video player controls and hover triggers reveal.
   */
  public static moveRelative(dx: number, dy: number): boolean {
    if (!SetCursorPosFn || !GetCursorPosFn) return false;

    const current = this.getCursorPosition();
    if (!current) return false;

    const newX = current.x + dx;
    const newY = current.y + dy;

    const ok = SetCursorPosFn(newX, newY);

    // Also dispatch lightweight move event so Chrome/Edge unhides media player controls
    if (mouseEventFn) {
      try {
        mouseEventFn(MOUSEEVENTF_MOVE, 0, 0, 0, 0);
      } catch {}
    }

    return ok;
  }

  /**
   * Sets absolute cursor position
   */
  public static setCursorPosition(x: number, y: number): boolean {
    if (!SetCursorPosFn) return false;
    const ok = SetCursorPosFn(x, y);
    if (mouseEventFn) {
      try {
        mouseEventFn(MOUSEEVENTF_MOVE, 0, 0, 0, 0);
      } catch {}
    }
    return ok;
  }

  /**
   * Dispatches mouse button down or up
   */
  public static mouseButton(button: 'left' | 'right' | 'middle', state: 'down' | 'up'): boolean {
    let flag = 0;
    if (button === 'left') {
      flag = state === 'down' ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
    } else if (button === 'right') {
      flag = state === 'down' ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
    } else if (button === 'middle') {
      flag = state === 'down' ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
    }

    if (!flag) return false;

    // 1. Try SendInput with 40-byte 64-bit struct buffer
    if (SendInputFn) {
      const buf = Buffer.alloc(40);
      buf.writeUInt32LE(INPUT_MOUSE, 0);
      buf.writeUInt32LE(flag, 20);
      const sent = SendInputFn(1, buf, 40);
      if (sent > 0) return true;
    }

    // 2. Fallback to mouse_event
    if (mouseEventFn) {
      mouseEventFn(flag, 0, 0, 0, 0);
      return true;
    }

    return false;
  }

  /**
   * Dispatches mouse click (down then up)
   */
  public static click(button: 'left' | 'right' | 'middle'): boolean {
    const downOk = this.mouseButton(button, 'down');
    const upOk = this.mouseButton(button, 'up');
    return downOk && upOk;
  }

  /**
   * Dispatches vertical (and optional horizontal) wheel scrolling
   */
  public static scroll(dy: number, dx: number = 0): boolean {
    let success = false;

    // Vertical wheel
    if (dy !== 0) {
      const mouseData = Math.round(dy);
      if (SendInputFn) {
        const buf = Buffer.alloc(40);
        buf.writeUInt32LE(INPUT_MOUSE, 0);
        buf.writeInt32LE(mouseData, 16);
        buf.writeUInt32LE(MOUSEEVENTF_WHEEL, 20);
        const sent = SendInputFn(1, buf, 40);
        if (sent > 0) success = true;
      }
      if (!success && mouseEventFn) {
        mouseEventFn(MOUSEEVENTF_WHEEL, 0, 0, mouseData, 0);
        success = true;
      }
    }

    // Horizontal wheel
    if (dx !== 0) {
      const mouseData = Math.round(dx);
      if (SendInputFn) {
        const buf = Buffer.alloc(40);
        buf.writeUInt32LE(INPUT_MOUSE, 0);
        buf.writeInt32LE(mouseData, 16);
        buf.writeUInt32LE(MOUSEEVENTF_HWHEEL, 20);
        SendInputFn(1, buf, 40);
      } else if (mouseEventFn) {
        mouseEventFn(MOUSEEVENTF_HWHEEL, 0, 0, mouseData, 0);
      }
    }

    return success;
  }

  /**
   * Dispatches keyboard key down, up, or tap (~15ms interval)
   */
  public static async key(
    keyName: string,
    action: 'down' | 'up' | 'tap' = 'tap'
  ): Promise<boolean> {
    const lower = keyName.toLowerCase().trim();
    let vk = 0;
    let isExtended = false;

    if (VK_MAP[lower]) {
      vk = VK_MAP[lower].vk;
      isExtended = !!VK_MAP[lower].extended;
    } else if (lower.length === 1) {
      const code = lower.toUpperCase().charCodeAt(0);
      if (code >= 0x41 && code <= 0x5a) {
        vk = code;
      } else if (code >= 0x30 && code <= 0x39) {
        vk = code;
      }
    }

    if (!vk) {
      console.warn(`[Win32Input] Unknown key: "${keyName}"`);
      return false;
    }

    const scancode = MapVirtualKeyWFn ? MapVirtualKeyWFn(vk, 0) : 0;

    const sendKey = (isUp: boolean) => {
      if (SendInputFn) {
        const buf = Buffer.alloc(40);
        buf.writeUInt32LE(INPUT_KEYBOARD, 0);
        buf.writeUInt16LE(vk, 8);
        buf.writeUInt16LE(scancode, 10);

        let flags = 0;
        if (isExtended) flags |= KEYEVENTF_EXTENDEDKEY;
        if (isUp) flags |= KEYEVENTF_KEYUP;

        buf.writeUInt32LE(flags, 12);
        return SendInputFn(1, buf, 40) > 0;
      }
      return false;
    };

    if (action === 'down') {
      return sendKey(false);
    } else if (action === 'up') {
      return sendKey(true);
    } else {
      // Tap: down -> wait 15ms -> up
      sendKey(false);
      await new Promise((res) => setTimeout(res, 15));
      return sendKey(true);
    }
  }

  /**
   * Dispatches chord combination (e.g. "Shift+Right" or "Alt+Enter")
   */
  public static async keyCombo(comboStr: string): Promise<boolean> {
    const parts = comboStr.split('+').map((s) => s.trim().toLowerCase());
    const modifiers = parts.slice(0, -1);
    const mainKey = parts[parts.length - 1];

    // Hold modifiers
    for (const mod of modifiers) {
      await this.key(mod, 'down');
    }

    // Tap main key
    await this.key(mainKey, 'tap');

    // Release modifiers
    for (const mod of modifiers.reverse()) {
      await this.key(mod, 'up');
    }

    return true;
  }

  /**
   * Retrieves info about current foreground window and process
   */
  public static getForegroundApp(): ForegroundAppInfo | null {
    if (!GetForegroundWindowFn || !GetWindowTextWFn || !GetWindowThreadProcessIdFn) {
      return null;
    }

    const hwnd = GetForegroundWindowFn();
    if (!hwnd) return null;

    // Get Title
    const titleBuf = new Uint16Array(512);
    const titleLen = GetWindowTextWFn(hwnd, titleBuf, 512);
    const title = titleLen > 0 ? Buffer.from(titleBuf.buffer, 0, titleLen * 2).toString('utf16le') : '';

    // Get PID
    const pidHolder = [0];
    GetWindowThreadProcessIdFn(hwnd, pidHolder);
    const pid = pidHolder[0];

    let fullPath = '';
    let processName = '';

    if (pid && OpenProcessFn && QueryFullProcessImageNameWFn && CloseHandleFn) {
      const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
      const hProcess = OpenProcessFn(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
      if (hProcess) {
        const exeBuf = new Uint16Array(512);
        const sizeHolder = [512];
        const ok = QueryFullProcessImageNameWFn(hProcess, 0, exeBuf, sizeHolder);
        CloseHandleFn(hProcess);
        if (ok) {
          fullPath = Buffer.from(exeBuf.buffer, 0, sizeHolder[0] * 2).toString('utf16le');
          processName = path.basename(fullPath).toLowerCase();
        }
      }
    }

    return {
      hwnd: Number(hwnd),
      title,
      processName,
      fullPath,
    };
  }
}
