/**
 * FrameDeduplicator
 *
 * Compares incoming encoded JPEG frames against the last delivered frame.
 * If consecutive frames are identical (e.g. desktop is static), transmission is skipped,
 * significantly cutting network bandwidth while keeping connection alive with periodic keepalives.
 */

export interface FrameDeduplicatorOptions {
  keepaliveIntervalMs?: number;
  getNow?: () => number;
}

export interface DedupeDecision {
  send: boolean;
  isKeepalive: boolean;
}

export class FrameDeduplicator {
  private lastFrameBuffer: Buffer | null = null;
  private lastSentTime = 0;
  private readonly keepaliveIntervalMs: number;
  private readonly getNow: () => number;

  constructor(options?: FrameDeduplicatorOptions) {
    this.keepaliveIntervalMs = options?.keepaliveIntervalMs ?? 1000;
    this.getNow = options?.getNow ?? Date.now;
  }

  /**
   * Evaluates if a frame should be transmitted to the client.
   * Compares the raw JPEG payload byte-for-byte.
   */
  public shouldSend(jpegBytes: Buffer): DedupeDecision {
    const now = this.getNow();

    if (!this.lastFrameBuffer) {
      this.lastFrameBuffer = Buffer.from(jpegBytes);
      this.lastSentTime = now;
      return { send: true, isKeepalive: false };
    }

    const isIdentical =
      this.lastFrameBuffer.length === jpegBytes.length && this.lastFrameBuffer.equals(jpegBytes);

    if (!isIdentical) {
      this.lastFrameBuffer = Buffer.from(jpegBytes);
      this.lastSentTime = now;
      return { send: true, isKeepalive: false };
    }

    // Frame is identical. Send only if keepalive interval has elapsed.
    if (now - this.lastSentTime >= this.keepaliveIntervalMs) {
      this.lastSentTime = now;
      return { send: true, isKeepalive: true };
    }

    return { send: false, isKeepalive: false };
  }

  public reset(): void {
    this.lastFrameBuffer = null;
    this.lastSentTime = 0;
  }
}
