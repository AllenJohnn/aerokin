import { PeerConnection, DataChannel } from 'node-datachannel';
import { Connection, ConnectionState, ConnectionMode, ChannelName } from './Connection.js';
import { chunkDataChannelMessage, RtcMessageReassembler } from './RtcTransport.js';
import { DeviceStore } from '../device-store.js';
import { SignalingClient } from './SignalingClient.js';

export interface RtcHostManagerOptions {
  signalingClient: SignalingClient;
  deviceStore: DeviceStore;
  iceServers?: any[];
  onClientConnected?: (session: RtcHostSession) => void;
  onClientDisconnected?: (deviceId: string) => void;
  onClientAuthenticated?: (session: RtcHostSession) => void;
}

export class RtcHostSession implements Connection {
  public pc: PeerConnection;
  public peerId: string;
  private deviceStore: DeviceStore;
  private channels = new Map<ChannelName, DataChannel>();
  private reassembler = new RtcMessageReassembler();
  private messageHandlers = new Map<
    ChannelName,
    Set<(data: ArrayBuffer | string | Uint8Array) => void>
  >();
  private stateChangeHandlers = new Set<(state: ConnectionState) => void>();
  private nextMessageId = 1;

  public state: ConnectionState = 'connecting';
  public latencyMs = 0;
  public mode: ConnectionMode = 'webrtc_direct';
  public authenticated = false;
  public deviceId: string | null = null;
  public isClosed = false;

  constructor(
    peerId: string,
    pc: PeerConnection,
    deviceStore: DeviceStore,
    private onAuthSuccess?: (session: RtcHostSession) => void
  ) {
    this.peerId = peerId;
    this.pc = pc;
    this.deviceStore = deviceStore;

    this.pc.onStateChange((st) => {
      if (st === 'connected') {
        this.updateConnectionMode();
      } else if (st === 'disconnected') {
        this.notifyState('reconnecting');
      } else if (st === 'failed' || st === 'closed') {
        this.close();
      }
    });
  }

  public addDataChannel(dc: DataChannel): void {
    const label = dc.getLabel() as ChannelName;
    this.channels.set(label, dc);

    dc.onOpen(() => {
      if (this.channels.has('control') && this.channels.has('input')) {
        if (this.state !== 'connected') {
          this.state = 'connected';
          this.notifyState('connected');
        }
      }
    });

    dc.onClosed(() => {
      this.channels.delete(label);
      if (this.channels.size === 0 && !this.isClosed) {
        this.close();
      }
    });

    dc.onError((err) => {
      console.warn(`[RtcHostSession] DataChannel ${label} error:`, err);
    });

    dc.onMessage((raw: string | ArrayBuffer | Buffer) => {
      let packet: Uint8Array;
      if (typeof raw === 'string') {
        packet = Buffer.from(raw, 'utf8');
      } else if (raw instanceof ArrayBuffer) {
        packet = new Uint8Array(raw);
      } else {
        packet = raw;
      }
      const full = this.reassembler.processChunk(packet);
      if (!full) return;

      this.handleIncomingMessage(label, full);
    });
  }

  private handleIncomingMessage(channel: ChannelName, data: Uint8Array): void {
    if (channel === 'control') {
      try {
        const text = new TextDecoder().decode(data);
        const msg = JSON.parse(text);

        if (!this.authenticated) {
          if (msg.type === 'auth') {
            const { deviceId, credential } = msg;
            if (deviceId && credential && this.deviceStore.verifyCredential(deviceId, credential)) {
              this.authenticated = true;
              this.deviceId = deviceId;

              // Check if device is configured as remote
              const dev = this.deviceStore.getDevice(deviceId);

              this.send(
                'control',
                JSON.stringify({
                  type: 'auth_ok',
                  deviceId,
                  name: dev?.name || 'Device',
                  pcId: this.deviceStore.getPcId(),
                  pcName: this.deviceStore.getPcIdentity().name,
                })
              );

              this.onAuthSuccess?.(this);
              return;
            } else {
              this.send(
                'control',
                JSON.stringify({
                  type: 'auth_failed',
                  error: 'Unauthorized: Invalid or revoked device credential',
                })
              );
              this.close();
              return;
            }
          }
          // Drop all other control messages prior to auth
          return;
        }

        // Authenticated control messages
        if (msg.type === 'ping' && typeof msg.t === 'number') {
          this.send('control', JSON.stringify({ type: 'pong', t: msg.t }));
          this.latencyMs = Math.max(1, Date.now() - msg.t);
          return;
        }
      } catch {}
    }

    // In-band gate: drop input, media, stats, clipboard before auth
    if (!this.authenticated) {
      return;
    }

    const handlers = this.messageHandlers.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {}
      }
    }
  }

  private updateConnectionMode(): void {
    try {
      const pair = (this.pc as any).getSelectedCandidatePair?.();
      if (pair) {
        const isRelay =
          pair.local?.candidateType === 'relay' ||
          pair.remote?.candidateType === 'relay' ||
          String(pair.local?.candidate || '').includes('typ relay') ||
          String(pair.remote?.candidate || '').includes('typ relay');

        this.mode = isRelay ? 'webrtc_turn' : 'webrtc_direct';
      }
    } catch {
      this.mode = 'webrtc_direct';
    }
  }

  public send(channel: ChannelName, data: ArrayBuffer | string | Uint8Array): void {
    if (this.isClosed) return;
    const dc = this.channels.get(channel);
    if (!dc || !dc.isOpen()) return;

    const chunks = chunkDataChannelMessage(data as any, this.nextMessageId++);
    for (const chunk of chunks) {
      try {
        dc.sendMessageBinary(Buffer.from(chunk));
      } catch {}
    }
  }

  public onMessage(
    channel: ChannelName,
    handler: (data: ArrayBuffer | string | Uint8Array) => void
  ): () => void {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
    }
    const set = this.messageHandlers.get(channel)!;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  public onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  private notifyState(st: ConnectionState): void {
    this.state = st;
    for (const h of this.stateChangeHandlers) {
      try {
        h(st);
      } catch {}
    }
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    for (const dc of this.channels.values()) {
      try {
        dc.close();
      } catch {}
    }
    this.channels.clear();
    try {
      this.pc.close();
    } catch {}
    this.notifyState('closed');
  }
}

export class RtcHostManager {
  private options: RtcHostManagerOptions;
  private sessions = new Map<string, RtcHostSession>();
  private iceServers: any[];

  constructor(options: RtcHostManagerOptions) {
    this.options = options;
    this.iceServers = options.iceServers || [];
    this.bindSignalingClient();
  }

  public setIceServers(servers: any[]): void {
    this.iceServers = [...servers];
  }

  public getSession(peerId: string): RtcHostSession | undefined {
    return this.sessions.get(peerId);
  }

  public getActiveSessions(): RtcHostSession[] {
    return Array.from(this.sessions.values()).filter((s) => !s.isClosed);
  }

  private bindSignalingClient(): void {
    const sig = this.options.signalingClient as any;

    sig.options.onRegistered = (iceServers: any[]) => {
      if (Array.isArray(iceServers) && iceServers.length > 0) {
        this.iceServers = iceServers;
      }
    };

    sig.options.onOffer = (peerId: string, sdp: string) => {
      this.handleIncomingOffer(peerId, sdp);
    };

    sig.options.onCandidate = (peerId: string, candidate: any) => {
      this.handleIncomingCandidate(peerId, candidate);
    };

    sig.options.onPeerLeft = (peerId: string) => {
      this.handlePeerLeft(peerId);
    };
  }

  public handleIncomingOffer(peerId: string, sdp: string): void {
    try {
      // Close any existing session for this peerId
      const existing = this.sessions.get(peerId);
      if (existing) {
        existing.close();
        this.sessions.delete(peerId);
      }

      const formattedIceServers = this.iceServers.map((s) => {
        if (typeof s.urls === 'string') return s.urls;
        if (Array.isArray(s.urls)) return s.urls[0];
        return s;
      });

      const pc = new PeerConnection(peerId, {
        iceServers: formattedIceServers,
      });

      const session = new RtcHostSession(peerId, pc, this.options.deviceStore, (authedSession) => {
        this.options.onClientAuthenticated?.(authedSession);
      });

      this.sessions.set(peerId, session);

      pc.onLocalDescription((answerSdp, type) => {
        if (type === 'answer') {
          this.options.signalingClient.sendAnswer(peerId, answerSdp);
        }
      });

      pc.onLocalCandidate((candidate, sdpMid) => {
        this.options.signalingClient.sendCandidate(peerId, { candidate, sdpMid });
      });

      pc.onDataChannel((dc) => {
        session.addDataChannel(dc);
      });

      pc.setRemoteDescription(sdp, 'offer');
      this.options.onClientConnected?.(session);
    } catch (err) {
      console.error(`[RtcHostManager] Failed to handle offer from peer ${peerId}:`, err);
    }
  }

  public handleIncomingCandidate(peerId: string, candidate: any): void {
    const session = this.sessions.get(peerId);
    if (!session || session.isClosed) return;

    try {
      const candStr = typeof candidate === 'string' ? candidate : candidate.candidate;
      const mid = candidate.sdpMid || '0';
      if (candStr) {
        session.pc.addRemoteCandidate(candStr, mid);
      }
    } catch (err) {
      console.warn(`[RtcHostManager] Failed to add remote candidate for ${peerId}:`, err);
    }
  }

  public handlePeerLeft(peerId: string): void {
    const session = this.sessions.get(peerId);
    if (session) {
      const deviceId = session.deviceId;
      session.close();
      this.sessions.delete(peerId);
      if (deviceId) {
        this.options.onClientDisconnected?.(deviceId);
      }
    }
  }

  public closeAll(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }
}
