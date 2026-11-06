import os from 'node:os';

/**
 * Detects the local IPv4 address of the host machine.
 * Prioritizes the active Wi-Fi adapter and skips virtual / VPN adapters (Hyper-V, WSL, Tailscale, etc.).
 */
export function getLocalIPv4(): string {
  const interfaces = os.networkInterfaces();

  // 1. Prioritize active Wi-Fi / Wireless adapters
  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    const isWifi = /wi-?fi|wireless|wlan/i.test(name);
    if (isWifi) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
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
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }

  // 3. Fallback to any non-internal IPv4
  for (const [, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }

  return '127.0.0.1';
}
