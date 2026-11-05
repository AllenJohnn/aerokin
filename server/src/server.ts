import https from 'node:https';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { getOrCreateLocalCaAndCert } from './ca.js';
import {
  createMoveCoalescer,
  createScroller,
  handleClick,
  handleButton,
  handleScroll,
  handleAbsMove,
  handleAbsClick,
  handleAbsButton,
  handleKey,
  handleText,
} from './input.js';
import {
  validateClientMessage,
  ConnectionRateLimiter,
  WS_MAX_PAYLOAD_BYTES,
  WS_CLOSE_POLICY_VIOLATION,
} from './protocol.js';
import { parseAllowedOrigins, isOriginAllowed } from './origin.js';
import { MediaManager } from './media-manager.js';
import { DeviceStore, DevicePublicInfo } from './device-store.js';
import { PairingManager } from './pairing-manager.js';
import { StreamService, MonitorService } from './desktop/index.js';

export interface ServerConfig {
  port: number;
  lanIp: string;
  token?: string; // Optional legacy token
  legacyToken?: string;
  publicDir: string;
  certsDir: string;
  allowedOrigins?: Set<string>;
  deviceStore?: DeviceStore;
  pairingManager?: PairingManager;
  streamService?: StreamService;
}

export interface ActivityEvent {
  id: string;
  time: number;
  type: 'move' | 'click' | 'button' | 'scroll' | 'media' | 'ping' | 'connect' | 'disconnect';
  summary: string;
}

/**
 * Returns true if the HTTP request originated from the local machine (loopback).
 */
function isLoopback(req: express.Request): boolean {
  const ip = req.socket.remoteAddress || '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost'
  );
}

export function startServer(config: ServerConfig): {
  httpsServer: https.Server;
  wss: WebSocketServer;
  desktopWss: WebSocketServer;
  streamService: StreamService;
  mediaManager: MediaManager;
  deviceStore: DeviceStore;
  pairingManager: PairingManager;
  revokeDevice: (deviceId: string) => void;
  revokeAll: (exceptDeviceId?: string) => void;
  broadcastDevices: () => void;
} {
  const app = express();
  const allowedOrigins =
    config.allowedOrigins || parseAllowedOrigins(process.env.AEROKIN_ALLOWED_ORIGINS);

  const deviceStore = config.deviceStore || new DeviceStore(config.certsDir);
  const pairingManager = config.pairingManager || new PairingManager();

  // In-memory state for desktop localhost dashboard
  const activeSockets = new Set<WebSocket>();
  const socketsByDeviceId = new Map<string, Set<WebSocket>>();
  const unauthConnectionsByIp = new Map<string, number>();

  let lastLatency: number | null = null;
  const eventBuffer: ActivityEvent[] = [];

  function recordEvent(type: ActivityEvent['type'], summary: string) {
    const event: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      time: Date.now(),
      type,
      summary,
    };
    eventBuffer.push(event);
    if (eventBuffer.length > 50) {
      eventBuffer.shift();
    }
  }

  // Initialize StreamService for live desktop remote
  const streamService = config.streamService || new StreamService({ deviceStore });

  function broadcastDesktopStatus() {
    const payload = JSON.stringify({
      type: 'desktop_status',
      state: streamService.getState(),
      monitor: streamService.getActiveMonitor(),
      stats: streamService.getStats(),
    });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  function broadcastDesktopStats(stats: any) {
    const payload = JSON.stringify({
      type: 'desktop_stats',
      stats,
    });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  streamService.setOnStatusChange((state, error) => {
    broadcastDesktopStatus();
    if (error) {
      recordEvent('disconnect', `Desktop stream error: ${error}`);
    }
  });

  streamService.setOnStatsUpdate((stats) => {
    broadcastDesktopStats(stats);
  });

  function closeDeviceSockets(deviceId: string) {
    if (streamService.getSessionInfo().deviceId === deviceId) {
      streamService.stopSession('Device revoked');
    }
    const set = socketsByDeviceId.get(deviceId);
    if (set) {
      for (const socket of set) {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(4001, 'Device revoked');
        }
      }
      socketsByDeviceId.delete(deviceId);
    }
  }

  function broadcastDevices() {
    const payload = JSON.stringify({
      type: 'devices',
      list: deviceStore.listDevices(),
    });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  function revokeDevice(deviceId: string) {
    deviceStore.revokeDevice(deviceId);
    closeDeviceSockets(deviceId);
    broadcastDevices();
  }

  function revokeAll(exceptDeviceId?: string) {
    const revoked = deviceStore.revokeAllDevices(exceptDeviceId);
    for (const id of revoked) {
      closeDeviceSockets(id);
    }
    broadcastDevices();
  }

  // Initialize MediaManager (Tier 1: Keys, Tier 2: SMTC, Tier 3: Profiles)
  const mediaManager = new MediaManager();

  // Broadcast state changes to all authorized clients
  mediaManager.setOnStateChange((nowPlaying, sessions, volume, muted) => {
    const payloadNowPlaying = JSON.stringify({
      type: 'nowplaying',
      ...nowPlaying,
      volume,
      muted,
    });
    const payloadSessions = JSON.stringify({
      type: 'sessions',
      list: sessions,
    });

    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payloadNowPlaying);
        ws.send(payloadSessions);
      }
    }
  });

  // Body parsing for JSON
  app.use(express.json({ limit: '16kb' }));

  // Serve static PWA files from public folder
  app.use(express.static(config.publicDir));

  // Health check endpoint (accessible to all; CORS enabled ONLY for allow-listed origins)
  app.options('/health', (req, res) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.sendStatus(204);
    } else {
      res.sendStatus(403);
    }
  });

  app.get('/health', (req, res) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
    res.json({ status: 'ok', service: 'aerokin-server' });
  });

  // REST API: Pairing CORS preflight
  app.options('/api/pair', (req, res) => {
    const origin = req.headers.origin;
    if (isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.sendStatus(204);
    } else {
      res.sendStatus(403);
    }
  });

  // REST API: Pairing submission (Phone submits 8-digit code + device info)
  app.post('/api/pair', async (req, res) => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      res.status(403).json({ error: 'Forbidden: Disallowed Origin' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    const clientIp = req.socket.remoteAddress || 'unknown';
    const { code, name, platform } = req.body || {};

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Pairing code is required' });
      return;
    }

    const deviceName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : 'Mobile Device';
    const devicePlatform = typeof platform === 'string' && platform.trim() ? platform.trim().slice(0, 32) : 'Browser';

    const result = await pairingManager.submitPairing(code, deviceName, devicePlatform, clientIp);
    if (!result.ok) {
      res.status(result.lockedOut ? 429 : 403).json({
        error: result.error || 'Pairing failed',
        lockedOut: result.lockedOut,
        remainingSeconds: result.remainingSeconds,
      });
      return;
    }

    // On PC operator approval: issue 32-byte cryptographic credential, store SHA-256 hash on disk
    const { deviceId, rawCredential } = deviceStore.addDevice(deviceName, devicePlatform);

    res.json({
      ok: true,
      deviceId,
      credential: rawCredential,
      name: deviceName,
    });
  });

  // REST API: Pairing info (Active Code & URLs) - LOOPBACK ONLY (403 for LAN, NO CORS)
  app.get('/api/pair', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const activeCode = pairingManager.getActiveCode();
    const currentCode = activeCode ? activeCode.code : '';
    const pairUrl = currentCode ? `https://${config.lanIp}:${config.port}/#code=${currentCode}` : '';
    const mdnsUrl = currentCode ? `https://aerokin.local:${config.port}/#code=${currentCode}` : '';

    const rawHosted = (process.env.AEROKIN_HOSTED_URL || '').trim().replace(/\/+$/, '');
    const hostedPairUrl = (rawHosted && currentCode)
      ? `${rawHosted}/#host=${config.lanIp}:${config.port}&code=${currentCode}`
      : undefined;

    res.json({
      url: pairUrl,
      mdnsUrl,
      hostedUrl: rawHosted || undefined,
      hostedPairUrl,
      code: currentCode,
      expiresInSeconds: activeCode ? activeCode.validForSeconds : 0,
      lanIp: config.lanIp,
      port: config.port,
    });
  });

  // REST API: Live Server Status & Recent Events - LOOPBACK ONLY (403 for LAN)
  app.get('/api/status', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    res.json({
      activeClients: activeSockets.size,
      connectedClients: activeSockets.size,
      lastLatency,
      recentEvents: eventBuffer.slice(-25),
      mediaStatus: mediaManager.getCurrentStatus(),
      devices: deviceStore.listDevices(),
    });
  });

  // REST API: Loopback-only Keyboard Debugger Page (/debug/keys)
  app.get('/debug/keys', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).send('Forbidden: /debug/keys is restricted to loopback (127.0.0.1) only.');
      return;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AEROKIN Key Debugger (Loopback)</title>
  <style>
    body {
      background: #07070B;
      color: #F5F5F7;
      font-family: monospace;
      padding: 24px;
      margin: 0;
    }
    h1 { color: #FF5A1F; font-size: 20px; margin-bottom: 8px; }
    p { color: #8A8A96; font-size: 13px; margin-bottom: 16px; }
    #log {
      background: #0E0E17;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 16px;
      height: 70vh;
      overflow-y: auto;
      font-size: 13px;
      display: flex;
      flex-direction: column-reverse;
      gap: 6px;
    }
    .entry {
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(255,255,255,0.03);
      display: flex;
      justify-content: space-between;
    }
    .entry.keydown { border-left: 3px solid #FF5A1F; color: #FFF; }
    .entry.keyup { border-left: 3px solid #7C5CFF; color: #8A8A96; }
    .badge { color: #FF5A1F; font-weight: bold; }
    .time { color: #555; }
    .clear-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.15);
      color: #FFF;
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <h1>AEROKIN Key Event Monitor (/debug/keys)</h1>
  <p>Keep this window in focus to capture and verify key events (Arrows, J, L, F, Space, Media keys) sent by AEROKIN.</p>
  <button class="clear-btn" onclick="document.getElementById('log').innerHTML=''">Clear Log</button>
  <div id="log"></div>

  <script>
    const log = document.getElementById('log');

    function addEntry(type, e) {
      const div = document.createElement('div');
      div.className = 'entry ' + type;
      const now = new Date().toLocaleTimeString();
      div.innerHTML = '<span><span class="badge">' + type.toUpperCase() + '</span> key: <strong>' + e.key + '</strong> | code: <strong>' + e.code + '</strong> | keyCode: ' + e.keyCode + '</span><span class="time">' + now + '</span>';
      log.prepend(div);
    }

    window.addEventListener('keydown', (e) => addEntry('keydown', e));
    window.addEventListener('keyup', (e) => addEntry('keyup', e));
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  // Get or create Local Root CA & 365-day Leaf Cert with SANs
  const certs = getOrCreateLocalCaAndCert(config.certsDir, config.lanIp);

  const httpsServer = https.createServer(
    {
      key: certs.serverKeyPem,
      cert: certs.serverCertPem,
    },
    app
  );

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: WS_MAX_PAYLOAD_BYTES,
  });

  const desktopWss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
  });

  desktopWss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';
    let isStreamAuth = false;
    let streamDeviceId: string | null = null;

    // 1. Check query parameters ?deviceId=...&credential=...
    try {
      const parsedUrl = new URL(req.url || '', `https://${req.headers.host || config.lanIp}`);
      const dId = parsedUrl.searchParams.get('deviceId');
      const cred = parsedUrl.searchParams.get('credential');
      if (dId && cred && deviceStore.verifyCredential(dId, cred)) {
        isStreamAuth = true;
        streamDeviceId = dId;
        streamService.handleStreamSocket(ws, dId, clientIp);
      }
    } catch {}

    // 2. 5s auth timeout if not authenticated via query params
    let authTimeout: NodeJS.Timeout | null = null;
    if (!isStreamAuth) {
      authTimeout = setTimeout(() => {
        if (!isStreamAuth) {
          try {
            ws.close(4001, 'Stream auth timeout (5s)');
          } catch {}
        }
      }, 5000);

      ws.on('message', (data: Buffer | string) => {
        if (isStreamAuth) return;
        try {
          const raw = typeof data === 'string' ? data : data.toString('utf8');
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            parsed.type === 'auth' &&
            typeof parsed.deviceId === 'string' &&
            typeof parsed.credential === 'string'
          ) {
            if (deviceStore.verifyCredential(parsed.deviceId, parsed.credential)) {
              isStreamAuth = true;
              streamDeviceId = parsed.deviceId;
              if (authTimeout) {
                clearTimeout(authTimeout);
                authTimeout = null;
              }
              ws.send(JSON.stringify({ type: 'stream_auth_ok', deviceId: parsed.deviceId }));
              streamService.handleStreamSocket(ws, parsed.deviceId, clientIp);
              return;
            }
          }
        } catch {}

        if (authTimeout) {
          clearTimeout(authTimeout);
          authTimeout = null;
        }
        try {
          ws.close(4001, 'Unauthorized stream socket');
        } catch {}
      });
    }

    ws.on('close', () => {
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }
    });
  });

  httpsServer.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const parsedUrl = new URL(req.url || '/', `https://${req.headers.host || config.lanIp}`);
      if (parsedUrl.pathname === '/desktop/stream') {
        desktopWss.handleUpgrade(req, socket, head, (ws) => {
          desktopWss.emit('connection', ws, req);
        });
      } else {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const clientIp = req.socket.remoteAddress || 'unknown';

    // 1. Concurrency limit: max 4 concurrent unauthenticated connections per IP
    const currentUnauth = unauthConnectionsByIp.get(clientIp) || 0;
    if (currentUnauth >= 4) {
      ws.close(WS_CLOSE_POLICY_VIOLATION, 'Too many unauthenticated connections from IP');
      return;
    }
    unauthConnectionsByIp.set(clientIp, currentUnauth + 1);

    let isAuthenticated = false;
    let authenticatedDeviceId: string | null = null;
    let coalescer: ReturnType<typeof createMoveCoalescer> | null = null;
    let scroller: ReturnType<typeof createScroller> | null = null;
    const rateLimiter = new ConnectionRateLimiter();
    let lastMoveLogTime = 0;
    let invalidMessageCount = 0;

    // Strict 5s authentication timeout
    let authTimeout: NodeJS.Timeout | null = setTimeout(() => {
      if (!isAuthenticated) {
        cleanup();
        ws.close(4001, 'Authentication timed out (5s)');
      }
    }, 5000);

    const cleanup = () => {
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }
      if (!isAuthenticated) {
        const remaining = Math.max(0, (unauthConnectionsByIp.get(clientIp) || 1) - 1);
        if (remaining === 0) {
          unauthConnectionsByIp.delete(clientIp);
        } else {
          unauthConnectionsByIp.set(clientIp, remaining);
        }
      }
      activeSockets.delete(ws);
      if (authenticatedDeviceId) {
        const set = socketsByDeviceId.get(authenticatedDeviceId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            socketsByDeviceId.delete(authenticatedDeviceId);
          }
        }
      }
      if (coalescer) {
        coalescer.destroy();
        coalescer = null;
      }
      if (scroller) {
        scroller.destroy();
        scroller = null;
      }
      recordEvent('disconnect', 'Client disconnected');
    };

    // Optional legacy query-token check if enabled
    try {
      const parsedUrl = new URL(
        req.url || '',
        `https://${req.headers.host || config.lanIp}`
      );
      const queryToken = parsedUrl.searchParams.get('token');
      const legacySecret = config.legacyToken || config.token;

      if (process.env.AEROKIN_LEGACY_TOKEN === '1' && queryToken && legacySecret) {
        if (queryToken === legacySecret) {
          console.warn('[SECURITY WARNING] Insecure query-token connection accepted (AEROKIN_LEGACY_TOKEN=1).');
          completeAuthentication('legacy_query_device', 'Legacy Device');
        }
      }
    } catch {}

    function completeAuthentication(deviceId: string, deviceName: string) {
      isAuthenticated = true;
      authenticatedDeviceId = deviceId;
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }
      const remaining = Math.max(0, (unauthConnectionsByIp.get(clientIp) || 1) - 1);
      if (remaining === 0) {
        unauthConnectionsByIp.delete(clientIp);
      } else {
        unauthConnectionsByIp.set(clientIp, remaining);
      }

      let devSockets = socketsByDeviceId.get(deviceId);
      if (!devSockets) {
        devSockets = new Set();
        socketsByDeviceId.set(deviceId, devSockets);
      }
      devSockets.add(ws);

      activeSockets.add(ws);
      recordEvent('connect', `Authorized device connected: ${deviceName}`);

      // Initialize per-connection move coalescer and scroller
      coalescer = createMoveCoalescer(8);
      scroller = createScroller();

      // Handshake greeting
      ws.send(JSON.stringify({ type: 'auth_ok', deviceId }));
      ws.send(JSON.stringify({ type: 'hello', ok: true }));

      // Send initial media status and sessions list
      const initialStatus = mediaManager.getCurrentStatus();
      ws.send(JSON.stringify({ type: 'sessions', list: initialStatus.sessions }));
      ws.send(
        JSON.stringify({
          type: 'nowplaying',
          ...initialStatus.nowPlaying,
          volume: initialStatus.volume,
          muted: initialStatus.muted,
        })
      );

      // Send current device list
      ws.send(JSON.stringify({ type: 'devices', list: deviceStore.listDevices() }));

      // Send initial desktop status and monitors
      ws.send(JSON.stringify({ type: 'desktop_monitors', monitors: MonitorService.listMonitors() }));
      ws.send(
        JSON.stringify({
          type: 'desktop_status',
          state: streamService.getState(),
          monitor: streamService.getActiveMonitor(),
          stats: streamService.getStats(),
        })
      );
    }

    ws.on('message', async (data: Buffer | string) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf8');

        // Tiny maxPayload until auth (512 bytes)
        if (!isAuthenticated && raw.length > 512) {
          cleanup();
          ws.close(WS_CLOSE_POLICY_VIOLATION, 'Handshake frame too large');
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          invalidMessageCount++;
          if (invalidMessageCount > 50) {
            ws.close(WS_CLOSE_POLICY_VIOLATION, 'Too many malformed messages');
          }
          return;
        }

        const msg = validateClientMessage(parsed);
        if (!msg) {
          invalidMessageCount++;
          if (invalidMessageCount > 50) {
            ws.close(WS_CLOSE_POLICY_VIOLATION, 'Too many invalid messages');
          }
          return;
        }

        // Before authentication, ONLY 'auth' messages are processed. Drop all input!
        if (!isAuthenticated) {
          if (msg.type !== 'auth') {
            return;
          }

          const valid = deviceStore.verifyCredential(msg.deviceId, msg.credential);
          if (!valid) {
            cleanup();
            ws.close(4001, 'Unauthorized: Invalid or revoked device credential');
            return;
          }

          const dev = deviceStore.getDevice(msg.deviceId);
          completeAuthentication(msg.deviceId, dev?.name || 'Device');
          return;
        }

        // Per-connection token bucket rate limit check
        const rateResult = rateLimiter.check(msg.type);
        if (!rateResult.ok) {
          if (rateResult.closeConnection) {
            ws.close(
              WS_CLOSE_POLICY_VIOLATION,
              rateResult.reason || 'Rate limit exceeded: sustained flood'
            );
          }
          return;
        }

        switch (msg.type) {
          case 'auth':
            // Already authenticated; ignore duplicate auth
            break;

          case 'logout':
            cleanup();
            ws.close(1000, 'User logged out');
            break;

          case 'device_list':
            ws.send(JSON.stringify({ type: 'devices', list: deviceStore.listDevices() }));
            break;

          case 'device_rename':
            deviceStore.renameDevice(msg.deviceId, msg.name);
            broadcastDevices();
            break;

          case 'device_revoke':
            revokeDevice(msg.deviceId);
            break;

          case 'device_revoke_all':
            revokeAll(msg.exceptCurrent ? authenticatedDeviceId || undefined : undefined);
            break;

          case 'ping':
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
              lastLatency = Math.max(1, Math.round(Date.now() - msg.t));
            }
            break;

          case 'move':
            // Coalesced per connection (~8ms flush, float carry, capped +/-200)
            coalescer?.addMove(msg.dx, msg.dy);
            const now = Date.now();
            if (now - lastMoveLogTime >= 250) {
              lastMoveLogTime = now;
              recordEvent('move', `dx: ${msg.dx.toFixed(1)}, dy: ${msg.dy.toFixed(1)}`);
            }
            break;

          case 'click':
            // Immediate click execution
            await handleClick(msg.button);
            recordEvent('click', `button: ${msg.button}`);
            break;

          case 'button':
            // Mouse button down / up for dragging
            await handleButton(msg.button, msg.state);
            recordEvent('button', `${msg.button} ${msg.state}`);
            break;

          case 'scroll':
            // Scrolled per connection with float carry and unit scaling
            await scroller?.scroll(msg.dy, msg.dx);
            recordEvent(
              'scroll',
              `dy: ${msg.dy.toFixed(1)}${msg.dx !== 0 ? ` dx: ${msg.dx.toFixed(1)}` : ''}`
            );
            break;

          case 'media':
            // Universal Media Action (scoped to session if provided)
            const mediaRes = await mediaManager.handleMediaCommand(msg.action, undefined, (msg as any).sessionId);
            recordEvent('media', `${msg.action} (Tier ${mediaRes.tier}, ${mediaRes.latencyMs}ms)`);
            break;

          case 'seekby':
            // Seek relative seconds (positive or negative)
            const seekByRes = await mediaManager.handleMediaCommand('seekby', msg.seconds, (msg as any).sessionId);
            recordEvent(
              'media',
              `seekby ${msg.seconds}s (Tier ${seekByRes.tier}, ${seekByRes.latencyMs}ms)`
            );
            break;

          case 'seekto':
            // Seek absolute position
            const seekToRes = await mediaManager.handleMediaCommand('seekto', msg.position, (msg as any).sessionId);
            recordEvent(
              'media',
              `seekto ${msg.position}s (Tier ${seekToRes.tier}, ${seekToRes.latencyMs}ms)`
            );
            break;

          case 'session':
            // Pick active SMTC media session
            await mediaManager.handleMediaCommand('session', msg.id);
            recordEvent('media', `session ${msg.id}`);
            break;

          case 'setvolume':
            // Direct master volume scalar (0-100)
            await mediaManager.handleMediaCommand('setvolume', msg.level);
            recordEvent('media', `setvolume ${msg.level}%`);
            break;

          case 'getvolume':
            const volRes = await mediaManager.handleMediaCommand('getvolume');
            if (ws.readyState === WebSocket.OPEN && volRes) {
              ws.send(JSON.stringify({ type: 'volume', volume: volRes.detail }));
            }
            break;

          case 'desktop_monitors': {
            const list = MonitorService.listMonitors(true);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'desktop_monitors', monitors: list }));
            }
            break;
          }

          case 'desktop_start': {
            recordEvent(
              'connect',
              `Desktop stream request (preset: ${msg.preset || 'balanced'}, monitor: ${msg.monitorId || 'primary'})`
            );
            const startRes = await streamService.startSession({
              monitorId: msg.monitorId,
              preset: msg.preset,
              customScale: msg.customScale,
              customFps: msg.customFps,
            });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'desktop_status',
                  state: streamService.getState(),
                  monitor: startRes.monitor,
                  stats: streamService.getStats(),
                  error: startRes.error,
                })
              );
            }
            break;
          }

          case 'desktop_stop': {
            recordEvent('disconnect', 'Desktop stream stop requested');
            await streamService.stopSession('Client requested stop');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'desktop_status',
                  state: 'stopped',
                })
              );
            }
            break;
          }

          case 'abs_move': {
            handleAbsMove(msg.x, msg.y, msg.monitorId);
            break;
          }

          case 'abs_click': {
            await handleAbsClick(msg.button, msg.count, msg.x, msg.y, msg.monitorId);
            recordEvent('click', `abs_click ${msg.button} x${msg.count || 1}`);
            break;
          }

          case 'abs_button': {
            await handleAbsButton(msg.button, msg.state, msg.x, msg.y, msg.monitorId);
            recordEvent('button', `abs_button ${msg.button} ${msg.state}`);
            break;
          }

          case 'key': {
            await handleKey(msg.key, msg.action, msg.modifiers);
            recordEvent(
              'move',
              `key: ${msg.key} ${msg.action || 'tap'}${
                msg.modifiers?.length ? ` (${msg.modifiers.join('+')})` : ''
              }`
            );
            break;
          }

          case 'text': {
            await handleText(msg.text);
            recordEvent('move', `text (${msg.text.length} chars)`);
            break;
          }
        }
      } catch {
        // Ignore parse errors or handler rejections; never crash
      }
    });

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  httpsServer.listen(config.port, '0.0.0.0');

  return {
    httpsServer,
    wss,
    desktopWss,
    streamService,
    mediaManager,
    deviceStore,
    pairingManager,
    revokeDevice,
    revokeAll,
    broadcastDevices,
  };
}
