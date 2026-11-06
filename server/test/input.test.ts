import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMoveCoalescer,
  createScroller,
  handleClick,
  handleButton,
  handleScroll,
  resetDefaultScroller,
  setInputBackend,
  resetDefaultInputBackend,
  WHEEL_DELTA,
  WHEEL_DELTA_PER_UNIT,
  MAX_SCROLL_DELTA,
} from '../src/input.js';
import { RecordingInputBackend } from '../src/input/InputBackend.js';
import {
  validateClientMessage,
  TokenBucket,
  ConnectionRateLimiter,
  MAX_MOVE_DELTA,
  MAX_SEEKBY_SECONDS,
  MAX_SEEKTO_SECONDS,
  MAX_SESSION_ID_LENGTH,
  ALLOWED_MEDIA_ACTIONS,
} from '../src/protocol.js';
import { mouse } from '@nut-tree-fork/nut-js';

describe('AEROKIN Input & Protocol Validation', () => {
  let mockBackend: RecordingInputBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    resetDefaultScroller();
    mockBackend = new RecordingInputBackend();
    setInputBackend(mockBackend);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetDefaultInputBackend();
  });

  describe('Move Coalescer & Remainder Carry', () => {
    it('accumulates sub-pixel float moves and carries remainder across ticks', () => {
      const moveRelSpy = vi.spyOn(mockBackend, 'moveRelative').mockReturnValue(true);

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
      const moveRelSpy = vi.spyOn(mockBackend, 'moveRelative').mockReturnValue(true);

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
      const moveRelSpy = vi.spyOn(mockBackend, 'moveRelative').mockReturnValue(true);

      const coalescer = createMoveCoalescer(8);

      coalescer.addMove(999, -888);
      vi.advanceTimersByTime(8);

      expect(moveRelSpy).toHaveBeenCalledWith(200, -200);

      coalescer.destroy();
    });

    it('ignores invalid move inputs (NaN, strings, non-numbers, undefined)', () => {
      const moveRelSpy = vi.spyOn(mockBackend, 'moveRelative').mockReturnValue(true);

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

  describe('Scroll Handler, Unit Conversion & Isolation', () => {
    it('converts protocol units to Windows wheel units and negates dy (positive dy = scroll down)', async () => {
      const scrollSpy = vi.spyOn(mockBackend, 'scroll').mockReturnValue(true);

      const scroller = createScroller();

      // Protocol dy = 1.0 (scroll down) -> Win32 dy = -10 (negative wheel rotates backward -> scroll down)
      await scroller.scroll(1.0, 0);
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenLastCalledWith(-10, 0);

      // Protocol dy = -2.0 (scroll up) -> Win32 dy = +20 (positive wheel rotates forward -> scroll up)
      await scroller.scroll(-2.0, 0);
      expect(scrollSpy).toHaveBeenCalledTimes(2);
      expect(scrollSpy).toHaveBeenLastCalledWith(20, 0);

      // Protocol dx = 3.0 (scroll right) -> Win32 dx = +30 (positive hwheel tilts right -> scroll right)
      await scroller.scroll(0, 3.0);
      expect(scrollSpy).toHaveBeenCalledTimes(3);
      expect(scrollSpy).toHaveBeenLastCalledWith(0, 30);

      // Protocol dx = -1.5 (scroll left) -> Win32 dx = -15
      await scroller.scroll(0, -1.5);
      expect(scrollSpy).toHaveBeenCalledTimes(4);
      expect(scrollSpy).toHaveBeenLastCalledWith(0, -15);

      scroller.destroy();
    });

    it('accumulates sub-notch float scroll deltas and carries remainder across calls', async () => {
      const scrollSpy = vi.spyOn(mockBackend, 'scroll').mockReturnValue(true);

      const scroller = createScroller();

      // 0.04 units * 10 = 0.4 wheel delta -> int 0, remainder -0.4
      await scroller.scroll(0.04);
      expect(scrollSpy).not.toHaveBeenCalled();

      // 0.08 units * 10 = 0.8 wheel delta -> total -1.2 -> int -1, remainder -0.2
      await scroller.scroll(0.08);
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenLastCalledWith(-1, 0);

      // Horizontal float carry:
      // dx 0.06 * 10 = 0.6 -> int 0, remainder 0.6
      await scroller.scroll(0, 0.06);
      expect(scrollSpy).toHaveBeenCalledTimes(1);

      // dx 0.08 * 10 = 0.8 -> total 1.4 -> int 1, remainder 0.4
      await scroller.scroll(0, 0.08);
      expect(scrollSpy).toHaveBeenCalledTimes(2);
      expect(scrollSpy).toHaveBeenLastCalledWith(0, 1);

      scroller.destroy();
    });

    it('clamps incoming scroll deltas to MAX_SCROLL_DELTA', async () => {
      const scrollSpy = vi.spyOn(mockBackend, 'scroll').mockReturnValue(true);

      const scroller = createScroller();

      // Extreme values clamped to +/-500 units (* 10 = +/-5000 wheel delta)
      await scroller.scroll(9999, -8888);
      expect(scrollSpy).toHaveBeenCalledWith(-MAX_SCROLL_DELTA * WHEEL_DELTA_PER_UNIT, -MAX_SCROLL_DELTA * WHEEL_DELTA_PER_UNIT);

      scroller.destroy();
    });

    it('isolates scroll remainder between two separate connections', async () => {
      const scrollSpy = vi.spyOn(mockBackend, 'scroll').mockReturnValue(true);

      const scrollerA = createScroller();
      const scrollerB = createScroller();

      // Scroller A receives 0.05 units -> wheelDy = -0.5 (int 0, remainder -0.5)
      await scrollerA.scroll(0.05);
      expect(scrollSpy).not.toHaveBeenCalled();
      expect(scrollerA.getRemainders().remainderWheelDy).toBeCloseTo(-0.5);
      expect(scrollerB.getRemainders().remainderWheelDy).toBe(0);

      // Scroller B receives 0.05 units -> wheelDy = -0.5 (int 0, remainder -0.5)
      await scrollerB.scroll(0.05);
      expect(scrollSpy).not.toHaveBeenCalled();
      expect(scrollerB.getRemainders().remainderWheelDy).toBeCloseTo(-0.5);

      // Scroller A receives another 0.06 units -> total -1.1 (int -1, remainder -0.1)
      await scrollerA.scroll(0.06);
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      expect(scrollSpy).toHaveBeenLastCalledWith(-1, 0);
      expect(scrollerA.getRemainders().remainderWheelDy).toBeCloseTo(-0.1);

      // Scroller B's state was completely unmolested!
      expect(scrollerB.getRemainders().remainderWheelDy).toBeCloseTo(-0.5);

      scrollerA.destroy();
      scrollerB.destroy();
    });

    it('nut-js fallback follows the exact same sign convention as Win32', async () => {
      mockBackend.supported = false;
      const scrollDownSpy = vi.spyOn(mouse, 'scrollDown').mockResolvedValue(undefined as any);
      const scrollUpSpy = vi.spyOn(mouse, 'scrollUp').mockResolvedValue(undefined as any);

      const scroller = createScroller();

      // 12 protocol units = 120 wheel delta = 1 notch
      // Positive dy = page scrolls DOWN -> calls mouse.scrollDown(1)
      await scroller.scroll(12);
      expect(scrollDownSpy).toHaveBeenCalledWith(1);
      expect(scrollUpSpy).not.toHaveBeenCalled();

      // Negative dy = page scrolls UP -> calls mouse.scrollUp(1)
      await scroller.scroll(-12);
      expect(scrollUpSpy).toHaveBeenCalledWith(1);

      scroller.destroy();
    });

    it('ignores invalid scroll parameters', async () => {
      const scrollSpy = vi.spyOn(mockBackend, 'scroll').mockReturnValue(true);

      const scroller = createScroller();
      await scroller.scroll('not-a-number' as any);
      await scroller.scroll(NaN);
      await scroller.scroll(Infinity);
      await scroller.scroll(null as any);

      expect(scrollSpy).not.toHaveBeenCalled();
      scroller.destroy();
    });
  });

  describe('Click and Drag Button Handlers', () => {
    it('dispatches valid click actions to InputBackend', async () => {
      const clickSpy = vi.spyOn(mockBackend, 'click').mockReturnValue(true);

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
      const buttonSpy = vi.spyOn(mockBackend, 'mouseButton').mockReturnValue(true);

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

  describe('Protocol Message Validation (validateClientMessage)', () => {
    it('rejects malformed or non-object payloads', () => {
      expect(validateClientMessage(null)).toBeNull();
      expect(validateClientMessage(undefined)).toBeNull();
      expect(validateClientMessage('hello')).toBeNull();
      expect(validateClientMessage(12345)).toBeNull();
      expect(validateClientMessage([])).toBeNull();
      expect(validateClientMessage({})).toBeNull();
      expect(validateClientMessage({ type: 'unsupported_type' })).toBeNull();
    });

    it('validates and clamps move messages', () => {
      expect(validateClientMessage({ type: 'move', dx: 10, dy: -20 })).toEqual({
        type: 'move',
        dx: 10,
        dy: -20,
      });

      // Clamps to +/-200
      expect(validateClientMessage({ type: 'move', dx: 999, dy: -888 })).toEqual({
        type: 'move',
        dx: 200,
        dy: -200,
      });

      // Rejects non-finite numbers
      expect(validateClientMessage({ type: 'move', dx: NaN, dy: 10 })).toBeNull();
      expect(validateClientMessage({ type: 'move', dx: 10, dy: Infinity })).toBeNull();
      expect(validateClientMessage({ type: 'move', dx: '10', dy: 20 })).toBeNull();
    });

    it('validates and clamps scroll messages', () => {
      expect(validateClientMessage({ type: 'scroll', dy: 15.5 })).toEqual({
        type: 'scroll',
        dy: 15.5,
        dx: 0,
      });
      expect(validateClientMessage({ type: 'scroll', dy: -10, dx: 5 })).toEqual({
        type: 'scroll',
        dy: -10,
        dx: 5,
      });

      // Clamps to MAX_SCROLL_DELTA
      expect(validateClientMessage({ type: 'scroll', dy: 2000, dx: -3000 })).toEqual({
        type: 'scroll',
        dy: MAX_SCROLL_DELTA,
        dx: -MAX_SCROLL_DELTA,
      });

      // Rejects invalid
      expect(validateClientMessage({ type: 'scroll', dy: NaN })).toBeNull();
      expect(validateClientMessage({ type: 'scroll', dy: 10, dx: 'bad' })).toBeNull();
    });

    it('validates click messages', () => {
      expect(validateClientMessage({ type: 'click', button: 'left' })).toEqual({
        type: 'click',
        button: 'left',
      });
      expect(validateClientMessage({ type: 'click', button: 'right' })).toEqual({
        type: 'click',
        button: 'right',
      });
      expect(validateClientMessage({ type: 'click', button: 'middle' })).toEqual({
        type: 'click',
        button: 'middle',
      });
      expect(validateClientMessage({ type: 'click', button: 'unknown' })).toBeNull();
    });

    it('validates button messages', () => {
      expect(validateClientMessage({ type: 'button', button: 'left', state: 'down' })).toEqual({
        type: 'button',
        button: 'left',
        state: 'down',
      });
      expect(validateClientMessage({ type: 'button', button: 'right', state: 'up' })).toEqual({
        type: 'button',
        button: 'right',
        state: 'up',
      });
      expect(validateClientMessage({ type: 'button', button: 'left', state: 'hold' })).toBeNull();
      expect(validateClientMessage({ type: 'button', button: 'wheel', state: 'down' })).toBeNull();
    });

    it('validates media actions against allow-list', () => {
      for (const action of ALLOWED_MEDIA_ACTIONS) {
        expect(validateClientMessage({ type: 'media', action })).toEqual({
          type: 'media',
          action,
        });
      }
      expect(validateClientMessage({ type: 'media', action: 'shutdown' })).toBeNull();
      expect(validateClientMessage({ type: 'media', action: '' })).toBeNull();
    });

    it('validates seekby, seekto, session, setvolume, getvolume, ping', () => {
      // seekby
      expect(validateClientMessage({ type: 'seekby', seconds: 15 })).toEqual({
        type: 'seekby',
        seconds: 15,
      });
      expect(validateClientMessage({ type: 'seekby', seconds: 999999 })).toEqual({
        type: 'seekby',
        seconds: MAX_SEEKBY_SECONDS,
      });
      expect(validateClientMessage({ type: 'seekby', seconds: NaN })).toBeNull();

      // seekto
      expect(validateClientMessage({ type: 'seekto', position: 120 })).toEqual({
        type: 'seekto',
        position: 120,
      });
      expect(validateClientMessage({ type: 'seekto', position: -5 })).toBeNull(); // >= 0 required
      expect(validateClientMessage({ type: 'seekto', position: 99999999 })).toEqual({
        type: 'seekto',
        position: MAX_SEEKTO_SECONDS,
      });

      // session
      expect(validateClientMessage({ type: 'session', id: 'Spotify.exe' })).toEqual({
        type: 'session',
        id: 'Spotify.exe',
      });
      expect(validateClientMessage({ type: 'session', id: '' })).toBeNull();
      expect(validateClientMessage({ type: 'session', id: 'a'.repeat(300) })).toBeNull();

      // setvolume
      expect(validateClientMessage({ type: 'setvolume', level: 75 })).toEqual({
        type: 'setvolume',
        level: 75,
      });
      expect(validateClientMessage({ type: 'setvolume', level: 120 })).toEqual({
        type: 'setvolume',
        level: 100,
      });
      expect(validateClientMessage({ type: 'setvolume', level: -20 })).toEqual({
        type: 'setvolume',
        level: 0,
      });
      expect(validateClientMessage({ type: 'setvolume', level: NaN })).toBeNull();

      // getvolume
      expect(validateClientMessage({ type: 'getvolume' })).toEqual({ type: 'getvolume' });

      // ping
      expect(validateClientMessage({ type: 'ping', t: 1700000000 })).toEqual({
        type: 'ping',
        t: 1700000000,
      });
      expect(validateClientMessage({ type: 'ping', t: 'invalid' })).toBeNull();
    });
  });

  describe('Rate Limiter & Abuse Prevention', () => {
    it('allows messages within bucket capacity and throttles when depleted', () => {
      const bucket = new TokenBucket(5, 1, 1000); // 5 tokens, 1 token/sec

      for (let i = 0; i < 5; i++) {
        expect(bucket.tryConsume(1, 1000)).toBe(true);
      }
      expect(bucket.tryConsume(1, 1000)).toBe(false);

      // Advance by 2 seconds -> should refill 2 tokens
      expect(bucket.tryConsume(1, 3000)).toBe(true);
      expect(bucket.tryConsume(1, 3000)).toBe(true);
      expect(bucket.tryConsume(1, 3000)).toBe(false);
    });

    it('enforces category limits and detects sustained flood abuse', () => {
      const now = 10000;
      const limiter = new ConnectionRateLimiter(now);

      // Move limit is 250 capacity
      for (let i = 0; i < 250; i++) {
        const res = limiter.check('move', now);
        expect(res.ok).toBe(true);
      }

      // 251st move should be dropped, but not yet close connection
      const dropRes = limiter.check('move', now);
      expect(dropRes.ok).toBe(false);
      expect(dropRes.closeConnection).toBe(false);

      // Sustained flood: 50 consecutive violations triggers socket closure
      for (let i = 1; i < 50; i++) {
        limiter.check('move', now);
      }

      const floodRes = limiter.check('move', now);
      expect(floodRes.ok).toBe(false);
      expect(floodRes.closeConnection).toBe(true);
      expect(floodRes.reason).toContain('Rate limit exceeded: sustained flood');
    });
  });
});
