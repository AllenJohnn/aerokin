/**
 * AEROKIN Transport Abstraction
 *
 * Provides a unified bidirectional connection interface for:
 * 1. Direct LAN WebSocket (WsTransport)
 * 2. Direct WebRTC DataChannel (RtcTransport - Part 4)
 * 3. TURN Relay WebRTC DataChannel (RtcTransport - Part 4)
 */

export type ChannelName = 'input' | 'stats' | 'media' | 'clipboard' | 'control';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export type ConnectionMode = 'lan_direct' | 'webrtc_direct' | 'webrtc_turn';

export interface FrameMeta {
  sequence: number;
  timestampMs: number;
  width?: number;
  height?: number;
  isKeyframe?: boolean;
  codec?: 'h264' | 'mjpeg';
}

export interface FrameSinkStats {
  fps: number;
  bitrateKbps: number;
  droppedFrames: number;
  decodeLatencyMs?: number;
  rttMs?: number;
}

export interface Connection {
  state: ConnectionState;
  latencyMs: number;
  mode: ConnectionMode;

  send(channel: ChannelName, data: ArrayBuffer | string | Uint8Array): void;
  onMessage(
    channel: ChannelName,
    handler: (data: ArrayBuffer | string | Uint8Array) => void
  ): () => void;
  onStateChange(handler: (state: ConnectionState) => void): () => void;
  close(): void;
}

export interface FrameSink {
  pushFrame(chunk: ArrayBuffer | Uint8Array, metadata?: FrameMeta): void;
  onStats(handler: (stats: FrameSinkStats) => void): () => void;
  close?(): void;
}
