import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../src/server.js';
import { DeviceStore } from '../src/device-store.js';
import { PairingManager } from '../src/pairing-manager.js';
import { isPrivateIp } from '../src/network.js';

describe('AeroKin Trusted-Network Mode Suite (RFC 1918, Hotspot & Frictionless Auto-Connect)', () => {
  let tempDir: string;
  let serverInstance: ReturnType<typeof startServer>;
  let deviceStore: DeviceStore;
  let pairingManager: PairingManager;
  let app: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-trusted-test-'));
    deviceStore = new DeviceStore(tempDir);
    pairingManager = new PairingManager();

    serverInstance = startServer({
      port: 0,
      lanIp: '192.168.1.55',
      publicDir: tempDir,
      certsDir: tempDir,
      deviceStore,
      pairingManager,
      allowedOrigins: new Set(['*']),
    });

    const listeners = serverInstance.httpsServer.listeners('request');
    app = listeners[0];
  });

  afterEach(() => {
    serverInstance.httpsServer.close();
    serverInstance.wss.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function mockRequest(
    method: string,
    url: string,
    remoteAddress: string,
    body?: any,
    customHeaders?: Record<string, string>
  ): Promise<{ status: number; headers: Record<string, any>; body: any }> {
    return new Promise((resolve) => {
      const { Readable } = require('node:stream');
      const bodyStr = body ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        host: '127.0.0.1',
        'x-aerokin-local': '1',
        ...customHeaders,
      };
      if (body) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(bodyStr).toString();
      }

      const req: any = Readable.from(bodyStr ? [Buffer.from(bodyStr)] : []);
      req.method = method;
      req.url = url;
      req.headers = headers;
      req.socket = { remoteAddress };

      const { EventEmitter } = require('node:events');
      const res: any = new EventEmitter();
      res.statusCode = 200;
      res.headers = {};
      let responseText = '';
      let isDone = false;

      function finish(status: number) {
        if (isDone) return;
        isDone = true;
        let parsed: any = null;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = responseText;
        }
        resolve({ status, headers: res.headers, body: parsed });
      }

      res.setHeader = (k: string, v: string) => {
        res.headers[k.toLowerCase()] = v;
      };
      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };
      res.sendStatus = (code: number) => {
        res.statusCode = code;
        finish(code);
      };
      res.json = (data: any) => {
        responseText = JSON.stringify(data);
        finish(res.statusCode);
      };
      res.send = (data: any) => {
        responseText = typeof data === 'string' ? data : JSON.stringify(data);
        finish(res.statusCode);
      };
      res.end = (chunk?: any) => {
        if (chunk) responseText += chunk.toString();
        finish(res.statusCode);
      };

      app(req, res);
    });
  }

  it('verifies RFC 1918, iPhone Hotspot (172.20.10.x), and Link-Local private IP classification', () => {
    // Loopback
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);

    // 10.0.0.0/8
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('10.255.255.254')).toBe(true);

    // 172.16.0.0/12 (Crucial for iOS Personal Hotspot which uses 172.20.10.0/28)
    expect(isPrivateIp('172.20.10.1')).toBe(true); // iPhone gateway
    expect(isPrivateIp('172.20.10.2')).toBe(true); // Windows laptop client
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.254')).toBe(true);

    // 192.168.0.0/16 (Standard home Wi-Fi)
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('192.168.0.100')).toBe(true);

    // 169.254.0.0/16 (Link-Local)
    expect(isPrivateIp('169.254.1.5')).toBe(true);

    // IPv6 Private & Link-Local
    expect(isPrivateIp('fe80::1ff:fe00:1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);

    // Public IPs must NEVER be classified as private
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('203.0.113.195')).toBe(false);
    expect(isPrivateIp('172.32.0.1')).toBe(false);
  });

  it('auto-registers and pairs device connecting from private IPs (including 172.20.10.x) with no code', async () => {
    expect(deviceStore.isTrustedNetworkMode()).toBe(true);

    // 1. Connection from iPhone Personal Hotspot (172.20.10.2)
    const hotspotRes = await mockRequest('POST', '/api/pair', '172.20.10.2', {
      clientDeviceId: 'dev_iphone_hotspot_001',
      clientCredential: 'cred_random_secret_hotspot_val',
      name: "Allen's iPhone",
      platform: 'iOS',
    });

    expect(hotspotRes.status).toBe(200);
    expect(hotspotRes.body.ok).toBe(true);
    expect(hotspotRes.body.deviceId).toBe('dev_iphone_hotspot_001');
    expect(hotspotRes.body.pcId).toBe(deviceStore.getPcId());

    // Verify device is stored in deviceStore
    const stored = deviceStore.getDevice('dev_iphone_hotspot_001');
    expect(stored).toBeDefined();
    expect(stored?.name).toBe("Allen's iPhone");
    expect(stored?.platform).toBe('iOS');
    expect(deviceStore.verifyCredential('dev_iphone_hotspot_001', 'cred_random_secret_hotspot_val')).toBe(true);

    // 2. Connection from standard Home Wi-Fi (192.168.1.120)
    const wifiRes = await mockRequest('POST', '/api/pair', '192.168.1.120', {
      name: 'iPad Pro',
      platform: 'iOS',
    });

    expect(wifiRes.status).toBe(200);
    expect(wifiRes.body.ok).toBe(true);
    expect(wifiRes.body.deviceId).toMatch(/^dev_/);
    expect(wifiRes.body.credential).toBeDefined();
    expect(deviceStore.verifyCredential(wifiRes.body.deviceId, wifiRes.body.credential)).toBe(true);
  });

  it('strictly rejects auto-registration from public IPs with 403 Forbidden', async () => {
    const publicIps = ['8.8.8.8', '1.1.1.1', '203.0.113.50'];

    for (const ip of publicIps) {
      const res = await mockRequest('POST', '/api/pair', ip, {
        clientDeviceId: 'dev_malicious_remote',
        clientCredential: 'fake_credential',
        name: 'Attacker Machine',
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    }

    expect(deviceStore.getDevice('dev_malicious_remote')).toBeNull();
  });

  it('replaces older device record when client re-registers with same device name (no duplicates)', async () => {
    // Initial pairing
    const firstReg = await mockRequest('POST', '/api/pair', '192.168.1.50', {
      clientDeviceId: 'dev_phone_v1',
      clientCredential: 'cred_v1',
      name: "Allen's iPhone",
      platform: 'iOS',
    });
    expect(firstReg.status).toBe(200);

    const initialList = deviceStore.listDevices();
    const phoneRecordsInitial = initialList.filter((d) => d.name === "Allen's iPhone");
    expect(phoneRecordsInitial).toHaveLength(1);
    expect(phoneRecordsInitial[0].deviceId).toBe('dev_phone_v1');

    // Storage cleared or new random credential generated on phone with same name
    const secondReg = await mockRequest('POST', '/api/pair', '192.168.1.50', {
      clientDeviceId: 'dev_phone_v2_new_id',
      clientCredential: 'cred_v2_fresh_secret',
      name: "Allen's iPhone",
      platform: 'iOS',
    });
    expect(secondReg.status).toBe(200);

    const updatedList = deviceStore.listDevices();
    const phoneRecordsUpdated = updatedList.filter((d) => d.name === "Allen's iPhone");
    // Crucial requirement: replaces older record instead of creating duplicates
    expect(phoneRecordsUpdated).toHaveLength(1);
    expect(phoneRecordsUpdated[0].deviceId).toBe('dev_phone_v2_new_id');

    // Old credential revoked, new credential active
    expect(deviceStore.verifyCredential('dev_phone_v1', 'cred_v1')).toBe(false);
    expect(deviceStore.verifyCredential('dev_phone_v2_new_id', 'cred_v2_fresh_secret')).toBe(true);
  });

  it('restores code-based pairing flow when Trusted-Network mode is toggled OFF', async () => {
    // 1. Toggle Trusted-Network Mode OFF via loopback control
    const toggleRes = await mockRequest('POST', '/api/dashboard/trusted-mode', '127.0.0.1', {
      trustedMode: false,
    });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.trustedMode).toBe(false);
    expect(deviceStore.isTrustedNetworkMode()).toBe(false);

    // 2. Attempting auto-registration without code must now be rejected with 403
    const rejectedNoCode = await mockRequest('POST', '/api/pair', '192.168.1.60', {
      clientDeviceId: 'dev_unauthorized_attempt',
      name: 'iPhone 15',
    });
    expect(rejectedNoCode.status).toBe(403);
    expect(rejectedNoCode.body.error).toContain('code required');

    // 3. Pairing with a valid 8-digit code succeeds
    const activeCodeObj = pairingManager.getActiveCode();
    expect(activeCodeObj).toBeDefined();
    const validCode = activeCodeObj!.code;

    const codePairRes = await mockRequest('POST', '/api/pair', '192.168.1.60', {
      code: validCode,
      clientDeviceId: 'dev_code_paired_phone',
      clientCredential: 'cred_code_paired_secret',
      name: 'Phone With Code',
      platform: 'iOS',
    });
    expect(codePairRes.status).toBe(200);
    expect(codePairRes.body.ok).toBe(true);
    expect(deviceStore.verifyCredential('dev_code_paired_phone', 'cred_code_paired_secret')).toBe(true);

    // 4. Toggle Trusted Mode back ON restores auto-connect
    const reenableRes = await mockRequest('POST', '/api/dashboard/trusted-mode', '127.0.0.1', {
      trustedMode: true,
    });
    expect(reenableRes.status).toBe(200);
    expect(reenableRes.body.trustedMode).toBe(true);

    const instantRes = await mockRequest('POST', '/api/pair', '172.20.10.2', {
      name: 'Instant Hotspot Phone',
    });
    expect(instantRes.status).toBe(200);
    expect(instantRes.body.ok).toBe(true);
  });
});
