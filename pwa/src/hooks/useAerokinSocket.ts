import { useEffect, useRef, useState, useCallback } from 'react';
import { requestWakeLock, releaseWakeLock } from '../utils/wakelock';

export type MediaAction =
  | 'playpause'
  | 'next'
  | 'prev'
  | 'volup'
  | 'voldown'
  | 'mute'
  | 'fullscreen'
  | 'seekfwd'
  | 'seekback';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'unauthorized' | 'disconnected';

export interface NowPlayingData {
  app?: string;
  title?: string;
  artist?: string;
  art?: string;
  status: 'playing' | 'paused' | 'stopped' | 'none';
  position?: number;
  duration?: number;
  canSeek?: boolean;
}

export interface MediaSessionItem {
  id: string;
  app: string;
  title: string;
  current: boolean;
}

export interface UseAerokinSocketReturn {
  status: ConnectionStatus;
  latency: number | null;
  token: string | null;
  setToken: (token: string) => void;
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right' | 'middle') => void;
  sendButton: (button: 'left' | 'right' | 'middle', state: 'down' | 'up') => void;
  sendScroll: (dy: number, dx?: number) => void;
  sendMedia: (action: MediaAction) => void;
  sendSeekBy: (seconds: number) => void;
  sendSeekTo: (position: number) => void;
  sendSession: (id: string) => void;
  sendSetVolume: (level: number) => void;
  isBackpressured: () => boolean;
  nowPlaying: NowPlayingData;
  sessions: MediaSessionItem[];
  volume: number;
  muted: boolean;
}

const STORAGE_TOKEN_KEY = 'aerokin_auth_token';

export function useAerokinSocket(): UseAerokinSocketReturn {
  // Read token from URL query or localStorage
  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken && urlToken.trim().length > 0) {
      localStorage.setItem(STORAGE_TOKEN_KEY, urlToken.trim());
      return urlToken.trim();
    }
    return localStorage.getItem(STORAGE_TOKEN_KEY) || null;
  });

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);

  // Live media state from server
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData>({ status: 'none' });
  const [sessions, setSessions] = useState<MediaSessionItem[]>([]);
  const [volume, setVolume] = useState<number>(50);
  const [muted, setMuted] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const backoffDelayRef = useRef<number>(1000);

  const setToken = useCallback((newToken: string) => {
    const cleaned = newToken.trim().toUpperCase();
    localStorage.setItem(STORAGE_TOKEN_KEY, cleaned);
    setTokenState(cleaned);
    backoffDelayRef.current = 1000;
  }, []);

  const isBackpressured = useCallback((): boolean => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return true;
    }
    // Skip sending while ws.bufferedAmount > 4KB
    return socketRef.current.bufferedAmount > 4096;
  }, []);

  const sendRaw = useCallback((payload: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const sendMove = useCallback(
    (dx: number, dy: number) => {
      sendRaw({ type: 'move', dx, dy });
    },
    [sendRaw]
  );

  const sendClick = useCallback(
    (button: 'left' | 'right' | 'middle' = 'left') => {
      sendRaw({ type: 'click', button });
    },
    [sendRaw]
  );

  const sendButton = useCallback(
    (button: 'left' | 'right' | 'middle', state: 'down' | 'up') => {
      sendRaw({ type: 'button', button, state });
    },
    [sendRaw]
  );

  const sendScroll = useCallback(
    (dy: number, dx?: number) => {
      sendRaw({ type: 'scroll', dy, dx });
    },
    [sendRaw]
  );

  const sendMedia = useCallback(
    (action: MediaAction) => {
      sendRaw({ type: 'media', action });
    },
    [sendRaw]
  );

  const sendSeekBy = useCallback(
    (seconds: number) => {
      sendRaw({ type: 'seekby', seconds });
    },
    [sendRaw]
  );

  const sendSeekTo = useCallback(
    (position: number) => {
      sendRaw({ type: 'seekto', position });
    },
    [sendRaw]
  );

  const sendSession = useCallback(
    (id: string) => {
      sendRaw({ type: 'session', id });
    },
    [sendRaw]
  );

  const sendSetVolume = useCallback(
    (level: number) => {
      setVolume(Math.round(level));
      sendRaw({ type: 'setvolume', level: Math.round(level) });
    },
    [sendRaw]
  );

  useEffect(() => {
    if (!token) {
      setStatus('unauthorized');
      return;
    }

    let isMounted = true;

    function connect() {
      if (!token) return;

      if (socketRef.current) {
        socketRef.current.close();
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In dev mode (e.g. port 5174 or 5173), default to server on port 8443
      const isDevPort = window.location.port === '5174' || window.location.port === '5173';
      const host = isDevPort
        ? `${window.location.hostname}:8443`
        : window.location.host;

      const wsUrl = `${protocol}//${host}/?token=${encodeURIComponent(token)}`;

      setStatus((prev) => (prev === 'connected' ? 'connected' : 'reconnecting'));

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setStatus('connected');
        backoffDelayRef.current = 1000;
        requestWakeLock();

        // Start ping loop every 2s
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
          }
        }, 2000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pong' && typeof data.t === 'number') {
            const rtt = Date.now() - data.t;
            setLatency(rtt);
          } else if (data.type === 'nowplaying') {
            setNowPlaying({
              app: data.app,
              title: data.title,
              artist: data.artist,
              art: data.art,
              status: data.status || 'none',
              position: data.position,
              duration: data.duration,
              canSeek: data.canSeek ?? false,
            });
            if (typeof data.volume === 'number') {
              const norm = data.volume <= 1.0 && data.volume > 0 ? Math.round(data.volume * 100) : Math.round(data.volume);
              setVolume(norm);
            }
            if (typeof data.muted === 'boolean') {
              setMuted(data.muted);
            }
          } else if (data.type === 'sessions' && Array.isArray(data.list)) {
            setSessions(data.list);
          } else if (data.type === 'volume' && typeof data.volume === 'number') {
            const norm = data.volume <= 1.0 && data.volume > 0 ? Math.round(data.volume * 100) : Math.round(data.volume);
            setVolume(norm);
          }
        } catch {
          // ignore non-json
        }
      };

      ws.onclose = (event) => {
        if (!isMounted) return;
        releaseWakeLock();
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Close code 4001 indicates invalid / unauthorized token
        if (event.code === 4001) {
          setStatus('unauthorized');
          return;
        }

        setStatus('reconnecting');

        // Exponential backoff auto-reconnect (1s, 2s, 4s, max 8s)
        const delay = backoffDelayRef.current;
        backoffDelayRef.current = Math.min(delay * 1.5, 8000);

        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMounted) connect();
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      isMounted = false;
      releaseWakeLock();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [token]);

  return {
    status,
    latency,
    token,
    setToken,
    sendMove,
    sendClick,
    sendButton,
    sendScroll,
    sendMedia,
    sendSeekBy,
    sendSeekTo,
    sendSession,
    sendSetVolume,
    isBackpressured,
    nowPlaying,
    sessions,
    volume,
    muted,
  };
}
