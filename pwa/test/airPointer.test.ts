import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AirPointerEngine, OneEuroFilter } from '../src/engine/airPointer.js';

describe('OneEuroFilter', () => {
  it('smooths low-speed noise and tracks rapid changes with low latency', () => {
    const filter = new OneEuroFilter(1.0, 0.1);

    // Initial value
    expect(filter.filter(0, 0.016)).toBe(0);

    // Small jitter/noise step at slow speed: high smoothing
    const stepSlow = filter.filter(0.2, 0.016);
    expect(stepSlow).toBeLessThan(0.2);
    expect(stepSlow).toBeGreaterThan(0.01);

    // Reset and test high-velocity step: low smoothing / fast adaptation
    filter.reset();
    filter.filter(0, 0.016);
    // Rapid flick to 50.0 deg/s
    const stepFast = filter.filter(50.0, 0.016);
    expect(stepFast).toBeGreaterThan(15.0); // Responds much more aggressively to high velocity
  });
});

describe('AirPointerEngine', () => {
  it('carries sub-pixel remainders and rounds sent coordinates to 2 decimal places', () => {
    const moves: Array<{ dx: number; dy: number }> = [];
    const engine = new AirPointerEngine((dx, dy) => moves.push({ dx, dy }), () => false);

    // Simulate small rotation rate
    engine.processMotion(
      { alpha: 1.0, beta: 0.5, gamma: 0.0 },
      { x: 0, y: 0, z: -9.81 },
      0.016
    );

    engine.flushFrame();
    if (moves.length > 0) {
      // Sent numbers must have at most 2 decimals
      const last = moves[moves.length - 1];
      expect(Number(last.dx.toFixed(2))).toBe(last.dx);
      expect(Number(last.dy.toFixed(2))).toBe(last.dy);
    }
  });

  it('skips sending while backpressured (>4KB) but retains accumulated deltas', () => {
    let backpressured = true;
    const moves: Array<{ dx: number; dy: number }> = [];
    const engine = new AirPointerEngine((dx, dy) => moves.push({ dx, dy }), () => backpressured);

    // Apply moderate motion
    for (let i = 0; i < 5; i++) {
      engine.processMotion(
        { alpha: 10.0, beta: 5.0, gamma: 0.0 },
        { x: 0, y: 0, z: -9.81 },
        0.016
      );
      engine.flushFrame();
    }

    // Nothing sent because backpressured
    expect(moves.length).toBe(0);
    const telemetryBefore = engine.getTelemetry();
    expect(Math.abs(telemetryBefore.remainderX)).toBeGreaterThan(0);

    // Network drain: backpressure clears!
    backpressured = false;
    engine.flushFrame();

    // Now accumulated motion flushes smoothly
    expect(moves.length).toBe(1);
    expect(Math.abs(moves[0].dx)).toBeGreaterThan(0);
  });

  it('freezes pointer during OK button tap and 120ms freeze window', () => {
    const moves: Array<{ dx: number; dy: number }> = [];
    const engine = new AirPointerEngine((dx, dy) => moves.push({ dx, dy }), () => false);

    // Trigger tap freeze
    engine.freezePointer(150);

    // Process motion during freeze
    engine.processMotion(
      { alpha: 15.0, beta: 10.0, gamma: 0.0 },
      { x: 0, y: 0, z: -9.81 },
      0.016
    );
    engine.flushFrame();

    // No moves sent during freeze
    expect(moves.length).toBe(0);
  });

  it('handles pause mode and hold mode correctly', () => {
    const moves: Array<{ dx: number; dy: number }> = [];
    const engine = new AirPointerEngine((dx, dy) => moves.push({ dx, dy }), () => false, {
      mode: 'hold',
    });

    // In 'hold' mode, motion is ignored while hold is not engaged
    engine.setHoldEngaged(false);
    engine.processMotion(
      { alpha: 20.0, beta: 15.0, gamma: 0.0 },
      { x: 0, y: 0, z: -9.81 },
      0.016
    );
    engine.flushFrame();
    expect(moves.length).toBe(0);

    // Engage thumb
    engine.setHoldEngaged(true);
    engine.processMotion(
      { alpha: 20.0, beta: 15.0, gamma: 0.0 },
      { x: 0, y: 0, z: -9.81 },
      0.016
    );
    engine.flushFrame();
    expect(moves.length).toBe(1);

    // Now test pause toggle
    engine.setPaused(true);
    engine.processMotion(
      { alpha: 20.0, beta: 15.0, gamma: 0.0 },
      { x: 0, y: 0, z: -9.81 },
      0.016
    );
    engine.flushFrame();
    expect(moves.length).toBe(1); // No new move sent
  });

  it('honors calibration signs and axis swapping', () => {
    const moves1: Array<{ dx: number; dy: number }> = [];
    const engine1 = new AirPointerEngine(
      (dx, dy) => moves1.push({ dx, dy }),
      () => false,
      { invertX: false },
      { calibrated: true, yawSign: 1, pitchSign: 1, yawAxis: 'alpha', pitchAxis: 'beta' }
    );

    engine1.processMotion(
      { alpha: 10.0, beta: 0.0, gamma: 0.0 },
      { x: 0, y: 0, z: -9.81 },
      0.016
    );
    engine1.flushFrame();

    const moves2: Array<{ dx: number; dy: number }> = [];
    const engine2 = new AirPointerEngine(
      (dx, dy) => moves2.push({ dx, dy }),
      () => false,
      { invertX: true },
      { calibrated: true, yawSign: 1, pitchSign: 1, yawAxis: 'alpha', pitchAxis: 'beta' }
    );

    engine2.processMotion(
      { alpha: 10.0, beta: 0.0, gamma: 0.0 },
      { x: 0, y: 0, z: -9.81 },
      0.016
    );
    engine2.flushFrame();

    expect(moves1[0].dx).toBeGreaterThan(0);
    expect(moves2[0].dx).toBeLessThan(0);
  });
});
