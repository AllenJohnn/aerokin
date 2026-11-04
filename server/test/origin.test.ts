import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseAllowedOrigins, isOriginAllowed } from '../src/origin.js';

describe('Origin and CORS Security Policy', () => {
  describe('parseAllowedOrigins', () => {
    it('returns empty set if env var is undefined or empty', () => {
      expect(parseAllowedOrigins(undefined).size).toBe(0);
      expect(parseAllowedOrigins('').size).toBe(0);
      expect(parseAllowedOrigins('   ').size).toBe(0);
    });

    it('parses comma-separated HTTPS origins and normalizes them', () => {
      const input = 'https://aerokin.vercel.app, https://my-remote.app/,  https://sub.domain.com:8443  ';
      const parsed = parseAllowedOrigins(input);

      expect(parsed.has('https://aerokin.vercel.app')).toBe(true);
      expect(parsed.has('https://my-remote.app')).toBe(true);
      expect(parsed.has('https://sub.domain.com:8443')).toBe(true);
      expect(parsed.size).toBe(3);
    });

    it('ignores non-HTTPS remote origins for security', () => {
      const input = 'http://insecure-site.com, https://secure-site.com';
      const parsed = parseAllowedOrigins(input);

      expect(parsed.has('https://secure-site.com')).toBe(true);
      expect(parsed.has('http://insecure-site.com')).toBe(false);
      expect(parsed.size).toBe(1);
    });

    it('allows http only for localhost/127.0.0.1 in testing/dev', () => {
      const input = 'http://localhost:3000, http://127.0.0.1:8080';
      const parsed = parseAllowedOrigins(input);

      expect(parsed.has('http://localhost:3000')).toBe(true);
      expect(parsed.has('http://127.0.0.1:8080')).toBe(true);
      expect(parsed.size).toBe(2);
    });

    it('ignores malformed URLs without crashing', () => {
      const input = 'not-a-url, ://bad, https://valid.com';
      const parsed = parseAllowedOrigins(input);

      expect(parsed.has('https://valid.com')).toBe(true);
      expect(parsed.size).toBe(1);
    });
  });

  describe('isOriginAllowed', () => {
    const lanIp = '192.168.1.50';
    const port = 8443;
    const extraAllowed = new Set(['https://aerokin.vercel.app', 'https://remote.example.com']);

    it('accepts missing or empty Origin header for non-browser CLI/scripts', () => {
      expect(isOriginAllowed(undefined, lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed('', lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed('   ', lanIp, port, extraAllowed)).toBe(true);
    });

    it('accepts agent own origins (LAN IP HTTPS, aerokin.local, loopback)', () => {
      expect(isOriginAllowed(`https://${lanIp}:${port}`, lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed(`https://aerokin.local:${port}`, lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed(`https://localhost:${port}`, lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed(`https://127.0.0.1:${port}`, lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed(`http://localhost:${port}`, lanIp, port, extraAllowed)).toBe(true);
    });

    it('accepts local dev server origins', () => {
      expect(isOriginAllowed('http://localhost:5173', lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed('http://localhost:5174', lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed('http://localhost:4173', lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:5173', lanIp, port, extraAllowed)).toBe(true);
    });

    it('accepts extra allowed origins specified in AEROKIN_ALLOWED_ORIGINS', () => {
      expect(isOriginAllowed('https://aerokin.vercel.app', lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed('https://aerokin.vercel.app/', lanIp, port, extraAllowed)).toBe(true);
      expect(isOriginAllowed('https://remote.example.com', lanIp, port, extraAllowed)).toBe(true);
    });

    it('rejects disallowed arbitrary web origins (CSWSH protection)', () => {
      expect(isOriginAllowed('https://evil.com', lanIp, port, extraAllowed)).toBe(false);
      expect(isOriginAllowed('https://attacker.org', lanIp, port, extraAllowed)).toBe(false);
      expect(isOriginAllowed('http://insecure-aerokin.vercel.app', lanIp, port, extraAllowed)).toBe(false);
      expect(isOriginAllowed('https://not-aerokin.vercel.app', lanIp, port, extraAllowed)).toBe(false);
    });

    it('rejects malformed origin headers', () => {
      expect(isOriginAllowed('null', lanIp, port, extraAllowed)).toBe(false);
      expect(isOriginAllowed('javascript:void(0)', lanIp, port, extraAllowed)).toBe(false);
      expect(isOriginAllowed(':::invalid', lanIp, port, extraAllowed)).toBe(false);
    });
  });

  describe('Hosted URL format logic', () => {
    it('constructs correct hash fragment pairing URL with host and code', () => {
      const hostedBase = 'https://aerokin.vercel.app/';
      const cleanBase = hostedBase.trim().replace(/\/+$/, '');
      const lanIp = '192.168.1.100';
      const port = 8443;
      const token = '4EA378';

      const hostedPairUrl = `${cleanBase}/#host=${lanIp}:${port}&code=${token}`;
      expect(hostedPairUrl).toBe('https://aerokin.vercel.app/#host=192.168.1.100:8443&code=4EA378');
    });
  });
});
