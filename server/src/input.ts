import { mouse, keyboard, Button, Key, Point } from '@nut-tree-fork/nut-js';

// Configure nut-js for zero-delay instant response
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

export type MediaAction =
  | 'playpause'
  | 'next'
  | 'prev'
  | 'volup'
  | 'voldown'
  | 'mute'
  | 'fullscreen'
  | 'seekfwd'
  | 'seekback';

const MEDIA_KEY_MAP: Record<MediaAction, Key> = {
  playpause: Key.AudioPlay,
  next: Key.AudioNext,
  prev: Key.AudioPrev,
  volup: Key.AudioVolUp,
  voldown: Key.AudioVolDown,
  mute: Key.AudioMute,
  fullscreen: Key.F,
  seekfwd: Key.Right,
  seekback: Key.Left,
};

export interface MoveCoalescer {
  addMove: (dxRaw: unknown, dyRaw: unknown) => void;
  destroy: () => void;
}

/**
 * Creates a per-connection move coalescer.
 * Accumulates dx/dy and flushes every ~8ms with ONE mouse.getPosition + setPosition.
 * Ensures only one OS call is in flight at a time.
 * Enforces a +/-200 cap per incoming message before accumulating.
 */
export function createMoveCoalescer(flushIntervalMs = 8): MoveCoalescer {
  let accumulatedDx = 0;
  let accumulatedDy = 0;
  let isFlushing = false;

  const timer = setInterval(async () => {
    // Ensure only one OS call in flight at a time
    if (isFlushing) return;
    if (accumulatedDx === 0 && accumulatedDy === 0) return;

    // Snapshot and reset accumulator
    const dx = accumulatedDx;
    const dy = accumulatedDy;
    accumulatedDx = 0;
    accumulatedDy = 0;

    isFlushing = true;
    try {
      const current = await mouse.getPosition();
      await mouse.setPosition(new Point(current.x + dx, current.y + dy));
    } catch {
      // Ignore OS-level cursor clamp or coordinate errors
    } finally {
      isFlushing = false;
    }
  }, flushIntervalMs);

  return {
    addMove(dxRaw: unknown, dyRaw: unknown) {
      if (typeof dxRaw !== 'number' || typeof dyRaw !== 'number') return;
      if (isNaN(dxRaw) || isNaN(dyRaw)) return;

      // Keep the +/-200 cap per incoming message
      const dx = Math.max(-200, Math.min(200, Math.round(dxRaw)));
      const dy = Math.max(-200, Math.min(200, Math.round(dyRaw)));

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
  if (button !== 'left' && button !== 'right') return;

  try {
    if (button === 'left') {
      await mouse.click(Button.LEFT);
    } else {
      await mouse.click(Button.RIGHT);
    }
  } catch {
    // Ignore input errors
  }
}

/**
 * Handles mouse scroll commands immediately (positive dy = down, negative dy = up).
 */
export async function handleScroll(dyRaw: unknown): Promise<void> {
  if (typeof dyRaw !== 'number' || isNaN(dyRaw)) return;
  const dy = Math.round(dyRaw);
  if (dy === 0) return;

  try {
    if (dy > 0) {
      await mouse.scrollDown(dy);
    } else {
      await mouse.scrollUp(-dy);
    }
  } catch {
    // Ignore input errors
  }
}

/**
 * Handles media and shortcut keys immediately (Windows multimedia keys, fullscreen, seeking).
 */
export async function handleMedia(action: unknown): Promise<void> {
  if (typeof action !== 'string') return;
  const targetKey = MEDIA_KEY_MAP[action as MediaAction];
  if (targetKey === undefined) return;

  try {
    await keyboard.type(targetKey);
  } catch {
    // Ignore input errors
  }
}
