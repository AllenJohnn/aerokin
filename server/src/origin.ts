/**
 * AEROKIN Origin & CORS Security Policy
 *
 * Enforces Cross-Site WebSocket Hijacking (CSWSH) protection and restrictive CORS.
 *
 * Tradeoff documentation for missing Origin header:
 * All modern browsers (Safari, Chrome, Edge, Firefox) ALWAYS send an Origin header
 * on WebSocket handshakes, even for same-origin requests. Non-browser clients (such as
 * curl, native tools, or automation scripts) typically do not include an Origin header.
 * Because all connections require a valid 6-character auth token, accepting requests
 * without an Origin header allows developer/CLI usage while preventing malicious
 * websites in a user's browser from connecting (browsers cannot omit or spoof the Origin header).
 */

export function parseAllowedOrigins(envValue?: string): Set<string> {
  const allowed = new Set<string>();
  if (!envValue) return allowed;

  const parts = envValue.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const url = new URL(trimmed);
      // Extra allowed origins must use HTTPS (allow HTTP only for localhost in testing)
      const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol === 'https:' || (isLocal && url.protocol === 'http:')) {
        allowed.add(`${url.protocol}//${url.host}`.toLowerCase());
      }
    } catch {
      // Ignore invalid URLs
    }
  }
  return allowed;
}

export function isOriginAllowed(
  origin: string | undefined,
  lanIp: string,
  port: number,
  extraAllowedOrigins?: Set<string>
): boolean {
  // Missing or empty Origin header: accepted for non-browser clients (see docblock above).
  if (!origin || origin.trim() === '') {
    return true;
  }

  let normOrigin: string;
  try {
    const url = new URL(origin.trim());
    normOrigin = `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return false;
  }

  // 1. Built-in agent origins (HTTPS LAN IP, mDNS, loopback)
  const builtInOrigins = new Set<string>([
    `https://${lanIp}:${port}`.toLowerCase(),
    `https://aerokin.local:${port}`.toLowerCase(),
    `https://localhost:${port}`.toLowerCase(),
    `https://127.0.0.1:${port}`.toLowerCase(),
    `http://localhost:${port}`.toLowerCase(),
    `http://127.0.0.1:${port}`.toLowerCase(),
    // Standard dev server ports
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:4173',
  ]);

  if (builtInOrigins.has(normOrigin)) {
    return true;
  }

  // 2. Extra allowed origins from AEROKIN_ALLOWED_ORIGINS
  if (extraAllowedOrigins && extraAllowedOrigins.has(normOrigin)) {
    return true;
  }

  return false;
}
