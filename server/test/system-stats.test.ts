import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemStatsService } from '../src/stats/SystemStatsService.js';

describe('SystemStatsService Telemetry & Subscription Lifecycle', () => {
  let statsService: SystemStatsService;

  beforeEach(() => {
    vi.useFakeTimers();
    statsService = new SystemStatsService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sampler starts when first subscriber registers, stops when last unsubscribes', () => {
    expect(statsService.isSampling()).toBe(false);
    expect(statsService.getSubscriberCount()).toBe(0);

    const listener1 = vi.fn();
    const unsub1 = statsService.subscribe('sub_1', listener1);

    expect(statsService.isSampling()).toBe(true);
    expect(statsService.getSubscriberCount()).toBe(1);
    expect(listener1).toHaveBeenCalledTimes(1); // Immediate initial sample

    const listener2 = vi.fn();
    const unsub2 = statsService.subscribe('sub_2', listener2);
    expect(statsService.getSubscriberCount()).toBe(2);
    expect(statsService.isSampling()).toBe(true);

    unsub1();
    expect(statsService.getSubscriberCount()).toBe(1);
    expect(statsService.isSampling()).toBe(true); // Still running for sub_2

    unsub2();
    expect(statsService.getSubscriberCount()).toBe(0);
    expect(statsService.isSampling()).toBe(false); // Idle when no subscribers
  });

  it('correctly calculates total and per-core CPU deltas and clamps 0-100', () => {
    const prev = [
      { idle: 100, total: 200 },
      { idle: 150, total: 200 },
    ];
    const current = [
      { idle: 120, total: 300 }, // deltaTotal = 100, deltaIdle = 20 -> 80% usage
      { idle: 170, total: 300 }, // deltaTotal = 100, deltaIdle = 20 -> 80% usage
    ];

    const deltas = statsService.computeCpuDeltas(prev, current);
    expect(deltas.coresPercent).toEqual([80, 80]);
    expect(deltas.totalPercent).toBe(80);
  });

  it('handles zero total delta without division by zero', () => {
    const prev = [{ idle: 100, total: 100 }];
    const current = [{ idle: 100, total: 100 }];

    const deltas = statsService.computeCpuDeltas(prev, current);
    expect(deltas.coresPercent).toEqual([0]);
    expect(deltas.totalPercent).toBe(0);
  });

  it('returns explicit "not available" for GPU and temperature without hardware drivers', () => {
    const sample = statsService.collectSynchronousMetrics();
    expect(sample.gpu.available).toBe(false);
    expect(sample.gpu.utilizationPercent).toBeNull();
    expect(sample.gpu.note).toBe('not available');

    expect(sample.temperature.available).toBe(false);
    expect(sample.temperature.celsius).toBeNull();
    expect(sample.temperature.note).toContain('not available');
  });

  it('gathers valid RAM and Uptime values', () => {
    const sample = statsService.collectSynchronousMetrics();
    expect(sample.ram.totalBytes).toBeGreaterThan(0);
    expect(sample.ram.usedBytes).toBeGreaterThanOrEqual(0);
    expect(sample.ram.percent).toBeGreaterThanOrEqual(0);
    expect(sample.ram.percent).toBeLessThanOrEqual(100);
    expect(sample.uptimeSeconds).toBeGreaterThan(0);
  });

  it('measures agent own process CPU usage percentage', () => {
    const sample = statsService.collectSynchronousMetrics();
    expect(typeof sample.cpu.agentCpuPercent).toBe('number');
    expect(sample.cpu.agentCpuPercent).toBeGreaterThanOrEqual(0);
  });
});
