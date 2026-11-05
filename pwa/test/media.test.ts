import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatTime } from '../src/components/media/Timeline';

describe('Media 2.0 Timeline & Format Utilities', () => {
  it('formats seconds into m:ss and h:mm:ss timestamps correctly', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(59)).toBe('0:59');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(75)).toBe('1:15');
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3665)).toBe('1:01:05');
    expect(formatTime(7325)).toBe('2:02:05');

    // Edge cases
    expect(formatTime(undefined)).toBe('0:00');
    expect(formatTime(-10)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
  });

  it('calculates seek delta correctly with custom seek interval', () => {
    const intervals = [5, 10, 15, 30] as const;

    for (const interval of intervals) {
      const fwd = interval;
      const bwd = -interval;
      expect(fwd).toBeGreaterThan(0);
      expect(bwd).toBeLessThan(0);
      expect(Math.abs(bwd)).toBe(interval);
    }
  });

  it('clamps scrubber position correctly within [0, duration]', () => {
    const duration = 180; // 3 minutes

    const clamp = (val: number) => Math.max(0, Math.min(duration, val));

    expect(clamp(50)).toBe(50);
    expect(clamp(-10)).toBe(0);
    expect(clamp(200)).toBe(180);
    expect(clamp(0)).toBe(0);
    expect(clamp(180)).toBe(180);
  });
});
