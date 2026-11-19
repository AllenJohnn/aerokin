/**
 * AEROKIN Loopback & Localhost Access Gate
 *
 * Ensures that administrative, pairing, log, and dashboard management endpoints
 * can ONLY be accessed by processes running on the local PC itself, never by other
 * devices on the local area network (LAN) or external internet.
 *
 * Enforces cross-site browser request protection (CSRF / CSWSH):
 * - Strict loopback socket IP validation (127.0.0.1, ::1)
 * - Restrictive Host header validation (localhost / 127.0.0.1 / [::1])
 * - Rejection of foreign Origin headers
 * - Mandatory custom header X-AeroKin-Local: 1
 */

import os from 'node:os';
import type { Request, Response, NextFunction } from 'express';

/**
 * Returns a cached Set of all IP addresses belonging to the host machine,
 * refreshed periodically or on demand.
 */
let cachedLocalIps: Set<string> | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10_000; // 10 seconds

export function getAllLocalIps(forceRefresh = false): Set<string> {
  const now = Date.now();
  if (cachedLocalIps && !forceRefresh && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedLocalIps;
  }

  const ips = new Set<string>();

  // Always include standard loopback identifiers
  ips.add('127.0.0.1');
  ips.add('::1');
  ips.add('localhost');
  ips.add('0.0.0.0');
  ips.add('::');

  try {
    const interfaces = os.networkInterfaces();
    for (const addrs of Object.values(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.address) {
          ips.add(addr.address.toLowerCase());
          // If IPv4, also include its IPv4-mapped IPv6 representation
          if (addr.family === 'IPv4') {
            ips.add(`::ffff:${addr.address.toLowerCase()}`);
          }
        }
      }
    }
  } catch {
    // Fallback gracefully
  }

  cachedLocalIps = ips;
  lastCacheTime = now;
  return ips;
}

/**
 * Normalizes an IP string by stripping leading whitespace and IPv4-mapped IPv6 prefix if present.
 */
export function normalizeIp(ip: string | undefined | null): string {
  if (!ip) return '';
  let clean = ip.trim().toLowerCase();
  if (clean.startsWith('::ffff:')) {
    clean = clean.slice(7);
  }
  return clean;
}

/**
 * Checks whether an IP address belongs to the local machine (loopback or host LAN interface).
 */
export function isLoopbackIp(remoteIp: string | undefined | null): boolean {
  if (!remoteIp) return false;

  const raw = remoteIp.trim().toLowerCase();
  const normalized = normalizeIp(raw);

  // Standard loopback checks
  if (
    raw === '127.0.0.1' ||
    raw === '::1' ||
    raw === '::ffff:127.0.0.1' ||
    raw === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost'
  ) {
    return true;
  }

  // Check against all active IP addresses on this PC
  const localIps = getAllLocalIps();
  return localIps.has(raw) || localIps.has(normalized);
}

/**
 * Returns true if the IP is strictly a loopback address (127.0.0.1, ::1, localhost).
 */
export function isStrictLoopbackIp(remoteIp: string | undefined | null): boolean {
  if (!remoteIp) return false;
  const raw = remoteIp.trim().toLowerCase();
  const normalized = normalizeIp(raw);
  return (
    raw === '127.0.0.1' ||
    raw === '::1' ||
    raw === '::ffff:127.0.0.1' ||
    raw === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost'
  );
}

/**
 * Verifies if an Express HTTP request originated from the local machine.
 */
export function isLoopbackRequest(req: Request): boolean {
  const socketIp = req.socket?.remoteAddress;
  return isLoopbackIp(socketIp);
}

export interface LocalControlVerification {
  ok: boolean;
  status: number;
  error: string;
}

/**
 * Verifies that a state-changing local control request is valid:
 * 1. Must originate from loopback IP (127.0.0.1, ::1, ::ffff:127.0.0.1).
 * 2. Host header must be localhost / 127.0.0.1 / [::1] / ::1 (with optional port).
 * 3. Any present Origin header must be from loopback (no cross-site browser requests).
 * 4. Must include custom header X-AeroKin-Local: 1.
 */
export function verifyLocalControl(req: Request): LocalControlVerification {
  const socketIp = req.socket?.remoteAddress;
  if (!isStrictLoopbackIp(socketIp)) {
    return { ok: false, status: 403, error: 'Forbidden: Loopback only' };
  }

  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i.test(host)) {
    return { ok: false, status: 403, error: 'Forbidden: Invalid Host header for local control' };
  }

  const origin = req.headers.origin;
  if (origin && origin.trim() !== '') {
    try {
      const parsed = new URL(origin.trim());
      const h = parsed.hostname.toLowerCase();
      if (h !== 'localhost' && h !== '127.0.0.1' && h !== '::1' && h !== '[::1]') {
        return { ok: false, status: 403, error: 'Forbidden: Cross-site request rejected' };
      }
    } catch {
      return { ok: false, status: 403, error: 'Forbidden: Malformed Origin header' };
    }
  }

  const localHeader = req.headers['x-aerokin-local'];
  if (localHeader !== '1') {
    return { ok: false, status: 403, error: 'Forbidden: Missing X-AeroKin-Local header' };
  }

  return { ok: true, status: 200, error: '' };
}

/**
 * Express middleware enforcing local control security invariants on state-changing endpoints.
 */
export function requireLocalControl(req: Request, res: Response, next: NextFunction): void {
  const check = verifyLocalControl(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }
  next();
}
