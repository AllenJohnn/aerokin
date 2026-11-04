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
} from './input.js';
import {
  validateClientMessage,
  ConnectionRateLimiter,
  WS_MAX_PAYLOAD_BYTES,
  WS_CLOSE_POLICY_VIOLATION,
} from './protocol.js';
import { MediaManager, NowPlayingData, MediaSessionItem } from './media-manager.js';

export interface ServerConfig {
  port: number;
  lanIp: string;
  token: string;
  publicDir: string;
  certsDir: string;
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
  mediaManager: MediaManager;
} {
  const app = express();

  // In-memory state for desktop localhost dashboard
  const activeSockets = new Set<WebSocket>();
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

  // Serve static PWA files from public folder
  app.use(express.static(config.publicDir));

  // Health check endpoint (accessible to all)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'aerokin-server' });
  });

  // REST API: Pairing info (URL + Token) - LOOPBACK ONLY (403 for LAN)
  app.get('/api/pair', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const pairUrl = `https://${config.lanIp}:${config.port}/?token=${config.token}`;
    const mdnsUrl = `https://aerokin.local:${config.port}/?token=${config.token}`;
    res.json({
      url: pairUrl,
      mdnsUrl,
      token: config.token,
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
    h1 { color: #22D3EE; font-size: 20px; margin-bottom: 8px; }
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
    .entry.keydown { border-left: 3px solid #22D3EE; color: #FFF; }
    .entry.keyup { border-left: 3px solid #7C5CFF; color: #8A8A96; }
    .badge { color: #22D3EE; font-weight: bold; }
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
    server: httpsServer,
    maxPayload: WS_MAX_PAYLOAD_BYTES,
  });

  wss.on('connection', (ws: WebSocket, req) => {
    let coalescer: ReturnType<typeof createMoveCoalescer> | null = null;
    let scroller: ReturnType<typeof createScroller> | null = null;
    const rateLimiter = new ConnectionRateLimiter();
    let lastMoveLogTime = 0;
    let invalidMessageCount = 0;

    const cleanup = () => {
      activeSockets.delete(ws);
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

    try {
      const parsedUrl = new URL(
        req.url || '',
        `https://${req.headers.host || config.lanIp}`
      );
      const clientToken = parsedUrl.searchParams.get('token');

      // Reject unauthorized clients without the correct token (close code 4001)
      if (!clientToken || clientToken !== config.token) {
        ws.close(4001, 'Unauthorized: Invalid or missing token');
        return;
      }

      activeSockets.add(ws);
      recordEvent('connect', 'Authorized iPhone client connected');

      // Initialize per-connection move coalescer (~8ms flush loop, float remainder carry)
      coalescer = createMoveCoalescer(8);
      // Initialize per-connection scroller (float carry, unit conversion, per-conn remainder)
      scroller = createScroller();

      // Send greeting upon authorized connection
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

      ws.on('message', async (data: Buffer | string) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString('utf8');
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
              // Universal Media Action
              const mediaRes = await mediaManager.handleMediaCommand(msg.action);
              recordEvent('media', `${msg.action} (Tier ${mediaRes.tier}, ${mediaRes.latencyMs}ms)`);
              break;

            case 'seekby':
              // Seek relative seconds (positive or negative)
              const seekByRes = await mediaManager.handleMediaCommand('seekby', msg.seconds);
              recordEvent(
                'media',
                `seekby ${msg.seconds}s (Tier ${seekByRes.tier}, ${seekByRes.latencyMs}ms)`
              );
              break;

            case 'seekto':
              // Seek absolute position
              const seekToRes = await mediaManager.handleMediaCommand('seekto', msg.position);
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
          }
        } catch {
          // Ignore parse errors or handler rejections; never crash
        }
      });

      ws.on('close', cleanup);
      ws.on('error', cleanup);
    } catch {
      cleanup();
      ws.close(4001, 'Unauthorized');
    }
  });

  httpsServer.listen(config.port, '0.0.0.0');

  return { httpsServer, wss, mediaManager };
}
