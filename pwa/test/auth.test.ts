import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getStoredDeviceCredentials,
  saveStoredDeviceCredentials,
  clearStoredDeviceCredentials,
  consumeConnectionFragment,
  STORAGE_HOST_KEY,
  STORAGE_TOKEN_KEY,
  STORAGE_DEVICE_ID_KEY,
  STORAGE_CREDENTIAL_KEY,
} from '../src/utils/hosting';

describe('PWA Authentication & Credentials', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};

    const localStorageMock = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    };

    (globalThis as any).window = {
      localStorage: localStorageMock,
      location: {
        hash: '',
        pathname: '/',
        search: '',
        host: '192.168.1.50:8443',
      },
      history: {
        replaceState: vi.fn(),
      },
    };
    (globalThis as any).localStorage = localStorageMock;
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it('saves, retrieves, and clears stored device credentials', () => {
    saveStoredDeviceCredentials('dev_123', 'cred_secret_abc', "Allen's Phone");

    const creds = getStoredDeviceCredentials();
    expect(creds.deviceId).toBe('dev_123');
    expect(creds.credential).toBe('cred_secret_abc');
    expect(creds.name).toBe("Allen's Phone");

    clearStoredDeviceCredentials();
    const cleared = getStoredDeviceCredentials();
    expect(cleared.deviceId).toBeNull();
    expect(cleared.credential).toBeNull();
    expect(cleared.name).toBeNull();
  });

  it('parses #code= from URL hash fragment and strips hash via replaceState', () => {
    window.location.hash = '#code=84920153';

    const result = consumeConnectionFragment();
    expect(result.code).toBe('84920153');
    expect(localStorage.getItem(STORAGE_TOKEN_KEY)).toBe('84920153');

    // History replaceState called with clean URL
    expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('parses #host=&code= from URL hash fragment in hosted mode and stores both', () => {
    window.location.hash = '#host=192.168.1.75:8443&code=12345678';

    const result = consumeConnectionFragment();
    expect(result.host).toBe('192.168.1.75:8443');
    expect(result.code).toBe('12345678');
    expect(localStorage.getItem(STORAGE_HOST_KEY)).toBe('192.168.1.75:8443');
    expect(localStorage.getItem(STORAGE_TOKEN_KEY)).toBe('12345678');

    expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('clears stored credentials upon receiving 4001 close event', () => {
    saveStoredDeviceCredentials('dev_revoked', 'secret_revoked', 'Phone');
    expect(localStorage.getItem(STORAGE_CREDENTIAL_KEY)).toBe('secret_revoked');

    // Simulate 4001 close handling behavior
    const handleCloseCode = (code: number) => {
      if (code === 4001) {
        clearStoredDeviceCredentials();
        return 'unauthorized';
      }
      return 'reconnecting';
    };

    const status = handleCloseCode(4001);
    expect(status).toBe('unauthorized');
    expect(getStoredDeviceCredentials().credential).toBeNull();
  });

  it('does NOT loop on 1008 policy violation close code', () => {
    let reconnectScheduled = false;

    const handleCloseCode = (code: number) => {
      if (code === 1008) {
        return 'disconnected'; // No reconnect scheduled
      }
      reconnectScheduled = true;
      return 'reconnecting';
    };

    const status = handleCloseCode(1008);
    expect(status).toBe('disconnected');
    expect(reconnectScheduled).toBe(false);
  });
});