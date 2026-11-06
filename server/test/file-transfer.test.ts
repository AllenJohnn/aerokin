import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { startServer } from '../src/server.js';
import { DeviceStore } from '../src/device-store.js';
import { PairingManager } from '../src/pairing-manager.js';
import { RecordingInputBackend } from '../src/input/InputBackend.js';
import { NoOpPowerActionExecutor } from '../src/actions/PowerActionExecutor.js';

describe('AeroKin Secure File Transfer & Drop (/api/transfer/upload)', () => {
  let tempDir: string;
  let serverInstance: ReturnType<typeof startServer>;
  let deviceStore: DeviceStore;
  let pairingManager: PairingManager;
  let app: any;
  let testDeviceId: string;
  let testCredential: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-file-test-'));
    deviceStore = new DeviceStore(tempDir);
    pairingManager = new PairingManager();

    const dev = deviceStore.addDevice("Allen's Phone", 'iOS');
    testDeviceId = dev.deviceId;
    testCredential = dev.rawCredential;

    serverInstance = startServer({
      port: 0,
      lanIp: '192.168.1.55',
      publicDir: tempDir,
      certsDir: tempDir,
      downloadsDir: tempDir,
      deviceStore,
      pairingManager,
      allowedOrigins: new Set(['*']),
      inputBackend: new RecordingInputBackend(),
      powerExecutor: new NoOpPowerActionExecutor(),
    });

    const listeners = serverInstance.httpsServer.listeners('request');
    app = listeners[0];
  });

  afterEach(() => {
    serverInstance.httpsServer.close();
    serverInstance.wss.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function mockUploadRequest(
    method: string,
    url: string,
    remoteAddress: string,
    headers: Record<string, string>,
    body: Buffer | string
  ): Promise<{ status: number; headers: Record<string, any>; body: any; text: string }> {
    return new Promise((resolve) => {
      const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const req: any = Readable.from([bodyBuf]);
      req.method = method;
      req.url = url;
      req.headers = {
        host: '192.168.1.55',
        'content-length': String(bodyBuf.length),
        ...headers,
      };
      req.socket = {
        remoteAddress,
        destroy: () => {},
        pipe: () => {},
      };
      req.connection = req.socket;

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

      app(req, res);
    });
  }

  it('rejects unauthenticated remote LAN requests with 401 Unauthorized', async () => {
    const res = await mockUploadRequest(
      'POST',
      '/api/transfer/upload',
      '192.168.1.105',
      { 'content-type': 'application/octet-stream' },
      'test file content'
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('rejects invalid device credentials with 401 Unauthorized', async () => {
    const res = await mockUploadRequest(
      'POST',
      '/api/transfer/upload',
      '192.168.1.105',
      {
        'content-type': 'application/octet-stream',
        'x-aerokin-device-id': testDeviceId,
        'x-aerokin-credential': 'wrong_invalid_credential',
      },
      'test file content'
    );
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('accepts file upload from authenticated device and writes safely', async () => {
    const payload = 'Hello from iPhone via AeroKin Drop!';
    const res = await mockUploadRequest(
      'POST',
      '/api/transfer/upload',
      '192.168.1.105',
      {
        'content-type': 'text/plain',
        'x-aerokin-device-id': testDeviceId,
        'x-aerokin-credential': testCredential,
        'x-aerokin-filename': 'notes.txt',
      },
      payload
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.filename).toContain('notes');
    expect(res.body.bytes).toBe(Buffer.byteLength(payload));

    // Verify file exists on disk inside configured temp directory
    expect(fs.existsSync(res.body.path)).toBe(true);
    const content = fs.readFileSync(res.body.path, 'utf8');
    expect(content).toBe(payload);
  });

  it('sanitizes path traversal attempts in filename header', async () => {
    const payload = 'Attempting path traversal...';
    const res = await mockUploadRequest(
      'POST',
      '/api/transfer/upload',
      '127.0.0.1', // Loopback allows without device headers
      {
        'content-type': 'application/octet-stream',
        'x-aerokin-filename': '../../../../windows/system32/evil.bat',
      },
      payload
    );

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.filename).toContain('evil.bat');
    expect(res.body.path).not.toContain('system32');
    expect(res.body.path.startsWith(tempDir)).toBe(true);

    // Verify file is strictly inside configured temp dir
    expect(fs.existsSync(res.body.path)).toBe(true);
  });
});
