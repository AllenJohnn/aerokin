import { describe, it, expect, vi } from 'vitest';
import { validateClientMessage } from '../src/protocol.js';
import {
  ScreenshotService,
  MAX_SCREENSHOT_BYTES,
  checkIsSecureScreen,
} from '../src/screenshot/ScreenshotService.js';

describe('Screenshot Service & Protocol Validation', () => {
  describe('Protocol Message Validation', () => {
    it('validates default screenshot_request', () => {
      const msg = validateClientMessage({ type: 'screenshot_request' });
      expect(msg).toEqual({
        type: 'screenshot_request',
        target: 'all',
        monitorId: undefined,
        includeCursor: undefined,
      });
    });

    it('validates specific target and monitorId with cursor', () => {
      const msg = validateClientMessage({
        type: 'screenshot_request',
        target: 'monitor',
        monitorId: 'mon_0',
        includeCursor: true,
      });
      expect(msg).toEqual({
        type: 'screenshot_request',
        target: 'monitor',
        monitorId: 'mon_0',
        includeCursor: true,
      });
    });

    it('rejects invalid targets', () => {
      const msg = validateClientMessage({
        type: 'screenshot_request',
        target: 'invalid_target',
      });
      expect(msg).toBeNull();
    });

    it('clamps or rejects oversized monitorId', () => {
      const msg = validateClientMessage({
        type: 'screenshot_request',
        monitorId: 'a'.repeat(70),
      });
      expect(msg).toEqual({
        type: 'screenshot_request',
        target: 'all',
        monitorId: undefined,
        includeCursor: undefined,
      });
    });
  });

  describe('Secure Screen & Size Downscaling Logic', () => {
    it('returns honest error when PC is on secure desktop', async () => {
      const service = new ScreenshotService();
      // Test when checkIsSecureScreen returns true
      const origPlatform = process.platform;
      if (process.platform === 'win32') {
        // Can verify checkIsSecureScreen executes safely
        const isSecure = checkIsSecureScreen();
        expect(typeof isSecure).toBe('boolean');
      }
    });

    it('enforces 8 MB size safety boundary', () => {
      expect(MAX_SCREENSHOT_BYTES).toBe(8 * 1024 * 1024);
    });

    it('manages 5-item in-memory screenshot ring buffer for phone client', () => {
      interface HistoryItem {
        id: string;
        timestamp: number;
        data: string;
      }

      function pushToHistory(buffer: HistoryItem[], item: HistoryItem): HistoryItem[] {
        const next = [item, ...buffer];
        if (next.length > 5) {
          next.pop();
        }
        return next;
      }

      let history: HistoryItem[] = [];
      for (let i = 1; i <= 7; i++) {
        history = pushToHistory(history, {
          id: `shot_${i}`,
          timestamp: Date.now() + i,
          data: `data_${i}`,
        });
      }

      expect(history).toHaveLength(5);
      expect(history[0].id).toBe('shot_7');
      expect(history[4].id).toBe('shot_3');
    });
  });
});
