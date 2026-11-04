import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isHostedMode,
  validateHost,
  consumeConnectionFragment,
  STORAGE_HOST_KEY,
  STORAGE_TOKEN_KEY,
} from '../src/utils/hosting';

// Simple in-memory localStorage mock for node environment
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

// Polyfill window & localStorage for tests
const mockLocation = {
  hostname: 'localhost',
  hash: '',
  pathname: '/',
  search: '',
};

const mockHistory = {
  replaceState: vi.fn(),
};

(globalThis as any).localStorage = localStorageMock;
(globalThis as any).window = {
  location: mockLocation,
  history: mockHistory,
};

describe('isHostedMode', () => {
  beforeEach(() => {
    (globalThis as any).window.location = { ...mockLocation };
    delete (import.meta.env as any).VITE_HOSTED_MODE;
  });

  const setHostname = (hostname: string) => {
    (globalThis as any).window.location.hostname = hostname;
  };

  it('returns true if VITE_HOSTED_MODE is "true" regardless of hostname', () => {
    (import.meta.env as any).VITE_HOSTED_MODE = 'true';
    setHostname('localhost');
    expect(isHostedMode()).toBe(true);
  });

  it('returns false for localhost and loopback IPs', () => {
    setHostname('localhost');
    expect(isHostedMode()).toBe(false);

    setHostname('127.0.0.1');
    expect(isHostedMode()).toBe(false);

    setHostname('::1');
    expect(isHostedMode()).toBe(false);
  });

  it('returns false for mDNS .local hostnames', () => {
    setHostname('aerokin.local');
    expect(isHostedMode()).toBe(false);

    setHostname('my-pc.local');
    expect(isHostedMode()).toBe(false);
  });

  it('returns false for RFC 1918 private LAN IP ranges', () => {
    setHostname('192.168.1.100');
    expect(isHostedMode()).toBe(false);

    setHostname('10.0.0.5');
    expect(isHostedMode()).toBe(false);

    setHostname('172.20.10.2');
    expect(isHostedMode()).toBe(false);

    setHostname('169.254.1.1');
    expect(isHostedMode()).toBe(false);
  });

  it('returns true for public hostnames and cloud hosting domains', () => {
    setHostname('aerokin.vercel.app');
    expect(isHostedMode()).toBe(true);

    setHostname('aerokin.netlify.app');
    expect(isHostedMode()).toBe(true);

    setHostname('app.aerokin.com');
    expect(isHostedMode()).toBe(true);

    setHostname('8.8.8.8');
    expect(isHostedMode()).toBe(true);
  });
});

describe('validateHost', () => {
  it('rejects non-strings and empty input', () => {
    expect(validateHost(null).valid).toBe(false);
    expect(validateHost('').valid).toBe(false);
    expect(validateHost('   ').valid).toBe(false);
  });

  it('rejects schemes (http://, https://, wss://)', () => {
    const res1 = validateHost('https://192.168.1.50:8443');
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain('Do not include http://');

    const res2 = validateHost('wss://aerokin.local:8443');
    expect(res2.valid).toBe(false);

    const res3 = validateHost('http://localhost');
    expect(res3.valid).toBe(false);
  });

  it('rejects slashes, paths, and queries', () => {
    const res = validateHost('192.168.1.50:8443/api');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Do not include slashes or paths');
  });

  it('rejects invalid port numbers', () => {
    expect(validateHost('192.168.1.50:0').valid).toBe(false);
    expect(validateHost('192.168.1.50:70000').valid).toBe(false);
    expect(validateHost('192.168.1.50:abc').valid).toBe(false);
  });

  it('accepts valid IPv4 address and defaults port to 8443', () => {
    const res = validateHost('192.168.1.50');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('192.168.1.50:8443');
  });

  it('accepts valid IPv4 with explicit port', () => {
    const res = validateHost('192.168.1.50:9000');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('192.168.1.50:9000');
  });

  it('accepts valid hostname (e.g. aerokin.local) with or without port', () => {
    const res1 = validateHost('aerokin.local');
    expect(res1.valid).toBe(true);
    expect(res1.normalized).toBe('aerokin.local:8443');

    const res2 = validateHost('aerokin.local:8443');
    expect(res2.valid).toBe(true);
    expect(res2.normalized).toBe('aerokin.local:8443');
  });

  it('rejects invalid octets in IPv4', () => {
    expect(validateHost('192.168.1.300').valid).toBe(false);
  });
});

describe('consumeConnectionFragment', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockHistory.replaceState.mockClear();
  });

  it('parses #host=...&code=... from location hash, saves to localStorage, and strips hash via replaceState', () => {
    (globalThis as any).window.location = {
      ...mockLocation,
      hash: '#host=192.168.1.50:8443&code=4ea378',
      pathname: '/',
      search: '',
    };

    const result = consumeConnectionFragment();
    expect(result.host).toBe('192.168.1.50:8443');
    expect(result.code).toBe('4EA378');

    expect(localStorageMock.getItem(STORAGE_HOST_KEY)).toBe('192.168.1.50:8443');
    expect(localStorageMock.getItem(STORAGE_TOKEN_KEY)).toBe('4EA378');

    expect(mockHistory.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('falls back to localStorage when hash is empty', () => {
    localStorageMock.setItem(STORAGE_HOST_KEY, '10.0.0.2:8443');
    localStorageMock.setItem(STORAGE_TOKEN_KEY, 'ABCDEF');

    (globalThis as any).window.location = {
      ...mockLocation,
      hash: '',
      pathname: '/',
      search: '',
    };

    const result = consumeConnectionFragment();
    expect(result.host).toBe('10.0.0.2:8443');
    expect(result.code).toBe('ABCDEF');
  });
});
