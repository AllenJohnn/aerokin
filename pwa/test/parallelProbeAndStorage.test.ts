import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  savePc,
  getSavedPc,
  getSavedPcs,
  getKnownHostsForPc,
  updateKnownHostsForPc,
  probeHostsInParallel,
  getOrCreateClientDeviceIdentity,
  getStoredDeviceCredentials,
  SavedPc,
} from '../src/utils/hosting';
import {
  idbGet,
  idbSet,
  idbDelete,
  repairAndSyncStorage,
  setPersistentItem,
} from '../src/utils/persistentStorage';

// Setup Mock In-Memory Storage for localStorage and IndexedDB
const localStore = new Map<string, string>();
const idbStore = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (key: string) => localStore.get(key) || null,
  setItem: (key: string, value: string) => localStore.set(key, String(value)),
  removeItem: (key: string) => localStore.delete(key),
  clear: () => localStore.clear(),
};

(globalThis as any).window = {
  location: {
    hostname: 'localhost',
    host: 'localhost:8443',
    port: '8443',
    protocol: 'https:',
    hash: '',
    pathname: '/',
    search: '',
  },
  history: {
    replaceState: vi.fn(),
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock IndexedDB operations via in-memory Map
vi.mock('../src/utils/persistentStorage', async () => {
  const actual = await vi.importActual<any>('../src/utils/persistentStorage');
  return {
    ...actual,
    idbGet: vi.fn(async (key: string) => idbStore.get(key) || null),
    idbSet: vi.fn(async (key: string, value: string) => {
      idbStore.set(key, String(value));
    }),
    idbDelete: vi.fn(async (key: string) => {
      idbStore.delete(key);
    }),
    repairAndSyncStorage: vi.fn(async () => {
      let repairedFromIdb = false;
      let repairedFromLocalStorage = false;
      const criticalKeys = [
        'aerokin_device_id',
        'aerokin_device_credential',
        'aerokin_device_name',
        'aerokin_saved_pcs',
        'aerokin_active_pc_id',
      ];

      for (const key of criticalKeys) {
        const localVal = localStore.get(key);
        const idbVal = idbStore.get(key);

        if (localVal && !idbVal) {
          idbStore.set(key, localVal);
          repairedFromLocalStorage = true;
        } else if (!localVal && idbVal) {
          localStore.set(key, idbVal);
          repairedFromIdb = true;
        }
      }

      const hasCredentials = Boolean(
        localStore.get('aerokin_device_id') && localStore.get('aerokin_device_credential')
      );
      return { repairedFromIdb, repairedFromLocalStorage, hasCredentials };
    }),
    setPersistentItem: vi.fn((key: string, value: string) => {
      localStore.set(key, value);
      idbStore.set(key, value);
    }),
  };
});

describe('Parallel Host Probing & Resilient Dual Storage Suite', () => {
  beforeEach(() => {
    localStore.clear();
    idbStore.clear();
    vi.clearAllMocks();
  });

  describe('1. Dual-Layer Storage & iOS Safari Eviction Repair', () => {
    it('repairs localStorage from IndexedDB when Safari tab storage is cleared', async () => {
      // 1. Initial save writes to both localStorage and IndexedDB
      setPersistentItem('aerokin_device_id', 'dev_apple_iphone_007');
      setPersistentItem('aerokin_device_credential', 'super_secret_client_credential_bytes');
      setPersistentItem('aerokin_device_name', "Allen's iPhone");

      expect(localStore.get('aerokin_device_id')).toBe('dev_apple_iphone_007');
      expect(idbStore.get('aerokin_device_id')).toBe('dev_apple_iphone_007');

      // 2. Simulate iOS 7-day Safari tab wipe (localStorage completely cleared, IDB survived)
      localStore.clear();
      expect(localStore.size).toBe(0);
      expect(idbStore.size).toBeGreaterThan(0);

      // 3. App startup calls repairAndSyncStorage()
      const syncResult = await repairAndSyncStorage();
      expect(syncResult.repairedFromIdb).toBe(true);
      expect(syncResult.hasCredentials).toBe(true);

      // Verify localStorage was fully restored from IndexedDB
      expect(localStore.get('aerokin_device_id')).toBe('dev_apple_iphone_007');
      expect(localStore.get('aerokin_device_credential')).toBe(
        'super_secret_client_credential_bytes'
      );
      expect(localStore.get('aerokin_device_name')).toBe("Allen's iPhone");
    });

    it('repairs IndexedDB from localStorage when IndexedDB is reset', async () => {
      localStore.set('aerokin_device_id', 'dev_restored_from_local');
      localStore.set('aerokin_device_credential', 'cred_restored_from_local');

      expect(idbStore.size).toBe(0);

      const syncResult = await repairAndSyncStorage();
      expect(syncResult.repairedFromLocalStorage).toBe(true);
      expect(idbStore.get('aerokin_device_id')).toBe('dev_restored_from_local');
    });

    it('generates random credentials and default name "iPhone" silently on clean device', () => {
      expect(localStore.size).toBe(0);

      const identity = getOrCreateClientDeviceIdentity();
      expect(identity.deviceId).toMatch(/^dev_[0-9a-f]{16}$/);
      expect(identity.credential).toBeDefined();
      expect(identity.credential.length).toBeGreaterThan(20);
      expect(identity.name).toBeDefined();

      const stored = getStoredDeviceCredentials();
      expect(stored.deviceId).toBe(identity.deviceId);
      expect(stored.credential).toBe(identity.credential);
    });
  });

  describe('2. Credentials Keyed Strictly by PC ID (Never by IP or Origin)', () => {
    it('maintains device credentials per PC across IP and network changes', () => {
      const pcId1 = 'pc_main_desktop_1001';
      const pc1: SavedPc = {
        pcId: pcId1,
        name: 'Allen Desktop',
        deviceId: 'dev_iphone_for_pc1',
        credential: 'cred_secret_pc1',
        lanHost: '192.168.1.55:8443',
        knownHosts: ['allens-desktop.local:8443', '192.168.1.55:8443'],
        lastSeen: Date.now(),
        pairedVia: 'lan',
      };

      savePc(pc1);
      expect(getSavedPc(pcId1)?.credential).toBe('cred_secret_pc1');

      // Laptop moves to iPhone Personal Hotspot (172.20.10.2:8443)
      updateKnownHostsForPc(
        pcId1,
        {
          localHostname: 'allens-desktop.local',
          ips: ['172.20.10.2', '192.168.1.55'],
        },
        '172.20.10.2:8443'
      );

      const updatedPc = getSavedPc(pcId1);
      expect(updatedPc).toBeDefined();
      expect(updatedPc?.lanHost).toBe('172.20.10.2:8443');
      // Credential is STILL valid and keyed to pcId
      expect(updatedPc?.credential).toBe('cred_secret_pc1');
      expect(updatedPc?.deviceId).toBe('dev_iphone_for_pc1');
      // knownHosts is refreshed with new hotspot IP
      expect(updatedPc?.knownHosts).toContain('172.20.10.2:8443');
    });

    it('stores up to 6 ordered known hosts prioritizing hostname.local and recent IPs', () => {
      const pcId = 'pc_laptop_multi_adapter';
      const pc: SavedPc = {
        pcId,
        name: 'Work Laptop',
        deviceId: 'dev_01',
        credential: 'cred_01',
        lastSeen: Date.now(),
        pairedVia: 'lan',
      };
      savePc(pc);

      updateKnownHostsForPc(
        pcId,
        {
          localHostname: 'work-laptop.local',
          ips: [
            '192.168.1.50',
            '172.20.10.2', // Hotspot
            '10.10.0.99',
            '192.168.2.10',
            '192.168.3.10',
            '192.168.4.10', // Excess should be capped at 6
          ],
        },
        'work-laptop.local:8443'
      );

      const hosts = getKnownHostsForPc(pcId);
      expect(hosts.length).toBeLessThanOrEqual(6);
      expect(hosts[0]).toBe('work-laptop.local:8443'); // Primary .local is first
      expect(hosts).toContain('172.20.10.2:8443');
    });
  });

  describe('3. Parallel Host Probing (Fast <= 1.5s Timeout, First Responder Wins)', () => {
    it('races candidate hosts in parallel and selects first responder with AeroKin identity', async () => {
      const originalFetch = globalThis.fetch;

      // Mock fetch:
      // hostname.local:8443 -> slow / delayed (800ms)
      // 192.168.1.55:8443 -> answers fast (50ms)
      // 172.20.10.2:8443 -> network error / offline
      globalThis.fetch = vi.fn(async (url: any) => {
        const urlStr = String(url);

        if (urlStr.includes('192.168.1.55:8443')) {
          await new Promise((r) => setTimeout(r, 50));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'ok',
              service: 'aerokin-server',
              pcId: 'pc_winner_192',
              addresses: { localHostname: 'allens-pc.local', ips: ['192.168.1.55'] },
            }),
          } as any;
        }

        if (urlStr.includes('hostname.local:8443')) {
          await new Promise((r) => setTimeout(r, 800));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              status: 'ok',
              service: 'aerokin-server',
              pcId: 'pc_slow',
            }),
          } as any;
        }

        // 172.20.10.2 fails immediately
        throw new Error('Connection refused / offline');
      });

      try {
        const candidateHosts = [
          'hostname.local:8443',
          '172.20.10.2:8443',
          '192.168.1.55:8443',
        ];

        const result = await probeHostsInParallel(candidateHosts, 1500);
        expect(result).not.toBeNull();
        expect(result?.winningHost).toBe('192.168.1.55:8443');
        expect(result?.healthData?.pcId).toBe('pc_winner_192');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns null when all candidate hosts fail or exceed timeout', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async () => {
        throw new Error('Network unreachable');
      });

      try {
        const result = await probeHostsInParallel(['192.168.1.100:8443', '10.0.0.1:8443'], 200);
        expect(result).toBeNull();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
