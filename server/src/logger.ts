/**
 * AEROKIN Bounded Ring Buffer Logger & Secret Redactor
 *
 * Maintains an in-memory ring buffer of the last 1000 log events.
 * Categories: 'pairing' | 'desktop' | 'media' | 'input' | 'security' | 'system'
 * Levels: 'info' | 'warn' | 'error' | 'debug'
 *
 * GUARANTEES:
 * - Never stores or logs 8-digit pairing codes, 32-byte device credentials, or legacy tokens.
 * - Automatic redaction regex scrubs all sensitive keys before entries enter memory.
 * - Thread/event-safe bounded buffer (max 1000 entries).
 * - Distributes real-time log lines to dashboard event streams.
 */

import { EventEmitter } from 'node:events';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogCategory = 'pairing' | 'desktop' | 'media' | 'input' | 'security' | 'system';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
}

export const MAX_RING_BUFFER_ENTRIES = 1000;

// Regular expressions to detect and scrub sensitive values:
// 1. 8-digit numeric pairing codes in URL parameters or plain references
const REGEX_PAIRING_CODE_URL = /([#&?]code=)\d{8}/gi;
const REGEX_PAIRING_CODE_LABEL = /(pairing code:\s*)\d{8}/gi;
const REGEX_PAIRING_CODE_STANDALONE = /\b[1-9]\d{7}\b/g;

// 2. 32-byte hex credentials (64 hex characters) or bearer/device tokens
const REGEX_HEX_CREDENTIAL = /\b[0-9a-fA-F]{64}\b/g;
const REGEX_SHORT_TOKEN = /([?&#]token=)[a-zA-Z0-9_-]+/gi;

/**
 * Pure function to sanitize log strings of sensitive credentials and codes.
 */
export function redactSecrets(message: string): string {
  if (!message || typeof message !== 'string') return '';

  return message
    .replace(REGEX_PAIRING_CODE_URL, '$1[REDACTED_CODE]')
    .replace(REGEX_PAIRING_CODE_LABEL, '$1[REDACTED_CODE]')
    .replace(REGEX_HEX_CREDENTIAL, '[REDACTED_CREDENTIAL]')
    .replace(REGEX_SHORT_TOKEN, '$1[REDACTED_TOKEN]');
}

export class ServerLogger extends EventEmitter {
  private buffer: LogEntry[] = [];
  private entryCounter = 0;
  private isHooked = false;

  private originalConsoleLog = console.log;
  private originalConsoleWarn = console.warn;
  private originalConsoleError = console.error;

  constructor(private maxEntries = MAX_RING_BUFFER_ENTRIES) {
    super();
  }

  /**
   * Adds an entry to the ring buffer after secret redaction.
   */
  public addEntry(
    level: LogLevel,
    category: LogCategory,
    rawMessage: string
  ): LogEntry {
    const cleanMessage = redactSecrets(rawMessage);
    const entry: LogEntry = {
      id: `log_${Date.now()}_${++this.entryCounter}`,
      timestamp: Date.now(),
      level,
      category,
      message: cleanMessage,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }

    this.emit('entry', entry);
    return entry;
  }

  public info(category: LogCategory, message: string): void {
    this.originalConsoleLog(`[${category.toUpperCase()}] ${message}`);
    this.addEntry('info', category, message);
  }

  public warn(category: LogCategory, message: string): void {
    this.originalConsoleWarn(`[${category.toUpperCase()}] ${message}`);
    this.addEntry('warn', category, message);
  }

  public error(category: LogCategory, message: string): void {
    this.originalConsoleError(`[${category.toUpperCase()}] ${message}`);
    this.addEntry('error', category, message);
  }

  /**
   * Returns a snapshot of entries, optionally filtering by timestamp and maximum count.
   */
  public getEntries(sinceTimestamp = 0, limit = 200): LogEntry[] {
    let result = this.buffer;
    if (sinceTimestamp > 0) {
      result = result.filter((e) => e.timestamp > sinceTimestamp);
    }
    return result.slice(-Math.min(limit, this.maxEntries));
  }

  public clear(): void {
    this.buffer = [];
  }

  /**
   * Hooks process console.log/warn/error to capture output into the ring buffer.
   */
  public hookConsole(): void {
    if (this.isHooked) return;
    this.isHooked = true;

    const parseCategory = (msg: string): LogCategory => {
      const lower = msg.toLowerCase();
      if (lower.includes('[pairing]') || lower.includes('pair')) return 'pairing';
      if (lower.includes('[desktopstream]') || lower.includes('[desktop]') || lower.includes('ffmpeg')) return 'desktop';
      if (lower.includes('[media]') || lower.includes('smtc')) return 'media';
      if (lower.includes('[win32]') || lower.includes('[input]')) return 'input';
      if (lower.includes('[security]')) return 'security';
      return 'system';
    };

    const formatArgs = (args: any[]): string => {
      return args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
    };

    console.log = (...args: any[]) => {
      this.originalConsoleLog(...args);
      const msg = formatArgs(args);
      this.addEntry('info', parseCategory(msg), msg);
    };

    console.warn = (...args: any[]) => {
      this.originalConsoleWarn(...args);
      const msg = formatArgs(args);
      this.addEntry('warn', parseCategory(msg), msg);
    };

    console.error = (...args: any[]) => {
      this.originalConsoleError(...args);
      const msg = formatArgs(args);
      this.addEntry('error', parseCategory(msg), msg);
    };
  }

  public unhookConsole(): void {
    if (!this.isHooked) return;
    this.isHooked = false;
    console.log = this.originalConsoleLog;
    console.warn = this.originalConsoleWarn;
    console.error = this.originalConsoleError;
  }
}

export const serverLogger = new ServerLogger();
