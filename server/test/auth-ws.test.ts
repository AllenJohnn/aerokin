import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { startServer } from '../src/server.js';
import { DeviceStore } from '../src/device-store.js';
import { PairingManager } from '../src/pairing-manager.js';

describe('Server WebSocket Authentication & Device Security', () => {
  let tempDir: string;
  let serverInstance: ReturnType<typeof startServer>;
  let port: number;
  let deviceStore: DeviceStore;
  let pairingManager: PairingManager;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-authws-test-'));
    deviceStore = new DeviceStore(tempDir);
    pairingManager = new PairingManager();

    // Use ephemeral port (0)
    serverInstance = startServer({
      port: 0,
      lanIp: '127.0.0.1',
      publicDir: tempDir,
      certsDir: tempDir,
      deviceStore,
      pairingManager,
      allowedOrigins: new Set(['*']),
    });

    await new Promise<void>((resolve) => {
      serverInstance.httpsServer.listen(0, '127.0.0.1', () => {
        const addr = serverInstance.httpsServer.address();
        if (typeof addr === 'object' && addr) {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      serverInstance.wss.close(() => {
        serverInstance.httpsServer.close(() => resolve());
      });
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('drops input messages received before authentication', async () => {
    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
      rejectUnauthorized: false,
    });

    await new Promise((resolve) => ws.on('open', resolve));

    // Send move and click before auth
    ws.send(JSON.stringify({ type: 'move', dx: 50, dy: 50 }));
    ws.send(JSON.stringify({ type: 'click', button: 'left' }));

    // Socket should still be open (awaiting auth within 5s)
    expect(ws.readyState).toBe(WebSocket.OPEN);

    ws.close();
  });

  it('rejects invalid device credentials with close code 4001', async () => {
    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
      rejectUnauthorized: false,
    });

    await new Promise((resolve) => ws.on('open', resolve));

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    // Send invalid auth
    ws.send(
      JSON.stringify({
        type: 'auth',
        deviceId: 'non-existent-device',
        credential: 'invalid-credential-value',
      })
    );

    const { code, reason } = await closePromise;
    expect(code).toBe(4001);
    expect(reason).toContain('Unauthorized');
  });

  it('authenticates valid credentials, returns auth_ok, and receives device list', async () => {
    const { deviceId, rawCredential } = deviceStore.addDevice("Allen's Phone", 'iOS');

    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
      rejectUnauthorized: false,
    });

    await new Promise((resolve) => ws.on('open', resolve));

    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    // Send valid auth
    ws.send(
      JSON.stringify({
        type: 'auth',
        deviceId,
        credential: rawCredential,
      })
    );

    // Wait briefly for handshake messages
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(ws.readyState).toBe(WebSocket.OPEN);

    const authOkMsg = receivedMessages.find((m) => m.type === 'auth_ok');
    expect(authOkMsg).toBeDefined();
    expect(authOkMsg.deviceId).toBe(deviceId);

    const devicesMsg = receivedMessages.find((m) => m.type === 'devices');
    expect(devicesMsg).toBeDefined();
    expect(Array.isArray(devicesMsg.list)).toBe(true);

    ws.close();
  });

  it('immediately closes live connection with 4001 when device is revoked', async () => {
    const { deviceId, rawCredential } = deviceStore.addDevice('Revoke Target', 'iOS');

    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
      rejectUnauthorized: false,
    });

    await new Promise((resolve) => ws.on('open', resolve));

    ws.send(
      JSON.stringify({
        type: 'auth',
        deviceId,
        credential: rawCredential,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ws.readyState).toBe(WebSocket.OPEN);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    // Operator revokes device
    serverInstance.revokeDevice(deviceId);

    const { code } = await closePromise;
    expect(code).toBe(4001);
  });

  it('closes all live connections with 4001 when revokeAll is executed', async () => {
    const dev1 = deviceStore.addDevice('Device 1', 'iOS');
    const dev2 = deviceStore.addDevice('Device 2', 'Web');

    const ws1 = new WebSocket(`wss://127.0.0.1:${port}/`, { rejectUnauthorized: false });
    const ws2 = new WebSocket(`wss://127.0.0.1:${port}/`, { rejectUnauthorized: false });

    await Promise.all([
      new Promise((resolve) => ws1.on('open', resolve)),
      new Promise((resolve) => ws2.on('open', resolve)),
    ]);

    ws1.send(JSON.stringify({ type: 'auth', deviceId: dev1.deviceId, credential: dev1.rawCredential }));
    ws2.send(JSON.stringify({ type: 'auth', deviceId: dev2.deviceId, credential: dev2.rawCredential }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    const closePromises = [
      new Promise<number>((resolve) => ws1.on('close', (code) => resolve(code))),
      new Promise<number>((resolve) => ws2.on('close', (code) => resolve(code))),
    ];

    serverInstance.revokeAll();

    const codes = await Promise.all(closePromises);
    expect(codes).toEqual([4001, 4001]);
  });

  it('enforces unauthenticated message size limit (tiny maxPayload <= 512 bytes)', async () => {
    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, { rejectUnauthorized: false });
    await new Promise((resolve) => ws.on('open', resolve));

    const closePromise = new Promise<{ code: number }>((resolve) => {
      ws.on('close', (code) => resolve({ code }));
    });

    // Send payload > 512 bytes before auth
    const largePayload = JSON.stringify({ type: 'auth', flood: 'a'.repeat(600) });
    ws.send(largePayload);

    const { code } = await closePromise;
    expect(code).toBe(1008); // Policy violation
  });

  it('enforces per-IP unauthenticated concurrency limit (max 4)', async () => {
    const sockets: WebSocket[] = [];

    for (let i = 0; i < 4; i++) {
      const s = new WebSocket(`wss://127.0.0.1:${port}/`, { rejectUnauthorized: false });
      await new Promise((resolve) => s.on('open', resolve));
      sockets.push(s);
    }

    // 5th unauthenticated connection from same IP must be rejected immediately
    const s5 = new WebSocket(`wss://127.0.0.1:${port}/`, { rejectUnauthorized: false });
    const closePromise = new Promise<{ code: number }>((resolve) => {
      s5.on('close', (code) => resolve({ code }));
    });

    const { code } = await closePromise;
    expect(code).toBe(1008); // Policy violation

    for (const s of sockets) s.close();
  });
});