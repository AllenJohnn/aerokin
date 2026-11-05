/**
 * AEROKIN Mobile Diagnostics & Client Ring Buffer Logger
 *
 * Maintains an in-memory ring buffer of the last 300 client events.
 * Redacts all sensitive credentials, pairing codes, and tokens.
 */

export type DiagnosticLevel = 'info' | 'warn' | 'error';
export type DiagnosticCategory = 'socket' | 'stream' | 'media' | 'input' | 'system';

export interface DiagnosticEvent {
  id: string;
  timestamp: number;
  level: DiagnosticLevel;
  category: DiagnosticCategory;
  message: string;
}

export const MAX_CLIENT_DIAGNOSTICS_ENTRIES = 300;

const REGEX_PAIRING_CODE_URL = /([#&?]code=)\d{8}/gi;
const REGEX_PAIRING_CODE_LABEL = /(pairing code:\s*)\d{8}/gi;
const REGEX_HEX_CREDENTIAL = /\b[0-9a-fA-F]{64}\b/g;
const REGEX_SHORT_TOKEN = /(?:[?&#]|\b)token=[a-zA-Z0-9_-]+/gi;

export function redactClientSecrets(message: string): string {
  if (!message || typeof message !== 'string') return '';
  return message
    .replace(REGEX_PAIRING_CODE_URL, '$1[REDACTED_CODE]')
    .replace(REGEX_PAIRING_CODE_LABEL, '$1[REDACTED_CODE]')
    .replace(REGEX_HEX_CREDENTIAL, '[REDACTED_CREDENTIAL]')
    .replace(REGEX_SHORT_TOKEN, 'token=[REDACTED_TOKEN]');
}

class DiagnosticsLogger {
  private buffer: DiagnosticEvent[] = [];
  private counter = 0;
  private listeners: Array<() => void> = [];

  public log(level: DiagnosticLevel, category: DiagnosticCategory, rawMessage: string): DiagnosticEvent {
    const cleanMessage = redactClientSecrets(rawMessage);
    const event: DiagnosticEvent = {
      id: `diag_${Date.now()}_${++this.counter}`,
      timestamp: Date.now(),
      level,
      category,
      message: cleanMessage,
    };

    this.buffer.push(event);
    if (this.buffer.length > MAX_CLIENT_DIAGNOSTICS_ENTRIES) {
      this.buffer.shift();
    }

    this.notify();
    return event;
  }

  public getEvents(): DiagnosticEvent[] {
    return [...this.buffer];
  }

  public clear(): void {
    this.buffer = [];
    this.notify();
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {}
    }
  }
}

export const diagnosticsLogger = new DiagnosticsLogger();

export interface DiagnosticsSummaryInfo {
  status: string;
  host: string | null;
  deviceId: string | null;
  latency: number | null;
  desktopStats?: { fps: number; bitrateKbps: number; droppedFrames: number } | null;
  lastCloseCode?: number | null;
  lastCloseReason?: string | null;
}

export function formatDiagnosticsReport(info: DiagnosticsSummaryInfo, events = diagnosticsLogger.getEvents()): string {
  const lines: string[] = [
    '=== AEROKIN DIAGNOSTICS REPORT ===',
    `Timestamp: ${new Date().toISOString()}`,
    `Connection Status: ${info.status.toUpperCase()}`,
    `Host: ${info.host || 'Not configured'}`,
    `Device ID: ${info.deviceId ? `${info.deviceId.slice(0, 8)}...` : 'None'}`,
    `Current Latency (RTT): ${info.latency !== null ? `${info.latency} ms` : 'N/A'}`,
  ];

  if (info.desktopStats) {
    lines.push(
      `Desktop Stream: ${info.desktopStats.fps} fps | ${info.desktopStats.bitrateKbps} kbps | Dropped: ${info.desktopStats.droppedFrames}`
    );
  }

  if (info.lastCloseCode !== undefined && info.lastCloseCode !== null) {
    lines.push(`Last Close Code: ${info.lastCloseCode} (${info.lastCloseReason || 'No reason provided'})`);
  }

  lines.push('\n--- RECENT CLIENT EVENTS (Last 300) ---');
  if (events.length === 0) {
    lines.push('No events recorded.');
  } else {
    for (const ev of events) {
      const time = new Date(ev.timestamp).toLocaleTimeString();
      lines.push(`[${time}] [${ev.level.toUpperCase()}] [${ev.category.toUpperCase()}] ${ev.message}`);
    }
  }

  return lines.join('\n');
}
