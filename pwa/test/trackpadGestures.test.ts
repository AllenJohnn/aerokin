import { describe, it, expect, beforeEach } from 'vitest';
import {
  TrackpadGestureEngine,
  TrackpadIntent,
  DEFAULT_TRACKPAD_CONFIG,
} from '../src/engine/trackpadGestures';

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
});
