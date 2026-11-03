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

export function startServer(config: ServerConfig): {
  httpsServer: https.Server;
  wss: WebSocketServer;
} {
  const app = express();

  // Serve static files from public folder
  app.use(express.static(config.publicDir));

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'aerokin-server' });
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
      if (coalescer) {
        coalescer.destroy();
        coalescer = null;
      }
    };

    try {
      const parsedUrl = new URL(
        req.url || '',
        `https://${req.headers.host || config.lanIp}`
      );
      const clientToken = parsedUrl.searchParams.get('token');

      // Reject unauthorized clients without the correct token
      if (!clientToken || clientToken !== config.token) {
        ws.close(4001, 'Unauthorized: Invalid or missing token');
        return;
      }

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
              }
              break;

            case 'move':
              // Coalesced per connection (~8ms flush, only one OS call in flight)
              coalescer?.addMove(msg.dx, msg.dy);
              break;

            case 'click':
              // Immediate click execution
              await handleClick(msg.button);
              break;

            case 'scroll':
              // Immediate scroll execution
              await handleScroll(msg.dy);
              break;

            case 'media':
              // Immediate media key execution
              await handleMedia(msg.action);
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
