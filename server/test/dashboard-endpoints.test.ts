import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../src/server.js';
import { DeviceStore } from '../src/device-store.js';
import { PairingManager } from '../src/pairing-manager.js';
import { serverLogger } from '../src/logger.js';

describe('PC Dashboard & Management Endpoints (Loopback Security)', () => {
  let tempDir: string;
  let serverInstance: ReturnType<typeof startServer>;
  let deviceStore: DeviceStore;
  let pairingManager: PairingManager;
  let app: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-dash-test-'));
    // Create dummy index.html in public dir
    fs.writeFileSync(path.join(tempDir, 'index.html'), '<html>Dashboard</html>');

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

    // Extract express app from httpsServer listeners
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
    body?: any
  ): Promise<{ status: number; headers: Record<string, any>; body: any; text: string }> {
    return new Promise((resolve) => {
      const { Readable } = require('node:stream');
      const bodyStr = body ? JSON.stringify(body) : '';

      const headers: Record<string, string> = {
        host: '127.0.0.1',
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
        resolve({
          status,
          headers: res.headers,
          body: parsed,
          text: responseText,
        });
      }

      res.setHeader = (k: string, v: any) => {
        res.headers[k.toLowerCase()] = v;
      };
      res.getHeader = (k: string) => res.headers[k.toLowerCase()];
      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };
      res.sendStatus = (code: number) => {
        res.statusCode = code;
        finish(code);
      };
      res.writeHead = (code: number, head: any) => {
        res.statusCode = code;
        if (head) Object.assign(res.headers, head);
        // If it's 403 or SSE stream, resolve immediately without waiting for stream close
        if (code === 403 || res.headers['content-type']?.includes('text/event-stream')) {
          process.nextTick(() => finish(code));
        }
      };
      res.write = (chunk: any) => {
        responseText += chunk ? chunk.toString() : '';
      };
      res.end = (chunk?: any) => {
        if (chunk) responseText += chunk.toString();
        finish(res.statusCode);
      };
      res.send = (chunk: any) => res.end(chunk);
      res.json = (data: any) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(data));
      };
      res.sendFile = (filePath: string) => {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          res.end(content);
        } catch {
          res.status(404).end('Not found');
        }
      };

      app(req, res);
    });
  }

  const PROTECTED_ENDPOINTS = [
    { method: 'GET', url: '/dashboard' },
    { method: 'GET', url: '/api/dashboard/status' },
    { method: 'GET', url: '/api/dashboard/events' },
    { method: 'POST', url: '/api/pair/approve', body: { requestId: '123', approved: true } },
    { method: 'POST', url: '/api/pair/regenerate' },
    { method: 'POST', url: '/api/devices/rename', body: { deviceId: '123', name: 'New' } },
    { method: 'POST', url: '/api/devices/disconnect', body: { deviceId: '123' } },
    { method: 'POST', url: '/api/devices/revoke', body: { deviceId: '123' } },
    { method: 'POST', url: '/api/devices/revoke-all' },
    { method: 'POST', url: '/api/desktop/stop' },
    { method: 'GET', url: '/api/logs' },
    { method: 'GET', url: '/api/logs/download' },
  ];

  it('strictly rejects non-loopback LAN requests with 403 Forbidden for all dashboard endpoints', async () => {
    const foreignLanIp = '192.168.254.222';

    for (const ep of PROTECTED_ENDPOINTS) {
      const res = await mockRequest(ep.method, ep.url, foreignLanIp, ep.body);
      expect(res.status, `Endpoint ${ep.method} ${ep.url} must reject non-loopback`).toBe(403);
    }
  });

  it('allows loopback (127.0.0.1) requests to access /dashboard and returns HTML', async () => {
    const res = await mockRequest('GET', '/dashboard', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html>Dashboard</html>');
  });

  it('returns complete dashboard status snapshot for loopback requests', async () => {
    const res = await mockRequest('GET', '/api/dashboard/status', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('devices');
    expect(res.body).toHaveProperty('pairing');
    expect(res.body.pairing).toHaveProperty('code');
    expect(res.body).toHaveProperty('desktop');
    expect(res.body).toHaveProperty('media');
    expect(res.body).toHaveProperty('pc');
    expect(res.body.pc).toHaveProperty('hostname');
    expect(res.body.pc).toHaveProperty('power');
  });

  it('regenerates 8-digit code via POST /api/pair/regenerate', async () => {
    const res = await mockRequest('POST', '/api/pair/regenerate', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.code).toMatch(/^\d{8}$/);
    expect(res.body.expiresInSeconds).toBeGreaterThan(115);
  });

  it('manages device operations (rename, revoke, revoke-all) via loopback', async () => {
    const dev = deviceStore.addDevice('Test Phone', 'iOS');

    // Rename
    const renameRes = await mockRequest('POST', '/api/devices/rename', '127.0.0.1', {
      deviceId: dev.deviceId,
      name: 'Renamed Phone',
    });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.ok).toBe(true);
    expect(deviceStore.getDevice(dev.deviceId)?.name).toBe('Renamed Phone');

    // Revoke
    const revokeRes = await mockRequest('POST', '/api/devices/revoke', '127.0.0.1', {
      deviceId: dev.deviceId,
    });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.ok).toBe(true);
    expect(deviceStore.getDevice(dev.deviceId)?.revoked).toBe(true);

    // Revoke all
    const revokeAllRes = await mockRequest('POST', '/api/devices/revoke-all', '127.0.0.1');
    expect(revokeAllRes.status).toBe(200);
    expect(revokeAllRes.body.ok).toBe(true);
  });

  it('downloads redacted logs as text file via GET /api/logs/download', async () => {
    serverLogger.info('system', 'System test event for download');
    const res = await mockRequest('GET', '/api/logs/download', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment; filename="aerokin-logs-');
    expect(res.text).toContain('System test event for download');
  });

  it('provides systemStats, actions, features, and clipboardSharedCount in status snapshot', async () => {
    const res = await mockRequest('GET', '/api/dashboard/status', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.body.systemStats).toBeDefined();
    expect(res.body.actions).toBeDefined();
    expect(res.body.features).toBeDefined();
    expect(res.body.features.clipboard).toBe(true);
    expect(typeof res.body.clipboardSharedCount).toBe('number');
  });

  it('manages feature flags via GET and POST /api/dashboard/features', async () => {
    // GET features
    const getRes = await mockRequest('GET', '/api/dashboard/features', '127.0.0.1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.clipboard).toBe(true);

    // POST features update
    const postRes = await mockRequest('POST', '/api/dashboard/features', '127.0.0.1', {
      clipboard: false,
      screenshot: false,
    });
    expect(postRes.status).toBe(200);
    expect(postRes.body.ok).toBe(true);
    expect(postRes.body.flags.clipboard).toBe(false);
    expect(postRes.body.flags.screenshot).toBe(false);

    // Verify GET reflects update
    const verifyRes = await mockRequest('GET', '/api/dashboard/features', '127.0.0.1');
    expect(verifyRes.body.clipboard).toBe(false);
  });

  it('handles action cancel countdown via POST /api/dashboard/actions/cancel', async () => {
    const res = await mockRequest('POST', '/api/dashboard/actions/cancel', '127.0.0.1');
    expect(res.status).toBe(200);
    expect(typeof res.body.success).toBe('boolean');
  });

  it('manages remote input pause state via GET and POST /api/dashboard/pause (loopback only)', async () => {
    // Initial status: paused is false
    const initRes = await mockRequest('GET', '/api/dashboard/pause', '127.0.0.1');
    expect(initRes.status).toBe(200);
    expect(initRes.body.paused).toBe(false);
    expect(serverInstance.isInputPaused()).toBe(false);

    // Toggle pause to true
    const pauseRes = await mockRequest('POST', '/api/dashboard/pause', '127.0.0.1', {
      paused: true,
    });
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.ok).toBe(true);
    expect(pauseRes.body.paused).toBe(true);
    expect(serverInstance.isInputPaused()).toBe(true);

    // Verify GET reflects paused: true
    const checkRes = await mockRequest('GET', '/api/dashboard/pause', '127.0.0.1');
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.paused).toBe(true);

    // Toggle pause back to false
    const resumeRes = await mockRequest('POST', '/api/dashboard/pause', '127.0.0.1', {
      paused: false,
    });
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.ok).toBe(true);
    expect(resumeRes.body.paused).toBe(false);
    expect(serverInstance.isInputPaused()).toBe(false);

    // Verify remote LAN requests are rejected with 403 Forbidden
    const lanGetRes = await mockRequest('GET', '/api/dashboard/pause', '192.168.1.100');
    expect(lanGetRes.status).toBe(403);
    expect(lanGetRes.body.error).toContain('Loopback only');

    const lanPostRes = await mockRequest('POST', '/api/dashboard/pause', '192.168.1.100', {
      paused: true,
    });
    expect(lanPostRes.status).toBe(403);
    expect(lanPostRes.body.error).toContain('Loopback only');
  });
});
