import { describe, it, expect, beforeEach } from 'vitest';
import { FrameDeduplicator } from '../src/desktop/FrameDeduplicator.js';
import {
  AdaptiveQualityManager,
  QUALITY_TIER_LADDER,
} from '../src/desktop/AdaptiveQualityManager.js';

describe('FrameDeduplicator (Bandwidth Reduction)', () => {
  let mockTime = 100000;
  const getNow = () => mockTime;

  beforeEach(() => {
    mockTime = 100000;
  });

  it('transmits first frame immediately', () => {
    const dedupe = new FrameDeduplicator({ getNow, keepaliveIntervalMs: 1000 });
    const frameA = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

    const res = dedupe.shouldSend(frameA);
    expect(res.send).toBe(true);
    expect(res.isKeepalive).toBe(false);
  });

  it('skips identical consecutive frames within keepalive window', () => {
    const dedupe = new FrameDeduplicator({ getNow, keepaliveIntervalMs: 1000 });
    const frameA = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

    dedupe.shouldSend(frameA);

    // 100ms later: same frame
    mockTime += 100;
    const res2 = dedupe.shouldSend(frameA);
    expect(res2.send).toBe(false);
    expect(res2.isKeepalive).toBe(false);

    // 500ms later: same frame
    mockTime += 400;
    const res3 = dedupe.shouldSend(frameA);
    expect(res3.send).toBe(false);
  });

  it('sends keepalive frame when screen remains static for >= 1000ms', () => {
    const dedupe = new FrameDeduplicator({ getNow, keepaliveIntervalMs: 1000 });
    const frameA = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

    dedupe.shouldSend(frameA);

    // Advance by 1050ms
    mockTime += 1050;
    const res = dedupe.shouldSend(frameA);
    expect(res.send).toBe(true);
    expect(res.isKeepalive).toBe(true);

    // Immediately afterwards, identical frame skipped again
    mockTime += 50;
    const resNext = dedupe.shouldSend(frameA);
    expect(resNext.send).toBe(false);
  });

  it('transmits novel frame immediately and resets keepalive timer', () => {
    const dedupe = new FrameDeduplicator({ getNow, keepaliveIntervalMs: 1000 });
    const frameA = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);
    const frameB = Buffer.from([0xff, 0xd8, 0x01, 0x99, 0xff, 0xd9]);

    dedupe.shouldSend(frameA);

    mockTime += 200;
    const res = dedupe.shouldSend(frameB);
    expect(res.send).toBe(true);
    expect(res.isKeepalive).toBe(false);

    // Same frameB 100ms later skipped
    mockTime += 100;
    expect(dedupe.shouldSend(frameB).send).toBe(false);
  });

  it('resets state properly', () => {
    const dedupe = new FrameDeduplicator({ getNow, keepaliveIntervalMs: 1000 });
    const frameA = Buffer.from([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]);

    dedupe.shouldSend(frameA);
    dedupe.reset();

    mockTime += 10;
    const res = dedupe.shouldSend(frameA);
    expect(res.send).toBe(true);
    expect(res.isKeepalive).toBe(false);
  });
});

describe('AdaptiveQualityManager (Network Backpressure State Machine)', () => {
  let mockTime = 100000;
  const getNow = () => mockTime;

  beforeEach(() => {
    mockTime = 100000;
  });

  it('initializes with default tier and user cap', () => {
    const manager = new AdaptiveQualityManager('fast', { getNow });
    expect(manager.getUserCap()).toBe('fast');
    expect(manager.getActiveTier()).toBe('fast');
  });

  it('steps down one tier when congestion exceeds 1000ms', () => {
    const manager = new AdaptiveQualityManager('balanced', {
      getNow,
      downgradeDelayMs: 1000,
      bufferThresholdBytes: 256 * 1024,
    });
    expect(manager.getActiveTier()).toBe('balanced');

    // Congestion starts (buffer > 256KB)
    let res = manager.updateNetworkCondition(300 * 1024, 0);
    expect(res.changed).toBe(false);
    expect(res.activeTier).toBe('balanced');

    // 500ms of congestion: still waiting
    mockTime += 500;
    res = manager.updateNetworkCondition(300 * 1024, 0);
    expect(res.changed).toBe(false);

    // 1050ms total congestion: steps down to 'fast'
    mockTime += 550;
    res = manager.updateNetworkCondition(300 * 1024, 0);
    expect(res.changed).toBe(true);
    expect(res.activeTier).toBe('fast');
    expect(manager.getActiveTier()).toBe('fast');
  });

  it('steps down from fast to tiny on persistent congestion', () => {
    const manager = new AdaptiveQualityManager('fast', {
      getNow,
      downgradeDelayMs: 1000,
      minChangeIntervalMs: 1000,
    });

    // 1000ms congestion -> steps down to 'tiny'
    manager.updateNetworkCondition(300 * 1024, 0);
    mockTime += 1001;
    const res = manager.updateNetworkCondition(300 * 1024, 0);
    expect(res.changed).toBe(true);
    expect(res.activeTier).toBe('tiny');

    // Does not step down below 'tiny'
    mockTime += 2000;
    const resFloor = manager.updateNetworkCondition(300 * 1024, 0);
    expect(resFloor.changed).toBe(false);
    expect(resFloor.activeTier).toBe('tiny');
  });

  it('steps up towards user cap only after 10s of clean sending', () => {
    const manager = new AdaptiveQualityManager('balanced', {
      getNow,
      downgradeDelayMs: 1000,
      upgradeDelayMs: 10000,
      minChangeIntervalMs: 1000,
    });

    // Step down to fast
    manager.updateNetworkCondition(300 * 1024, 0);
    mockTime += 1001;
    manager.updateNetworkCondition(300 * 1024, 0);
    expect(manager.getActiveTier()).toBe('fast');

    // Clean network begins
    manager.updateNetworkCondition(50 * 1024, 0);

    // Clean network for 5 seconds: no upgrade yet
    mockTime += 5000;
    let res = manager.updateNetworkCondition(50 * 1024, 0);
    expect(res.changed).toBe(false);
    expect(res.activeTier).toBe('fast');

    // Clean network for another 5.1s (total 10.1s clean): upgrades to 'balanced'
    mockTime += 5100;
    res = manager.updateNetworkCondition(50 * 1024, 0);
    expect(res.changed).toBe(true);
    expect(res.activeTier).toBe('balanced');
  });

  it('never upgrades beyond user cap preset', () => {
    const manager = new AdaptiveQualityManager('fast', {
      getNow,
      upgradeDelayMs: 10000,
    });
    expect(manager.getActiveTier()).toBe('fast');

    // Clean network for 20 seconds
    mockTime += 20000;
    const res = manager.updateNetworkCondition(0, 0);
    expect(res.changed).toBe(false);
    expect(res.activeTier).toBe('fast');
  });

  it('clamps active tier immediately if user lowers their preset cap', () => {
    const manager = new AdaptiveQualityManager('high', { getNow });
    expect(manager.getActiveTier()).toBe('high');

    // User chooses 'fast' cap
    manager.setUserCap('fast');
    expect(manager.getUserCap()).toBe('fast');
    expect(manager.getActiveTier()).toBe('fast');
  });
});
