import { describe, it, expect, vi, beforeEach } from 'vitest';
import WebSocket from 'ws';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../src/server.js';
import { DeviceStore } from '../src/device-store.js';
import { PairingManager } from '../src/pairing-manager.js';
import { RecordingInputBackend } from '../src/input/InputBackend.js';
import { setInputBackend } from '../src/input.js';

describe('AeroKin High-Frequency Binary WebSocket Protocol', () => {
  let tempDir: string;
  let deviceStore: DeviceStore;
  let pairingManager: PairingManager;
  let inputBackend: RecordingInputBackend;
  let serverInstance: any;
  let serverPort: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-binary-test-'));
    deviceStore = new DeviceStore(tempDir);
    deviceStore.setTrustedNetworkMode(true);
    pairingManager = new PairingManager();
    inputBackend = new RecordingInputBackend();
    setInputBackend(inputBackend);

    // Use a random port
    serverPort = 30000 + Math.floor(Math.random() * 10000);

    serverInstance = startServer({
      port: serverPort,
      lanIp: '127.0.0.1',
      publicDir: tempDir,
      certsDir: tempDir,
      deviceStore,
      pairingManager,
      inputBackend,
    });
  });

  it('processes 5-byte binary MOVE datagrams without JSON overhead', async () => {
    const ws = new WebSocket(`wss://127.0.0.1:${serverPort}`, {
      rejectUnauthorized: false,
      headers: { origin: `https://127.0.0.1:${serverPort}` },
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    // 1. Authenticate in trusted mode
    ws.send(
      JSON.stringify({
        type: 'auth',
        deviceId: 'dev_test_binary',
        credential: 'test_cred_binary',
        name: 'iPhone Pro',
        platform: 'iOS',
      })
    );

    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth_ok') resolve();
      });
    });

    // 2. Send 5-byte binary MOVE packet: [0x01, dx=15 (int16), dy=-8 (int16)]
    const moveBuf = Buffer.alloc(5);
    moveBuf.writeUInt8(0x01, 0);
    moveBuf.writeInt16LE(15, 1);
    moveBuf.writeInt16LE(-8, 3);
    ws.send(moveBuf);

    // Give server ~50ms to flush coalesced move
    await new Promise((r) => setTimeout(r, 60));

    const moveEvents = inputBackend.events.filter((e) => e.type === 'moveRelative');
    expect(moveEvents.length).toBeGreaterThan(0);
    const lastMove = moveEvents.at(-1);
    expect(lastMove?.args[0]).toBe(15);
    expect(lastMove?.args[1]).toBe(-8);

    ws.close();
    serverInstance.wss.close();
    serverInstance.httpsServer.close();
  });

  it('processes 2-byte binary CLICK datagrams', async () => {
    const ws = new WebSocket(`wss://127.0.0.1:${serverPort}`, {
      rejectUnauthorized: false,
      headers: { origin: `https://127.0.0.1:${serverPort}` },
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.send(
      JSON.stringify({
        type: 'auth',
        deviceId: 'dev_test_click',
        credential: 'test_cred_click',
        name: 'iPhone Pro',
      })
    );

    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth_ok') resolve();
      });
    });

    // 2-byte CLICK packet: [0x03, button=1 (right click)]
    const clickBuf = Buffer.from([0x03, 0x01]);
    ws.send(clickBuf);

    await new Promise((r) => setTimeout(r, 30));

    const clickEvents = inputBackend.events.filter((e) => e.type === 'click');
    expect(clickEvents.length).toBeGreaterThan(0);
    expect(clickEvents[0].args[0]).toBe('right');

    ws.close();
    serverInstance.wss.close();
    serverInstance.httpsServer.close();
  });
});
