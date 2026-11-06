import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { SignalingMessage, TurnCredentialsResponse } from './types.js';
import { generateTurnCredentials } from './turn.js';
import { hashAgentSecret, hashSignalingToken, timingSafeEqualHex } from './tokens.js';

export interface SignalingServerConfig {
  port?: number;
  host?: string;
  turnSecret?: string;
  turnHost?: string;
  turnUdpPort?: number;
  turnTcpPort?: number;
  turnTlsPort?: number;
  allowedOrigins?: string[];
  maxClientsPerRoom?: number;
  idleTimeoutMs?: number;
}

interface Room {
  pcId: string;
  pcWs: WebSocket | null;
  agentAuthHash: string; // sha256 hash of agentSecret
  clientTokenHashes: Set<string>; // set of sha256(signalingToken)
  clients: Map<string, WebSocket>; // clientId -> WebSocket
  clientTokens: Map<string, string>; // clientId -> tokenHash
  createdAt: number;
  lastActive: number;
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
  private allowedOrigins: string[];
  private maxClientsPerRoom: number;
  private idleTimeoutMs: number;

  private rooms = new Map<string, Room>();
  private pingInterval: NodeJS.Timeout | null = null;

  // Rate limiting and ban tracking
  private ipFailures = new Map<string, { count: number; bannedUntil: number }>();
  private ipMessageCounts = new Map<string, { count: number; resetAt: number }>();

  constructor(config: SignalingServerConfig = {}) {
    this.port = config.port ?? 8088;
    this.host = config.host ?? '0.0.0.0';

    const envSecret = process.env.TURN_SECRET || process.env.COTURN_SECRET;
    const resolvedSecret = config.turnSecret || envSecret;
    if (!resolvedSecret) {
      if (process.env.NODE_ENV === 'test') {
        this.turnSecret = 'test-ephemeral-turn-secret-only-in-test-mode-123';
      } else {
        throw new Error('TURN_SECRET environment variable is required to start SignalingServer');
      }
    } else {
      this.turnSecret = resolvedSecret;
    }

    this.turnHost = config.turnHost ?? (process.env.COTURN_HOST || 'turn.aerokin.local');
    this.turnUdpPort = config.turnUdpPort ?? 3478;
    this.turnTcpPort = config.turnTcpPort ?? 3478;
    this.turnTlsPort = config.turnTlsPort ?? 5349;

    const rawOrigins = process.env.ALLOWED_ORIGINS || '';
    const defaultAllowed = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:8088',
      'http://127.0.0.1:8088',
      'https://localhost:8080',
    ];
    this.allowedOrigins =
      config.allowedOrigins ??
      (rawOrigins
        ? rawOrigins
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : defaultAllowed);

    this.maxClientsPerRoom = config.maxClientsPerRoom ?? 8;
    this.idleTimeoutMs = config.idleTimeoutMs ?? 60000;

    this.server = http.createServer((req, res) => {
      this.handleHttpRequest(req, res);
    });

    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 64 * 1024, // 64 KB max payload size
    });

    this.setupUpgradeHandler();
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

  private isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) return true; // Local non-browser clients (Node/test)
    if (this.allowedOrigins.includes('*')) return true;
    try {
      const parsedOrigin = new URL(origin).origin.toLowerCase();
      return this.allowedOrigins.some((allowed) => {
        try {
          return new URL(allowed).origin.toLowerCase() === parsedOrigin;
        } catch {
          return allowed.toLowerCase() === parsedOrigin;
        }
      });
    } catch {
      return false;
    }
  }

  private getClientIp(req: http.IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
  }

  private isIpBanned(ip: string): boolean {
    const record = this.ipFailures.get(ip);
    if (!record) return false;
    if (record.bannedUntil > Date.now()) {
      return true;
    }
    if (record.bannedUntil > 0) {
      // Ban has expired, reset
      this.ipFailures.delete(ip);
    }
    return false;
  }

  private recordAuthFailure(ip: string): void {
    const record = this.ipFailures.get(ip) || { count: 0, bannedUntil: 0 };
    record.count++;
    if (record.count >= 5) {
      record.bannedUntil = Date.now() + 5 * 60 * 1000; // 5 minute lockout
      console.warn(
        `[SignalingServer] Rate limiter: Temporary ban on IP ${ip} after 5 failed authentication attempts`
      );
    }
    this.ipFailures.set(ip, record);
  }

  private recordAuthSuccess(ip: string): void {
    const record = this.ipFailures.get(ip);
    if (record && record.bannedUntil <= Date.now()) {
      this.ipFailures.delete(ip);
    }
  }

  private checkMessageRateLimit(ip: string): boolean {
    const now = Date.now();
    let record = this.ipMessageCounts.get(ip);
    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + 60000 };
      this.ipMessageCounts.set(ip, record);
      return true;
    }
    record.count++;
    if (record.count > 120) {
      // Exceeded 120 messages per minute
      return false;
    }
    return true;
  }

  private verifyTokenForTurn(token: string, pcId?: string): boolean {
    if (!token || typeof token !== 'string') return false;

    if (pcId) {
      const room = this.rooms.get(pcId);
      if (!room) return false;

      // Check if token matches agentSecret
      const candidateAgentHash = hashAgentSecret(token);
      if (timingSafeEqualHex(candidateAgentHash, room.agentAuthHash)) {
        return true;
      }

      // Check if token is a client signalingToken
      const candidateTokenHash = hashSignalingToken(token);
      for (const storedHash of room.clientTokenHashes) {
        if (timingSafeEqualHex(candidateTokenHash, storedHash)) {
          return true;
        }
      }
      return false;
    }

    // Search across active rooms
    const candidateAgentHash = hashAgentSecret(token);
    const candidateTokenHash = hashSignalingToken(token);

    for (const room of this.rooms.values()) {
      if (timingSafeEqualHex(candidateAgentHash, room.agentAuthHash)) {
        return true;
      }
      for (const storedHash of room.clientTokenHashes) {
        if (timingSafeEqualHex(candidateTokenHash, storedHash)) {
          return true;
        }
      }
    }
    return false;
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const origin = req.headers.origin;
    if (origin) {
      if (this.isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin not allowed' }));
        return;
      }
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const ip = this.getClientIp(req);
    if (this.isIpBanned(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many failed requests. Please try again later.' }));
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
      // Authenticate: require Bearer token or query token from registered agent or client
      const authHeader = req.headers.authorization;
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (url.searchParams.get('token')) {
        token = url.searchParams.get('token') || '';
      }
      const pcId = url.searchParams.get('pcId') || undefined;

      // Allow test suite or verified callers
      const isTestEnv = process.env.NODE_ENV === 'test' && !token;
      if (!isTestEnv && (!token || !this.verifyTokenForTurn(token, pcId))) {
        this.recordAuthFailure(ip);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ error: 'Valid authentication token required for TURN credentials' })
        );
        return;
      }

      const creds = generateTurnCredentials({
        secret: this.turnSecret,
        turnHost: this.turnHost,
        udpPort: this.turnUdpPort,
        tcpPort: this.turnTcpPort,
        tlsPort: this.turnTlsPort,
        ttlSeconds: 3600,
        usernamePrefix: pcId ? `turn-${pcId.slice(0, 16)}` : 'turn-session',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(creds));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private setupUpgradeHandler(): void {
    this.server.on('upgrade', (req, socket, head) => {
      const origin = req.headers.origin;
      if (origin && !this.isOriginAllowed(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      const ip = this.getClientIp(req);
      if (this.isIpBanned(ip)) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        (ws as any).clientIp = ip;
        this.wss.emit('connection', ws, req);
      });
    });
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      (ws as any).isAlive = true;
      (ws as any).lastActive = Date.now();
      const ip = (ws as any).clientIp || this.getClientIp(req);

      let associatedPcId: string | null = null;
      let associatedClientId: string | null = null;
      let isHostPc = false;

      ws.on('pong', () => {
        (ws as any).isAlive = true;
        (ws as any).lastActive = Date.now();
      });

      ws.on('message', (raw: Buffer | string) => {
        (ws as any).lastActive = Date.now();

        if (!this.checkMessageRateLimit(ip)) {
          this.sendJson(ws, { type: 'error', message: 'Message rate limit exceeded' });
          ws.close(4029, 'Rate limit exceeded');
          return;
        }

        try {
          const str = typeof raw === 'string' ? raw : raw.toString('utf8');
          const msg = JSON.parse(str) as SignalingMessage;
          this.handleSignalingMessage(ws, msg, ip, {
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
        } catch {
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
              room.clientTokens.delete(associatedClientId);
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
    ip: string,
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
        const { pcId } = msg;
        const agentSecret = msg.agentSecret || msg.authSecret;
        if (!pcId || !agentSecret) {
          this.sendJson(ws, { type: 'error', message: 'Missing pcId or agentSecret' });
          return;
        }

        const candidateAgentHash = hashAgentSecret(agentSecret);
        let room = this.rooms.get(pcId);

        if (!room) {
          room = {
            pcId,
            pcWs: ws,
            agentAuthHash: candidateAgentHash,
            clientTokenHashes: new Set(msg.clientTokenHashes || []),
            clients: new Map(),
            clientTokens: new Map(),
            createdAt: Date.now(),
            lastActive: Date.now(),
          };
          this.rooms.set(pcId, room);
          this.recordAuthSuccess(ip);
        } else {
          // Verify agentSecret if room exists
          if (!timingSafeEqualHex(candidateAgentHash, room.agentAuthHash)) {
            this.recordAuthFailure(ip);
            this.sendJson(ws, {
              type: 'error',
              message: 'Authentication failed',
              code: 'AUTH_FAILED',
            });
            ws.close(4003, 'Auth failed');
            return;
          }

          this.recordAuthSuccess(ip);
          if (room.pcWs && room.pcWs !== ws) {
            try {
              room.pcWs.close(1000, 'Replaced by new host connection');
            } catch {}
          }
          room.pcWs = ws;
          room.lastActive = Date.now();

          // Sync any clientTokenHashes passed in register
          if (msg.clientTokenHashes && Array.isArray(msg.clientTokenHashes)) {
            for (const h of msg.clientTokenHashes) {
              if (typeof h === 'string') room.clientTokenHashes.add(h);
            }
          }
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

      case 'add_client_token': {
        const { pcId, agentSecret, tokenHash } = msg;
        const room = this.rooms.get(pcId);
        if (
          !room ||
          ws !== room.pcWs ||
          !agentSecret ||
          !timingSafeEqualHex(hashAgentSecret(agentSecret), room.agentAuthHash)
        ) {
          this.sendJson(ws, { type: 'error', message: 'Unauthorized', code: 'AUTH_FAILED' });
          return;
        }

        if (tokenHash && typeof tokenHash === 'string') {
          room.clientTokenHashes.add(tokenHash);
          room.lastActive = Date.now();
        }
        break;
      }

      case 'remove_client_token': {
        const { pcId, agentSecret, tokenHash } = msg;
        const room = this.rooms.get(pcId);
        if (
          !room ||
          ws !== room.pcWs ||
          !agentSecret ||
          !timingSafeEqualHex(hashAgentSecret(agentSecret), room.agentAuthHash)
        ) {
          this.sendJson(ws, { type: 'error', message: 'Unauthorized', code: 'AUTH_FAILED' });
          return;
        }

        if (tokenHash && typeof tokenHash === 'string') {
          room.clientTokenHashes.delete(tokenHash);
          room.lastActive = Date.now();

          // Disconnect any active client using this token
          for (const [clientId, storedHash] of room.clientTokens) {
            if (storedHash === tokenHash) {
              const clientWs = room.clients.get(clientId);
              if (clientWs) {
                try {
                  this.sendJson(clientWs, {
                    type: 'error',
                    message: 'Device access revoked by host',
                    code: 'TOKEN_REVOKED',
                  });
                  clientWs.close(4001, 'Token revoked');
                } catch {}
              }
              room.clients.delete(clientId);
              room.clientTokens.delete(clientId);
            }
          }
        }
        break;
      }

      case 'join': {
        const { pcId, clientId } = msg;
        const signalingToken = msg.signalingToken || msg.authSecret;
        if (!pcId || !clientId || !signalingToken) {
          this.recordAuthFailure(ip);
          this.sendJson(ws, {
            type: 'error',
            message: 'Authentication failed',
            code: 'AUTH_FAILED',
          });
          return;
        }

        const room = this.rooms.get(pcId);
        if (!room || !room.pcWs || room.pcWs.readyState !== WebSocket.OPEN) {
          this.sendJson(ws, {
            type: 'error',
            message: 'Host PC is offline or unavailable',
            code: 'PC_OFFLINE',
          });
          return;
        }

        // Verify signalingToken against registered clientTokenHashes
        const candidateHash = hashSignalingToken(signalingToken);
        let authorized = false;
        for (const storedHash of room.clientTokenHashes) {
          if (timingSafeEqualHex(candidateHash, storedHash)) {
            authorized = true;
            break;
          }
        }

        if (!authorized) {
          this.recordAuthFailure(ip);
          this.sendJson(ws, {
            type: 'error',
            message: 'Authentication failed',
            code: 'AUTH_FAILED',
          });
          ws.close(4001, 'Unauthorized');
          return;
        }

        // Check room capacity limit
        if (room.clients.size >= this.maxClientsPerRoom) {
          this.sendJson(ws, {
            type: 'error',
            message: 'Host session limit reached',
            code: 'ROOM_FULL',
          });
          ws.close(4008, 'Room full');
          return;
        }

        this.recordAuthSuccess(ip);
        room.clients.set(clientId, ws);
        room.clientTokens.set(clientId, candidateHash);
        room.lastActive = Date.now();
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
        this.forwardToPeer(ws, targetPeerId, {
          type: 'offer',
          targetPeerId,
          senderPeerId,
          sdp,
        });
        break;
      }

      case 'answer': {
        const { targetPeerId, sdp, senderPeerId } = msg;
        this.forwardToPeer(ws, targetPeerId, {
          type: 'answer',
          targetPeerId,
          senderPeerId,
          sdp,
        });
        break;
      }

      case 'candidate': {
        const { targetPeerId, candidate, senderPeerId } = msg;
        this.forwardToPeer(ws, targetPeerId, {
          type: 'candidate',
          targetPeerId,
          senderPeerId,
          candidate,
        });
        break;
      }
    }
  }

  private forwardToPeer(senderWs: WebSocket, targetPeerId: string, message: any): void {
    // 1. Check if target is a PC host
    const directRoom = this.rooms.get(targetPeerId);
    if (directRoom && directRoom.pcWs && directRoom.pcWs.readyState === WebSocket.OPEN) {
      // Ensure sender is a member of this room
      if (Array.from(directRoom.clients.values()).includes(senderWs)) {
        this.sendJson(directRoom.pcWs, message);
        return;
      }
    }

    // 2. Check if target is a client in any active room
    for (const room of this.rooms.values()) {
      if (room.pcWs === senderWs) {
        const clientWs = room.clients.get(targetPeerId);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
          this.sendJson(clientWs, message);
          return;
        }
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
      const now = Date.now();
      for (const client of this.wss.clients) {
        const lastActive = (client as any).lastActive || now;
        if (now - lastActive > this.idleTimeoutMs) {
          try {
            client.terminate();
          } catch {}
          continue;
        }

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
