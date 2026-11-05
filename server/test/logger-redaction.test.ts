import { describe, it, expect, beforeEach } from 'vitest';
import { ServerLogger, redactSecrets } from '../src/logger.js';

describe('Server Logger & Secret Redaction', () => {
  let logger: ServerLogger;

  beforeEach(() => {
    logger = new ServerLogger(50); // small buffer for testing
  });

  describe('redactSecrets', () => {
    it('redacts 8-digit pairing codes in URLs and text labels', () => {
      const rawUrl = 'https://192.168.1.100:8443/#code=48291048';
      expect(redactSecrets(rawUrl)).toBe('https://192.168.1.100:8443/#code=[REDACTED_CODE]');

      const rawLabel = 'Generated pairing code: 84920193 for device';
      expect(redactSecrets(rawLabel)).toBe('Generated pairing code: [REDACTED_CODE] for device');
    });

    it('redacts 32-byte (64 hex char) credentials and tokens', () => {
      const hexCred = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
      const msg = `Issuing device credential: ${hexCred} to client`;
      expect(redactSecrets(msg)).toBe('Issuing device credential: [REDACTED_CREDENTIAL] to client');

      const urlWithToken = 'https://localhost:8443/?token=secret_tok_12345';
      expect(redactSecrets(urlWithToken)).toBe('https://localhost:8443/?token=[REDACTED_TOKEN]');
    });

    it('preserves harmless numbers and strings', () => {
      const safe = 'Stream running at 30 fps, bitrate 1420 kbps, resolution 1920x1080';
      expect(redactSecrets(safe)).toBe(safe);
    });
  });

  describe('ServerLogger ring buffer', () => {
    it('enforces maximum capacity and drops oldest entries', () => {
      for (let i = 1; i <= 60; i++) {
        logger.addEntry('info', 'system', `Event message #${i}`);
      }

      const entries = logger.getEntries(0, 100);
      expect(entries.length).toBe(50);
      expect(entries[0].message).toBe('Event message #11');
      expect(entries[entries.length - 1].message).toBe('Event message #60');
    });

    it('redacts secrets on ingestion before storing', () => {
      logger.addEntry('info', 'pairing', 'New code: https://192.168.1.5:8443/#code=99887766');
      const entries = logger.getEntries();
      expect(entries[0].message).toContain('[REDACTED_CODE]');
      expect(entries[0].message).not.toContain('99887766');
    });

    it('filters entries by timestamp and limit', () => {
      const t1 = Date.now() - 5000;
      logger.addEntry('info', 'desktop', 'Old frame');

      const snap = logger.getEntries(t1 + 10000, 10);
      expect(snap.length).toBe(0);

      const recent = logger.getEntries(0, 1);
      expect(recent.length).toBe(1);
    });

    it('emits real-time entry events to subscribers', () => {
      let receivedMsg = '';
      logger.on('entry', (e) => {
        receivedMsg = e.message;
      });

      logger.addEntry('warn', 'security', 'Access attempt from 192.168.1.50');
      expect(receivedMsg).toBe('Access attempt from 192.168.1.50');
    });
  });
});
