import { mouse, keyboard, Button, Key, Point as NutPoint } from '@nut-tree-fork/nut-js';
import { MonitorService } from './desktop/MonitorService.js';
import { InputBackend, createInputBackend } from './input/InputBackend.js';

// Configure nut-js for zero-delay instant response fallback
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

let activeInputBackend: InputBackend = createInputBackend();

export function getInputBackend(): InputBackend {
  return activeInputBackend;
}

export function setInputBackend(backend: InputBackend): void {
  activeInputBackend = backend;
}

export function resetDefaultInputBackend(): void {
  activeInputBackend = createInputBackend();
}

export interface MoveCoalescer {
  addMove: (dxRaw: unknown, dyRaw: unknown) => void;
  destroy: () => void;
}

/**
 * Creates a per-connection move coalescer.
 * Accumulates dx/dy (supports floats!) and flushes every ~8ms with ONE atomic move.
 * Maintains fractional remainders server-side across ticks so low-speed sub-pixel tracking is preserved.
 * Enforces a +/-200 cap per incoming message before accumulating.
 * Uses native Win32 GetCursorPos + SetCursorPos via InputBackend, falling back to nut-js.
 */
export function createMoveCoalescer(flushIntervalMs = 8): MoveCoalescer {
  let accumulatedDx = 0;
  let accumulatedDy = 0;
  let remainderDx = 0;
  let remainderDy = 0;
  let isFlushing = false;

  const timer = setInterval(async () => {
    if (isFlushing) return;
    if (accumulatedDx === 0 && accumulatedDy === 0 && remainderDx === 0 && remainderDy === 0) {
      return;
    }

    // Combine accumulated with fractional remainders
    const totalDx = accumulatedDx + remainderDx;
    const totalDy = accumulatedDy + remainderDy;

    accumulatedDx = 0;
    accumulatedDy = 0;

    const intDx = Math.trunc(totalDx);
    const intDy = Math.trunc(totalDy);

    remainderDx = totalDx - intDx;
    remainderDy = totalDy - intDy;

    if (intDx === 0 && intDy === 0) return;

    isFlushing = true;
    try {
      const backend = getInputBackend();
      let handled = false;
      if (backend.isSupported()) {
        handled = backend.moveRelative(intDx, intDy);
      }

      // Fallback to nut-js if unsupported or returned false
      if (!handled) {
        const current = await mouse.getPosition();
        await mouse.setPosition(new NutPoint(current.x + intDx, current.y + intDy));
      }
    } catch {
      // Ignore coordinate clamp errors
    } finally {
      isFlushing = false;
    }
  }, flushIntervalMs);

  return {
    addMove(dxRaw: unknown, dyRaw: unknown) {
      if (typeof dxRaw !== 'number' || typeof dyRaw !== 'number') return;
      if (isNaN(dxRaw) || isNaN(dyRaw)) return;

      // Keep the +/-200 cap per incoming message
      const dx = Math.max(-200, Math.min(200, dxRaw));
      const dy = Math.max(-200, Math.min(200, dyRaw));

      accumulatedDx += dx;
      accumulatedDy += dy;
    },
    destroy() {
      clearInterval(timer);
    },
  };
}

/**
 * Handles mouse click commands immediately (left, right, or middle).
 */
export async function handleClick(button: unknown): Promise<void> {
  if (button !== 'left' && button !== 'right' && button !== 'middle') return;

  try {
    const backend = getInputBackend();
    if (backend.isSupported()) {
      const ok = backend.click(button as 'left' | 'right' | 'middle');
      if (ok) return;
    }

    // Fallback to nut-js
    if (button === 'left') {
      await mouse.click(Button.LEFT);
    } else if (button === 'right') {
      await mouse.click(Button.RIGHT);
    } else {
      await mouse.click(Button.MIDDLE);
    }
  } catch {
    // Ignore input errors
  }
}

/**
 * Handles mouse button down / up commands for dragging.
 */
export async function handleButton(button: unknown, state: unknown): Promise<void> {
  if (button !== 'left' && button !== 'right' && button !== 'middle') return;
  if (state !== 'down' && state !== 'up') return;

  try {
    const backend = getInputBackend();
    if (backend.isSupported()) {
      const ok = backend.mouseButton(button as 'left' | 'right' | 'middle', state as 'down' | 'up');
      if (ok) return;
    }

    // Fallback to nut-js
    const targetBtn =
      button === 'left' ? Button.LEFT : button === 'right' ? Button.RIGHT : Button.MIDDLE;

    if (state === 'down') {
      await mouse.pressButton(targetBtn);
    } else {
      await mouse.releaseButton(targetBtn);
    }
  } catch {
    // Ignore input errors
  }
}

// Win32 & Protocol Scroll Constants
export const WHEEL_DELTA = 120;
export const SCROLL_UNITS_PER_NOTCH = 12; // 12 protocol units = 1 standard 120-unit wheel notch
export const WHEEL_DELTA_PER_UNIT = WHEEL_DELTA / SCROLL_UNITS_PER_NOTCH; // 10 Windows wheel units per protocol unit
export const MAX_SCROLL_DELTA = 500;

export interface Scroller {
  scroll: (dyRaw: unknown, dxRaw?: unknown) => Promise<void>;
  destroy: () => void;
  getRemainders: () => { remainderWheelDy: number; remainderWheelDx: number };
}

/**
 * SCROLL PROTOCOL SPECIFICATION:
 * Protocol message format:
 *   { type: 'scroll', dy: number, dx?: number }
 *
 * Direction convention:
 *   - Positive dy = page scrolls DOWN (content moves up).
 *   - Negative dy = page scrolls UP (content moves down).
 *   - Positive dx = page scrolls RIGHT (content moves left).
 *   - Negative dx = page scrolls LEFT (content moves right).
 *
 * Responsibility:
 *   The client applies user preference (natural vs inverted scrolling).
 *   The server does NOT invert; it treats incoming dy/dx strictly as page-scroll directions.
 *
 * Windows wheel unit mapping:
 *   Standard Windows mouse wheel notch = 120 units (WHEEL_DELTA).
 *   1 protocol unit = WHEEL_DELTA / SCROLL_UNITS_PER_NOTCH = 10 Windows wheel units.
 *
 * Windows wheel sign convention:
 *   - MOUSEEVENTF_WHEEL: Positive dwData rotates wheel forward (away from user) -> page scrolls UP.
 *     Therefore, to scroll page DOWN (positive protocol dy), Windows wheel delta must be NEGATIVE.
 *     Windows dy = -protocol dy * WHEEL_DELTA_PER_UNIT.
 *   - MOUSEEVENTF_HWHEEL: Positive dwData tilts wheel right -> page scrolls RIGHT.
 *     Therefore, Windows dx = protocol dx * WHEEL_DELTA_PER_UNIT.
 *   - nut-js fallback: follows the exact same convention (positive protocol dy calls mouse.scrollDown).
 */
export function createScroller(): Scroller {
  let remainderWheelDy = 0;
  let remainderWheelDx = 0;
  let fallbackNotchRemainderDy = 0;

  return {
    async scroll(dyRaw: unknown, dxRaw?: unknown): Promise<void> {
      if (typeof dyRaw !== 'number' || !Number.isFinite(dyRaw)) return;
      const dxVal = typeof dxRaw === 'number' && Number.isFinite(dxRaw) ? dxRaw : 0;

      // Clamp per-message bounds
      const clampedDy = Math.max(-MAX_SCROLL_DELTA, Math.min(MAX_SCROLL_DELTA, dyRaw));
      const clampedDx = Math.max(-MAX_SCROLL_DELTA, Math.min(MAX_SCROLL_DELTA, dxVal));

      // Protocol dy > 0 -> page down -> Windows wheel delta is negative
      // Protocol dx > 0 -> page right -> Windows hwheel delta is positive
      const targetWheelDy = -clampedDy * WHEEL_DELTA_PER_UNIT;
      const targetWheelDx = clampedDx * WHEEL_DELTA_PER_UNIT;

      // Accumulate with fractional carry
      const totalWheelDy = targetWheelDy + remainderWheelDy;
      const totalWheelDx = targetWheelDx + remainderWheelDx;

      const intWheelDy = Math.trunc(totalWheelDy) || 0;
      const intWheelDx = Math.trunc(totalWheelDx) || 0;

      remainderWheelDy = totalWheelDy - intWheelDy;
      remainderWheelDx = totalWheelDx - intWheelDx;

      if (intWheelDy === 0 && intWheelDx === 0) return;

      try {
        const backend = getInputBackend();
        if (backend.isSupported()) {
          const ok = backend.scroll(intWheelDy, intWheelDx);
          if (ok) return;
        }

        // Fallback to nut-js:
        // Positive protocol dy (negative intWheelDy) -> scroll DOWN
        // Negative protocol dy (positive intWheelDy) -> scroll UP
        const totalNotches = -intWheelDy / WHEEL_DELTA + fallbackNotchRemainderDy;
        const intNotches = Math.trunc(totalNotches);
        fallbackNotchRemainderDy = totalNotches - intNotches;

        if (intNotches > 0) {
          await mouse.scrollDown(intNotches);
        } else if (intNotches < 0) {
          await mouse.scrollUp(-intNotches);
        }
      } catch {
        // Ignore input errors
      }
    },
    destroy() {
      remainderWheelDy = 0;
      remainderWheelDx = 0;
      fallbackNotchRemainderDy = 0;
    },
    getRemainders() {
      return { remainderWheelDy, remainderWheelDx };
    },
  };
}

// Module-level default scroller for backward-compatibility with standalone handleScroll calls
let defaultScroller = createScroller();

/**
 * Handles mouse scroll commands with float remainder carry using the default scroller.
 */
export async function handleScroll(dyRaw: unknown, dxRaw?: unknown): Promise<void> {
  return defaultScroller.scroll(dyRaw, dxRaw);
}

/**
 * Resets the default scroller state (useful for tests).
 */
export function resetDefaultScroller(): void {
  defaultScroller.destroy();
  defaultScroller = createScroller();
}

/**
 * Handles absolute cursor positioning across displays.
 * NormX and NormY are [0, 1] relative to the target monitor bounds.
 */
export function handleAbsMove(normX: number, normY: number, monitorId?: string): boolean {
  if (typeof normX !== 'number' || typeof normY !== 'number') return false;
  if (!Number.isFinite(normX) || !Number.isFinite(normY)) return false;

  const monitor = MonitorService.getMonitor(monitorId);
  const virtual = MonitorService.getVirtualDesktopBounds();
  const mapped = MonitorService.mapNormalizedToVirtual(normX, normY, monitor, virtual);

  const backend = getInputBackend();
  if (backend.isSupported()) {
    return backend.moveAbsolute(
      mapped.virtualNormX,
      mapped.virtualNormY,
      mapped.screenX,
      mapped.screenY
    );
  }
  return false;
}

/**
 * Handles absolute mouse clicks at specified normalized coordinates.
 */
export async function handleAbsClick(
  button: 'left' | 'right' | 'middle',
  count: number = 1,
  normX?: number,
  normY?: number,
  monitorId?: string
): Promise<boolean> {
  if (button !== 'left' && button !== 'right' && button !== 'middle') return false;

  const backend = getInputBackend();
  if (normX !== undefined && normY !== undefined && Number.isFinite(normX) && Number.isFinite(normY)) {
    const monitor = MonitorService.getMonitor(monitorId);
    const virtual = MonitorService.getVirtualDesktopBounds();
    const mapped = MonitorService.mapNormalizedToVirtual(normX, normY, monitor, virtual);

    if (backend.isSupported()) {
      return backend.clickAbsolute(
        button,
        mapped.virtualNormX,
        mapped.virtualNormY,
        mapped.screenX,
        mapped.screenY,
        count
      );
    }
  }

  if (backend.isSupported()) {
    return backend.clickAbsolute(button, undefined, undefined, undefined, undefined, count);
  }

  // Fallback to handleClick
  for (let i = 0; i < count; i++) {
    await handleClick(button);
  }
  return true;
}

/**
 * Handles absolute mouse button transitions (down / up) for dragging.
 */
export async function handleAbsButton(
  button: 'left' | 'right' | 'middle',
  state: 'down' | 'up',
  normX?: number,
  normY?: number,
  monitorId?: string
): Promise<boolean> {
  if (button !== 'left' && button !== 'right' && button !== 'middle') return false;
  if (state !== 'down' && state !== 'up') return false;

  const backend = getInputBackend();
  if (normX !== undefined && normY !== undefined && Number.isFinite(normX) && Number.isFinite(normY)) {
    const monitor = MonitorService.getMonitor(monitorId);
    const virtual = MonitorService.getVirtualDesktopBounds();
    const mapped = MonitorService.mapNormalizedToVirtual(normX, normY, monitor, virtual);

    if (backend.isSupported()) {
      return backend.buttonAbsolute(
        button,
        state,
        mapped.virtualNormX,
        mapped.virtualNormY,
        mapped.screenX,
        mapped.screenY
      );
    }
  }

  if (backend.isSupported()) {
    return backend.buttonAbsolute(button, state);
  }

  await handleButton(button, state);
  return true;
}

/**
 * Handles keyboard input with optional modifiers.
 */
export async function handleKey(
  key: string,
  action: 'down' | 'up' | 'tap' = 'tap',
  modifiers: string[] = []
): Promise<boolean> {
  if (!key || typeof key !== 'string') return false;
  const backend = getInputBackend();
  if (backend.isSupported()) {
    return backend.keyWithModifiers(key, action, modifiers);
  }
  return false;
}

/**
 * Handles typed unicode text input.
 */
export async function handleText(text: string): Promise<boolean> {
  if (!text || typeof text !== 'string') return false;
  const backend = getInputBackend();
  if (backend.isSupported()) {
    return backend.typeText(text);
  }
  return false;
}
