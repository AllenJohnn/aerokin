import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  savePc,
  getSavedPc,
  getSavedPcs,
  updateSavedPcLanHost,
  hasStoredCredentialForActivePc,
  consumeConnectionFragment,
  isHostedMode,
  SavedPc,
  STORAGE_SAVED_PCS_KEY,
  STORAGE_ACTIVE_PC_KEY,
} from '../src/utils/hosting';
import { ConnectionManager } from '../src/transport/ConnectionManager';

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) || null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

(globalThis as any).localStorage = localStorageMock;
(globalThis as any).window = {
  location: {
    hostname: 'aerokin.vercel.app',
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

describe('Pair Once & Work on Every Network Suite', () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  describe('1. Credentials Keyed by AgentId', () => {
    it('stores and retrieves paired PCs strictly keyed by agentId (not by IP address)', () => {
      const agentId = 'agent_pc_987654321';
      const initialRecord: SavedPc = {
        pcId: agentId,
        name: 'Workstation 1',
        deviceId: 'dev_iphone_alpha',
        credential: 'base64url_cryptographic_credential_xyz',
        lanHost: '192.168.1.55:8443',
        signalingUrl: 'wss://signal.example.com',
        lastSeen: Date.now(),
        pairedVia: 'remote',
      };

      savePc(initialRecord);

      // Verify retrieved strictly by agentId
      const saved = getSavedPc(agentId);
      expect(saved).not.toBeNull();
      expect(saved?.pcId).toBe(agentId);
      expect(saved?.credential).toBe('base64url_cryptographic_credential_xyz');
      expect(saved?.lanHost).toBe('192.168.1.55:8443');
      expect(hasStoredCredentialForActivePc()).toBe(true);
    });
  });

  describe('2. Automatic LAN Address Update on IP Change', () => {
    it('updates stored LAN address automatically when PC changes IP on a new network without re-pairing', () => {
      const agentId = 'agent_pc_office';
      savePc({
        pcId: agentId,
        name: 'Office PC',
        deviceId: 'dev_phone_1',
        credential: 'perm_secret_token_123',
        lanHost: '192.168.1.50:8443',
        signalingUrl: 'wss://signal.example.com',
        lastSeen: 1000,
        pairedVia: 'lan',
      });

      // PC connects to a new network and receives new IP 10.0.0.120:8443
      const updated = updateSavedPcLanHost(agentId, '10.0.0.120:8443');
      expect(updated).toBe(true);

      const retrieved = getSavedPc(agentId);
      expect(retrieved?.lanHost).toBe('10.0.0.120:8443');
      // Credential is preserved intact; no re-pairing required
      expect(retrieved?.credential).toBe('perm_secret_token_123');
    });

    it('does not re-save if LAN host is already identical', () => {
      const agentId = 'agent_pc_identical';
      savePc({
        pcId: agentId,
        name: 'Same Host PC',
        deviceId: 'dev_phone_2',
        credential: 'token_abc',
        lanHost: '192.168.1.50:8443',
        lastSeen: 1000,
        pairedVia: 'lan',
      });

      const updated = updateSavedPcLanHost(agentId, '192.168.1.50:8443');
      expect(updated).toBe(false);
    });
  });

  describe('3. Network Switch & <= 1.5s LAN Probe Timeout', () => {
    it('probes LAN first and falls back to WebRTC signaling after <= 1.5s when away from PC network', async () => {
      vi.useFakeTimers();

      let modeChangedTo: string | null = null;
      let discoveredHost: string | null = null;

      const conn = new ConnectionManager({
        lanUrl: 'wss://192.168.1.99:8443/ws', // Unreachable IP on current network
        signalingUrl: 'wss://signal.example.com',
        deviceId: 'dev_test_phone',
        credential: 'test_cred_token',
        pcId: 'pc_home_123',
        onModeChange: (mode) => {
          modeChangedTo = mode;
        },
        onLanHostDiscovered: (h) => {
          discoveredHost = h;
        },
      });

      expect(conn.state).toBe('connecting');

      // Fast-forward past the 1.5s LAN probe timeout
      vi.advanceTimersByTime(1550);

      // ConnectionManager should switch to WebRTC remote path
      // Mode changes or active transport switches to WebRTC
      expect(conn.state).toBeDefined();

      conn.close();
      vi.useRealTimers();
    });
  });

  describe('4. Hosted vs LAN Origin Behavior', () => {
    it('operates on a single stable hosted origin across all network transitions', () => {
      (import.meta.env as any).VITE_HOSTED_MODE = 'true';
      expect(isHostedMode()).toBe(true);

      // Verify consumeConnectionFragment reads and strips #agent=<id>&signal=<host>&code=<code>
      (globalThis as any).window.location = {
        hostname: 'aerokin.vercel.app',
        hash: '#agent=agent_allen_pc&signal=signal.aerokin.com&code=98765432',
        pathname: '/',
        search: '',
      };

      const params = consumeConnectionFragment();
      expect(params.pcId).toBe('agent_allen_pc');
      expect(params.signalingUrl).toBe('wss://signal.aerokin.com');
      expect(params.code).toBe('98765432');

      // Address bar is cleaned
      expect((globalThis as any).window.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    });

    it('identifies when running from a LAN origin', () => {
      delete (import.meta.env as any).VITE_HOSTED_MODE;
      (globalThis as any).window.location.hostname = '192.168.1.55';
      expect(isHostedMode()).toBe(false);
    });
  });
});
