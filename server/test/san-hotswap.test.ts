import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import {
  buildSanSet,
  getOrCreateLocalCaAndCert,
  GeneratedCerts,
} from '../src/ca.js';
import { startServer } from '../src/server.js';
import { DeviceStore } from '../src/device-store.js';
import { PairingManager } from '../src/pairing-manager.js';

describe('AeroKin Network-Independent Addressing & Dynamic SAN Hot-Swap Suite', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-san-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds comprehensive SAN set with hostname, .local domains, and all private IPv4s', () => {
    const customIps = ['192.168.1.55', '172.20.10.2', '10.0.0.42'];
    const { dns, ips } = buildSanSet(customIps);

    // Hostname and .local domains
    const host = os.hostname().toLowerCase();
    expect(dns).toContain(host);
    expect(dns).toContain(`${host}.local`);
    expect(dns).toContain('aerokin.local');
    expect(dns).toContain('localhost');

    // Loopback and all non-internal private IPv4s
    expect(ips).toContain('127.0.0.1');
    expect(ips).toContain('192.168.1.55');
    expect(ips).toContain('172.20.10.2'); // iPhone Personal Hotspot
    expect(ips).toContain('10.0.0.42');
  });

  it('produces deterministic and stable SAN sets across calls', () => {
    const san1 = buildSanSet(['192.168.1.50', '172.20.10.2']);
    const san2 = buildSanSet(['172.20.10.2', '192.168.1.50']);

    expect(JSON.stringify(san1)).toBe(JSON.stringify(san2));
    expect(Array.isArray(san1.dns)).toBe(true);
    expect(Array.isArray(san1.ips)).toBe(true);
  });

  it('regenerates leaf certificate signed by the SAME 10-year CA on interface change', () => {
    // 1. Initial generation with home Wi-Fi IP
    const certsInitial = getOrCreateLocalCaAndCert(tempDir, ['192.168.1.55']);
    const caCertContent = fs.readFileSync(path.join(tempDir, 'ca-cert.pem'), 'utf8');
    const initialLeafCert = fs.readFileSync(path.join(tempDir, 'server-cert.pem'), 'utf8');

    expect(certsInitial.caCertPem).toBe(caCertContent);
    expect(certsInitial.serverCertPem).toBe(initialLeafCert);

    // 2. Network change occurs (e.g. laptop connects to iPhone Personal Hotspot at 172.20.10.2)
    const certsUpdated = getOrCreateLocalCaAndCert(tempDir, ['192.168.1.55', '172.20.10.2']);
    const updatedCaCertContent = fs.readFileSync(path.join(tempDir, 'ca-cert.pem'), 'utf8');
    const updatedLeafCert = fs.readFileSync(path.join(tempDir, 'server-cert.pem'), 'utf8');

    // CRITICAL: The CA cert MUST remain byte-identical so iPhone root trust keeps working without reinstall
    expect(updatedCaCertContent).toBe(caCertContent);
    expect(certsUpdated.caCertPem).toBe(caCertContent);

    // The leaf cert is regenerated with the new SAN set
    expect(updatedLeafCert).not.toBe(initialLeafCert);
    expect(certsUpdated.serverCertPem).toBe(updatedLeafCert);
  });

  it('hot-swaps updated TLS certificate into running server via setSecureContext without restart', async () => {
    const deviceStore = new DeviceStore(tempDir);
    const pairingManager = new PairingManager();

    const serverInstance = startServer({
      port: 0,
      lanIp: '192.168.1.55',
      publicDir: tempDir,
      certsDir: tempDir,
      deviceStore,
      pairingManager,
      allowedOrigins: new Set(['*']),
    });

    let serverPort = 0;
    await new Promise<void>((resolve) => {
      serverInstance.httpsServer.listen(0, '127.0.0.1', () => {
        const addr = serverInstance.httpsServer.address();
        if (typeof addr === 'object' && addr) {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    try {
      // Generate updated leaf cert with hotspot IP
      const updatedCerts = getOrCreateLocalCaAndCert(tempDir, ['192.168.1.55', '172.20.10.2']);

      // Hot-swap into running TLS server
      expect(() => {
        serverInstance.hotSwapCertificate(updatedCerts);
      }).not.toThrow();

      // Verify server is still responding normally after hot-swap
      const res = await new Promise<{ statusCode: number }>((resolve, reject) => {
        const req = https.request(
          `https://127.0.0.1:${serverPort}/health`,
          {
            method: 'GET',
            rejectUnauthorized: false,
          },
          (response) => {
            resolve({ statusCode: response.statusCode || 0 });
          }
        );
        req.on('error', reject);
        req.end();
      });

      expect(res.statusCode).toBe(200);
    } finally {
      serverInstance.httpsServer.close();
      serverInstance.wss.close();
    }
  });
});
