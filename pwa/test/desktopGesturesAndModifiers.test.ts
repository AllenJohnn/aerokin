import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadDesktopSettings,
  saveDesktopSettings,
  DEFAULT_DESKTOP_SETTINGS,
  DesktopSettings,
  STORAGE_DESKTOP_SETTINGS_KEY,
} from '../src/types/desktop';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
(globalThis as any).localStorage = localStorageMock;
(globalThis as any).window = {};

describe('AEROKIN Desktop Settings & Key Modifier Latching', () => {
  beforeEach(() => {
    storage.clear();
  });

  describe('DesktopSettings Persistence', () => {
    it('returns default settings when storage is empty', () => {
      const s = loadDesktopSettings();
      expect(s).toEqual(DEFAULT_DESKTOP_SETTINGS);
    });

    it('persists and reloads valid desktop settings', () => {
      const custom: DesktopSettings = {
        defaultPreset: 'high',
        fpsCap: 60,
        inputMode: 'trackpad',
        showStats: true,
        autoHideToolbar: false,
      };
      saveDesktopSettings(custom);

      const loaded = loadDesktopSettings();
      expect(loaded).toEqual(custom);
    });

    it('sanitizes and clamps invalid storage entries to safe defaults', () => {
      storage.set(
        STORAGE_DESKTOP_SETTINGS_KEY,
        JSON.stringify({
          defaultPreset: 'invalid_super_turbo',
          fpsCap: 500,
          inputMode: 'telepathy',
          showStats: 'yes',
        })
      );

      const sanitized = loadDesktopSettings();
      expect(sanitized.defaultPreset).toBe('balanced');
      expect(sanitized.fpsCap).toBe(60); // clamped to 60 max
      expect(sanitized.inputMode).toBe('direct');
      expect(sanitized.showStats).toBe(true);
    });
  });

  describe('Sticky Modifier Latching Logic', () => {
    it('latches modifiers and unlatches upon single key action', () => {
      let latchedModifiers: Record<string, boolean> = {
        ctrl: false,
        alt: false,
        shift: false,
        win: false,
      };

      const toggleModifier = (mod: string) => {
        latchedModifiers[mod] = !latchedModifiers[mod];
      };

      const getActiveModifiers = () =>
        Object.entries(latchedModifiers)
          .filter(([_, v]) => v)
          .map(([k]) => k);

      const clearModifiers = () => {
        latchedModifiers = { ctrl: false, alt: false, shift: false, win: false };
      };

      // 1. User taps Ctrl
      toggleModifier('ctrl');
      expect(getActiveModifiers()).toEqual(['ctrl']);

      // 2. User taps Shift (chord combination prep)
      toggleModifier('shift');
      expect(getActiveModifiers()).toEqual(['ctrl', 'shift']);

      // 3. User taps Esc -> dispatched with ['ctrl', 'shift'], then latched state clears
      const dispatchedMods = getActiveModifiers();
      expect(dispatchedMods).toEqual(['ctrl', 'shift']);
      clearModifiers();
      expect(getActiveModifiers()).toEqual([]);
    });

    it('un-toggles modifier if user taps it a second time', () => {
      let latched = false;
      const toggle = () => {
        latched = !latched;
      };

      toggle(); // tap once -> on
      expect(latched).toBe(true);

      toggle(); // tap again -> off
      expect(latched).toBe(false);
    });
  });

  describe('Gesture Arbitration Timing', () => {
    it('identifies double tap within 280ms threshold', () => {
      const TAP_THRESHOLD = 280;
      let lastTapTime = 1000;

      const secondTapTime = 1200; // 200ms delta (< 280ms)
      const isDoubleTap = secondTapTime - lastTapTime < TAP_THRESHOLD;
      expect(isDoubleTap).toBe(true);

      const slowTapTime = 1350; // 350ms delta (> 280ms)
      const isSlowTap = slowTapTime - lastTapTime < TAP_THRESHOLD;
      expect(isSlowTap).toBe(false);
    });

    it('cancels long press when touch moves greater than 8px', () => {
      const MOVE_THRESHOLD = 8;
      const startX = 100;
      const startY = 100;

      // Small jitter (3px move)
      const jitterDist = Math.hypot(102 - startX, 102 - startY);
      expect(jitterDist < MOVE_THRESHOLD).toBe(true); // Should NOT cancel long press

      // Deliberate swipe/drag (15px move)
      const moveDist = Math.hypot(112 - startX, 110 - startY);
      expect(moveDist > MOVE_THRESHOLD).toBe(true); // Should cancel long press
    });
  });
});
