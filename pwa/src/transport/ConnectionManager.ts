import { Connection, ConnectionState, ConnectionMode, ChannelName } from './Connection';
import { WsTransport } from './WsTransport';
import { RtcTransport } from './RtcTransport';

export interface ConnectionManagerOptions {
  lanUrl: string;
  signalingUrl?: string;
  deviceId: string;
  credential: string;
  pcId?: string;
  onModeChange?: (mode: ConnectionMode) => void;
  onLatencyUpdate?: (latencyMs: number) => void;
  onLanHostDiscovered?: (lanHost: string) => void;
}

export class ConnectionManager implements Connection {
  private options: ConnectionManagerOptions;
  private activeTransport: Connection | null = null;
  private lanProbeTimer: any = null;
  private stateChangeHandlers = new Set<(state: ConnectionState) => void>();
  private messageHandlers = new Map<
    ChannelName,
    Set<(data: ArrayBuffer | string | Uint8Array) => void>
  >();
  private currentMode: ConnectionMode = 'lan_direct';
  private currentState: ConnectionState = 'connecting';
  private currentLatency = 0;

  constructor(options: ConnectionManagerOptions) {
    this.options = options;
    this.connect();
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

  public connect(): void {
    this.currentState = 'connecting';
    this.notifyState('connecting');

    // 1. Probe LAN WebSocket first (fastest local path, <= 1.5s probe per S1)
    const lan = new WsTransport(this.options.lanUrl);
    this.activeTransport = lan;

    const LAN_PROBE_TIMEOUT_MS = 1500;
    if (this.lanProbeTimer) {
      clearTimeout(this.lanProbeTimer);
      this.lanProbeTimer = null;
    }

    if (this.options.signalingUrl && this.options.pcId) {
      this.lanProbeTimer = setTimeout(() => {
        if (this.currentState === 'connecting' && this.activeTransport === lan) {
          console.log(
            `[ConnectionManager] LAN probe timed out (<= 1.5s); switching to remote WebRTC signaling...`
          );
          lan.close();
          this.switchToWebRtc();
        }
      }, LAN_PROBE_TIMEOUT_MS);
    }

    lan.onStateChange((st) => {
      if (st === 'connected') {
        if (this.lanProbeTimer) {
          clearTimeout(this.lanProbeTimer);
          this.lanProbeTimer = null;
        }
        this.currentState = 'connected';
        this.currentMode = 'lan_direct';
        this.options.onModeChange?.(this.currentMode);
        this.notifyState('connected');

        try {
          const u = new URL(this.options.lanUrl);
          this.options.onLanHostDiscovered?.(u.host);
        } catch {}
      } else if (st === 'failed' || st === 'closed') {
        if (this.lanProbeTimer) {
          clearTimeout(this.lanProbeTimer);
          this.lanProbeTimer = null;
        }
        if (this.options.signalingUrl && this.options.pcId) {
          // Fall back to WebRTC
          this.switchToWebRtc();
        } else {
          this.currentState = 'failed';
          this.notifyState('failed');
        }
      } else if (st === 'reconnecting') {
        this.currentState = 'reconnecting';
        this.notifyState('reconnecting');
      }
    });

    // Wire message handlers
    for (const ch of ['input', 'stats', 'media', 'clipboard', 'control'] as ChannelName[]) {
      lan.onMessage(ch, (data) => {
        this.dispatchMessage(ch, data);
      });
    }
  }

  private switchToWebRtc(): void {
    if (this.lanProbeTimer) {
      clearTimeout(this.lanProbeTimer);
      this.lanProbeTimer = null;
    }

    if (!this.options.signalingUrl || !this.options.pcId) {
      this.currentState = 'failed';
      this.notifyState('failed');
      return;
    }

    console.log('[ConnectionManager] LAN unreachable; initiating WebRTC remote fallback...');
    this.activeTransport?.close();

    const rtc = new RtcTransport({
      signalingUrl: this.options.signalingUrl,
      pcId: this.options.pcId,
      clientId: this.options.deviceId,
      credential: this.options.credential,
      onModeChange: (m) => {
        this.currentMode = m;
        this.options.onModeChange?.(m);
      },
      onLatencyUpdate: (lat) => {
        this.currentLatency = lat;
        this.options.onLatencyUpdate?.(lat);
      },
    });
    this.activeTransport = rtc;

    rtc.onStateChange((st) => {
      this.currentState = st;
      this.notifyState(st);
    });

    for (const ch of ['input', 'stats', 'media', 'clipboard', 'control'] as ChannelName[]) {
      rtc.onMessage(ch, (data) => {
        if (ch === 'control') {
          try {
            const text =
              typeof data === 'string'
                ? data
                : new TextDecoder().decode(
                    data instanceof Uint8Array ? data : new Uint8Array(data)
                  );
            const parsed = JSON.parse(text);
            if (parsed.lanIp && parsed.port) {
              this.options.onLanHostDiscovered?.(`${parsed.lanIp}:${parsed.port}`);
            }
          } catch {}
        }
        this.dispatchMessage(ch, data);
      });
    }
  }

  public send(channel: ChannelName, data: ArrayBuffer | string | Uint8Array): void {
    if (this.activeTransport && this.currentState === 'connected') {
      this.activeTransport.send(channel, data);
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
    for (const h of this.stateChangeHandlers) {
      try {
        h(st);
      } catch {}
    }
  }

  public close(): void {
    if (this.lanProbeTimer) {
      clearTimeout(this.lanProbeTimer);
      this.lanProbeTimer = null;
    }
    this.currentState = 'closed';
    this.activeTransport?.close();
    this.activeTransport = null;
    this.notifyState('closed');
  }
}
