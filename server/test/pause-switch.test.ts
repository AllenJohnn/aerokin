import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { startServer } from '../src/server.js';
import { DeviceStore } from '../src/device-store.js';
import { PairingManager } from '../src/pairing-manager.js';
import { RecordingInputBackend } from '../src/input/InputBackend.js';
import { NoOpPowerActionExecutor } from '../src/actions/PowerActionExecutor.js';

describe('Remote Input Pause Switch & Safety Controls', () => {
  let tempDir: string;
  let serverInstance: ReturnType<typeof startServer>;
  let port: number;
  let deviceStore: DeviceStore;
  let pairingManager: PairingManager;
  let inputBackend: RecordingInputBackend;
  let powerExecutor: NoOpPowerActionExecutor;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-pause-test-'));
    deviceStore = new DeviceStore(tempDir);
    pairingManager = new PairingManager();
    inputBackend = new RecordingInputBackend();
    powerExecutor = new NoOpPowerActionExecutor();

    serverInstance = startServer({
      port: 0,
      lanIp: '127.0.0.1',
      publicDir: tempDir,
      certsDir: tempDir,
      deviceStore,
      pairingManager,
      allowedOrigins: new Set(['*']),
      inputBackend,
      powerExecutor,
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

  it('notifies clients on initial connect and broadcasts pause/resume state', async () => {
    // Add device directly to device store
    const { deviceId, rawCredential } = deviceStore.addDevice("Allen's iPhone", 'iOS');

    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
      rejectUnauthorized: false,
    });

    try {
      await new Promise((resolve) => ws.on('open', resolve));

      const messages: any[] = [];
      ws.on('message', (data) => {
        try {
          messages.push(JSON.parse(data.toString()));
        } catch {}
      });

      // Authenticate
      ws.send(JSON.stringify({ type: 'auth', deviceId, credential: rawCredential }));

      // Wait for initial handshake messages
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(messages.some((m) => m.type === 'auth_ok')).toBe(true);
      expect(
        messages.some((m) => m.type === 'input_pause_status' && m.paused === false)
      ).toBe(true);

      // Operator toggles pause ON
      serverInstance.setInputPaused(true);
      expect(serverInstance.isInputPaused()).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(
        messages.some((m) => m.type === 'input_pause_status' && m.paused === true)
      ).toBe(true);

      // Operator toggles pause OFF
      serverInstance.setInputPaused(false);
      expect(serverInstance.isInputPaused()).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 50));
      const resumeMsgs = messages.filter(
        (m) => m.type === 'input_pause_status' && m.paused === false
      );
      expect(resumeMsgs.length).toBeGreaterThanOrEqual(2);
    } finally {
      ws.close();
    }
  });

  it('blocks remote input messages when pause switch is active and returns error', async () => {
    // Add device directly to device store
    const { deviceId, rawCredential } = deviceStore.addDevice("Allen's iPhone", 'iOS');

    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, {
      rejectUnauthorized: false,
    });

    try {
      await new Promise((resolve) => ws.on('open', resolve));

      const messages: any[] = [];
      ws.on('message', (data) => {
        try {
          messages.push(JSON.parse(data.toString()));
        } catch {}
      });

      ws.send(JSON.stringify({ type: 'auth', deviceId, credential: rawCredential }));
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Turn pause ON
      serverInstance.setInputPaused(true);

      // Send mouse move
      ws.send(JSON.stringify({ type: 'move', dx: 15, dy: 20 }));
      // Send click
      ws.send(JSON.stringify({ type: 'click', button: 'left' }));
      // Send key
      ws.send(JSON.stringify({ type: 'key', key: 'a' }));
      // Send quick action (volume_mute)
      ws.send(JSON.stringify({ type: 'quick_action', action: 'volume_mute' }));

      await new Promise((resolve) => setTimeout(resolve, 150));

      // Input backend should have received 0 move / click calls
      const moves = inputBackend.events.filter((e) => e.type === 'moveRelative');
      expect(moves.length).toBe(0);

      const errors = messages.filter(
        (m) =>
          m.type === 'error' &&
          m.error === 'Remote input is paused by PC operator'
      );
      expect(errors.length).toBe(4);

      // Resume input
      serverInstance.setInputPaused(false);
      ws.send(JSON.stringify({ type: 'move', dx: 5, dy: 5 }));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error count should still be 4 (no new error)
      const afterResumeErrors = messages.filter(
        (m) =>
          m.type === 'error' &&
          m.error === 'Remote input is paused by PC operator'
      );
      expect(afterResumeErrors.length).toBe(4);
    } finally {
      ws.close();
    }
  });
});
