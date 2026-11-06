import { describe, it, expect } from 'vitest';

describe('Presenter Remote & Tools Logic', () => {
  describe('Presentation Key Mapping Logic', () => {
    function mapPresenterKey(
      action: 'next' | 'prev' | 'start' | 'end' | 'black' | 'white',
      mode: 'arrows' | 'pages' = 'arrows'
    ): { key: string; modifiers?: string[] } {
      switch (action) {
        case 'next':
          return mode === 'arrows' ? { key: 'ArrowRight' } : { key: 'PageDown' };
        case 'prev':
          return mode === 'arrows' ? { key: 'ArrowLeft' } : { key: 'PageUp' };
        case 'start':
          return { key: 'F5' };
        case 'end':
          return { key: 'Escape' };
        case 'black':
          return { key: 'b' };
        case 'white':
          return { key: 'w' };
      }
    }

    it('maps slide next and prev to Arrow keys in arrows mode', () => {
      expect(mapPresenterKey('next', 'arrows')).toEqual({ key: 'ArrowRight' });
      expect(mapPresenterKey('prev', 'arrows')).toEqual({ key: 'ArrowLeft' });
    });

    it('maps slide next and prev to PageDown/PageUp in pages mode', () => {
      expect(mapPresenterKey('next', 'pages')).toEqual({ key: 'PageDown' });
      expect(mapPresenterKey('prev', 'pages')).toEqual({ key: 'PageUp' });
    });

    it('maps presentation start and end to F5 and Escape', () => {
      expect(mapPresenterKey('start')).toEqual({ key: 'F5' });
      expect(mapPresenterKey('end')).toEqual({ key: 'Escape' });
    });

    it('maps black screen and white screen to B and W keys', () => {
      expect(mapPresenterKey('black')).toEqual({ key: 'b' });
      expect(mapPresenterKey('white')).toEqual({ key: 'w' });
    });
  });

  describe('Screenshot History Ring Buffer', () => {
    interface HistoryItem {
      id: string;
      dataUrl: string;
      timestamp: number;
    }

    function pushScreenshotHistory(
      history: HistoryItem[],
      newItem: HistoryItem,
      maxLimit: number = 5
    ): HistoryItem[] {
      return [newItem, ...history.filter((h) => h.id !== newItem.id)].slice(0, maxLimit);
    }

    it('maintains a maximum of 5 in-memory screenshot items (FIFO eviction)', () => {
      let history: HistoryItem[] = [];
      for (let i = 1; i <= 7; i++) {
        history = pushScreenshotHistory(history, {
          id: `shot-${i}`,
          dataUrl: `data:image/jpeg;base64,sample${i}`,
          timestamp: Date.now() + i,
        });
      }

      expect(history.length).toBe(5);
      expect(history[0].id).toBe('shot-7');
      expect(history[4].id).toBe('shot-3');
    });
  });

  describe('Settings Export & Privacy Sanitization', () => {
    function sanitizeSettingsForExport(rawSettings: Record<string, any>): Record<string, any> {
      const sensitiveKeys = new Set([
        'token',
        'deviceId',
        'credential',
        'pairingCode',
        'secret',
        'password',
        'clientIp',
      ]);

      const sanitized: Record<string, any> = {
        app: 'aerokin',
        exportVersion: 1,
        exportedAt: Date.now(),
        settings: {},
      };

      for (const [k, v] of Object.entries(rawSettings)) {
        if (!sensitiveKeys.has(k)) {
          sanitized.settings[k] = v;
        }
      }

      return sanitized;
    }

    it('strictly redacts device credentials, tokens, and device IDs from export JSON', () => {
      const fullSettings = {
        trackpadConfig: { pointerSpeed: 1.2, naturalScroll: true },
        seekMethod: 'auto',
        token: 'secret-token-123',
        deviceId: 'device-456-abc',
        credential: 'super-secret-credential',
        pairingCode: '87654321',
      };

      const exported = sanitizeSettingsForExport(fullSettings);
      expect(exported.settings.trackpadConfig).toBeDefined();
      expect(exported.settings.seekMethod).toBe('auto');
      expect(exported.settings.token).toBeUndefined();
      expect(exported.settings.deviceId).toBeUndefined();
      expect(exported.settings.credential).toBeUndefined();
      expect(exported.settings.pairingCode).toBeUndefined();
    });
  });
});
