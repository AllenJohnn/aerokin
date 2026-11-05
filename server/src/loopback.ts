/**
 * AEROKIN Loopback & Localhost Access Gate
 *
 * Ensures that administrative, pairing, log, and dashboard management endpoints
 * can ONLY be accessed by processes running on the local PC itself, never by other
 * devices on the local area network (LAN) or external internet.
 *
 * Normalizes IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1, ::ffff:192.168.1.10)
 * and verifies against all network interfaces physically or logically bound to this PC.
 */

import os from 'node:os';
import type { Request } from 'express';

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
 * Verifies if an Express HTTP request originated from the local machine.
 */
export function isLoopbackRequest(req: Request): boolean {
  const socketIp = req.socket?.remoteAddress;
  return isLoopbackIp(socketIp);
}
