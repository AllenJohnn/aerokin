import { Connection, ChannelName, ConnectionState, ConnectionMode } from './Connection';

export class WsTransport implements Connection {
  public state: ConnectionState = 'connecting';
  public latencyMs = 0;
  public readonly mode: ConnectionMode = 'lan_direct';

  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers = new Map<
    ChannelName,
    Set<(data: ArrayBuffer | string | Uint8Array) => void>
  >();
  private stateChangeHandlers = new Set<(state: ConnectionState) => void>();
  private pingTimer: any = null;
  private lastPingSent = 0;
  private isExplicitlyClosed = false;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect(): void {
    if (this.isExplicitlyClosed) return;
    this.updateState('connecting');

    try {
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.updateState('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        if (!this.isExplicitlyClosed) {
          this.updateState('reconnecting');
        } else {
          this.updateState('closed');
        }
      };

      this.ws.onerror = () => {
        this.updateState('failed');
      };
    } catch {
      this.updateState('failed');
    }
  }

  private updateState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const h of this.stateChangeHandlers) {
      try {
        h(newState);
      } catch {}
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSent = performance.now();
        // Client-to-server ping
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 4000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private mapTypeToChannel(type: string): ChannelName {
    switch (type) {
      case 'move':
      case 'click':
      case 'button':
      case 'scroll':
      case 'key':
      case 'abs_move':
      case 'abs_click':
      case 'abs_button':
        return 'input';
      case 'media':
      case 'seekby':
      case 'seekto':
      case 'session':
      case 'setvolume':
      case 'getvolume':
      case 'nowplaying':
      case 'sessions':
      case 'volume':
        return 'media';
      case 'get_clipboard':
      case 'set_clipboard':
      case 'set_clipboard_and_paste':
      case 'clipboard_text':
      case 'clipboard_synced':
        return 'clipboard';
      case 'sys_stats_sub':
      case 'sys_stats_unsub':
      case 'sys_stats':
        return 'stats';
      default:
        return 'control';
    }
  }

  private handleMessage(data: any): void {
    if (data instanceof ArrayBuffer) {
      const handlers = this.messageHandlers.get('input');
      if (handlers) {
        for (const h of handlers) h(data);
      }
      return;
    }

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);

        // Handle pong / latency measurement
        if (parsed.type === 'pong' && this.lastPingSent > 0) {
          this.latencyMs = Math.round((performance.now() - this.lastPingSent) * 10) / 10;
        }

        let channel: ChannelName = 'control';
        if (
          parsed.channel &&
          ['input', 'stats', 'media', 'clipboard', 'control'].includes(parsed.channel)
        ) {
          channel = parsed.channel;
          const payload =
            typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data);
          const handlers = this.messageHandlers.get(channel);
          if (handlers) {
            for (const h of handlers) h(payload);
          }
          return;
        }

        if (parsed.type) {
          channel = this.mapTypeToChannel(parsed.type);
        }

        const handlers = this.messageHandlers.get(channel);
        if (handlers) {
          for (const h of handlers) h(data);
        }
      } catch {
        const handlers = this.messageHandlers.get('control');
        if (handlers) {
          for (const h of handlers) h(data);
        }
      }
    }
  }

  public send(channel: ChannelName, data: ArrayBuffer | string | Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type) {
          this.ws.send(data);
          return;
        }
      } catch {}

      this.ws.send(JSON.stringify({ channel, data }));
    } else {
      this.ws.send(data);
    }
  }

  public onMessage(
    channel: ChannelName,
    handler: (data: ArrayBuffer | string | Uint8Array) => void
  ): () => void {
    let set = this.messageHandlers.get(channel);
    if (!set) {
      set = new Set();
      this.messageHandlers.set(channel, set);
    }
    set.add(handler);

    return () => {
      set?.delete(handler);
    };
  }

  public onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  public close(): void {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    this.updateState('closed');
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
