import https from 'node:https';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { getOrCreateCert } from './cert.js';
import { createMoveCoalescer, handleClick, handleScroll, handleMedia } from './input.js';

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
  type: 'move' | 'click' | 'scroll' | 'media' | 'ping' | 'connect' | 'disconnect';
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
} {
  const app = express();

  // In-memory state for desktop localhost dashboard
  const activeSockets = new Set<WebSocket>();
  let lastLatency: number | null = null;
  const eventBuffer: ActivityEvent[] = [];

  function recordEvent(
    type: ActivityEvent['type'],
    summary: string
  ) {
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
    res.json({
      url: pairUrl,
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
      connectedClients: activeSockets.size,
      lastLatency,
      recentEvents: eventBuffer.slice(-25),
    });
  });

  const sslCreds = getOrCreateCert(config.lanIp, config.certsDir);

  const httpsServer = https.createServer(
    {
      key: sslCreds.key,
      cert: sslCreds.cert,
    },
    app
  );

  const wss = new WebSocketServer({ server: httpsServer });

  wss.on('connection', (ws: WebSocket, req) => {
    let coalescer: ReturnType<typeof createMoveCoalescer> | null = null;

    const cleanup = () => {
      activeSockets.delete(ws);
      if (coalescer) {
        coalescer.destroy();
        coalescer = null;
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

      // Initialize per-connection move coalescer (~8ms flush loop)
      coalescer = createMoveCoalescer(8);

      // Send greeting upon authorized connection
      ws.send(JSON.stringify({ type: 'hello', ok: true }));

      ws.on('message', async (data: Buffer | string) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString('utf8');
          const msg = JSON.parse(raw);

          if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
            return;
          }

          switch (msg.type) {
            case 'ping':
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
                if (typeof msg.t === 'number') {
                  lastLatency = Math.max(1, Math.round(Date.now() - msg.t));
                }
              }
              break;

            case 'move':
              // Coalesced per connection (~8ms flush, only one OS call in flight)
              coalescer?.addMove(msg.dx, msg.dy);
              recordEvent('move', `dx: ${msg.dx}, dy: ${msg.dy}`);
              break;

            case 'click':
              // Immediate click execution
              await handleClick(msg.button);
              recordEvent('click', `button: ${msg.button}`);
              break;

            case 'scroll':
              // Immediate scroll execution
              await handleScroll(msg.dy);
              recordEvent('scroll', `dy: ${msg.dy}`);
              break;

            case 'media':
              // Immediate media key execution
              await handleMedia(msg.action);
              recordEvent('media', `action: ${msg.action}`);
              break;

            default:
              break;
          }
        } catch {
          // Ignore JSON parse errors or bad payloads; never crash
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

  return { httpsServer, wss };
}
