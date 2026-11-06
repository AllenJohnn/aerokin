import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSavedPcs,
  savePc,
  getSavedPc,
  getActivePc,
  removeSavedPc,
  setActivePcId,
  consumeConnectionFragment,
  STORAGE_HOST_KEY,
  STORAGE_DEVICE_ID_KEY,
  STORAGE_CREDENTIAL_KEY,
  STORAGE_SIGNALING_KEY,
  STORAGE_ACTIVE_PC_KEY,
  SavedPc,
} from '../src/utils/hosting';

describe('Multi-PC Switcher Subsystem & SavedPc Lifecycle', () => {
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

  it('manages multiple saved PCs and switches active PC state cleanly', () => {
    // 1. Initial state: No PCs saved
    expect(getSavedPcs()).toEqual([]);
    expect(getActivePc()).toBeNull();

    // 2. Pair first PC (Home Desktop)
    const homePc: SavedPc = {
      pcId: 'pc_home001',
      name: "Allen's Desktop (RTX 4060)",
      deviceId: 'dev_iphone_01',
      credential: 'cred_secret_alpha',
      lanHost: '192.168.1.100:8443',
      lastSeen: 1000,
      pairedVia: 'lan',
    };
    savePc(homePc);

    expect(getSavedPcs().length).toBe(1);
    expect(getActivePc()?.name).toBe("Allen's Desktop (RTX 4060)");
    expect(mockStorage[STORAGE_HOST_KEY]).toBe('192.168.1.100:8443');
    expect(mockStorage[STORAGE_DEVICE_ID_KEY]).toBe('dev_iphone_01');
    expect(mockStorage[STORAGE_CREDENTIAL_KEY]).toBe('cred_secret_alpha');

    // 3. Pair second PC (Office Laptop via Remote WebRTC)
    const officePc: SavedPc = {
      pcId: 'pc_office002',
      name: 'Office Studio Laptop',
      deviceId: 'dev_iphone_02',
      credential: 'cred_secret_beta',
      signalingUrl: 'wss://turn.aerokin.com:443',
      lastSeen: 2000,
      pairedVia: 'remote',
    };
    savePc(officePc);

    expect(getSavedPcs().length).toBe(2);
    // Newly saved PC becomes the active PC
    expect(getActivePc()?.name).toBe('Office Studio Laptop');
    expect(mockStorage[STORAGE_SIGNALING_KEY]).toBe('wss://turn.aerokin.com:443');
    expect(mockStorage[STORAGE_DEVICE_ID_KEY]).toBe('dev_iphone_02');

    // 4. Switch back to Home Desktop
    const switched = setActivePcId('pc_home001');
    expect(switched).toBe(true);
    expect(getActivePc()?.pcId).toBe('pc_home001');
    expect(mockStorage[STORAGE_HOST_KEY]).toBe('192.168.1.100:8443');
    expect(mockStorage[STORAGE_DEVICE_ID_KEY]).toBe('dev_iphone_01');
    expect(mockStorage[STORAGE_CREDENTIAL_KEY]).toBe('cred_secret_alpha');

    // 5. Delete Office Laptop ("Forget Computer")
    removeSavedPc('pc_office002');
    expect(getSavedPcs().length).toBe(1);
    expect(getSavedPc('pc_office002')).toBeNull();
    // Home Desktop remains active
    expect(getActivePc()?.pcId).toBe('pc_home001');

    // 6. Delete Home Desktop
    removeSavedPc('pc_home001');
    expect(getSavedPcs().length).toBe(0);
    expect(getActivePc()).toBeNull();
    expect(mockStorage[STORAGE_ACTIVE_PC_KEY]).toBeUndefined();
    expect(mockStorage[STORAGE_DEVICE_ID_KEY]).toBeUndefined();
  });

  it('handles remote aerokin://pair payload and saves PC identity', () => {
    (globalThis as any).window.location = {
      hash: '#pcId=pc_deepmind99&signaling=wss://turn.aerokin.com&code=98765432',
      pathname: '/',
      search: '',
    };

    const parsed = consumeConnectionFragment();
    expect(parsed.pcId).toBe('pc_deepmind99');
    expect(parsed.signalingUrl).toBe('wss://turn.aerokin.com');
    expect(parsed.code).toBe('98765432');

    savePc({
      pcId: parsed.pcId!,
      name: 'Cloud Machine',
      deviceId: 'dev_phone_99',
      credential: 'secret_cloud_token',
      signalingUrl: parsed.signalingUrl,
      lastSeen: Date.now(),
      pairedVia: 'remote',
    });

    const pc = getSavedPc('pc_deepmind99');
    expect(pc).toBeDefined();
    expect(pc?.pairedVia).toBe('remote');
    expect(pc?.signalingUrl).toBe('wss://turn.aerokin.com');
  });
});
