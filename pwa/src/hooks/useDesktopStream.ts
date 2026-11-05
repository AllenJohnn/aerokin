import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DesktopStats,
  DesktopStreamState,
  MonitorInfo,
} from '../types/desktop';

export interface UseDesktopStreamOptions {
  host: string | null;
  deviceId: string | null;
  credential: string | null;
  isHosted: boolean;
  active: boolean; // whether desktop tab is currently in view
  serverState?: DesktopStreamState;
  activeMonitor?: MonitorInfo | null;
}

export interface UseDesktopStreamReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  streamState: DesktopStreamState;
  streamError: string | null;
  stats: DesktopStats;
  zoom: number;
  pan: { x: number; y: number };
  setZoom: (z: number | ((prev: number) => number)) => void;
  setPan: (p: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  resetZoomPan: () => void;
  toNormalizedMonitorCoords: (clientX: number, clientY: number) => { x: number; y: number } | null;
  reconnectStream: () => void;
}

export function useDesktopStream({
  host,
  deviceId,
  credential,
  isHosted,
  active,
  serverState,
  activeMonitor,
}: UseDesktopStreamOptions): UseDesktopStreamReturn {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const [streamState, setStreamState] = useState<DesktopStreamState>('stopped');
  const [streamError, setStreamError] = useState<string | null>(null);

  // Client measured metrics
  const [stats, setStats] = useState<DesktopStats>({
    fps: 0,
    bitrateKbps: 0,
    droppedFrames: 0,
    width: 0,
    height: 0,
    latencyMs: 0,
  });

  // Local pan & zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const resetZoomPan = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef<number>(1000);
  const latestBitmapRef = useRef<ImageBitmap | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Frame rate & bitrate calculation accumulators
  const frameCountRef = useRef<number>(0);
  const byteCountRef = useRef<number>(0);
  const lastStatsCalcRef = useRef<number>(Date.now());
  const lastLatencyRef = useRef<number>(0);

  // Geometry tracking for coordinate hit-testing
  const geometryRef = useRef({
    canvasWidth: 0,
    canvasHeight: 0,
    renderWidth: 0,
    renderHeight: 0,
    offsetX: 0,
    offsetY: 0,
    streamWidth: 0,
    streamHeight: 0,
  });

  // Render loop using requestAnimationFrame
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const bitmap = latestBitmapRef.current;
    if (!canvas || !bitmap) {
      rafIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafIdRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const cw = canvas.width;
    const ch = canvas.height;
    const bw = bitmap.width;
    const bh = bitmap.height;

    // Calculate aspect ratio fit (letterboxing / pillarboxing)
    const canvasAspect = cw / (ch || 1);
    const streamAspect = bw / (bh || 1);

    let rw = cw;
    let rh = ch;
    let ox = 0;
    let oy = 0;

    if (canvasAspect > streamAspect) {
      // Height-constrained (pillarbox bars on sides)
      rh = ch;
      rw = Math.round(ch * streamAspect);
      ox = Math.round((cw - rw) / 2);
      oy = 0;
    } else {
      // Width-constrained (letterbox bars on top/bottom)
      rw = cw;
      rh = Math.round(cw / streamAspect);
      ox = 0;
      oy = Math.round((ch - rh) / 2);
    }

    geometryRef.current = {
      canvasWidth: cw,
      canvasHeight: ch,
      renderWidth: rw,
      renderHeight: rh,
      offsetX: ox,
      offsetY: oy,
      streamWidth: bw,
      streamHeight: bh,
    };

    // Draw background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cw, ch);

    // Apply zoom & pan centered on canvas
    ctx.save();
    ctx.translate(cw / 2 + pan.x * dpr, ch / 2 + pan.y * dpr);
    ctx.scale(zoom, zoom);
    ctx.translate(-cw / 2, -ch / 2);

    ctx.drawImage(bitmap, ox, oy, rw, rh);
    ctx.restore();

    rafIdRef.current = requestAnimationFrame(renderFrame);
  }, [zoom, pan]);

  useEffect(() => {
    rafIdRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [renderFrame]);

  // Connect and manage streaming WebSocket
  const connectStream = useCallback(() => {
    if (!active || !deviceId || !credential) {
      setStreamState('stopped');
      return;
    }

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {}
      socketRef.current = null;
    }

    let streamWsUrl: string;

    if (isHosted) {
      if (!host) {
        setStreamState('error');
        setStreamError('Host address not configured');
        return;
      }
      streamWsUrl = `wss://${host}/desktop/stream?deviceId=${encodeURIComponent(
        deviceId
      )}&credential=${encodeURIComponent(credential)}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const isDevPort = window.location.port === '5174' || window.location.port === '5173';
      const devServerPort = import.meta.env.VITE_DEV_SERVER_PORT || '8443';
      const targetHost = isDevPort
        ? `${window.location.hostname}:${devServerPort}`
        : window.location.host;
      streamWsUrl = `${protocol}//${targetHost}/desktop/stream?deviceId=${encodeURIComponent(
        deviceId
      )}&credential=${encodeURIComponent(credential)}`;
    }

    setStreamState('connecting');
    setStreamError(null);

    try {
      const ws = new WebSocket(streamWsUrl);
      ws.binaryType = 'arraybuffer';
      socketRef.current = ws;

      ws.onopen = () => {
        setStreamState('live');
        setStreamError(null);
        backoffRef.current = 1000;
        // Also send auth JSON greeting in case server prefers message-based auth
        try {
          ws.send(JSON.stringify({ type: 'auth', deviceId, credential }));
        } catch {}
      };

      ws.onmessage = async (event) => {
        if (!(event.data instanceof ArrayBuffer)) {
          // JSON signaling packet (e.g. stream_auth_ok or error)
          try {
            const raw = typeof event.data === 'string' ? event.data : '';
            if (raw) {
              const data = JSON.parse(raw);
              if (data.type === 'error') {
                setStreamError(data.message || 'Stream error');
              }
            }
          } catch {}
          return;
        }

        const buf = event.data;
        if (buf.byteLength < 16) return;

        const view = new DataView(buf);
        const m0 = view.getUint8(0);
        const m1 = view.getUint8(1);
        const m2 = view.getUint8(2);
        const m3 = view.getUint8(3);

        // Verify 'AERO' header
        if (m0 !== 0x41 || m1 !== 0x45 || m2 !== 0x52 || m3 !== 0x4f) {
          return;
        }

        const seq = view.getUint32(4, true);
        const serverTimestamp = view.getUint32(8, true);
        const width = view.getUint16(12, true);
        const height = view.getUint16(14, true);

        const latency = Math.max(1, Date.now() - serverTimestamp);
        lastLatencyRef.current = latency;

        // Decode JPEG blob
        try {
          const jpegBlob = new Blob([new Uint8Array(buf, 16)], { type: 'image/jpeg' });
          const newBitmap = await createImageBitmap(jpegBlob);

          const oldBitmap = latestBitmapRef.current;
          latestBitmapRef.current = newBitmap;
          if (oldBitmap) {
            oldBitmap.close();
          }

          frameCountRef.current++;
          byteCountRef.current += buf.byteLength;
          setStreamState('live');
        } catch {
          // Ignore occasional corrupted JPEG frames on network hiccup
        }
      };

      ws.onclose = (event) => {
        if (latestBitmapRef.current) {
          latestBitmapRef.current.close();
          latestBitmapRef.current = null;
        }

        if (event.code === 4001) {
          setStreamState('error');
          setStreamError('Unauthorized stream session: device credential invalid');
          return;
        }

        if (active) {
          setStreamState('reconnecting');
          const delay = Math.min(8000, backoffRef.current);
          backoffRef.current = Math.min(8000, backoffRef.current * 1.5);
          reconnectTimerRef.current = setTimeout(connectStream, delay);
        } else {
          setStreamState('stopped');
        }
      };

      ws.onerror = () => {
        setStreamError('Stream socket connection error');
      };
    } catch (err: any) {
      setStreamState('error');
      setStreamError(err?.message || 'Failed to initialize WebSocket');
    }
  }, [active, deviceId, credential, isHosted, host]);

  useEffect(() => {
    if (active) {
      connectStream();
    } else {
      setStreamState('stopped');
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'Tab inactive');
        } catch {}
        socketRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (latestBitmapRef.current) {
        latestBitmapRef.current.close();
        latestBitmapRef.current = null;
      }
    }

    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'Unmounting');
        } catch {}
        socketRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (latestBitmapRef.current) {
        latestBitmapRef.current.close();
        latestBitmapRef.current = null;
      }
    };
  }, [active, connectStream]);

  // Sync server secure-screen state if notified on control channel
  useEffect(() => {
    if (serverState === 'secure_screen') {
      setStreamState('secure_screen');
    }
  }, [serverState]);

  // Periodic client stats updater (1Hz)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsedSec = Math.max(0.1, (now - lastStatsCalcRef.current) / 1000);
      const fps = Math.round((frameCountRef.current / elapsedSec) * 10) / 10;
      const bitrateKbps = Math.round(((byteCountRef.current * 8) / elapsedSec / 1024) * 10) / 10;

      frameCountRef.current = 0;
      byteCountRef.current = 0;
      lastStatsCalcRef.current = now;

      setStats((prev) => ({
        ...prev,
        fps,
        bitrateKbps,
        latencyMs: lastLatencyRef.current,
        width: geometryRef.current.streamWidth,
        height: geometryRef.current.streamHeight,
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  /**
   * Pure coordinate transform:
   * Maps client touch screen (clientX, clientY) through:
   * 1. Canvas client bounding box
   * 2. DPR scaling
   * 3. Local Zoom & Pan camera inverse
   * 4. Letterbox / aspect ratio offset
   * 5. Clamps to [0, 1] relative to active monitor bounds
   */
  const toNormalizedMonitorCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const dpr = window.devicePixelRatio || 1;
      const touchX = (clientX - rect.left) * dpr;
      const touchY = (clientY - rect.top) * dpr;

      const geom = geometryRef.current;
      if (geom.renderWidth <= 0 || geom.renderHeight <= 0) return null;

      const cw = geom.canvasWidth;
      const ch = geom.canvasHeight;

      // Inverse of camera transform:
      // ctx.translate(cw/2 + pan.x * dpr, ch/2 + pan.y * dpr);
      // ctx.scale(zoom, zoom);
      // ctx.translate(-cw/2, -ch/2);
      const relX = touchX - (cw / 2 + pan.x * dpr);
      const relY = touchY - (ch / 2 + pan.y * dpr);

      const unscaledX = relX / zoom + cw / 2;
      const unscaledY = relY / zoom + ch / 2;

      // Subtract letterbox offsets
      const frameX = unscaledX - geom.offsetX;
      const frameY = unscaledY - geom.offsetY;

      // Normalize to [0, 1]
      const normX = Math.max(0, Math.min(1, frameX / geom.renderWidth));
      const normY = Math.max(0, Math.min(1, frameY / geom.renderHeight));

      return { x: normX, y: normY };
    },
    [zoom, pan]
  );

  return {
    canvasRef,
    streamState,
    streamError,
    stats,
    zoom,
    pan,
    setZoom,
    setPan,
    resetZoomPan,
    toNormalizedMonitorCoords,
    reconnectStream: connectStream,
  };
}
