import {
  Connection,
  ConnectionState,
  ConnectionMode,
  ChannelName,
} from './Connection';

export interface RtcChunkHeader {
  messageId: number;
  chunkIndex: number;
  totalChunks: number;
}

export const RTC_MAX_CHUNK_SIZE = 56 * 1024; // 56 KB to stay safely below 64KB DataChannel limits

/**
 * Splits a binary buffer or string into chunked DataChannel packets with a 12-byte header:
 * [0..3]: uint32 messageId
 * [4..7]: uint32 chunkIndex
 * [8..11]: uint32 totalChunks
 * [12..]: payload slice
 */
export function chunkDataChannelMessage(
  data: ArrayBuffer | Uint8Array | string,
  messageId: number
): Uint8Array[] {
  let rawBytes: Uint8Array;
  if (typeof data === 'string') {
    rawBytes = new TextEncoder().encode(data);
  } else if (data instanceof ArrayBuffer) {
    rawBytes = new Uint8Array(data);
  } else {
    rawBytes = data;
  }

  const totalLength = rawBytes.byteLength;
  const totalChunks = Math.max(1, Math.ceil(totalLength / RTC_MAX_CHUNK_SIZE));
  const chunks: Uint8Array[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * RTC_MAX_CHUNK_SIZE;
    const end = Math.min(start + RTC_MAX_CHUNK_SIZE, totalLength);
    const slice = rawBytes.subarray(start, end);

    const packet = new Uint8Array(12 + slice.byteLength);
    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);

    view.setUint32(0, messageId, true);
    view.setUint32(4, i, true);
    view.setUint32(8, totalChunks, true);
    packet.set(slice, 12);

    chunks.push(packet);
  }

  return chunks;
}

/**
 * Reassembles chunked DataChannel packets into complete messages.
 */
export class RtcMessageReassembler {
  private pending = new Map<
    number,
    {
      totalChunks: number;
      receivedCount: number;
      chunks: (Uint8Array | null)[];
      totalBytes: number;
      timestamp: number;
    }
  >();

  public processChunk(packet: Uint8Array): Uint8Array | null {
    if (packet.byteLength < 12) {
      return null;
    }

    const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
    const messageId = view.getUint32(0, true);
    const chunkIndex = view.getUint32(4, true);
    const totalChunks = view.getUint32(8, true);
    const payload = packet.subarray(12);

    // Single chunk message fast-path
    if (totalChunks === 1 && chunkIndex === 0) {
      return payload;
    }

    let record = this.pending.get(messageId);
    if (!record) {
      if (totalChunks <= 0 || totalChunks > 10000) {
        return null;
      }
      record = {
        totalChunks,
        receivedCount: 0,
        chunks: new Array(totalChunks).fill(null),
        totalBytes: 0,
        timestamp: Date.now(),
      };
      this.pending.set(messageId, record);
    }

    if (chunkIndex < record.totalChunks && !record.chunks[chunkIndex]) {
      record.chunks[chunkIndex] = payload;
      record.receivedCount++;
      record.totalBytes += payload.byteLength;
    }

    // Check if message is fully reassembled
    if (record.receivedCount === record.totalChunks) {
      this.pending.delete(messageId);
      const fullMessage = new Uint8Array(record.totalBytes);
      let offset = 0;
      for (let i = 0; i < record.totalChunks; i++) {
        const slice = record.chunks[i];
        if (slice) {
          fullMessage.set(slice, offset);
          offset += slice.byteLength;
        }
      }
      return fullMessage;
    }

    // Cleanup stale incomplete messages (>15s old)
    const now = Date.now();
    for (const [id, r] of this.pending) {
      if (now - r.timestamp > 15000) {
        this.pending.delete(id);
      }
    }

    return null;
  }
}

export interface RtcTransportOptions {
  signalingUrl: string;
  pcId: string;
  clientId: string;
  authSecret: string;
  onModeChange?: (mode: ConnectionMode) => void;
  onLatencyUpdate?: (latencyMs: number) => void;
  iceServers?: RTCIceServer[];
}

export class RtcTransport implements Connection {
  private options: RtcTransportOptions;
  private stateChangeHandlers = new Set<(state: ConnectionState) => void>();
  private messageHandlers = new Map<ChannelName, Set<(data: ArrayBuffer | string | Uint8Array) => void>>();
  private currentState: ConnectionState = 'connecting';
  private currentMode: ConnectionMode = 'webrtc_direct';
  private currentLatency = 0;
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private channels = new Map<ChannelName, RTCDataChannel>();
  private reassembler = new RtcMessageReassembler();
  private nextMessageId = 1;
  private pingInterval: any = null;
  private isClosed = false;

  constructor(options: RtcTransportOptions) {
    this.options = options;
    this.init();
  }

  public get state(): ConnectionState {
    return this.currentState;
  }

  public get latencyMs(): number {
    return this.currentLatency;
  }

  public get mode(): ConnectionMode {
    return this.currentMode;
  }

  private init(): void {
    if (this.isClosed) return;
    try {
      this.ws = new WebSocket(this.options.signalingUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.ws?.send(
          JSON.stringify({
            type: 'join',
            pcId: this.options.pcId,
            clientId: this.options.clientId,
            authSecret: this.options.authSecret,
          })
        );
      };

      this.ws.onmessage = async (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
          const msg = JSON.parse(raw);

          if (msg.type === 'joined') {
            await this.setupPeerConnection(msg.iceServers || this.options.iceServers || []);
          } else if (msg.type === 'answer') {
            if (this.pc && msg.sdp) {
              await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
            }
          } else if (msg.type === 'candidate') {
            if (this.pc && msg.candidate) {
              await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            }
          } else if (msg.type === 'peer_left') {
            this.notifyState('reconnecting');
          } else if (msg.type === 'error') {
            console.error('[RtcTransport] Signaling error:', msg.message);
            this.notifyState('failed');
          }
        } catch (err) {
          console.error('[RtcTransport] Failed to process signaling message:', err);
        }
      };

      this.ws.onerror = () => {
        if (this.currentState === 'connecting') {
          this.currentState = 'failed';
          this.notifyState('failed');
        }
      };

      this.ws.onclose = () => {
        if (!this.isClosed && this.currentState !== 'connected') {
          this.currentState = 'failed';
          this.notifyState('failed');
        }
      };
    } catch {
      this.currentState = 'failed';
      this.notifyState('failed');
    }
  }

  private async setupPeerConnection(iceServers: RTCIceServer[]): Promise<void> {
    if (this.isClosed) return;

    this.pc = new RTCPeerConnection({
      iceServers: iceServers.length > 0 ? iceServers : [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const channelNames: ChannelName[] = ['control', 'input', 'stats', 'media', 'clipboard'];
    for (const ch of channelNames) {
      const isInput = ch === 'input';
      const dc = this.pc.createDataChannel(ch, {
        ordered: !isInput,
        maxRetransmits: isInput ? 0 : undefined,
      });
      dc.binaryType = 'arraybuffer';
      this.setupDataChannel(ch, dc);
      this.channels.set(ch, dc);
    }

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'candidate',
            targetPeerId: this.options.pcId,
            candidate: ev.candidate,
          })
        );
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        this.checkCandidateType();
      } else if (state === 'disconnected') {
        this.notifyState('reconnecting');
      } else if (state === 'failed') {
        this.notifyState('failed');
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'offer',
          targetPeerId: this.options.pcId,
          sdp: offer.sdp,
        })
      );
    }
  }

  private setupDataChannel(name: ChannelName, dc: RTCDataChannel): void {
    dc.onopen = () => {
      // Once primary control and input channels open, connection is established
      if (this.channels.get('control')?.readyState === 'open' && this.channels.get('input')?.readyState === 'open') {
        if (this.currentState !== 'connected') {
          this.currentState = 'connected';
          this.notifyState('connected');
          this.startPing();
        }
      }
    };

    dc.onclose = () => {
      if (!this.isClosed && this.currentState === 'connected') {
        this.notifyState('reconnecting');
      }
    };

    dc.onmessage = (ev) => {
      let raw: Uint8Array;
      if (ev.data instanceof ArrayBuffer) {
        raw = new Uint8Array(ev.data);
      } else if (ev.data instanceof Uint8Array) {
        raw = ev.data;
      } else {
        raw = new TextEncoder().encode(String(ev.data));
      }

      const fullMessage = this.reassembler.processChunk(raw);
      if (fullMessage) {
        if (name === 'control') {
          try {
            const text = new TextDecoder().decode(fullMessage);
            const parsed = JSON.parse(text);
            if (parsed.type === 'pong' && typeof parsed.t === 'number') {
              this.currentLatency = Math.max(1, Date.now() - parsed.t);
              this.options.onLatencyUpdate?.(this.currentLatency);
              return;
            }
          } catch {}
        }
        this.dispatchMessage(name, fullMessage);
      }
    };
  }

  private checkCandidateType(): void {
    if (!this.pc?.getStats) return;
    this.pc.getStats().then((stats) => {
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const remoteCand = stats.get(report.remoteCandidateId);
          const localCand = stats.get(report.localCandidateId);
          const isRelay = remoteCand?.candidateType === 'relay' || localCand?.candidateType === 'relay';
          const newMode: ConnectionMode = isRelay ? 'webrtc_turn' : 'webrtc_direct';
          if (this.currentMode !== newMode) {
            this.currentMode = newMode;
            this.options.onModeChange?.(newMode);
          }
        }
      });
    }).catch(() => {});
  }

  private startPing(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.currentState === 'connected') {
        this.send('control', JSON.stringify({ type: 'ping', t: Date.now() }));
      }
    }, 2000);
  }

  public send(channel: ChannelName, data: ArrayBuffer | string | Uint8Array): void {
    const dc = this.channels.get(channel);
    if (!dc || dc.readyState !== 'open') return;

    const chunks = chunkDataChannelMessage(data, this.nextMessageId++);
    for (const chunk of chunks) {
      dc.send(chunk.buffer as ArrayBuffer);
    }
  }

  public onMessage(
    channel: ChannelName,
    handler: (data: ArrayBuffer | string | Uint8Array) => void
  ): () => void {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
    }
    const handlers = this.messageHandlers.get(channel)!;
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  public onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  private dispatchMessage(channel: ChannelName, data: ArrayBuffer | string | Uint8Array): void {
    const handlers = this.messageHandlers.get(channel);
    if (handlers) {
      for (const h of handlers) {
        try {
          h(data);
        } catch {}
      }
    }
  }

  private notifyState(st: ConnectionState): void {
    this.currentState = st;
    for (const h of this.stateChangeHandlers) {
      try {
        h(st);
      } catch {}
    }
  }

  public close(): void {
    this.isClosed = true;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const dc of this.channels.values()) {
      try {
        dc.close();
      } catch {}
    }
    this.channels.clear();
    try {
      this.pc?.close();
    } catch {}
    this.pc = null;
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.notifyState('closed');
  }
}
