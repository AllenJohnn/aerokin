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

export interface UseAerokinSocketReturn {
  status: ConnectionStatus;
  latency: number | null;
  token: string | null;
  setToken: (token: string) => void;
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right') => void;
  sendScroll: (dy: number) => void;
  sendMedia: (action: MediaAction) => void;
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
    (button: 'left' | 'right') => {
      sendRaw({ type: 'click', button });
    },
    [sendRaw]
  );

  const sendScroll = useCallback(
    (dy: number) => {
      sendRaw({ type: 'scroll', dy });
    },
    [sendRaw]
  );

  const sendMedia = useCallback(
    (action: MediaAction) => {
      sendRaw({ type: 'media', action });
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
      // In dev mode (port 5174), default to server on port 8443
      const host = window.location.port === '5174'
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
    sendScroll,
    sendMedia,
  };
}
