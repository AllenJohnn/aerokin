import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isHostedMode,
  validateHost,
  consumeConnectionFragment,
  buildTrustUrl,
  STORAGE_HOST_KEY,
  STORAGE_TOKEN_KEY,
  getSavedPcs,
  savePc,
  getSavedPc,
  getActivePc,
  removeSavedPc,
  setActivePcId,
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

    setHostname('aerokin.vercel.app');
    expect(isHostedMode()).toBe(true);

    setHostname('192.168.1.100');
    expect(isHostedMode()).toBe(true);
  });

  it('returns false when VITE_HOSTED_MODE is "false" or unset', () => {
    (import.meta.env as any).VITE_HOSTED_MODE = 'false';
    expect(isHostedMode()).toBe(false);

    delete (import.meta.env as any).VITE_HOSTED_MODE;
    expect(isHostedMode()).toBe(false);
  });

  it('preserves agent-served mode on Tailscale 100.x IPs and custom hostnames', () => {
    // Agent-served production build sets VITE_HOSTED_MODE=false
    (import.meta.env as any).VITE_HOSTED_MODE = 'false';

    // Tailscale CGNAT 100.x IP range
    setHostname('100.64.0.1');
    expect(isHostedMode()).toBe(false);

    setHostname('100.115.92.14');
    expect(isHostedMode()).toBe(false);

    // Custom internal domain or work VPN hostname
    setHostname('desktop-pc.tailscale.net');
    expect(isHostedMode()).toBe(false);

    setHostname('workstation.corp.internal');
    expect(isHostedMode()).toBe(false);

    setHostname('my-custom-pc.local');
    expect(isHostedMode()).toBe(false);
  });
});

describe('buildTrustUrl', () => {
  it('builds http URL pointing to port 8080 from IPv4 without port', () => {
    expect(buildTrustUrl('192.168.1.50')).toBe('http://192.168.1.50:8080/');
  });

  it('strips existing agent port and replaces with trust port 8080', () => {
    expect(buildTrustUrl('192.168.1.50:8443')).toBe('http://192.168.1.50:8080/');
    expect(buildTrustUrl('10.0.0.12:9000')).toBe('http://10.0.0.12:8080/');
  });

  it('builds http URL from hostname with or without port', () => {
    expect(buildTrustUrl('aerokin.local')).toBe('http://aerokin.local:8080/');
    expect(buildTrustUrl('aerokin.local:8443')).toBe('http://aerokin.local:8080/');
    expect(buildTrustUrl('my-pc.tailscale.net:8443')).toBe('http://my-pc.tailscale.net:8080/');
  });

  it('supports custom trust port parameter', () => {
    expect(buildTrustUrl('192.168.1.50:8443', 8081)).toBe('http://192.168.1.50:8081/');
  });

  it('handles empty or blank host with localhost fallback', () => {
    expect(buildTrustUrl('')).toBe('http://localhost:8080/');
    expect(buildTrustUrl('   ')).toBe('http://localhost:8080/');
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

  it('parses pcId and signaling from query or hash', () => {
    (globalThis as any).window.location = {
      ...mockLocation,
      hash: '#pcId=pc_1234567890ab&signaling=wss://signaling.example.com&code=12345678',
      pathname: '/',
      search: '',
    };

    const result = consumeConnectionFragment();
    expect(result.pcId).toBe('pc_1234567890ab');
    expect(result.signalingUrl).toBe('wss://signaling.example.com');
    expect(result.code).toBe('12345678');
  });
});

describe('SavedPc Store', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('manages saving, retrieving, activating, and removing saved PCs', () => {
    expect(getSavedPcs()).toEqual([]);
    expect(getActivePc()).toBeNull();

    savePc({
      pcId: 'pc_home12345678',
      name: "Allen's Workstation",
      deviceId: 'dev_111',
      credential: 'secret_cred_1',
      lanHost: '192.168.1.55:8443',
      signalingUrl: 'wss://signal.aerokin.com',
      lastSeen: 1000,
      pairedVia: 'lan',
    });

    savePc({
      pcId: 'pc_office876543',
      name: "Office Studio",
      deviceId: 'dev_222',
      credential: 'secret_cred_2',
      signalingUrl: 'wss://signal.aerokin.com',
      lastSeen: 2000,
      pairedVia: 'remote',
    });

    const list = getSavedPcs();
    expect(list.length).toBe(2);
    expect(getActivePc()?.pcId).toBe('pc_office876543');

    // Switch active PC
    const switched = setActivePcId('pc_home12345678');
    expect(switched).toBe(true);
    expect(getActivePc()?.name).toBe("Allen's Workstation");

    // Remove PC
    removeSavedPc('pc_home12345678');
    expect(getSavedPcs().length).toBe(1);
    expect(getActivePc()?.pcId).toBe('pc_office876543');
  });
});
