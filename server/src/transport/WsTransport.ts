import { WebSocket } from 'ws';
import { Connection, ChannelName, ConnectionState, ConnectionMode } from './Connection.js';

export class WsTransport implements Connection {
  public state: ConnectionState = 'connected';
  public latencyMs = 0;
  public readonly mode: ConnectionMode = 'lan_direct';

  private ws: WebSocket;
  private messageHandlers = new Map<
    ChannelName,
    Set<(data: ArrayBuffer | string | Uint8Array) => void>
  >();
  private stateChangeHandlers = new Set<(state: ConnectionState) => void>();
  private pingInterval: NodeJS.Timeout | null = null;
  private lastPingTime = 0;

  constructor(ws: WebSocket) {
    this.ws = ws;

    if (ws.readyState === WebSocket.CONNECTING) {
      this.state = 'connecting';
      ws.once('open', () => this.updateState('connected'));
    } else if (ws.readyState === WebSocket.OPEN) {
      this.state = 'connected';
    } else {
      this.state = 'closed';
    }

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      this.handleIncoming(data, isBinary);
    });

    ws.on('close', () => {
      this.stopPing();
      this.updateState('closed');
    });

    ws.on('error', () => {
      this.updateState('failed');
    });

    this.startPing();
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

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = performance.now();
        try {
          this.ws.ping();
        } catch {}
      }
    }, 5000);

    this.ws.on('pong', () => {
      if (this.lastPingTime > 0) {
        this.latencyMs = Math.round((performance.now() - this.lastPingTime) * 10) / 10;
      }
    });
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private mapMessageTypeToChannel(type: string): ChannelName {
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

  private handleIncoming(data: any, isBinary: boolean): void {
    if (isBinary) {
      // Binary messages default to input channel unless tagged
      const handlers = this.messageHandlers.get('input');
      if (handlers) {
        for (const h of handlers) h(data);
      }
      return;
    }

    const text = data.toString('utf8');
    try {
      const parsed = JSON.parse(text);
      let channel: ChannelName = 'control';

      if (
        parsed.channel &&
        ['input', 'stats', 'media', 'clipboard', 'control'].includes(parsed.channel)
      ) {
        channel = parsed.channel;
        const payload = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data);
        const handlers = this.messageHandlers.get(channel);
        if (handlers) {
          for (const h of handlers) h(payload);
        }
        return;
      }

      if (parsed.type) {
        channel = this.mapMessageTypeToChannel(parsed.type);
      }

      const handlers = this.messageHandlers.get(channel);
      if (handlers) {
        for (const h of handlers) h(text);
      }
    } catch {
      // Raw string fallback
      const handlers = this.messageHandlers.get('control');
      if (handlers) {
        for (const h of handlers) h(text);
      }
    }
  }

  public send(channel: ChannelName, data: ArrayBuffer | string | Uint8Array): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        // If already has type, send directly
        if (parsed.type) {
          this.ws.send(data);
          return;
        }
      } catch {}

      // Wrap in envelope
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
    this.stopPing();
    this.updateState('closed');
    try {
      this.ws.close();
    } catch {}
  }
}
