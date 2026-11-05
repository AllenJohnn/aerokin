import { describe, it, expect, beforeEach } from 'vitest';
import {
  TrackpadGestureEngine,
  TrackpadIntent,
  TrackpadConfig,
  DEFAULT_TRACKPAD_CONFIG,
  DEFAULT_SCROLL_SENSITIVITY,
  DEFAULT_POINTER_SPEED,
  DEFAULT_MOMENTUM_DECAY,
  SCROLL_HAPTIC_THROTTLE_MS,
  STORAGE_TRACKPAD_CONFIG_KEY,
  validateTrackpadConfig,
  migrateTrackpadConfig,
  validateAndMigrateTrackpadConfig,
  loadTrackpadConfig,
  saveTrackpadConfig,
} from '../src/engine/trackpadGestures';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};
(globalThis as any).localStorage = localStorageMock;
(globalThis as any).window = {};

describe('AEROKIN TrackpadGestureEngine', () => {
  let engine: TrackpadGestureEngine;

  beforeEach(() => {
    engine = new TrackpadGestureEngine({
      naturalScroll: true,
      scrollSensitivityX: 1.0,
      scrollSensitivityY: 1.0,
      momentum: false,
    });
  });

  describe('One-finger move and acceleration', () => {
    it('moves cursor with velocity-based acceleration and carries sub-pixel remainders', () => {
      // Finger down at t = 1000
      let intents = engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      expect(intents).toEqual([]);
      expect(engine.getState()).toBe('ONE_FINGER_TRACKING');

      // Move slowly: 1px in 50ms (speed = 0.02 px/ms -> accel ~1.025)
      intents = engine.processEvent({ type: 'move', id: 1, x: 101, y: 100, time: 1050 });
      expect(intents.length).toBe(1);
      expect(intents[0].type).toBe('move');
      if (intents[0].type === 'move') {
        expect(intents[0].dx).toBeCloseTo(1.03, 1);
        expect(intents[0].dy).toBe(0);
      }

      // Fast flick: 20px in 10ms (speed = 2.0 px/ms -> accel max capped at 3.5)
      intents = engine.processEvent({ type: 'move', id: 1, x: 121, y: 100, time: 1060 });
      expect(intents.length).toBe(1);
      expect(intents[0].type).toBe('move');
      if (intents[0].type === 'move') {
        // 20 * 3.5 = 70 plus remainder
        expect(intents[0].dx).toBeGreaterThanOrEqual(69);
      }
    });

    it('accumulates tiny sub-pixel delta remainder across moves', () => {
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });

      // Very tiny move: 0.02px (below 0.05 threshold)
      let intents = engine.processEvent({ type: 'move', id: 1, x: 100.02, y: 100, time: 1016 });
      expect(intents).toEqual([]); // Carried in remainder

      // Another tiny move: 0.04px -> total 0.06px (crosses 0.05 threshold)
      intents = engine.processEvent({ type: 'move', id: 1, x: 100.06, y: 100, time: 1032 });
      expect(intents.length).toBe(1);
      expect(intents[0].type).toBe('move');
      if (intents[0].type === 'move') {
        expect(intents[0].dx).toBeGreaterThanOrEqual(0.05);
      }
    });
  });

  describe('One-finger quick tap & tap-drag', () => {
    it('detects a quick tap (<180ms, <6px travel) as a left click', () => {
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      const intents = engine.processEvent({ type: 'up', id: 1, x: 102, y: 101, time: 1080 });

      expect(intents).toContainEqual({ type: 'click', button: 'left' });
      expect(intents).toContainEqual({ type: 'haptic', style: 'light' });
      expect(engine.getState()).toBe('IDLE');
    });

    it('does NOT trigger a tap if hold duration exceeds 180ms', () => {
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      const intents = engine.processEvent({ type: 'up', id: 1, x: 100, y: 100, time: 1250 });

      expect(intents).toEqual([]);
    });

    it('does NOT trigger a tap if finger moved more than 6px', () => {
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      engine.processEvent({ type: 'move', id: 1, x: 110, y: 100, time: 1050 });
      const intents = engine.processEvent({ type: 'up', id: 1, x: 110, y: 100, time: 1090 });

      expect(intents.filter((i) => i.type === 'click')).toEqual([]);
    });

    it('engages tap-drag on second touch within 280ms and releases on finger lift', () => {
      // 1. First quick tap at t = 1000 -> 1060
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      engine.processEvent({ type: 'up', id: 1, x: 100, y: 100, time: 1060 });

      // 2. Second touch within 150ms at t = 1210 (1210 - 1060 = 150ms < 280ms)
      const downIntents = engine.processEvent({ type: 'down', id: 2, x: 102, y: 101, time: 1210 });
      expect(engine.getState()).toBe('ONE_FINGER_DRAGGING');
      expect(downIntents).toContainEqual({ type: 'button', button: 'left', state: 'down' });
      expect(downIntents).toContainEqual({ type: 'drag_status', isDragging: true });
      expect(downIntents).toContainEqual({ type: 'haptic', style: 'heavy' });

      // 3. Move during drag
      const moveIntents = engine.processEvent({ type: 'move', id: 2, x: 120, y: 101, time: 1250 });
      expect(moveIntents.some((i) => i.type === 'move')).toBe(true);

      // 4. Release finger
      const upIntents = engine.processEvent({ type: 'up', id: 2, x: 120, y: 101, time: 1300 });
      expect(engine.getState()).toBe('IDLE');
      expect(upIntents).toContainEqual({ type: 'button', button: 'left', state: 'up' });
      expect(upIntents).toContainEqual({ type: 'drag_status', isDragging: false });
      expect(upIntents).toContainEqual({ type: 'haptic', style: 'medium' });
    });
  });

  describe('Two-finger scrolling (Natural vs Inverted)', () => {
    it('scrolls naturally on vertical and horizontal axes', () => {
      // Touch two fingers at (100, 200) and (150, 200)
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1010 });
      expect(engine.getState()).toBe('TWO_FINGER_TRACKING');

      // Move fingers UP: y decreases from 200 to 180 (dcy = -20)
      // Natural behavior: fingers UP -> page scrolls DOWN (protocol positive dy)
      let intents = engine.processEvent({ type: 'move', id: 1, x: 100, y: 180, time: 1050 });
      intents = intents.concat(
        engine.processEvent({ type: 'move', id: 2, x: 150, y: 180, time: 1050 })
      );

      const scrollEvents = intents.filter((i): i is { type: 'scroll'; dy: number; dx: number } => i.type === 'scroll');
      expect(scrollEvents.length).toBeGreaterThan(0);
      const totalDy = scrollEvents.reduce((acc, cur) => acc + cur.dy, 0);
      expect(totalDy).toBeGreaterThan(0); // Positive dy = page down!

      // Move fingers LEFT: x decreases (dcx < 0) -> page scrolls RIGHT (positive dx)
      intents = engine.processEvent({ type: 'move', id: 1, x: 80, y: 180, time: 1080 });
      intents = intents.concat(
        engine.processEvent({ type: 'move', id: 2, x: 130, y: 180, time: 1080 })
      );

      const scrollXEvents = intents.filter((i): i is { type: 'scroll'; dy: number; dx: number } => i.type === 'scroll');
      const totalDx = scrollXEvents.reduce((acc, cur) => acc + cur.dx, 0);
      expect(totalDx).toBeGreaterThan(0); // Positive dx = page right!
    });

    it('inverts scroll directions when naturalScroll is false', () => {
      engine.updateConfig({ naturalScroll: false });

      engine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1010 });

      // Move fingers UP (y decreases: dcy = -20)
      // Inverted: fingers UP -> page scrolls UP (protocol negative dy)
      let intents = engine.processEvent({ type: 'move', id: 1, x: 100, y: 180, time: 1050 });
      intents = intents.concat(
        engine.processEvent({ type: 'move', id: 2, x: 150, y: 180, time: 1050 })
      );

      const scrollEvents = intents.filter((i): i is { type: 'scroll'; dy: number; dx: number } => i.type === 'scroll');
      const totalDy = scrollEvents.reduce((acc, cur) => acc + cur.dy, 0);
      expect(totalDy).toBeLessThan(0); // Negative dy = page up!
    });

    it('stops scrolling immediately when fingers lift (no scroll on pointerup)', () => {
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1010 });

      engine.processEvent({ type: 'move', id: 1, x: 100, y: 150, time: 1050 });
      engine.processEvent({ type: 'move', id: 2, x: 150, y: 150, time: 1050 });

      // Lift first finger
      const up1 = engine.processEvent({ type: 'up', id: 1, x: 100, y: 150, time: 1060 });
      expect(up1.filter((i) => i.type === 'scroll')).toEqual([]);

      // Lift second finger
      const up2 = engine.processEvent({ type: 'up', id: 2, x: 150, y: 150, time: 1070 });
      expect(up2.filter((i) => i.type === 'scroll')).toEqual([]);
    });
  });

  describe('Two-finger tap (Right click)', () => {
    it('detects two-finger quick tap as a right click', () => {
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1020 });

      // Lift both with minimal travel within 200ms
      engine.processEvent({ type: 'up', id: 1, x: 101, y: 200, time: 1100 });
      const upIntents = engine.processEvent({ type: 'up', id: 2, x: 151, y: 201, time: 1120 });

      expect(upIntents).toContainEqual({ type: 'click', button: 'right' });
      expect(upIntents).toContainEqual({ type: 'haptic', style: 'medium' });
    });
  });

  describe('Transition rules and edge cases (Rule B3)', () => {
    it('cancels pending one-finger tap/drag when second finger lands', () => {
      // 1. One finger lands
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });

      // 2. Second finger lands before lift
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 100, time: 1050 });
      expect(engine.getState()).toBe('TWO_FINGER_TRACKING');

      // 3. Lift both fingers after hold
      engine.processEvent({ type: 'up', id: 1, x: 100, y: 100, time: 1400 });
      const intents2 = engine.processEvent({ type: 'up', id: 2, x: 150, y: 100, time: 1420 });

      // Must NEVER emit a left click!
      expect(intents2.filter((i) => i.type === 'click')).toEqual([]);
    });

    it('going from 2 fingers to 1 enters lockout: no move and no click until all fingers lift', () => {
      // Two fingers down
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 100, time: 1010 });

      // Two fingers move (scrolling active)
      engine.processEvent({ type: 'move', id: 1, x: 100, y: 120, time: 1050 });
      engine.processEvent({ type: 'move', id: 2, x: 150, y: 120, time: 1050 });

      // Lift finger 2
      const upIntents = engine.processEvent({ type: 'up', id: 2, x: 150, y: 120, time: 1080 });
      expect(engine.getState()).toBe('MULTI_FINGER_LOCKOUT');
      expect(upIntents.filter((i) => i.type === 'click')).toEqual([]);

      // Move remaining finger 1 -> must NOT move cursor or scroll
      const moveIntents = engine.processEvent({ type: 'move', id: 1, x: 120, y: 140, time: 1100 });
      expect(moveIntents).toEqual([]);

      // Lift finger 1 -> must NOT click
      const lastUpIntents = engine.processEvent({ type: 'up', id: 1, x: 120, y: 140, time: 1120 });
      expect(lastUpIntents).toEqual([]);
      expect(engine.getState()).toBe('IDLE');

      // Now a new clean one-finger touch can start
      engine.processEvent({ type: 'down', id: 3, x: 200, y: 200, time: 1500 });
      expect(engine.getState()).toBe('ONE_FINGER_TRACKING');
    });

    it('pointercancel mid-drag releases held button and resets state', () => {
      // Engage tap-drag
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      engine.processEvent({ type: 'up', id: 1, x: 100, y: 100, time: 1050 });
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1150 });
      expect(engine.getState()).toBe('ONE_FINGER_DRAGGING');

      // iOS system gesture / app switch triggers pointercancel
      const cancelIntents = engine.processEvent({ type: 'cancel', id: 1, x: 110, y: 110, time: 1200 });

      expect(cancelIntents).toContainEqual({ type: 'button', button: 'left', state: 'up' });
      expect(cancelIntents).toContainEqual({ type: 'drag_status', isDragging: false });
      expect(engine.getState()).toBe('IDLE');
      expect(engine.getPointerCount()).toBe(0);
    });

    it('pinch gesture suppresses scrolling', () => {
      // Initial touch: span = 50px (x=100 and x=150)
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1010 });

      // Pinch open: fingers move apart in opposite directions by 40px each (span = 130px, centroid unchanged)
      let intents = engine.processEvent({ type: 'move', id: 1, x: 60, y: 200, time: 1050 });
      intents = intents.concat(
        engine.processEvent({ type: 'move', id: 2, x: 190, y: 200, time: 1050 })
      );

      // Should be detected as pinch and emit NO scroll
      expect(intents.filter((i) => i.type === 'scroll')).toEqual([]);
    });
  });

  describe('Momentum Scrolling (optional)', () => {
    it('does NOT trigger momentum when config.momentum is false (default)', () => {
      engine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1010 });

      // Fast flick up: 100px in 20ms
      engine.processEvent({ type: 'move', id: 1, x: 100, y: 100, time: 1030 });
      engine.processEvent({ type: 'move', id: 2, x: 150, y: 100, time: 1030 });

      engine.processEvent({ type: 'up', id: 1, x: 100, y: 100, time: 1031 });
      engine.processEvent({ type: 'up', id: 2, x: 150, y: 100, time: 1032 });

      expect(engine.isMomentumActive()).toBe(false);
      expect(engine.stepMomentum(16)).toEqual([]);
    });

    it('triggers and decays momentum when enabled, and cancels instantly on new touch', () => {
      engine.updateConfig({ momentum: true, momentumDecay: 0.9 });

      engine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      engine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1010 });

      // Fast flick up: 60px in 20ms (speed 3.0 px/ms)
      engine.processEvent({ type: 'move', id: 1, x: 100, y: 140, time: 1030 });
      engine.processEvent({ type: 'move', id: 2, x: 150, y: 140, time: 1030 });

      engine.processEvent({ type: 'up', id: 1, x: 100, y: 140, time: 1031 });
      engine.processEvent({ type: 'up', id: 2, x: 150, y: 140, time: 1032 });

      expect(engine.isMomentumActive()).toBe(true);

      // Step momentum frame 1
      const step1 = engine.stepMomentum(16);
      expect(step1.length).toBe(1);
      expect(step1[0].type).toBe('scroll');

      // New touch arrives -> must cancel momentum instantly!
      engine.processEvent({ type: 'down', id: 3, x: 200, y: 200, time: 1050 });
      expect(engine.isMomentumActive()).toBe(false);
      expect(engine.stepMomentum(16)).toEqual([]);
    });
  });

  describe('Trackpad Configuration & Migration', () => {
    beforeEach(() => {
      storage.clear();
    });

    it('has correct default constants and values', () => {
      expect(DEFAULT_SCROLL_SENSITIVITY).toBe(0.25);
      expect(DEFAULT_POINTER_SPEED).toBe(1.0);
      expect(DEFAULT_MOMENTUM_DECAY).toBe(0.92);
      expect(SCROLL_HAPTIC_THROTTLE_MS).toBe(60);

      expect(DEFAULT_TRACKPAD_CONFIG).toEqual({
        configVersion: 2,
        naturalScroll: true,
        scrollSensitivityX: 0.25,
        scrollSensitivityY: 0.25,
        pointerSpeed: 1.0,
        momentum: false,
        momentumDecay: 0.92,
        scrollHaptics: true,
      });
    });

    it('migrates legacy stored config with old default 1.0 to new default 0.25', () => {
      const legacyConfig = {
        naturalScroll: true,
        scrollSensitivityX: 1.0,
        scrollSensitivityY: 1.0,
        momentum: false,
      };

      const migrated = migrateTrackpadConfig(legacyConfig);
      expect(migrated.scrollSensitivityX).toBe(0.25);
      expect(migrated.scrollSensitivityY).toBe(0.25);
      expect(migrated.configVersion).toBe(2);

      // Preserves custom sensitivity if user intentionally customized it away from 1.0
      const customConfig = {
        scrollSensitivityX: 0.75,
        scrollSensitivityY: 0.45,
      };
      const customMigrated = migrateTrackpadConfig(customConfig);
      expect(customMigrated.scrollSensitivityX).toBe(0.75);
      expect(customMigrated.scrollSensitivityY).toBe(0.45);
      expect(customMigrated.configVersion).toBe(2);
    });

    it('v2 config with 1.0 stays 1.0 across save and load', () => {
      // User deliberately set scroll sensitivity to 1.0 in version 2
      const userChoiceV2: TrackpadConfig = {
        configVersion: 2,
        naturalScroll: true,
        scrollSensitivityX: 1.0,
        scrollSensitivityY: 1.0,
        pointerSpeed: 1.0,
        momentum: false,
        momentumDecay: 0.92,
        scrollHaptics: true,
      };
      saveTrackpadConfig(userChoiceV2);

      const loaded = loadTrackpadConfig();
      expect(loaded.configVersion).toBe(2);
      expect(loaded.scrollSensitivityX).toBe(1.0);
      expect(loaded.scrollSensitivityY).toBe(1.0);
    });

    it('validates and clamps values to safe bounds', () => {
      const clamped = validateTrackpadConfig({
        naturalScroll: 'not-a-bool',
        scrollSensitivityX: 99.9, // exceeds 1.5 max
        scrollSensitivityY: 0.001, // below 0.05 min
        pointerSpeed: 10.0, // exceeds 3.0 max
        momentum: 123,
        momentumDecay: 0.5, // below 0.80 min
        scrollHaptics: null,
      });

      expect(clamped.configVersion).toBe(2);
      expect(clamped.naturalScroll).toBe(true);
      expect(clamped.scrollSensitivityX).toBe(1.5);
      expect(clamped.scrollSensitivityY).toBe(0.05);
      expect(clamped.pointerSpeed).toBe(3.0);
      expect(clamped.momentum).toBe(false);
      expect(clamped.momentumDecay).toBe(0.80);
      expect(clamped.scrollHaptics).toBe(true);
    });

    it('saves to and loads from localStorage with automatic migration and validation', () => {
      // 1. Simulate legacy storage with 1.0 sensitivities without version
      localStorageMock.setItem(
        STORAGE_TRACKPAD_CONFIG_KEY,
        JSON.stringify({
          naturalScroll: false,
          scrollSensitivityX: 1.0,
          scrollSensitivityY: 1.0,
        })
      );

      const loadedLegacy = loadTrackpadConfig();
      expect(loadedLegacy.configVersion).toBe(2);
      expect(loadedLegacy.naturalScroll).toBe(false);
      expect(loadedLegacy.scrollSensitivityX).toBe(0.25);
      expect(loadedLegacy.scrollSensitivityY).toBe(0.25);

      // 2. Save new customized config and reload
      const customized: TrackpadConfig = {
        configVersion: 2,
        naturalScroll: true,
        scrollSensitivityX: 0.4,
        scrollSensitivityY: 0.6,
        pointerSpeed: 1.5,
        momentum: true,
        momentumDecay: 0.95,
        scrollHaptics: false,
      };
      saveTrackpadConfig(customized);

      const reloaded = loadTrackpadConfig();
      expect(reloaded).toEqual(customized);
    });

    it('recovers gracefully from corrupt localStorage data and reset writes v2', () => {
      localStorageMock.setItem(STORAGE_TRACKPAD_CONFIG_KEY, '{invalid-json:::');
      const fallback = loadTrackpadConfig();
      expect(fallback).toEqual(DEFAULT_TRACKPAD_CONFIG);
      expect(fallback.configVersion).toBe(2);

      // Reset writes v2
      saveTrackpadConfig(DEFAULT_TRACKPAD_CONFIG);
      const afterReset = loadTrackpadConfig();
      expect(afterReset).toEqual(DEFAULT_TRACKPAD_CONFIG);
      expect(afterReset.configVersion).toBe(2);
    });
  });

  describe('Live Configuration Updates', () => {
    it('applies scroll sensitivity updates live without recreating engine', () => {
      const liveEngine = new TrackpadGestureEngine({
        naturalScroll: true,
        scrollSensitivityY: 0.25,
      });

      // Two-finger move with sensitivity 0.25: dcy = -20px
      // rawScrollDy = -(-20) * 0.25 = 5.0
      liveEngine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      liveEngine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1010 });
      let intents = liveEngine.processEvent({ type: 'move', id: 1, x: 100, y: 180, time: 1050 });
      intents = intents.concat(
        liveEngine.processEvent({ type: 'move', id: 2, x: 150, y: 180, time: 1050 })
      );

      const totalDy1 = intents
        .filter((i): i is { type: 'scroll'; dy: number; dx: number } => i.type === 'scroll')
        .reduce((acc, cur) => acc + cur.dy, 0);
      expect(totalDy1).toBe(5);

      // Live update sensitivity to 0.50 (double the speed!)
      liveEngine.updateConfig({ scrollSensitivityY: 0.5 });

      // Move another 20px up (from y=180 to y=160)
      // rawScrollDy = -(-20) * 0.50 = 10.0
      intents = liveEngine.processEvent({ type: 'move', id: 1, x: 100, y: 160, time: 1100 });
      intents = intents.concat(
        liveEngine.processEvent({ type: 'move', id: 2, x: 150, y: 160, time: 1100 })
      );

      const totalDy2 = intents
        .filter((i): i is { type: 'scroll'; dy: number; dx: number } => i.type === 'scroll')
        .reduce((acc, cur) => acc + cur.dy, 0);
      expect(totalDy2).toBe(10);
    });

    it('scales pointer speed via multiplier without altering the acceleration curve', () => {
      const normalEngine = new TrackpadGestureEngine({ pointerSpeed: 1.0 });
      const fastEngine = new TrackpadGestureEngine({ pointerSpeed: 2.0 });

      // Slow move: 10px in 50ms (speed 0.2 px/ms)
      normalEngine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      const normalIntents = normalEngine.processEvent({ type: 'move', id: 1, x: 110, y: 100, time: 1050 });

      fastEngine.processEvent({ type: 'down', id: 1, x: 100, y: 100, time: 1000 });
      const fastIntents = fastEngine.processEvent({ type: 'move', id: 1, x: 110, y: 100, time: 1050 });

      const normalMove = normalIntents.find((i): i is { type: 'move'; dx: number; dy: number } => i.type === 'move');
      const fastMove = fastIntents.find((i): i is { type: 'move'; dx: number; dy: number } => i.type === 'move');

      expect(normalMove).toBeDefined();
      expect(fastMove).toBeDefined();
      // Fast move should be approximately 2x normal move
      expect(fastMove!.dx).toBeCloseTo(normalMove!.dx * 2, 0);
    });

    it('restores all default values on reset', () => {
      const customEngine = new TrackpadGestureEngine({
        naturalScroll: false,
        scrollSensitivityX: 1.2,
        scrollSensitivityY: 1.2,
        pointerSpeed: 2.5,
        momentum: true,
        momentumDecay: 0.85,
        scrollHaptics: false,
      });

      customEngine.updateConfig(DEFAULT_TRACKPAD_CONFIG);
      expect(customEngine.getConfig()).toEqual(DEFAULT_TRACKPAD_CONFIG);
    });
  });

  describe('Scroll Haptics Throttling & Detents', () => {
    it('throttles detent haptics to at most one per 60ms', () => {
      const hapticEngine = new TrackpadGestureEngine({
        naturalScroll: true,
        scrollSensitivityY: 0.5,
        scrollHaptics: true,
      });

      hapticEngine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      hapticEngine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1000 });

      // Move 40px up at t = 1010 -> sendDy = 20 (>= 12 detent distance) -> detent haptic emitted
      let intents1 = hapticEngine.processEvent({ type: 'move', id: 1, x: 100, y: 160, time: 1010 });
      intents1 = intents1.concat(
        hapticEngine.processEvent({ type: 'move', id: 2, x: 150, y: 160, time: 1010 })
      );
      expect(intents1.some((i) => i.type === 'haptic' && i.style === 'detent')).toBe(true);

      // Move another 40px up at t = 1030 (only 20ms later, < 60ms throttle) -> detent haptic suppressed!
      let intents2 = hapticEngine.processEvent({ type: 'move', id: 1, x: 100, y: 120, time: 1030 });
      intents2 = intents2.concat(
        hapticEngine.processEvent({ type: 'move', id: 2, x: 150, y: 120, time: 1030 })
      );
      expect(intents2.some((i) => i.type === 'haptic' && i.style === 'detent')).toBe(false);

      // Move another 40px up at t = 1080 (70ms after first haptic, >= 60ms) -> detent haptic emitted!
      let intents3 = hapticEngine.processEvent({ type: 'move', id: 1, x: 100, y: 80, time: 1080 });
      intents3 = intents3.concat(
        hapticEngine.processEvent({ type: 'move', id: 2, x: 150, y: 80, time: 1080 })
      );
      expect(intents3.some((i) => i.type === 'haptic' && i.style === 'detent')).toBe(true);
    });

    it('suppresses all scroll detent haptics when scrollHaptics is false', () => {
      const silentEngine = new TrackpadGestureEngine({
        naturalScroll: true,
        scrollSensitivityY: 0.5,
        scrollHaptics: false,
      });

      silentEngine.processEvent({ type: 'down', id: 1, x: 100, y: 200, time: 1000 });
      silentEngine.processEvent({ type: 'down', id: 2, x: 150, y: 200, time: 1000 });

      // Move fingers up in 20px increments so span is preserved
      let intents: TrackpadIntent[] = [];
      for (let y = 180; y >= 100; y -= 20) {
        intents = intents.concat(
          silentEngine.processEvent({ type: 'move', id: 1, x: 100, y, time: 1010 + (200 - y) })
        );
        intents = intents.concat(
          silentEngine.processEvent({ type: 'move', id: 2, x: 150, y, time: 1010 + (200 - y) })
        );
      }

      // Scroll intent is present, but NO haptic
      expect(intents.some((i) => i.type === 'scroll')).toBe(true);
      expect(intents.some((i) => i.type === 'haptic')).toBe(false);
    });
  });
});
