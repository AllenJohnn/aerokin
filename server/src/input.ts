import { mouse, keyboard, Button, Key, Point } from '@nut-tree-fork/nut-js';
import { Win32Input } from './native/win32.js';

// Configure nut-js for zero-delay instant response fallback
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

export interface MoveCoalescer {
  addMove: (dxRaw: unknown, dyRaw: unknown) => void;
  destroy: () => void;
}

/**
 * Creates a per-connection move coalescer.
 * Accumulates dx/dy (supports floats!) and flushes every ~8ms with ONE atomic move.
 * Maintains fractional remainders server-side across ticks so low-speed sub-pixel tracking is preserved.
 * Enforces a +/-200 cap per incoming message before accumulating.
 * Uses native Win32 GetCursorPos + SetCursorPos on Windows, falling back to nut-js.
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
      // 1. Try native Win32 GetCursorPos + SetCursorPos
      let handled = false;
      if (Win32Input.isSupported()) {
        handled = Win32Input.moveRelative(intDx, intDy);
      }

      // 2. Fallback to nut-js if not Windows or if Win32 returned false
      if (!handled) {
        const current = await mouse.getPosition();
        await mouse.setPosition(new Point(current.x + intDx, current.y + intDy));
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
 * Handles mouse click commands immediately (left or right).
 */
export async function handleClick(button: unknown): Promise<void> {
  if (button !== 'left' && button !== 'right' && button !== 'middle') return;

  try {
    if (Win32Input.isSupported()) {
      const ok = Win32Input.click(button as 'left' | 'right' | 'middle');
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
    if (Win32Input.isSupported()) {
      const ok = Win32Input.mouseButton(button as 'left' | 'right' | 'middle', state as 'down' | 'up');
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

// Remainder state for scrolling
let scrollRemainderDy = 0;
let scrollRemainderDx = 0;

/**
 * Handles mouse scroll commands with float remainder carry.
 * Positive dy = scroll down / wheel notch, negative dy = up.
 * Optional dx for horizontal scrolling.
 */
export async function handleScroll(dyRaw: unknown, dxRaw?: unknown): Promise<void> {
  if (typeof dyRaw !== 'number' || isNaN(dyRaw)) return;
  const dxVal = typeof dxRaw === 'number' && !isNaN(dxRaw) ? dxRaw : 0;

  scrollRemainderDy += dyRaw;
  scrollRemainderDx += dxVal;

  const intDy = Math.trunc(scrollRemainderDy);
  const intDx = Math.trunc(scrollRemainderDx);

  scrollRemainderDy -= intDy;
  scrollRemainderDx -= intDx;

  if (intDy === 0 && intDx === 0) return;

  try {
    if (Win32Input.isSupported()) {
      const ok = Win32Input.scroll(intDy, intDx);
      if (ok) return;
    }

    // Fallback to nut-js
    if (intDy > 0) {
      await mouse.scrollDown(intDy);
    } else if (intDy < 0) {
      await mouse.scrollUp(-intDy);
    }
  } catch {
    // Ignore input errors
  }
}
