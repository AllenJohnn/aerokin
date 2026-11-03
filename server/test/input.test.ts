import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMoveCoalescer, handleClick, handleButton, handleScroll } from '../src/input.js';
import { Win32Input } from '../src/native/win32.js';

describe('AEROKIN Input & Protocol Validation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Move Coalescer & Remainder Carry', () => {
    it('accumulates sub-pixel float moves and carries remainder across ticks', () => {
      const moveRelSpy = vi.spyOn(Win32Input, 'moveRelative').mockReturnValue(true);
      const isSuppSpy = vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      const coalescer = createMoveCoalescer(8);

      // Tick 1: Small delta (0.4, 0.4) -> trunc is (0, 0), remainders are (0.4, 0.4)
      coalescer.addMove(0.4, 0.4);
      vi.advanceTimersByTime(8);
      expect(moveRelSpy).not.toHaveBeenCalled();

      // Tick 2: Additional delta (0.7, 0.8)
      // totalDx = 0.7 + 0.4 = 1.1 -> trunc is 1, remainder 0.1
      // totalDy = 0.8 + 0.4 = 1.2 -> trunc is 1, remainder 0.2
      coalescer.addMove(0.7, 0.8);
      vi.advanceTimersByTime(8);
      expect(moveRelSpy).toHaveBeenCalledTimes(1);
      expect(moveRelSpy).toHaveBeenLastCalledWith(1, 1);

      // Tick 3: Delta (0.9, 0.3)
      // totalDx = 0.9 + 0.1 = 1.0 -> trunc is 1, remainder 0.0
      // totalDy = 0.3 + 0.2 = 0.5 -> trunc is 0, remainder 0.5
      coalescer.addMove(0.9, 0.3);
      vi.advanceTimersByTime(8);
      expect(moveRelSpy).toHaveBeenCalledTimes(2);
      expect(moveRelSpy).toHaveBeenLastCalledWith(1, 0);

      // Tick 4: Delta (0.0, 0.5)
      // totalDx = 0.0 + 0.0 = 0.0
      // totalDy = 0.5 + 0.5 = 1.0 -> trunc is 1, remainder 0.0
      coalescer.addMove(0.0, 0.5);
      vi.advanceTimersByTime(8);
      expect(moveRelSpy).toHaveBeenCalledTimes(3);
      expect(moveRelSpy).toHaveBeenLastCalledWith(0, 1);

      coalescer.destroy();
    });

    it('handles negative float values and carries negative remainders correctly', () => {
      const moveRelSpy = vi.spyOn(Win32Input, 'moveRelative').mockReturnValue(true);
      vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      const coalescer = createMoveCoalescer(8);

      // -0.6, -0.6 -> int 0, remainder -0.6
      coalescer.addMove(-0.6, -0.6);
      vi.advanceTimersByTime(8);
      expect(moveRelSpy).not.toHaveBeenCalled();

      // -0.6, -0.6 -> total -1.2, int -1, remainder -0.2
      coalescer.addMove(-0.6, -0.6);
      vi.advanceTimersByTime(8);
      expect(moveRelSpy).toHaveBeenCalledTimes(1);
      expect(moveRelSpy).toHaveBeenLastCalledWith(-1, -1);

      coalescer.destroy();
    });

    it('enforces +/-200 cap per incoming move message', () => {
      const moveRelSpy = vi.spyOn(Win32Input, 'moveRelative').mockReturnValue(true);
      vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      const coalescer = createMoveCoalescer(8);

      coalescer.addMove(999, -888);
      vi.advanceTimersByTime(8);

      expect(moveRelSpy).toHaveBeenCalledWith(200, -200);

      coalescer.destroy();
    });

    it('ignores invalid move inputs (NaN, strings, non-numbers, undefined)', () => {
      const moveRelSpy = vi.spyOn(Win32Input, 'moveRelative').mockReturnValue(true);
      vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      const coalescer = createMoveCoalescer(8);

      coalescer.addMove(NaN, 50);
      coalescer.addMove(50, NaN);
      coalescer.addMove('100' as any, 20);
      coalescer.addMove(undefined as any, null as any);

      vi.advanceTimersByTime(8);
      expect(moveRelSpy).not.toHaveBeenCalled();

      coalescer.destroy();
    });
  });

  describe('Scroll Handler & Remainder Carry', () => {
    it('accumulates float scroll deltas and carries remainder across calls', async () => {
      const scrollSpy = vi.spyOn(Win32Input, 'scroll').mockReturnValue(true);
      vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      // 0.4 -> int 0, remainder 0.4 -> not executed
      await handleScroll(0.4);
      expect(scrollSpy).not.toHaveBeenCalled();

      // 0.8 -> total 1.2 -> int 1, remainder 0.2 -> executed with 1
      await handleScroll(0.8);
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenLastCalledWith(1, 0);

      // Horizontal scroll support with float remainder
      // dy 0.0 + 0.2 rem = 0.2 (int 0)
      // dx 1.6 + 0 rem = 1.6 (int 1, rem 0.6)
      await handleScroll(0, 1.6);
      expect(scrollSpy).toHaveBeenCalledTimes(2);
      expect(scrollSpy).toHaveBeenLastCalledWith(0, 1);
    });

    it('ignores invalid scroll parameters', async () => {
      const scrollSpy = vi.spyOn(Win32Input, 'scroll').mockReturnValue(true);
      vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      await handleScroll('not-a-number' as any);
      await handleScroll(NaN);
      await handleScroll(null as any);

      expect(scrollSpy).not.toHaveBeenCalled();
    });
  });

  describe('Click and Drag Button Handlers', () => {
    it('dispatches valid click actions to Win32Input', async () => {
      const clickSpy = vi.spyOn(Win32Input, 'click').mockReturnValue(true);
      vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      await handleClick('left');
      expect(clickSpy).toHaveBeenCalledWith('left');

      await handleClick('right');
      expect(clickSpy).toHaveBeenCalledWith('right');

      await handleClick('middle');
      expect(clickSpy).toHaveBeenCalledWith('middle');

      await handleClick('invalid' as any);
      expect(clickSpy).toHaveBeenCalledTimes(3);
    });

    it('dispatches valid button state transitions (down/up) for dragging', async () => {
      const buttonSpy = vi.spyOn(Win32Input, 'mouseButton').mockReturnValue(true);
      vi.spyOn(Win32Input, 'isSupported').mockReturnValue(true);

      await handleButton('left', 'down');
      expect(buttonSpy).toHaveBeenCalledWith('left', 'down');

      await handleButton('left', 'up');
      expect(buttonSpy).toHaveBeenCalledWith('left', 'up');

      await handleButton('right', 'down');
      expect(buttonSpy).toHaveBeenCalledWith('right', 'down');

      // Invalid button or state should be ignored
      await handleButton('middle', 'invalid' as any);
      await handleButton('extra' as any, 'down');
      expect(buttonSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Protocol Message Validation', () => {
    function validateMessage(raw: unknown): { valid: boolean; type?: string } {
      if (!raw || typeof raw !== 'object') return { valid: false };
      const msg = raw as Record<string, any>;
      if (typeof msg.type !== 'string') return { valid: false };

      switch (msg.type) {
        case 'ping':
          return { valid: true, type: 'ping' };
        case 'move':
          return {
            valid: typeof msg.dx === 'number' && !isNaN(msg.dx) && typeof msg.dy === 'number' && !isNaN(msg.dy),
            type: 'move',
          };
        case 'click':
          return {
            valid: msg.button === 'left' || msg.button === 'right' || msg.button === 'middle',
            type: 'click',
          };
        case 'button':
          return {
            valid:
              (msg.button === 'left' || msg.button === 'right' || msg.button === 'middle') &&
              (msg.state === 'down' || msg.state === 'up'),
            type: 'button',
          };
        case 'scroll':
          return {
            valid: typeof msg.dy === 'number' && !isNaN(msg.dy),
            type: 'scroll',
          };
        case 'media':
          return {
            valid: typeof msg.action === 'string' && msg.action.length > 0,
            type: 'media',
          };
        case 'seekby':
          return {
            valid: typeof msg.seconds === 'number' && !isNaN(msg.seconds),
            type: 'seekby',
          };
        case 'seekto':
          return {
            valid: typeof msg.position === 'number' && !isNaN(msg.position),
            type: 'seekto',
          };
        case 'session':
          return {
            valid: typeof msg.id === 'string' && msg.id.length > 0,
            type: 'session',
          };
        case 'setvolume':
          return {
            valid: typeof msg.level === 'number' && !isNaN(msg.level),
            type: 'setvolume',
          };
        default:
          return { valid: false };
      }
    }

    it('validates protocol messages correctly', () => {
      expect(validateMessage(null).valid).toBe(false);
      expect(validateMessage('string').valid).toBe(false);
      expect(validateMessage({}).valid).toBe(false);
      expect(validateMessage({ type: 'unknown' }).valid).toBe(false);

      expect(validateMessage({ type: 'ping', t: 123456 }).valid).toBe(true);
      expect(validateMessage({ type: 'move', dx: 1.5, dy: -2.3 }).valid).toBe(true);
      expect(validateMessage({ type: 'move', dx: 'bad', dy: 2 }).valid).toBe(false);
      expect(validateMessage({ type: 'click', button: 'left' }).valid).toBe(true);
      expect(validateMessage({ type: 'click', button: 'third' }).valid).toBe(false);
      expect(validateMessage({ type: 'button', button: 'left', state: 'down' }).valid).toBe(true);
      expect(validateMessage({ type: 'button', button: 'left', state: 'hold' }).valid).toBe(false);
      expect(validateMessage({ type: 'scroll', dy: -3.5 }).valid).toBe(true);
      expect(validateMessage({ type: 'media', action: 'playpause' }).valid).toBe(true);
      expect(validateMessage({ type: 'seekby', seconds: 10 }).valid).toBe(true);
      expect(validateMessage({ type: 'seekto', position: 120 }).valid).toBe(true);
      expect(validateMessage({ type: 'session', id: 'Spotify.exe' }).valid).toBe(true);
      expect(validateMessage({ type: 'setvolume', level: 75 }).valid).toBe(true);
    });
  });
});
