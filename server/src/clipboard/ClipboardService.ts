/**
 * AEROKIN Safe Clipboard Service
 *
 * Text-only clipboard exchange between Phone and PC with strict size limits (100 KB).
 * Implemented behind an IClipboardManager interface with mock support for testing.
 *
 * Security & Privacy:
 * - Content is NEVER logged anywhere on the server or client (only character lengths).
 * - History ring buffer stores only metadata (id, length, timestamp), max 20 items in-memory.
 * - History is volatile and cleared upon server restart or explicit user request.
 */

import { exec } from 'node:child_process';
import { MAX_CLIPBOARD_TEXT_BYTES } from '../protocol.js';
import { serverLogger } from '../logger.js';

export interface ClipboardHistoryItem {
  id: string;
  length: number;
  timestamp: number;
}

export interface IClipboardManager {
  readText(): Promise<string>;
  writeText(text: string): Promise<boolean>;
}

/**
 * In-memory Mock implementation for vitest and headless test environments.
 */
export class MockClipboardManager implements IClipboardManager {
  private text = '';

  public async readText(): Promise<string> {
    return this.text;
  }

  public async writeText(text: string): Promise<boolean> {
    this.text = text;
    return true;
  }
}

/**
 * Windows Native Clipboard Manager using safe PowerShell / Win32 commands.
 */
export class Win32ClipboardManager implements IClipboardManager {
  public async readText(): Promise<string> {
    if (process.platform !== 'win32') {
      return '';
    }

    return new Promise((resolve) => {
      // Safe PowerShell Get-Clipboard reading UTF-8 text with 1.5s timeout
      const psCmd =
        'powershell -NoProfile -Command "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; try { Get-Clipboard -Raw } catch { \'\' }"';

      exec(psCmd, { timeout: 1500, maxBuffer: 1024 * 512 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve('');
        }
        const text = stdout.slice(0, MAX_CLIPBOARD_TEXT_BYTES);
        resolve(text);
      });
    });
  }

  public async writeText(text: string): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    if (text.length > MAX_CLIPBOARD_TEXT_BYTES) {
      return false;
    }

    return new Promise((resolve) => {
      const psProcess = exec(
        'powershell -NoProfile -Command "$input | Set-Clipboard"',
        { timeout: 2000 },
        (err) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        }
      );

      if (psProcess.stdin) {
        psProcess.stdin.write(text);
        psProcess.stdin.end();
      } else {
        resolve(false);
      }
    });
  }
}

export class ClipboardService {
  private manager: IClipboardManager;
  private history: ClipboardHistoryItem[] = [];
  private readonly maxHistoryItems = 20;

  constructor(manager?: IClipboardManager) {
    this.manager =
      manager ||
      (process.platform === 'win32' ? new Win32ClipboardManager() : new MockClipboardManager());
  }

  public async getPcClipboard(): Promise<{ text: string; length: number }> {
    const text = await this.manager.readText();
    // Record privacy-safe log (only length, NEVER content)
    serverLogger.info('clipboard', `PC clipboard read. Length: ${text.length} chars.`);
    return { text, length: text.length };
  }

  public async setPcClipboard(
    text: string
  ): Promise<{ success: boolean; item?: ClipboardHistoryItem }> {
    if (text.length > MAX_CLIPBOARD_TEXT_BYTES) {
      serverLogger.warn(
        'clipboard',
        `Rejected oversized clipboard text (${text.length} bytes > ${MAX_CLIPBOARD_TEXT_BYTES}).`
      );
      return { success: false };
    }

    const ok = await this.manager.writeText(text);
    if (!ok) {
      return { success: false };
    }

    const item: ClipboardHistoryItem = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      length: text.length,
      timestamp: Date.now(),
    };

    this.history.unshift(item);
    if (this.history.length > this.maxHistoryItems) {
      this.history.pop();
    }

    // Privacy-safe log: NEVER print text content!
    serverLogger.info(
      'clipboard',
      `Updated PC clipboard from phone. Length: ${text.length} chars. (shared: ${this.history.length} items)`
    );

    return { success: true, item };
  }

  public getHistory(): ClipboardHistoryItem[] {
    return [...this.history];
  }

  public clearHistory(): void {
    this.history = [];
    serverLogger.info('clipboard', 'In-memory clipboard history cleared.');
  }

  public getSharedCount(): number {
    return this.history.length;
  }
}
