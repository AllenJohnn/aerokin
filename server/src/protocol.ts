/**
 * AEROKIN Protocol Validation, Constants, and Rate Limiting
 */

export const WS_MAX_PAYLOAD_BYTES = 131072; // 128 KB limit for authenticated frames (e.g. 100 KB clipboard)
export const WS_CLOSE_POLICY_VIOLATION = 1008;

export const MAX_MOVE_DELTA = 200;
export const MAX_SCROLL_DELTA = 500;
export const MAX_SEEKBY_SECONDS = 86400; // ±24 hours
export const MAX_SEEKTO_SECONDS = 864000; // 10 days
export const MAX_SESSION_ID_LENGTH = 256;
export const MAX_CLIPBOARD_TEXT_BYTES = 102400; // 100 KB limit for text clipboard
export const MAX_TYPE_TEXT_CHARS = 1000;
export const MAX_URL_LENGTH = 2048;

export const ALLOWED_QUICK_ACTIONS = [
  'lock_pc',
  'sleep',
  'monitor_off',
  'show_desktop',
  'task_view',
  'task_manager',
  'volume_mute',
  'brightness_up',
  'brightness_down',
  'send_link',
  'type_text',
  'shutdown',
  'restart',
  'sign_out',
  'cancel_shutdown',
  'launch_app',
] as const;

export type AllowedQuickAction = (typeof ALLOWED_QUICK_ACTIONS)[number];

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

export type AllowedMediaAction = (typeof ALLOWED_MEDIA_ACTIONS)[number];

export const ALLOWED_KEY_MODIFIERS = ['ctrl', 'alt', 'shift', 'win'] as const;
export type AllowedKeyModifier = (typeof ALLOWED_KEY_MODIFIERS)[number];

export const ALLOWED_SPECIAL_KEYS = [
  'left',
  'right',
  'up',
  'down',
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'home',
  'end',
  'pageup',
  'pagedown',
  'backspace',
  'delete',
  'del',
  'insert',
  'enter',
  'return',
  'tab',
  'space',
  'escape',
  'esc',
  'shift',
  'ctrl',
  'control',
  'alt',
  'win',
  'windows',
  'meta',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
] as const;

export type ValidClientMessage =
  | { type: 'ping'; t: number }
  | { type: 'server_pong'; t: number }
  | { type: 'battery'; percent: number | null; charging?: boolean }
  | { type: 'tail_logs'; limit?: number }
  | { type: 'auth'; deviceId: string; credential: string }
  | { type: 'device_list' }
  | { type: 'device_rename'; deviceId: string; name: string }
  | { type: 'device_revoke'; deviceId: string }
  | { type: 'device_revoke_all'; exceptCurrent?: boolean }
  | { type: 'logout' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'click'; button: 'left' | 'right' | 'middle' }
  | { type: 'button'; button: 'left' | 'right' | 'middle'; state: 'down' | 'up' }
  | { type: 'scroll'; dy: number; dx: number }
  | { type: 'media'; action: AllowedMediaAction; sessionId?: string }
  | { type: 'seekby'; seconds: number; sessionId?: string }
  | { type: 'seekto'; position: number; sessionId?: string }
  | { type: 'session'; id: string }
  | { type: 'setvolume'; level: number }
  | { type: 'getvolume' }
  | {
      type: 'desktop_start';
      monitorId?: string;
      preset?: 'low' | 'balanced' | 'high' | 'ultra';
      customScale?: number;
      customFps?: number;
      codec?: 'h264' | 'mjpeg';
      viewOnly?: boolean;
    }
  | { type: 'set_view_only'; viewOnly: boolean }
  | { type: 'desktop_stop' }
  | { type: 'desktop_monitors' }
  | { type: 'abs_move'; x: number; y: number; monitorId?: string }
  | {
      type: 'abs_click';
      button: 'left' | 'right' | 'middle';
      count?: number;
      x?: number;
      y?: number;
      monitorId?: string;
    }
  | {
      type: 'abs_button';
      button: 'left' | 'right' | 'middle';
      state: 'down' | 'up';
      x?: number;
      y?: number;
      monitorId?: string;
    }
  | {
      type: 'key';
      key: string;
      action?: 'down' | 'up' | 'tap';
      modifiers?: string[];
    }
  | { type: 'text'; text: string }
  | {
      type: 'screenshot_request';
      target?: 'all' | 'active_window' | 'monitor';
      monitorId?: string;
      includeCursor?: boolean;
    }
  | { type: 'stats_subscribe'; intervalMs?: number }
  | { type: 'stats_unsubscribe' }
  | { type: 'clipboard_get' }
  | { type: 'clipboard_set'; text: string }
  | { type: 'clipboard_set_and_paste'; text: string }
  | { type: 'clipboard_clear_history' }
  | {
      type: 'quick_action';
      action: AllowedQuickAction;
      payload?: string;
    }
  | { type: 'launcher_list' }
  | { type: 'features_get' };

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

    case 'server_pong': {
      if (typeof msg.t !== 'number' || !Number.isFinite(msg.t)) {
        return null;
      }
      return { type: 'server_pong', t: msg.t };
    }

    case 'battery': {
      const percent =
        typeof msg.percent === 'number' && Number.isFinite(msg.percent)
          ? Math.max(0, Math.min(100, Math.round(msg.percent)))
          : null;
      const charging = typeof msg.charging === 'boolean' ? msg.charging : undefined;
      return { type: 'battery', percent, charging };
    }

    case 'tail_logs': {
      const limit =
        typeof msg.limit === 'number' && Number.isFinite(msg.limit)
          ? Math.max(1, Math.min(200, Math.round(msg.limit)))
          : 50;
      return { type: 'tail_logs', limit };
    }

    case 'auth': {
      if (
        typeof msg.deviceId !== 'string' ||
        msg.deviceId.trim().length === 0 ||
        msg.deviceId.length > 64 ||
        typeof msg.credential !== 'string' ||
        msg.credential.trim().length === 0 ||
        msg.credential.length > 128
      ) {
        return null;
      }
      return {
        type: 'auth',
        deviceId: msg.deviceId.trim(),
        credential: msg.credential.trim(),
      };
    }

    case 'device_list': {
      return { type: 'device_list' };
    }

    case 'device_rename': {
      if (
        typeof msg.deviceId !== 'string' ||
        msg.deviceId.trim().length === 0 ||
        msg.deviceId.length > 64 ||
        typeof msg.name !== 'string' ||
        msg.name.trim().length === 0 ||
        msg.name.length > 64
      ) {
        return null;
      }
      return {
        type: 'device_rename',
        deviceId: msg.deviceId.trim(),
        name: msg.name.trim(),
      };
    }

    case 'device_revoke': {
      if (
        typeof msg.deviceId !== 'string' ||
        msg.deviceId.trim().length === 0 ||
        msg.deviceId.length > 64
      ) {
        return null;
      }
      return {
        type: 'device_revoke',
        deviceId: msg.deviceId.trim(),
      };
    }

    case 'device_revoke_all': {
      return {
        type: 'device_revoke_all',
        exceptCurrent: Boolean(msg.exceptCurrent),
      };
    }

    case 'logout': {
      return { type: 'logout' };
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
      return {
        type: 'media',
        action: msg.action as AllowedMediaAction,
        sessionId:
          typeof msg.sessionId === 'string'
            ? msg.sessionId.trim().slice(0, 128)
            : typeof msg.targetSessionId === 'string'
              ? msg.targetSessionId.trim().slice(0, 128)
              : undefined,
      };
    }

    case 'seekby': {
      if (typeof msg.seconds !== 'number' || !Number.isFinite(msg.seconds)) {
        return null;
      }
      return {
        type: 'seekby',
        seconds: Math.max(-MAX_SEEKBY_SECONDS, Math.min(MAX_SEEKBY_SECONDS, msg.seconds)),
        sessionId:
          typeof msg.sessionId === 'string'
            ? msg.sessionId.trim().slice(0, 128)
            : typeof msg.targetSessionId === 'string'
              ? msg.targetSessionId.trim().slice(0, 128)
              : undefined,
      };
    }

    case 'seekto': {
      if (typeof msg.position !== 'number' || !Number.isFinite(msg.position) || msg.position < 0) {
        return null;
      }
      return {
        type: 'seekto',
        position: Math.min(MAX_SEEKTO_SECONDS, msg.position),
        sessionId:
          typeof msg.sessionId === 'string'
            ? msg.sessionId.trim().slice(0, 128)
            : typeof msg.targetSessionId === 'string'
              ? msg.targetSessionId.trim().slice(0, 128)
              : undefined,
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

    case 'desktop_start': {
      let preset: 'low' | 'balanced' | 'high' | 'ultra' | undefined = undefined;
      if (typeof msg.preset === 'string') {
        if (['low', 'balanced', 'high', 'ultra'].includes(msg.preset)) {
          preset = msg.preset as 'low' | 'balanced' | 'high' | 'ultra';
        }
      }
      let monitorId: string | undefined = undefined;
      if (
        typeof msg.monitorId === 'string' &&
        msg.monitorId.length > 0 &&
        msg.monitorId.length <= 64
      ) {
        monitorId = msg.monitorId;
      }
      let customScale: number | undefined = undefined;
      if (typeof msg.customScale === 'number' && Number.isFinite(msg.customScale)) {
        customScale = Math.max(0.1, Math.min(1.0, msg.customScale));
      }
      let customFps: number | undefined = undefined;
      if (typeof msg.customFps === 'number' && Number.isFinite(msg.customFps)) {
        customFps = Math.max(5, Math.min(60, Math.round(msg.customFps)));
      }
      let codec: 'h264' | 'mjpeg' | undefined = undefined;
      if (msg.codec === 'h264' || msg.codec === 'mjpeg') {
        codec = msg.codec;
      }
      let viewOnly: boolean | undefined = undefined;
      if (typeof msg.viewOnly === 'boolean') {
        viewOnly = msg.viewOnly;
      }
      return {
        type: 'desktop_start',
        monitorId,
        preset,
        customScale,
        customFps,
        codec,
        viewOnly,
      };
    }

    case 'set_view_only': {
      if (typeof msg.viewOnly !== 'boolean') {
        return null;
      }
      return { type: 'set_view_only', viewOnly: msg.viewOnly };
    }

    case 'desktop_stop': {
      return { type: 'desktop_stop' };
    }

    case 'desktop_monitors': {
      return { type: 'desktop_monitors' };
    }

    case 'abs_move': {
      if (
        typeof msg.x !== 'number' ||
        !Number.isFinite(msg.x) ||
        typeof msg.y !== 'number' ||
        !Number.isFinite(msg.y)
      ) {
        return null;
      }
      return {
        type: 'abs_move',
        x: Math.max(0, Math.min(1, msg.x)),
        y: Math.max(0, Math.min(1, msg.y)),
        monitorId:
          typeof msg.monitorId === 'string' && msg.monitorId.length <= 64
            ? msg.monitorId
            : undefined,
      };
    }

    case 'abs_click': {
      if (msg.button !== 'left' && msg.button !== 'right' && msg.button !== 'middle') {
        return null;
      }
      const count =
        typeof msg.count === 'number' && Number.isFinite(msg.count)
          ? Math.max(1, Math.min(3, Math.round(msg.count)))
          : 1;
      const x =
        typeof msg.x === 'number' && Number.isFinite(msg.x)
          ? Math.max(0, Math.min(1, msg.x))
          : undefined;
      const y =
        typeof msg.y === 'number' && Number.isFinite(msg.y)
          ? Math.max(0, Math.min(1, msg.y))
          : undefined;
      return {
        type: 'abs_click',
        button: msg.button,
        count,
        x,
        y,
        monitorId:
          typeof msg.monitorId === 'string' && msg.monitorId.length <= 64
            ? msg.monitorId
            : undefined,
      };
    }

    case 'abs_button': {
      if (
        (msg.button !== 'left' && msg.button !== 'right' && msg.button !== 'middle') ||
        (msg.state !== 'down' && msg.state !== 'up')
      ) {
        return null;
      }
      const x =
        typeof msg.x === 'number' && Number.isFinite(msg.x)
          ? Math.max(0, Math.min(1, msg.x))
          : undefined;
      const y =
        typeof msg.y === 'number' && Number.isFinite(msg.y)
          ? Math.max(0, Math.min(1, msg.y))
          : undefined;
      return {
        type: 'abs_button',
        button: msg.button,
        state: msg.state,
        x,
        y,
        monitorId:
          typeof msg.monitorId === 'string' && msg.monitorId.length <= 64
            ? msg.monitorId
            : undefined,
      };
    }

    case 'key': {
      if (typeof msg.key !== 'string' || msg.key.length === 0 || msg.key.length > 32) {
        return null;
      }
      const lowerKey = msg.key.toLowerCase().trim();
      const isSpecial = (ALLOWED_SPECIAL_KEYS as readonly string[]).includes(lowerKey);
      const isSingleChar = lowerKey.length === 1 && /^[a-z0-9 `\-=\[\]\\;',.\/]$/.test(lowerKey);

      if (!isSpecial && !isSingleChar) {
        return null;
      }

      let action: 'down' | 'up' | 'tap' = 'tap';
      if (msg.action === 'down' || msg.action === 'up' || msg.action === 'tap') {
        action = msg.action;
      }

      let modifiers: string[] | undefined = undefined;
      if (Array.isArray(msg.modifiers)) {
        modifiers = msg.modifiers
          .filter((m) => typeof m === 'string')
          .map((m) => m.toLowerCase().trim())
          .filter((m) => (ALLOWED_KEY_MODIFIERS as readonly string[]).includes(m));
      }

      return {
        type: 'key',
        key: lowerKey,
        action,
        modifiers,
      };
    }

    case 'text': {
      if (typeof msg.text !== 'string' || msg.text.length === 0 || msg.text.length > 256) {
        return null;
      }
      const sanitized = msg.text.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
      if (sanitized.length === 0) return null;
      return { type: 'text', text: sanitized };
    }

    case 'screenshot_request': {
      let target: 'all' | 'active_window' | 'monitor' = 'all';
      if (typeof msg.target === 'string') {
        if (msg.target === 'all' || msg.target === 'active_window' || msg.target === 'monitor') {
          target = msg.target;
        } else {
          return null;
        }
      }
      let monitorId: string | undefined = undefined;
      if (typeof msg.monitorId === 'string') {
        const trimmed = msg.monitorId.trim();
        if (trimmed.length > 0 && trimmed.length <= 64) {
          monitorId = trimmed;
        }
      }
      const includeCursor = typeof msg.includeCursor === 'boolean' ? msg.includeCursor : undefined;
      return { type: 'screenshot_request', target, monitorId, includeCursor };
    }

    case 'stats_subscribe': {
      let intervalMs = 1000;
      if (typeof msg.intervalMs === 'number' && Number.isFinite(msg.intervalMs)) {
        intervalMs = Math.max(500, Math.min(5000, Math.round(msg.intervalMs)));
      }
      return { type: 'stats_subscribe', intervalMs };
    }

    case 'stats_unsubscribe': {
      return { type: 'stats_unsubscribe' };
    }

    case 'clipboard_get': {
      return { type: 'clipboard_get' };
    }

    case 'clipboard_set': {
      if (typeof msg.text !== 'string' || msg.text.length > MAX_CLIPBOARD_TEXT_BYTES) {
        return null;
      }
      return { type: 'clipboard_set', text: msg.text };
    }

    case 'clipboard_set_and_paste': {
      if (typeof msg.text !== 'string' || msg.text.length > MAX_CLIPBOARD_TEXT_BYTES) {
        return null;
      }
      return { type: 'clipboard_set_and_paste', text: msg.text };
    }

    case 'clipboard_clear_history': {
      return { type: 'clipboard_clear_history' };
    }

    case 'quick_action': {
      if (typeof msg.action !== 'string') {
        return null;
      }
      if (!ALLOWED_QUICK_ACTIONS.includes(msg.action as AllowedQuickAction)) {
        return null;
      }
      const action = msg.action as AllowedQuickAction;
      let payload: string | undefined = undefined;

      if (action === 'send_link') {
        if (
          typeof msg.payload !== 'string' ||
          msg.payload.length === 0 ||
          msg.payload.length > MAX_URL_LENGTH
        ) {
          return null;
        }
        try {
          const parsedUrl = new URL(msg.payload.trim());
          if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return null; // Strictly reject non-http schemes (javascript:, file:, etc.)
          }
          payload = parsedUrl.href;
        } catch {
          return null;
        }
      } else if (action === 'type_text') {
        if (
          typeof msg.payload !== 'string' ||
          msg.payload.length === 0 ||
          msg.payload.length > MAX_TYPE_TEXT_CHARS
        ) {
          return null;
        }
        payload = msg.payload;
      } else if (action === 'launch_app') {
        if (
          typeof msg.payload !== 'string' ||
          msg.payload.trim().length === 0 ||
          msg.payload.length > 64 ||
          !/^[a-zA-Z0-9_\-.]+$/.test(msg.payload.trim())
        ) {
          return null;
        }
        payload = msg.payload.trim();
      } else if (typeof msg.payload === 'string') {
        payload = msg.payload.slice(0, 256);
      }

      return { type: 'quick_action', action, payload };
    }

    case 'launcher_list': {
      return { type: 'launcher_list' };
    }

    case 'features_get': {
      return { type: 'features_get' };
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
  move: { capacity: 250, refillRate: 200 }, // Trackpad sends up to 120-200Hz
  abs_move: { capacity: 250, refillRate: 200 }, // Desktop absolute pointer moves
  scroll: { capacity: 150, refillRate: 100 }, // Multi-touch scroll updates
  click: { capacity: 40, refillRate: 20 }, // Clicks and button down/up transitions
  key: { capacity: 40, refillRate: 20 }, // Keyboard typing and shortcuts
  desktop: { capacity: 10, refillRate: 5 }, // Desktop start/stop/monitors queries
  media: { capacity: 40, refillRate: 20 }, // Media controls, seeking, volume
  ping: { capacity: 10, refillRate: 5 }, // Keepalive pings (phone sends ~0.5Hz)
  device: { capacity: 20, refillRate: 5 }, // Device list, rename, revoke
  auth: { capacity: 5, refillRate: 1 }, // Handshake auth message
  screenshot: { capacity: 4, refillRate: 2 }, // One-shot screenshot captures
  stats: { capacity: 10, refillRate: 5 }, // System stats subscription
  clipboard: { capacity: 20, refillRate: 10 }, // Clipboard read/write
  action: { capacity: 20, refillRate: 10 }, // Safe PC actions & app launcher
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
      case 'abs_move':
        return 'abs_move';
      case 'scroll':
        return 'scroll';
      case 'click':
      case 'button':
      case 'abs_click':
      case 'abs_button':
        return 'click';
      case 'key':
      case 'text':
        return 'key';
      case 'desktop_start':
      case 'desktop_stop':
      case 'desktop_monitors':
        return 'desktop';
      case 'media':
      case 'seekby':
      case 'seekto':
      case 'session':
      case 'setvolume':
      case 'getvolume':
        return 'media';
      case 'ping':
      case 'server_pong':
        return 'ping';
      case 'auth':
        return 'auth';
      case 'battery':
      case 'tail_logs':
      case 'device_list':
      case 'device_rename':
      case 'device_revoke':
      case 'device_revoke_all':
      case 'logout':
      case 'features_get':
      case 'set_view_only':
        return 'device';
      case 'screenshot_request':
        return 'screenshot';
      case 'stats_subscribe':
      case 'stats_unsubscribe':
        return 'stats';
      case 'clipboard_get':
      case 'clipboard_set':
      case 'clipboard_set_and_paste':
      case 'clipboard_clear_history':
        return 'clipboard';
      case 'quick_action':
      case 'launcher_list':
        return 'action';
    }
  }

  /**
   * Evaluates message rate limit.
   * Returns:
   *   { ok: true } if allowed.
   *   { ok: false, closeConnection: false } if dropped due to rate limit.
   *   { ok: false, closeConnection: true, reason: string } if sustained flood requires socket closure.
   */
  public check(
    type: ValidClientMessage['type'],
    now = Date.now()
  ): {
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
