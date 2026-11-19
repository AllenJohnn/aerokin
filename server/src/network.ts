import os from 'node:os';
import crypto from 'node:crypto';

/**
 * Normalizes an IP string by stripping whitespace and IPv4-mapped IPv6 prefix (::ffff:).
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
 * Validates whether an IP address belongs to standard private/local address spaces:
 * - IPv4: 127.0.0.0/8 (Loopback)
 * - IPv4: 10.0.0.0/8 (Class A private)
 * - IPv4: 172.16.0.0/12 (Class B private, including 172.20.10.x iPhone Personal Hotspot)
 * - IPv4: 192.168.0.0/16 (Class C private)
 * - IPv4: 169.254.0.0/16 (Link-Local)
 * - IPv6: ::1 (Loopback)
 * - IPv6: fc00::/7 (Unique Local Address)
 * - IPv6: fe80::/10 (Link-Local)
 *
 * Strictly rejects public IPs and invalid inputs.
 */
export function isPrivateIp(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const clean = normalizeIp(ip);

  // Standard loopback identifiers
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') {
    return true;
  }

  // IPv6 Unique Local Address (fc00::/7 -> fc.. or fd..)
  if (clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }

  // IPv6 Link-Local (fe80::/10 -> fe8.., fe9.., fea.., feb..)
  if (/^fe[89ab]/i.test(clean)) {
    return true;
  }

  // IPv4 parsing
  const ipv4Match = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const p0 = parseInt(ipv4Match[1], 10);
    const p1 = parseInt(ipv4Match[2], 10);
    const p2 = parseInt(ipv4Match[3], 10);
    const p3 = parseInt(ipv4Match[4], 10);

    if (p0 > 255 || p1 > 255 || p2 > 255 || p3 > 255) return false;

    // 127.0.0.0/8
    if (p0 === 127) return true;

    // 10.0.0.0/8
    if (p0 === 10) return true;

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255, covers 172.20.10.x Personal Hotspot)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

    // 192.168.0.0/16
    if (p0 === 192 && p1 === 168) return true;

    // 169.254.0.0/16
    if (p0 === 169 && p1 === 254) return true;

    return false;
  }

  return false;
}

/**
 * Returns a list of all current non-internal private IPv4 addresses
 * across all active network interfaces (Wi-Fi, Ethernet, Hotspot adapter, etc.).
 */
export function getAllPrivateIPv4s(): string[] {
  const interfaces = os.networkInterfaces();
  const ips = new Set<string>();

  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && isPrivateIp(addr.address)) {
        ips.add(addr.address);
      }
    }
  }

  return Array.from(ips);
}

/**
 * Detects the primary local IPv4 address of the host machine.
 * Prioritizes active Wi-Fi adapters and non-virtual physical interfaces.
 */
export function getLocalIPv4(): string {
  const interfaces = os.networkInterfaces();

  // 1. Prioritize active Wi-Fi / Wireless adapters
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const isWifi = /wi-?fi|wireless|wlan/i.test(name);
    if (isWifi) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal && isPrivateIp(addr.address)) {
          return addr.address;
        }
      }
    }
  }

  // 2. Fallback to physical Ethernet / LAN adapters, filtering out virtual & VPN adapters
  const virtualFilter =
    /virtual|vethernet|wsl|docker|tailscale|zerotier|vmware|vbox|hyper-v|loopback/i;
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs || virtualFilter.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && isPrivateIp(addr.address)) {
        return addr.address;
      }
    }
  }

  // 3. Fallback to any non-internal private IPv4
  const allPrivate = getAllPrivateIPv4s();
  if (allPrivate.length > 0) {
    return allPrivate[0];
  }

  return '127.0.0.1';
}

export interface NetworkAddressInfo {
  hostname: string;
  localHostname: string;
  mdnsHost: string;
  ips: string[];
  primaryPhoneUrl: string;
  ipUrls: string[];
}

/**
 * Computes network address representations for status, banner, tray, and QR codes.
 */
export function getNetworkAddresses(port = 8443, overrideHost?: string): NetworkAddressInfo {
  const host = overrideHost || os.hostname() || 'localhost';
  const cleanHost = host.trim();
  const lowerHost = cleanHost.toLowerCase();
  const ips = getAllPrivateIPv4s();
  const primaryIp = ips[0] || '127.0.0.1';

  const localHostname = lowerHost.endsWith('.local') ? lowerHost : `${lowerHost}.local`;
  const primaryPhoneUrl = `https://${localHostname}:${port}`;
  const ipUrls = ips.map((ip) => `https://${ip}:${port}`);

  return {
    hostname: cleanHost,
    localHostname,
    mdnsHost: 'aerokin.local',
    ips: ips.length > 0 ? ips : [primaryIp],
    primaryPhoneUrl,
    ipUrls: ipUrls.length > 0 ? ipUrls : [`https://${primaryIp}:${port}`],
  };
}

/**
 * Computes a stable fingerprint hash of active non-internal IPv4 interfaces.
 */
export function getNetworkFingerprint(): string {
  const interfaces = os.networkInterfaces();
  const entries: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        entries.push(`${name}:${addr.address}`);
      }
    }
  }

  entries.sort();
  return crypto.createHash('sha256').update(entries.join('|')).digest('hex');
}

/**
 * Polls network interfaces at a regular interval and invokes callback when changes occur.
 */
export function watchNetworkChanges(onChange: () => void, intervalMs = 4000): { stop: () => void } {
  let lastFingerprint = getNetworkFingerprint();
  const timer = setInterval(() => {
    try {
      const current = getNetworkFingerprint();
      if (current !== lastFingerprint) {
        lastFingerprint = current;
        onChange();
      }
    } catch {}
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
