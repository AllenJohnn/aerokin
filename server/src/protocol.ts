/**
 * AEROKIN Protocol Validation, Constants, and Rate Limiting
 */

export const WS_MAX_PAYLOAD_BYTES = 4096; // 4 KB limit for incoming frames
export const WS_CLOSE_POLICY_VIOLATION = 1008;

export const MAX_MOVE_DELTA = 200;
export const MAX_SCROLL_DELTA = 500;
export const MAX_SEEKBY_SECONDS = 86400; // ±24 hours
export const MAX_SEEKTO_SECONDS = 864000; // 10 days
export const MAX_SESSION_ID_LENGTH = 256;

export const ALLOWED_MEDIA_ACTIONS = [
  'playpause',
  'next',
  'prev',
  'stop',
  'volup',
  'voldown',
  'mute',
  'fullscreen',
  'seekfwd',
  'seekback',
] as const;

export type AllowedMediaAction = typeof ALLOWED_MEDIA_ACTIONS[number];

export type ValidClientMessage =
  | { type: 'ping'; t: number }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'click'; button: 'left' | 'right' | 'middle' }
  | { type: 'button'; button: 'left' | 'right' | 'middle'; state: 'down' | 'up' }
  | { type: 'scroll'; dy: number; dx: number }
  | { type: 'media'; action: AllowedMediaAction }
  | { type: 'seekby'; seconds: number }
  | { type: 'seekto'; position: number }
  | { type: 'session'; id: string }
  | { type: 'setvolume'; level: number }
  | { type: 'getvolume' };

/**
 * Validates and clamps an incoming message payload.
 * Returns the sanitized ValidClientMessage if valid, or null if invalid.
 * Never throws.
 */
export function validateClientMessage(raw: unknown): ValidClientMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const msg = raw as Record<string, unknown>;
  if (typeof msg.type !== 'string') {
    return null;
  }

  switch (msg.type) {
    case 'ping': {
      if (typeof msg.t !== 'number' || !Number.isFinite(msg.t)) {
        return null;
      }
      return { type: 'ping', t: msg.t };
    }

    case 'move': {
      if (
        typeof msg.dx !== 'number' ||
        !Number.isFinite(msg.dx) ||
        typeof msg.dy !== 'number' ||
        !Number.isFinite(msg.dy)
      ) {
        return null;
      }
      return {
        type: 'move',
        dx: Math.max(-MAX_MOVE_DELTA, Math.min(MAX_MOVE_DELTA, msg.dx)),
        dy: Math.max(-MAX_MOVE_DELTA, Math.min(MAX_MOVE_DELTA, msg.dy)),
      };
    }

    case 'click': {
      if (msg.button !== 'left' && msg.button !== 'right' && msg.button !== 'middle') {
        return null;
      }
      return { type: 'click', button: msg.button };
    }

    case 'button': {
      if (
        (msg.button !== 'left' && msg.button !== 'right' && msg.button !== 'middle') ||
        (msg.state !== 'down' && msg.state !== 'up')
      ) {
        return null;
      }
      return { type: 'button', button: msg.button, state: msg.state };
    }

    case 'scroll': {
      if (typeof msg.dy !== 'number' || !Number.isFinite(msg.dy)) {
        return null;
      }
      const dxRaw = msg.dx ?? 0;
      if (typeof dxRaw !== 'number' || !Number.isFinite(dxRaw)) {
        return null;
      }
      return {
        type: 'scroll',
        dy: Math.max(-MAX_SCROLL_DELTA, Math.min(MAX_SCROLL_DELTA, msg.dy)),
        dx: Math.max(-MAX_SCROLL_DELTA, Math.min(MAX_SCROLL_DELTA, dxRaw)),
      };
    }

    case 'media': {
      if (
        typeof msg.action !== 'string' ||
        !ALLOWED_MEDIA_ACTIONS.includes(msg.action as AllowedMediaAction)
      ) {
        return null;
      }
      return { type: 'media', action: msg.action as AllowedMediaAction };
    }

    case 'seekby': {
      if (typeof msg.seconds !== 'number' || !Number.isFinite(msg.seconds)) {
        return null;
      }
      return {
        type: 'seekby',
        seconds: Math.max(-MAX_SEEKBY_SECONDS, Math.min(MAX_SEEKBY_SECONDS, msg.seconds)),
      };
    }

    case 'seekto': {
      if (typeof msg.position !== 'number' || !Number.isFinite(msg.position) || msg.position < 0) {
        return null;
      }
      return {
        type: 'seekto',
        position: Math.min(MAX_SEEKTO_SECONDS, msg.position),
      };
    }

    case 'session': {
      if (
        typeof msg.id !== 'string' ||
        msg.id.trim().length === 0 ||
        msg.id.length > MAX_SESSION_ID_LENGTH
      ) {
        return null;
      }
      return { type: 'session', id: msg.id };
    }

    case 'setvolume': {
      if (typeof msg.level !== 'number' || !Number.isFinite(msg.level)) {
        return null;
      }
      const level = Math.round(msg.level);
      return {
        type: 'setvolume',
        level: Math.max(0, Math.min(100, level)),
      };
    }

    case 'getvolume': {
      return { type: 'getvolume' };
    }

    default:
      return null;
  }
}

/**
 * Token bucket algorithm for rate limiting.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  constructor(capacity: number, refillRate: number, now = Date.now()) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = now;
  }

  public tryConsume(tokens = 1, now = Date.now()): boolean {
    const elapsedSeconds = Math.max(0, (now - this.lastRefill) / 1000);
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRate);
    this.lastRefill = now;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  public getTokens(): number {
    return this.tokens;
  }
}

export interface RateLimitCategoryConfig {
  capacity: number;
  refillRate: number;
}

export const RATE_LIMIT_CONFIGS: Record<string, RateLimitCategoryConfig> = {
  move: { capacity: 250, refillRate: 200 }, // Phone gyro / trackpad sends up to 120-200Hz
  scroll: { capacity: 150, refillRate: 100 }, // Multi-touch scroll updates
  click: { capacity: 40, refillRate: 20 }, // Clicks and button down/up transitions
  media: { capacity: 40, refillRate: 20 }, // Media controls, seeking, volume
  ping: { capacity: 10, refillRate: 5 }, // Keepalive pings (phone sends ~0.5Hz)
};

export const MAX_CONSECUTIVE_RATE_LIMIT_VIOLATIONS = 50;

/**
 * Per-connection rate limiter managing multiple token buckets by message category.
 */
export class ConnectionRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private consecutiveViolations = 0;

  constructor(now = Date.now()) {
    for (const [cat, cfg] of Object.entries(RATE_LIMIT_CONFIGS)) {
      this.buckets.set(cat, new TokenBucket(cfg.capacity, cfg.refillRate, now));
    }
  }

  public getCategoryForType(type: ValidClientMessage['type']): string {
    switch (type) {
      case 'move':
        return 'move';
      case 'scroll':
        return 'scroll';
      case 'click':
      case 'button':
        return 'click';
      case 'media':
      case 'seekby':
      case 'seekto':
      case 'session':
      case 'setvolume':
      case 'getvolume':
        return 'media';
      case 'ping':
        return 'ping';
    }
  }

  /**
   * Evaluates message rate limit.
   * Returns:
   *   { ok: true } if allowed.
   *   { ok: false, closeConnection: false } if dropped due to rate limit.
   *   { ok: false, closeConnection: true, reason: string } if sustained flood requires socket closure.
   */
  public check(type: ValidClientMessage['type'], now = Date.now()): {
    ok: boolean;
    closeConnection?: boolean;
    reason?: string;
  } {
    const category = this.getCategoryForType(type);
    const bucket = this.buckets.get(category);

    if (!bucket) {
      return { ok: true };
    }

    const allowed = bucket.tryConsume(1, now);
    if (allowed) {
      if (this.consecutiveViolations > 0) {
        this.consecutiveViolations = Math.max(0, this.consecutiveViolations - 1);
      }
      return { ok: true };
    }

    this.consecutiveViolations += 1;
    if (this.consecutiveViolations >= MAX_CONSECUTIVE_RATE_LIMIT_VIOLATIONS) {
      return {
        ok: false,
        closeConnection: true,
        reason: `Rate limit exceeded: sustained flood on ${category} category`,
      };
    }

    return {
      ok: false,
      closeConnection: false,
    };
  }

  public getConsecutiveViolations(): number {
    return this.consecutiveViolations;
  }
}
