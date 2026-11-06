import WebSocket from 'ws';
import crypto from 'node:crypto';

export interface SignalingClientOptions {
  signalingUrl: string;
  pcId: string;
  authSecret?: string;
  onRegistered?: (iceServers: any[]) => void;
  onStatusChange?: (connected: boolean) => void;
  onOffer?: (sourcePeerId: string, sdp: string) => void;
  onCandidate?: (sourcePeerId: string, candidate: any) => void;
  onPeerLeft?: (peerId: string) => void;
}

export class SignalingClient {
  private options: SignalingClientOptions;
  private ws: WebSocket | null = null;
  private isClosed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private registered = false;

  constructor(options: SignalingClientOptions) {
    this.options = options;
    this.connect();
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.registered;
  }

  private connect(): void {
    if (this.isClosed) return;

    try {
      this.ws = new WebSocket(this.options.signalingUrl);

      this.ws.on('open', () => {
        const authSecret = this.options.authSecret || crypto.createHash('sha256').update(this.options.pcId).digest('hex');
        this.send({
          type: 'register',
          pcId: this.options.pcId,
          authSecret,
        });

        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.send({ type: 'ping' });
          }
        }, 15000);
      });

      this.ws.on('message', (raw: Buffer | string) => {
        try {
          const str = typeof raw === 'string' ? raw : raw.toString('utf8');
          const msg = JSON.parse(str);

          if (msg.type === 'registered') {
            this.registered = true;
            this.options.onRegistered?.(msg.iceServers || []);
            this.options.onStatusChange?.(true);
          } else if (msg.type === 'offer') {
            this.options.onOffer?.(msg.sourcePeerId || msg.peerId, msg.sdp);
          } else if (msg.type === 'candidate') {
            this.options.onCandidate?.(msg.sourcePeerId || msg.peerId, msg.candidate);
          } else if (msg.type === 'peer_left') {
            this.options.onPeerLeft?.(msg.peerId);
          }
        } catch {}
      });

      this.ws.on('close', () => {
        this.registered = false;
        this.options.onStatusChange?.(false);
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        try {
          this.ws?.close();
        } catch {}
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  public sendAnswer(targetPeerId: string, sdp: string): void {
    this.send({
      type: 'answer',
      targetPeerId,
      sdp,
    });
  }

  public sendCandidate(targetPeerId: string, candidate: any): void {
    this.send({
      type: 'candidate',
      targetPeerId,
      candidate,
    });
  }

  private send(msg: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {}
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  public close(): void {
    this.isClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}
