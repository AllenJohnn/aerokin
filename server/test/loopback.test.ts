import { describe, it, expect } from 'vitest';
import os from 'node:os';
import { isLoopbackIp, isLoopbackRequest, normalizeIp, getAllLocalIps } from '../src/loopback.js';

describe('Loopback Detection Gate', () => {
  it('normalizes IPv4-mapped IPv6 addresses', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::ffff:192.168.1.10')).toBe('192.168.1.10');
    expect(normalizeIp('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::1')).toBe('::1');
    expect(normalizeIp(null)).toBe('');
  });

  it('allows standard loopback addresses (127.0.0.1, ::1, ::ffff:127.0.0.1, localhost)', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackIp('localhost')).toBe(true);
  });

  it('allows all local network interface addresses of the host PC', () => {
    const interfaces = os.networkInterfaces();
    let testedCount = 0;

    for (const addrs of Object.values(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.address) {
          expect(isLoopbackIp(addr.address)).toBe(true);
          testedCount++;

          if (addr.family === 'IPv4') {
            expect(isLoopbackIp(`::ffff:${addr.address}`)).toBe(true);
          }
        }
      }
    }

    expect(testedCount).toBeGreaterThan(0);
  });

  it('denies addresses from different devices on the LAN or Internet', () => {
    const hostIps = getAllLocalIps();

    // Candidate addresses guaranteed not to be this machine's own IP
    const foreignIps = [
      '192.168.254.253',
      '10.254.254.254',
      '172.31.254.254',
      '8.8.8.8',
      '1.1.1.1',
      '::ffff:192.168.254.253',
    ];

    for (const ip of foreignIps) {
      const normalized = normalizeIp(ip);
      if (!hostIps.has(ip) && !hostIps.has(normalized)) {
        expect(isLoopbackIp(ip)).toBe(false);
      }
    }
  });

  it('denies null, undefined, or empty IP strings', () => {
    expect(isLoopbackIp('')).toBe(false);
    expect(isLoopbackIp(null)).toBe(false);
    expect(isLoopbackIp(undefined)).toBe(false);
  });

  it('verifies Express Request objects via socket.remoteAddress', () => {
    const mockLoopbackReq = {
      socket: { remoteAddress: '127.0.0.1' },
    } as any;
    expect(isLoopbackRequest(mockLoopbackReq)).toBe(true);

    const mockForeignReq = {
      socket: { remoteAddress: '192.168.254.253' },
    } as any;
    expect(isLoopbackRequest(mockForeignReq)).toBe(false);
  });
});
