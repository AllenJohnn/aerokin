import { describe, it, expect, beforeEach } from 'vitest';
import {
  diagnosticsLogger,
  redactClientSecrets,
  formatDiagnosticsReport,
  MAX_CLIENT_DIAGNOSTICS_ENTRIES,
} from '../src/utils/diagnosticsLogger';

describe('Diagnostics Logger & Ring Buffer', () => {
  beforeEach(() => {
    diagnosticsLogger.clear();
  });

  it('bounds the ring buffer to 300 entries', () => {
    expect(MAX_CLIENT_DIAGNOSTICS_ENTRIES).toBe(300);

    for (let i = 0; i < 350; i++) {
      diagnosticsLogger.log('info', 'socket', `Event ${i}`);
    }

    const events = diagnosticsLogger.getEvents();
    expect(events.length).toBe(300);
    expect(events[0].message).toBe('Event 50');
    expect(events[299].message).toBe('Event 349');
  });

  it('redacts pairing codes, device credentials, and tokens from log messages', () => {
    const rawWithCode = 'Connecting with pairing code: 12345678 and token=secret_abc123';
    const cleanWithCode = redactClientSecrets(rawWithCode);
    expect(cleanWithCode).not.toContain('12345678');
    expect(cleanWithCode).not.toContain('secret_abc123');
    expect(cleanWithCode).toContain('[REDACTED_CODE]');
    expect(cleanWithCode).toContain('[REDACTED_TOKEN]');

    const rawWithHex = 'Credential issued: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef in header';
    const cleanWithHex = redactClientSecrets(rawWithHex);
    expect(cleanWithHex).not.toContain('1234567890abcdef');
    expect(cleanWithHex).toContain('[REDACTED_CREDENTIAL]');
  });

  it('formats comprehensive diagnostics report without secrets', () => {
    diagnosticsLogger.log('info', 'socket', 'Connected to 192.168.1.10:8443');
    diagnosticsLogger.log('warn', 'stream', 'Framerate dropped to 25 fps');

    const report = formatDiagnosticsReport({
      status: 'connected',
      host: '192.168.1.10:8443',
      deviceId: 'dev_abc123456789',
      latency: 14,
      desktopStats: { fps: 30, bitrateKbps: 450, droppedFrames: 0 },
      lastCloseCode: 1000,
      lastCloseReason: 'Normal closure',
    });

    expect(report).toContain('=== AEROKIN DIAGNOSTICS REPORT ===');
    expect(report).toContain('Connection Status: CONNECTED');
    expect(report).toContain('Host: 192.168.1.10:8443');
    expect(report).toContain('Current Latency (RTT): 14 ms');
    expect(report).toContain('30 fps | 450 kbps');
    expect(report).toContain('Last Close Code: 1000');
    expect(report).toContain('[INFO] [SOCKET] Connected to 192.168.1.10:8443');
    expect(report).toContain('[WARN] [STREAM] Framerate dropped to 25 fps');
  });
});
