import { mouse, keyboard, Button, Key, Point } from '@nut-tree-fork/nut-js';

// Configure nut-js for zero-delay instant response suitable for real-time air mouse streaming
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

/**
 * Handles incoming move command: relative cursor displacement capped at +/- 200px.
 */
export async function handleMove(dxRaw: unknown, dyRaw: unknown): Promise<void> {
  if (typeof dxRaw !== 'number' || typeof dyRaw !== 'number') return;
  if (isNaN(dxRaw) || isNaN(dyRaw)) return;

  // Cap deltas between -200 and +200 pixels
  const dx = Math.max(-200, Math.min(200, Math.round(dxRaw)));
  const dy = Math.max(-200, Math.min(200, Math.round(dyRaw)));

  try {
    const current = await mouse.getPosition();
    await mouse.setPosition(new Point(current.x + dx, current.y + dy));
  } catch (err) {
    // Gracefully ignore operating system coordinate clamp or transient errors
  }
}

/**
 * Handles mouse click commands (left or right).
 */
export async function handleClick(button: unknown): Promise<void> {
  if (button !== 'left' && button !== 'right') return;

  try {
    if (button === 'left') {
      await mouse.click(Button.LEFT);
    } else {
      await mouse.click(Button.RIGHT);
    }
  } catch (err) {
    // Ignore input errors
  }
}

/**
 * Handles mouse scroll commands (positive dy = down, negative dy = up).
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
  } catch (err) {
    // Ignore input errors
  }
}

/**
 * Handles media and shortcut keys (Windows multimedia keys, fullscreen, seeking).
 */
export async function handleMedia(action: unknown): Promise<void> {
  if (typeof action !== 'string') return;
  const targetKey = MEDIA_KEY_MAP[action as MediaAction];
  if (targetKey === undefined) return;

  try {
    await keyboard.type(targetKey);
  } catch (err) {
    // Ignore input errors
  }
}
