import { describe, it, expect } from 'vitest';
import {
  validateClientMessage,
  ConnectionRateLimiter,
  ALLOWED_KEY_MODIFIERS,
  ALLOWED_SPECIAL_KEYS,
} from '../src/protocol.js';

describe('AEROKIN Desktop Protocol Validation & Limits', () => {
  describe('desktop_start message validation', () => {
    it('validates and accepts valid desktop_start parameters', () => {
      const msg = validateClientMessage({
        type: 'desktop_start',
        monitorId: 'mon_0',
        preset: 'balanced',
        customScale: 0.8,
        customFps: 45,
      });
      expect(msg).toEqual({
        type: 'desktop_start',
        monitorId: 'mon_0',
        preset: 'balanced',
        customScale: 0.8,
        customFps: 45,
      });
    });

    it('clamps customScale and customFps to valid ranges', () => {
      const msg = validateClientMessage({
        type: 'desktop_start',
        customScale: 1.5,
        customFps: 120,
      });
      expect(msg).toEqual({
        type: 'desktop_start',
        monitorId: undefined,
        preset: undefined,
        customScale: 1.0,
        customFps: 60,
      });
    });

    it('handles minimal desktop_start with no optional parameters', () => {
      const msg = validateClientMessage({ type: 'desktop_start' });
      expect(msg).toEqual({
        type: 'desktop_start',
        monitorId: undefined,
        preset: undefined,
        customScale: undefined,
        customFps: undefined,
      });
    });
  });

  describe('desktop_stop and desktop_monitors validation', () => {
    it('validates desktop_stop', () => {
      expect(validateClientMessage({ type: 'desktop_stop' })).toEqual({
        type: 'desktop_stop',
      });
    });

    it('validates desktop_monitors', () => {
      expect(validateClientMessage({ type: 'desktop_monitors' })).toEqual({
        type: 'desktop_monitors',
      });
    });
  });

  describe('abs_move and abs_click validation', () => {
    it('clamps abs_move coordinates strictly within [0, 1]', () => {
      const msg = validateClientMessage({
        type: 'abs_move',
        x: -0.2,
        y: 1.5,
        monitorId: 'mon_0',
      });
      expect(msg).toEqual({
        type: 'abs_move',
        x: 0,
        y: 1,
        monitorId: 'mon_0',
      });
    });

    it('rejects abs_move with non-finite coordinates', () => {
      expect(validateClientMessage({ type: 'abs_move', x: NaN, y: 0.5 })).toBeNull();
      expect(validateClientMessage({ type: 'abs_move', x: 0.5, y: Infinity })).toBeNull();
    });

    it('validates abs_click with count and coordinates', () => {
      const msg = validateClientMessage({
        type: 'abs_click',
        button: 'left',
        count: 2,
        x: 0.5,
        y: 0.5,
      });
      expect(msg).toEqual({
        type: 'abs_click',
        button: 'left',
        count: 2,
        x: 0.5,
        y: 0.5,
        monitorId: undefined,
      });
    });

    it('rejects abs_click with invalid button name', () => {
      expect(validateClientMessage({ type: 'abs_click', button: 'superclick' })).toBeNull();
    });
  });

  describe('abs_button validation', () => {
    it('validates abs_button transitions for dragging', () => {
      const down = validateClientMessage({
        type: 'abs_button',
        button: 'left',
        state: 'down',
        x: 0.25,
        y: 0.75,
      });
      expect(down).toEqual({
        type: 'abs_button',
        button: 'left',
        state: 'down',
        x: 0.25,
        y: 0.75,
        monitorId: undefined,
      });

      const up = validateClientMessage({
        type: 'abs_button',
        button: 'left',
        state: 'up',
      });
      expect(up).toEqual({
        type: 'abs_button',
        button: 'left',
        state: 'up',
        x: undefined,
        y: undefined,
        monitorId: undefined,
      });
    });
  });

  describe('key and text validation (security whitelisting)', () => {
    it('accepts whitelisted special keys and alphanumeric characters', () => {
      const k1 = validateClientMessage({
        type: 'key',
        key: 'Enter',
        action: 'tap',
        modifiers: ['Ctrl', 'Shift'],
      });
      expect(k1).toEqual({
        type: 'key',
        key: 'enter',
        action: 'tap',
        modifiers: ['ctrl', 'shift'],
      });

      const k2 = validateClientMessage({
        type: 'key',
        key: 'a',
        action: 'down',
      });
      expect(k2).toEqual({
        type: 'key',
        key: 'a',
        action: 'down',
        modifiers: undefined,
      });
    });

    it('filters out unauthorized modifiers', () => {
      const k = validateClientMessage({
        type: 'key',
        key: 'c',
        modifiers: ['Ctrl', 'SuperHackerMod', 'Alt'],
      });
      expect(k).toEqual({
        type: 'key',
        key: 'c',
        action: 'tap',
        modifiers: ['ctrl', 'alt'],
      });
    });

    it('rejects arbitrary dangerous strings as keys (no shell execution)', () => {
      expect(validateClientMessage({ type: 'key', key: 'cmd.exe /c calc' })).toBeNull();
      expect(validateClientMessage({ type: 'key', key: 'rm -rf /' })).toBeNull();
      expect(validateClientMessage({ type: 'key', key: '<script>' })).toBeNull();
    });

    it('sanitizes text input by stripping control characters', () => {
      const textMsg = validateClientMessage({
        type: 'text',
        text: 'Hello World!\x00\x07',
      });
      expect(textMsg).toEqual({
        type: 'text',
        text: 'Hello World!',
      });
    });
  });

  describe('Rate Limiter Categories for Desktop', () => {
    it('maps desktop messages to appropriate rate limit buckets', () => {
      const limiter = new ConnectionRateLimiter();
      expect(limiter.getCategoryForType('abs_move')).toBe('abs_move');
      expect(limiter.getCategoryForType('abs_click')).toBe('click');
      expect(limiter.getCategoryForType('abs_button')).toBe('click');
      expect(limiter.getCategoryForType('key')).toBe('key');
      expect(limiter.getCategoryForType('text')).toBe('key');
      expect(limiter.getCategoryForType('desktop_start')).toBe('desktop');
      expect(limiter.getCategoryForType('desktop_stop')).toBe('desktop');
      expect(limiter.getCategoryForType('desktop_monitors')).toBe('desktop');
    });
  });
});
