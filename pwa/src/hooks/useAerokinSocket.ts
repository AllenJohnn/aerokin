import { useEffect, useRef, useState, useCallback } from 'react';
import { requestWakeLock, releaseWakeLock } from '../utils/wakelock';
import {
  isHostedMode,
  consumeConnectionFragment,
  validateHost,
  STORAGE_HOST_KEY,
  STORAGE_TOKEN_KEY,
} from '../utils/hosting';

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
  host: string | null;
  isHosted: boolean;
  connectionError: string | null;
  setToken: (token: string) => void;
  setHost: (host: string) => void;
  connectManually: () => void;
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

export function useAerokinSocket(): UseAerokinSocketReturn {
  const isHosted = isHostedMode();

  // Read initial connection credentials from URL fragment (hosted) or search params (agent-served) or localStorage
  const [host, setHostState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fragment = consumeConnectionFragment();
    return fragment.host;
  });

  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fragment = consumeConnectionFragment();
    if (fragment.code) return fragment.code;

    // Check ?token= for agent-served mode
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken && urlToken.trim().length > 0) {
      const clean = urlToken.trim().toUpperCase();
      localStorage.setItem(STORAGE_TOKEN_KEY, clean);
      return clean;
    }
    return localStorage.getItem(STORAGE_TOKEN_KEY) || null;
  });

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // In hosted mode, require a user gesture (Connect button) to initiate the connection
  // to avoid triggering browser Local Network prompts without user interaction.
  // In agent-served mode, connect automatically as before.
  const [connectTrigger, setConnectTrigger] = useState<number>(() => (isHosted ? 0 : 1));

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

  const setHost = useCallback((newHost: string) => {
    const validated = validateHost(newHost);
    if (validated.valid && validated.normalized) {
      localStorage.setItem(STORAGE_HOST_KEY, validated.normalized);
      setHostState(validated.normalized);
      backoffDelayRef.current = 1000;
    }
  }, []);

  const connectManually = useCallback(() => {
    setConnectionError(null);
    setConnectTrigger((prev) => prev + 1);
  }, []);

  const isBackpressured = useCallback((): boolean => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return true;
    }
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

    if (isHosted && !host) {
      setStatus('disconnected');
      return;
    }

    if (connectTrigger === 0) {
      setStatus('disconnected');
      return;
    }

    let isMounted = true;

    function connect() {
      if (!token) return;

      if (socketRef.current) {
        socketRef.current.close();
      }

      let wsUrl: string;

      if (isHosted) {
        if (!host) {
          setStatus('disconnected');
          setConnectionError('PC host address not configured');
          return;
        }
        // Hosted static PWA connects directly to the local PC agent via WSS
        wsUrl = `wss://${host}/?token=${encodeURIComponent(token)}`;
      } else {
        // Agent-served flow (same-origin local server)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isDevPort = window.location.port === '5174' || window.location.port === '5173';
        const devServerPort = import.meta.env.VITE_DEV_SERVER_PORT || '8443';
        const targetHost = isDevPort
          ? `${window.location.hostname}:${devServerPort}`
          : window.location.host;

        wsUrl = `${protocol}//${targetHost}/?token=${encodeURIComponent(token)}`;
      }

      setStatus((prev) => (prev === 'connected' ? 'connected' : 'reconnecting'));

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setStatus('connected');
          setConnectionError(null);
          backoffDelayRef.current = 1000;
          requestWakeLock();

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
                const norm =
                  data.volume <= 1.0 && data.volume > 0
                    ? Math.round(data.volume * 100)
                    : Math.round(data.volume);
                setVolume(norm);
              }
              if (typeof data.muted === 'boolean') {
                setMuted(data.muted);
              }
            } else if (data.type === 'sessions' && Array.isArray(data.list)) {
              setSessions(data.list);
            } else if (data.type === 'volume' && typeof data.volume === 'number') {
              const norm =
                data.volume <= 1.0 && data.volume > 0
                  ? Math.round(data.volume * 100)
                  : Math.round(data.volume);
              setVolume(norm);
            }
          } catch {}
        };

        ws.onclose = (event) => {
          if (!isMounted) return;
          releaseWakeLock();
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          if (event.code === 4001) {
            setStatus('unauthorized');
            setConnectionError('Invalid pairing code. Check PC terminal.');
            return;
          }

          if (event.code === 1008) {
            setStatus('disconnected');
            setConnectionError(event.reason || 'Connection rejected: Policy violation or disallowed Origin');
            return;
          }

          setStatus('reconnecting');
          if (isHosted) {
            setConnectionError(
              'Cannot reach PC. Ensure you are on the same Wi-Fi, the CA certificate is installed, and Local Network permission is allowed.'
            );
          }

          const delay = backoffDelayRef.current;
          backoffDelayRef.current = Math.min(delay * 1.5, 8000);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted) connect();
          }, delay);
        };

        ws.onerror = () => {
          if (isMounted && isHosted) {
            setConnectionError(
              'Connection failed. Ensure same Wi-Fi, CA certificate trusted, and Local Network permission granted.'
            );
          }
          ws.close();
        };
      } catch (err: any) {
        setStatus('disconnected');
        setConnectionError(err?.message || 'WebSocket connection error');
      }
    }

    connect();

    return () => {
      isMounted = false;
      releaseWakeLock();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [token, host, isHosted, connectTrigger]);

  return {
    status,
    latency,
    token,
    host,
    isHosted,
    connectionError,
    setToken,
    setHost,
    connectManually,
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
