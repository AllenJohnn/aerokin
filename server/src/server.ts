import https from 'node:https';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { getOrCreateCert } from './cert.js';
import { handleMove, handleClick, handleScroll, handleMedia } from './input.js';

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

  // Load or generate TLS credentials
  const sslCreds = getOrCreateCert(config.lanIp, config.certsDir);

  const httpsServer = https.createServer(
    {
      key: sslCreds.key,
      cert: sslCreds.cert,
    },
    app
  );

  // Attach WebSocket server on the same HTTPS instance
  const wss = new WebSocketServer({ server: httpsServer });

  wss.on('connection', (ws: WebSocket, req) => {
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

      // Send greeting upon authorized connection
      ws.send(JSON.stringify({ type: 'hello', ok: true }));

      ws.on('message', async (data: Buffer | string) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString('utf8');
          const msg = JSON.parse(raw);

          if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
            return; // Ignore malformed message
          }

          switch (msg.type) {
            case 'ping':
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
              }
              break;

            case 'move':
              await handleMove(msg.dx, msg.dy);
              break;

            case 'click':
              await handleClick(msg.button);
              break;

            case 'scroll':
              await handleScroll(msg.dy);
              break;

            case 'media':
              await handleMedia(msg.action);
              break;

            default:
              // Ignore unknown types
              break;
          }
        } catch {
          // Ignore JSON parse errors or bad payloads; never crash
        }
      });
    } catch {
      ws.close(4001, 'Unauthorized');
    }
  });

  httpsServer.listen(config.port, '0.0.0.0');

  return { httpsServer, wss };
}
