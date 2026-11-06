import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  SignalingMessage,
  TurnCredentialsResponse,
} from './types.js';
import { generateTurnCredentials } from './turn.js';

export interface SignalingServerConfig {
  port?: number;
  host?: string;
  turnSecret?: string;
  turnHost?: string;
  turnUdpPort?: number;
  turnTcpPort?: number;
  turnTlsPort?: number;
}

interface Room {
  pcId: string;
  pcWs: WebSocket | null;
  pcAuthHash: string; // sha256 hash of authSecret
  clients: Map<string, WebSocket>; // clientId -> WebSocket
}

export class SignalingServer {
  private server: http.Server;
  private wss: WebSocketServer;
  private port: number;
  private host: string;
  private turnSecret: string;
  private turnHost: string;
  private turnUdpPort: number;
  private turnTcpPort: number;
  private turnTlsPort: number;

  private rooms = new Map<string, Room>();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(config: SignalingServerConfig = {}) {
    this.port = config.port ?? 8088;
    this.host = config.host ?? '0.0.0.0';
    this.turnSecret = config.turnSecret ?? 'aerokin-default-coturn-shared-secret-change-in-prod';
    this.turnHost = config.turnHost ?? 'turn.aerokin.local';
    this.turnUdpPort = config.turnUdpPort ?? 3478;
    this.turnTcpPort = config.turnTcpPort ?? 3478;
    this.turnTlsPort = config.turnTlsPort ?? 5349;

    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.wss = new WebSocketServer({
      server: this.server,
      maxPayload: 128 * 1024, // 128 KB max for signaling messages
    });

    this.setupWebSocketServer();
  }

  public getPort(): number {
    return this.port;
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        console.log(`[SignalingServer] Listening on http://${this.host}:${this.port}`);
        this.startHeartbeat();
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all connected WebSockets
    for (const client of this.wss.clients) {
      try {
        client.close(1000, 'Server shutting down');
      } catch {}
    }

    return new Promise((resolve, reject) => {
      this.wss.close(() => {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  private hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  private verifyHash(candidate: string, expectedHash: string): boolean {
    const candidateHash = this.hashSecret(candidate);
    const b1 = Buffer.from(candidateHash, 'hex');
    const b2 = Buffer.from(expectedHash, 'hex');
    if (b1.length !== b2.length) return false;
    return crypto.timingSafeEqual(b1, b2);
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS headers for PWA and API access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/health' || url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'aerokin-signaling',
          uptime: Math.round(process.uptime()),
          activeRooms: this.rooms.size,
          connectedClients: this.wss.clients.size,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    if (url.pathname === '/turn-credentials' || url.pathname === '/api/turn-credentials') {
      const creds = generateTurnCredentials({
        secret: this.turnSecret,
        turnHost: this.turnHost,
        udpPort: this.turnUdpPort,
        tcpPort: this.turnTcpPort,
        tlsPort: this.turnTlsPort,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(creds));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      (ws as any).isAlive = true;
      let associatedPcId: string | null = null;
      let associatedClientId: string | null = null;
      let isHostPc = false;

      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });

      ws.on('message', (raw: Buffer | string) => {
        try {
          const str = typeof raw === 'string' ? raw : raw.toString('utf8');
          const msg = JSON.parse(str) as SignalingMessage;
          this.handleSignalingMessage(ws, msg, {
            onRegistered: (pcId) => {
              associatedPcId = pcId;
              isHostPc = true;
            },
            onJoined: (pcId, clientId) => {
              associatedPcId = pcId;
              associatedClientId = clientId;
              isHostPc = false;
            },
          });
        } catch (e: any) {
          this.sendJson(ws, { type: 'error', message: 'Malformed JSON signaling payload' });
        }
      });

      ws.on('close', () => {
        if (associatedPcId) {
          const room = this.rooms.get(associatedPcId);
          if (room) {
            if (isHostPc && room.pcWs === ws) {
              // PC disconnected: notify all connected phone clients
              for (const [cId, clientWs] of room.clients) {
                this.sendJson(clientWs, {
                  type: 'peer_left',
                  peerId: associatedPcId,
                });
              }
              this.rooms.delete(associatedPcId);
            } else if (!isHostPc && associatedClientId) {
              // Phone disconnected: notify PC
              room.clients.delete(associatedClientId);
              if (room.pcWs && room.pcWs.readyState === WebSocket.OPEN) {
                this.sendJson(room.pcWs, {
                  type: 'peer_left',
                  peerId: associatedClientId,
                });
              }
            }
          }
        }
      });

      ws.on('error', () => {
        try {
          ws.close();
        } catch {}
      });
    });
  }

  private handleSignalingMessage(
    ws: WebSocket,
    msg: SignalingMessage,
    callbacks: {
      onRegistered: (pcId: string) => void;
      onJoined: (pcId: string, clientId: string) => void;
    }
  ): void {
    switch (msg.type) {
      case 'ping': {
        this.sendJson(ws, { type: 'pong' });
        break;
      }

      case 'register': {
        const { pcId, authSecret } = msg;
        if (!pcId || !authSecret) {
          this.sendJson(ws, { type: 'error', message: 'Missing pcId or authSecret' });
          return;
        }

        const authHash = this.hashSecret(authSecret);
        let room = this.rooms.get(pcId);
        if (!room) {
          room = {
            pcId,
            pcWs: ws,
            pcAuthHash: authHash,
            clients: new Map(),
          };
          this.rooms.set(pcId, room);
        } else {
          // Verify authSecret if room exists
          if (!this.verifyHash(authSecret, room.pcAuthHash)) {
            this.sendJson(ws, {
              type: 'error',
              message: 'Authentication failed for existing PC registration',
              code: 'AUTH_FAILED',
            });
            ws.close(4003, 'Auth failed');
            return;
          }
          if (room.pcWs && room.pcWs !== ws) {
            try {
              room.pcWs.close(1000, 'Replaced by new host connection');
            } catch {}
          }
          room.pcWs = ws;
        }

        callbacks.onRegistered(pcId);

        const creds = generateTurnCredentials({
          secret: this.turnSecret,
          turnHost: this.turnHost,
          udpPort: this.turnUdpPort,
          tcpPort: this.turnTcpPort,
          tlsPort: this.turnTlsPort,
          usernamePrefix: `pc-${pcId}`,
        });

        this.sendJson(ws, {
          type: 'registered',
          pcId,
          iceServers: creds.iceServers,
        });
        break;
      }

      case 'join': {
        const { pcId, clientId, authSecret } = msg;
        if (!pcId || !clientId || !authSecret) {
          this.sendJson(ws, { type: 'error', message: 'Missing pcId, clientId, or authSecret' });
          return;
        }

        const room = this.rooms.get(pcId);
        if (!room || !room.pcWs || room.pcWs.readyState !== WebSocket.OPEN) {
          this.sendJson(ws, {
            type: 'error',
            message: 'Host PC is offline or not registered',
            code: 'PC_OFFLINE',
          });
          return;
        }

        // Verify device authentication secret
        if (!this.verifyHash(authSecret, room.pcAuthHash)) {
          this.sendJson(ws, {
            type: 'error',
            message: 'Invalid PC credentials',
            code: 'AUTH_FAILED',
          });
          ws.close(4001, 'Unauthorized');
          return;
        }

        room.clients.set(clientId, ws);
        callbacks.onJoined(pcId, clientId);

        const creds = generateTurnCredentials({
          secret: this.turnSecret,
          turnHost: this.turnHost,
          udpPort: this.turnUdpPort,
          tcpPort: this.turnTcpPort,
          tlsPort: this.turnTlsPort,
          usernamePrefix: `client-${clientId}`,
        });

        // 1. Notify Phone of successful join with ICE/TURN servers
        this.sendJson(ws, {
          type: 'joined',
          pcId,
          clientId,
          iceServers: creds.iceServers,
        });

        // 2. Notify PC that phone peer has joined
        this.sendJson(room.pcWs, {
          type: 'peer_joined',
          peerId: clientId,
        });
        break;
      }

      case 'offer': {
        const { targetPeerId, sdp, senderPeerId } = msg;
        this.forwardToPeer(targetPeerId, {
          type: 'offer',
          targetPeerId,
          senderPeerId,
          sdp,
        });
        break;
      }

      case 'answer': {
        const { targetPeerId, sdp, senderPeerId } = msg;
        this.forwardToPeer(targetPeerId, {
          type: 'answer',
          targetPeerId,
          senderPeerId,
          sdp,
        });
        break;
      }

      case 'candidate': {
        const { targetPeerId, candidate, senderPeerId } = msg;
        this.forwardToPeer(targetPeerId, {
          type: 'candidate',
          targetPeerId,
          senderPeerId,
          candidate,
        });
        break;
      }
    }
  }

  private forwardToPeer(targetPeerId: string, message: any): void {
    // 1. Check if target is a PC host
    const directRoom = this.rooms.get(targetPeerId);
    if (directRoom && directRoom.pcWs && directRoom.pcWs.readyState === WebSocket.OPEN) {
      this.sendJson(directRoom.pcWs, message);
      return;
    }

    // 2. Check if target is a client in any active room
    for (const room of this.rooms.values()) {
      const clientWs = room.clients.get(targetPeerId);
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        this.sendJson(clientWs, message);
        return;
      }
    }
  }

  private sendJson(ws: WebSocket, data: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(data));
      } catch {}
    }
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      for (const client of this.wss.clients) {
        if ((client as any).isAlive === false) {
          try {
            client.terminate();
          } catch {}
          continue;
        }
        (client as any).isAlive = false;
        try {
          client.ping();
        } catch {}
      }
    }, 30000);
  }
}
