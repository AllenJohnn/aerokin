import { useEffect, useRef, useState, useCallback } from 'react';
import { requestWakeLock, releaseWakeLock } from '../utils/wakelock';
import {
  isHostedMode,
  consumeConnectionFragment,
  validateHost,
  STORAGE_HOST_KEY,
  STORAGE_TOKEN_KEY,
  STORAGE_DEVICE_NAME_KEY,
  getStoredDeviceCredentials,
  saveStoredDeviceCredentials,
  clearStoredDeviceCredentials,
  savePc,
  removeSavedPc,
  getActivePcId,
  getActivePc,
  setActivePcId,
  SavedPc,
} from '../utils/hosting';
import {
  MonitorInfo,
  DesktopStats,
  DesktopStreamState,
  QualityPresetName,
} from '../types/desktop';
import { diagnosticsLogger } from '../utils/diagnosticsLogger';

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

export interface MediaSessionCapabilities {
  canPlay?: boolean;
  canPause?: boolean;
  canTogglePlayPause?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  canStop?: boolean;
  canSeek?: boolean;
  canSetPosition?: boolean;
  canShuffle?: boolean;
  canRepeat?: boolean;
  canRate?: boolean;
}

export interface NowPlayingData {
  id?: string;
  app?: string;
  title?: string;
  artist?: string;
  art?: string;
  status: 'playing' | 'paused' | 'stopped' | 'none';
  position?: number;
  duration?: number;
  canSeek?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  capabilities?: MediaSessionCapabilities;
}

export interface MediaSessionItem {
  id: string;
  app: string;
  title: string;
  current: boolean;
  capabilities?: MediaSessionCapabilities;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  platform: string;
  createdAt: number;
  lastSeen: number;
  revoked: boolean;
}

export interface ScreenshotResponseData {
  success: boolean;
  mimeType?: 'image/jpeg' | 'image/png';
  data?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  downscaled?: boolean;
  note?: string;
  error?: string;
}

export interface SystemStatsData {
  timestamp: number;
  uptimeSeconds: number;
  cpu: {
    totalPercent: number;
    coresPercent: number[];
    agentCpuPercent: number;
  };
  ram: {
    usedBytes: number;
    totalBytes: number;
    percent: number;
  };
  disks: Array<{
    drive: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    percent: number;
  }>;
  network: {
    upBytesPerSec: number;
    downBytesPerSec: number;
  };
  power: {
    hasBattery: boolean;
    batteryPercent: number | null;
    isCharging: boolean;
    acConnected: boolean;
  };
  gpu: {
    available: boolean;
    utilizationPercent: number | null;
    note: string;
  };
  temperature: {
    available: boolean;
    celsius: number | null;
    note: string;
  };
  topProcesses: {
    byCpu: Array<{ name: string; value: string }>;
    byRam: Array<{ name: string; value: string }>;
  };
}

export interface FeatureFlags {
  clipboard: boolean;
  screenshot: boolean;
  quickActions: boolean;
  launcher: boolean;
  remoteAccess?: boolean;
  remotePower?: boolean;
  fileUpload?: boolean;
}

export interface LauncherEntry {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  path: string;
}

export interface ActionResultData {
  success: boolean;
  action: string;
  message?: string;
  countdownActive?: boolean;
  secondsRemaining?: number;
  error?: string;
}

export interface UseAerokinSocketReturn {
  status: ConnectionStatus;
  latency: number | null;
  host: string | null;
  isHosted: boolean;
  connectionError: string | null;
  deviceId: string | null;
  credential: string | null;
  deviceName: string | null;
  devices: DeviceInfo[];
  pairingCode: string | null;
  pairingAwaitingApproval: boolean;
  token: string | null; // Backwards compatibility for UI
  activePc: SavedPc | null;
  switchPc: (pc: SavedPc) => void;
  setToken: (token: string) => void;
  setHost: (host: string) => void;
  setPairingCode: (code: string) => void;
  connectManually: () => void;
  pairDevice: (
    code: string,
    name?: string,
    platform?: string,
    targetHost?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  renameDevice: (deviceId: string, name: string) => void;
  revokeDevice: (deviceId: string) => void;
  revokeAllDevices: (exceptCurrent?: boolean) => void;
  logout: () => void;
  unpairThisDevice: () => Promise<void>;
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right' | 'middle') => void;
  sendButton: (button: 'left' | 'right' | 'middle', state: 'down' | 'up') => void;
  sendScroll: (dy: number, dx?: number) => void;
  sendAbsMove: (x: number, y: number, monitorId?: string) => void;
  sendAbsClick: (
    button: 'left' | 'right' | 'middle',
    count?: number,
    x?: number,
    y?: number,
    monitorId?: string
  ) => void;
  sendAbsButton: (
    button: 'left' | 'right' | 'middle',
    state: 'down' | 'up',
    x?: number,
    y?: number,
    monitorId?: string
  ) => void;
  sendKey: (key: string, action?: 'down' | 'up' | 'tap', modifiers?: string[]) => void;
  sendText: (text: string) => void;
  startDesktopStream: (options?: {
    monitorId?: string;
    preset?: QualityPresetName;
    customScale?: number;
    customFps?: number;
  }) => void;
  stopDesktopStream: () => void;
  requestMonitors: () => void;
  desktopMonitors: MonitorInfo[];
  desktopStatus: {
    state: DesktopStreamState;
    monitor?: MonitorInfo;
    stats?: DesktopStats;
    error?: string;
  };
  desktopStats: DesktopStats | null;
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
  lastCloseCode: number | null;
  lastCloseReason: string | null;
  agentLogs: any[];
  requestAgentLogs: (limit?: number) => void;
  runLatencyTest: () => Promise<{ min: number; avg: number; max: number; p95: number }>;

  // Screenshot
  requestScreenshot: (options?: {
    target?: 'all' | 'active_window' | 'monitor';
    monitorId?: string;
    includeCursor?: boolean;
  }) => void;
  lastScreenshot: ScreenshotResponseData | null;

  // System Stats
  subscribeStats: (intervalMs?: number) => void;
  unsubscribeStats: () => void;
  systemStats: SystemStatsData | null;

  // Clipboard
  getClipboard: () => void;
  setClipboard: (text: string) => void;
  setClipboardAndPaste: (text: string) => void;
  clearClipboardHistory: () => void;
  lastClipboardText: string | null;
  lastClipboardLength: number | null;
  clipboardError: string | null;

  // Quick Actions & Launcher
  executeQuickAction: (action: string, payload?: string) => void;
  requestLauncherList: () => void;
  lastActionResult: ActionResultData | null;
  launcherEntries: LauncherEntry[];

  // Features
  featureFlags: FeatureFlags;
}

export function useAerokinSocket(): UseAerokinSocketReturn {
  const isHosted = isHostedMode();

  // Read initial connection credentials from localStorage or URL hash fragment
  const [host, setHostState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fragment = consumeConnectionFragment();
    return fragment.host || localStorage.getItem(STORAGE_HOST_KEY) || null;
  });

  const [pairingCode, setPairingCodeState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fragment = consumeConnectionFragment();
    if (fragment.code) return fragment.code;
    return localStorage.getItem(STORAGE_TOKEN_KEY) || null;
  });

  const storedCreds = getStoredDeviceCredentials();
  const [deviceId, setDeviceId] = useState<string | null>(storedCreds.deviceId);
  const [credential, setCredential] = useState<string | null>(storedCreds.credential);
  const [deviceName, setDeviceName] = useState<string | null>(storedCreds.name);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);

  const [status, setStatus] = useState<ConnectionStatus>(() =>
    storedCreds.credential && storedCreds.deviceId ? 'disconnected' : 'unauthorized'
  );
  const [activePc, setActivePcState] = useState<SavedPc | null>(() => getActivePc());
  const [latency, setLatency] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pairingAwaitingApproval, setPairingAwaitingApproval] = useState<boolean>(false);

  // In hosted mode, require a user gesture (Connect button) to initiate the connection
  // in agent-served mode, connect automatically if we have credentials
  const [connectTrigger, setConnectTrigger] = useState<number>(() =>
    isHosted ? 0 : storedCreds.credential ? 1 : 0
  );

  const switchPc = useCallback((pc: SavedPc) => {
    setActivePcId(pc.pcId);
    setActivePcState(pc);
    setDeviceId(pc.deviceId);
    setCredential(pc.credential);
    setDeviceName(pc.name);
    if (pc.lanHost) {
      setHostState(pc.lanHost);
    }
    setConnectionError(null);
    setConnectTrigger((prev) => prev + 1);
  }, []);

  // Live media state from server
  const [nowPlaying, setNowPlaying] = useState<NowPlayingData>({ status: 'none' });
  const [sessions, setSessions] = useState<MediaSessionItem[]>([]);
  const [volume, setVolume] = useState<number>(50);
  const [muted, setMuted] = useState<boolean>(false);

  // Live desktop remote state
  const [desktopMonitors, setDesktopMonitors] = useState<MonitorInfo[]>([]);
  const [desktopStatus, setDesktopStatus] = useState<{
    state: DesktopStreamState;
    monitor?: MonitorInfo;
    stats?: DesktopStats;
    error?: string;
  }>({ state: 'stopped' });
  const [desktopStats, setDesktopStats] = useState<DesktopStats | null>(null);
  const [lastCloseCode, setLastCloseCode] = useState<number | null>(null);
  const [lastCloseReason, setLastCloseReason] = useState<string | null>(null);
  const [agentLogs, setAgentLogs] = useState<any[]>([]);

  // Screenshot state
  const [lastScreenshot, setLastScreenshot] = useState<ScreenshotResponseData | null>(null);

  // System stats state
  const [systemStats, setSystemStats] = useState<SystemStatsData | null>(null);

  // Clipboard state
  const [lastClipboardText, setLastClipboardText] = useState<string | null>(null);
  const [lastClipboardLength, setLastClipboardLength] = useState<number | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  // Quick actions & Launcher state
  const [lastActionResult, setLastActionResult] = useState<ActionResultData | null>(null);
  const [launcherEntries, setLauncherEntries] = useState<LauncherEntry[]>([]);

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({
    clipboard: true,
    screenshot: true,
    quickActions: true,
    launcher: true,
  });

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const backoffDelayRef = useRef<number>(1000);
  const isAuthenticatedRef = useRef<boolean>(false);

  const setPairingCode = useCallback((newCode: string) => {
    const cleaned = newCode.trim();
    localStorage.setItem(STORAGE_TOKEN_KEY, cleaned);
    setPairingCodeState(cleaned);
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
    if (
      socketRef.current &&
      socketRef.current.readyState === WebSocket.OPEN &&
      (isAuthenticatedRef.current || (payload as any).type === 'auth')
    ) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const pairDevice = useCallback(
    async (
      code: string,
      name?: string,
      platform?: string,
      targetHost?: string
    ): Promise<{ ok: boolean; error?: string }> => {
      const activeHost =
        targetHost ||
        host ||
        (typeof window !== 'undefined'
          ? (window.location.port === '5173' || window.location.port === '5174'
              ? `${window.location.hostname}:8443`
              : window.location.host)
          : '');

      if (!activeHost) {
        return { ok: false, error: 'Host address is not configured.' };
      }

      const isApple =
        typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const devName = name || (isApple ? "Allen's iPhone" : 'Mobile Device');
      const devPlatform = platform || (isApple ? 'iOS' : 'Web');

      setPairingAwaitingApproval(true);
      setConnectionError(null);

      try {
        const res = await fetch(`https://${activeHost}/api/pair`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: code.trim(),
            name: devName,
            platform: devPlatform,
          }),
        });

        const data = await res.json().catch(() => ({}));
        setPairingAwaitingApproval(false);

        if (!res.ok) {
          const errorMsg =
            data.error ||
            (res.status === 429
              ? 'Too many failed attempts. Locked out for 60 seconds.'
              : res.status === 403
              ? 'Pairing denied by PC operator or invalid code.'
              : 'Pairing failed.');
          setConnectionError(errorMsg);
          return { ok: false, error: errorMsg };
        }

        if (data.ok && data.deviceId && data.credential) {
          saveStoredDeviceCredentials(data.deviceId, data.credential, data.name || devName);
          if (data.pcId) {
            savePc({
              pcId: data.pcId,
              name: data.pcName || 'AeroKin PC',
              deviceId: data.deviceId,
              credential: data.credential,
              lanHost: activeHost,
              lastSeen: Date.now(),
              pairedVia: 'lan',
            });
            setActivePcState(getActivePc());
          }
          setDeviceId(data.deviceId);
          setCredential(data.credential);
          setDeviceName(data.name || devName);
          setPairingCodeState(null);
          localStorage.removeItem(STORAGE_TOKEN_KEY);
          // Trigger immediate connect
          setConnectTrigger((prev) => prev + 1);
          return { ok: true };
        }

        return { ok: false, error: 'Invalid pairing response from server.' };
      } catch (err: any) {
        setPairingAwaitingApproval(false);
        const msg =
          err?.message ||
          'Failed to reach server. Ensure CA certificate is trusted and you are on the same Wi-Fi.';
        setConnectionError(msg);
        return { ok: false, error: msg };
      }
    },
    [host]
  );

  const logout = useCallback(() => {
    sendRaw({ type: 'logout' });
    const activePcId = getActivePcId();
    if (activePcId) {
      removeSavedPc(activePcId);
    }
    clearStoredDeviceCredentials();
    setDeviceId(null);
    setCredential(null);
    setDeviceName(null);
    setStatus('unauthorized');
    isAuthenticatedRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close(1000, 'User logged out');
      socketRef.current = null;
    }
  }, [sendRaw]);

  const unpairThisDevice = useCallback(async () => {
    if (deviceId) {
      sendRaw({ type: 'device_revoke', deviceId });
    }
    logout();
  }, [deviceId, sendRaw, logout]);

  const renameDevice = useCallback(
    (targetDeviceId: string, newName: string) => {
      sendRaw({ type: 'device_rename', deviceId: targetDeviceId, name: newName });
      if (targetDeviceId === deviceId) {
        setDeviceName(newName);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_DEVICE_NAME_KEY, newName);
        }
      }
    },
    [sendRaw, deviceId]
  );

  const revokeDevice = useCallback(
    (targetDeviceId: string) => {
      sendRaw({ type: 'device_revoke', deviceId: targetDeviceId });
      if (targetDeviceId === deviceId) {
        logout();
      }
    },
    [sendRaw, deviceId, logout]
  );

  const revokeAllDevices = useCallback(
    (exceptCurrent = false) => {
      sendRaw({ type: 'device_revoke_all', exceptCurrent });
      if (!exceptCurrent) {
        logout();
      }
    },
    [sendRaw, logout]
  );

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

  const sendAbsMove = useCallback(
    (x: number, y: number, monitorId?: string) => {
      sendRaw({ type: 'abs_move', x, y, monitorId });
    },
    [sendRaw]
  );

  const sendAbsClick = useCallback(
    (
      button: 'left' | 'right' | 'middle',
      count = 1,
      x?: number,
      y?: number,
      monitorId?: string
    ) => {
      sendRaw({ type: 'abs_click', button, count, x, y, monitorId });
    },
    [sendRaw]
  );

  const sendAbsButton = useCallback(
    (
      button: 'left' | 'right' | 'middle',
      state: 'down' | 'up',
      x?: number,
      y?: number,
      monitorId?: string
    ) => {
      sendRaw({ type: 'abs_button', button, state, x, y, monitorId });
    },
    [sendRaw]
  );

  const sendKey = useCallback(
    (key: string, action: 'down' | 'up' | 'tap' = 'tap', modifiers?: string[]) => {
      sendRaw({ type: 'key', key, action, modifiers });
    },
    [sendRaw]
  );

  const sendText = useCallback(
    (text: string) => {
      sendRaw({ type: 'text', text });
    },
    [sendRaw]
  );

  const startDesktopStream = useCallback(
    (options?: {
      monitorId?: string;
      preset?: QualityPresetName;
      customScale?: number;
      customFps?: number;
      codec?: 'h264' | 'mjpeg';
    }) => {
      diagnosticsLogger.log('info', 'stream', `Desktop stream start requested (preset: ${options?.preset || 'balanced'}, codec: ${options?.codec || 'h264'})`);
      sendRaw({ type: 'desktop_start', ...options });
    },
    [sendRaw]
  );

  const stopDesktopStream = useCallback(() => {
    diagnosticsLogger.log('info', 'stream', 'Desktop stream stop requested');
    sendRaw({ type: 'desktop_stop' });
  }, [sendRaw]);

  const requestMonitors = useCallback(() => {
    sendRaw({ type: 'desktop_monitors' });
  }, [sendRaw]);

  const sendMedia = useCallback(
    (action: MediaAction) => {
      diagnosticsLogger.log('info', 'media', `Media action: ${action}`);
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

  const requestAgentLogs = useCallback(
    (limit = 50) => {
      sendRaw({ type: 'tail_logs', limit });
    },
    [sendRaw]
  );

  const requestScreenshot = useCallback(
    (options?: {
      target?: 'all' | 'active_window' | 'monitor';
      monitorId?: string;
      includeCursor?: boolean;
    }) => {
      sendRaw({ type: 'screenshot_request', ...options });
    },
    [sendRaw]
  );

  const subscribeStats = useCallback(
    (intervalMs = 1000) => {
      sendRaw({ type: 'stats_subscribe', intervalMs });
    },
    [sendRaw]
  );

  const unsubscribeStats = useCallback(() => {
    sendRaw({ type: 'stats_unsubscribe' });
  }, [sendRaw]);

  const getClipboard = useCallback(() => {
    sendRaw({ type: 'clipboard_get' });
  }, [sendRaw]);

  const setClipboard = useCallback(
    (text: string) => {
      sendRaw({ type: 'clipboard_set', text });
    },
    [sendRaw]
  );

  const setClipboardAndPaste = useCallback(
    (text: string) => {
      sendRaw({ type: 'clipboard_set_and_paste', text });
    },
    [sendRaw]
  );

  const clearClipboardHistory = useCallback(() => {
    sendRaw({ type: 'clipboard_clear_history' });
  }, [sendRaw]);

  const executeQuickAction = useCallback(
    (action: string, payload?: string) => {
      sendRaw({ type: 'quick_action', action, payload });
    },
    [sendRaw]
  );

  const requestLauncherList = useCallback(() => {
    sendRaw({ type: 'launcher_list' });
  }, [sendRaw]);

  // Auto-unsubscribe from system stats when the tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: 'stats_unsubscribe' }));
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!credential || !deviceId) {
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
      if (!credential || !deviceId) {
        setStatus('unauthorized');
        return;
      }

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
        // Hosted static PWA connects directly to the local PC agent via TLS WebSocket
        // No secrets in the URL query!
        wsUrl = `wss://${host}/`;
      } else {
        // Agent-served flow (same-origin local server)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isDevPort = window.location.port === '5174' || window.location.port === '5173';
        const devServerPort = import.meta.env.VITE_DEV_SERVER_PORT || '8443';
        const targetHost = isDevPort
          ? `${window.location.hostname}:${devServerPort}`
          : window.location.host;

        wsUrl = `${protocol}//${targetHost}/`;
      }

      setStatus((prev) => (prev === 'connected' ? 'connected' : 'reconnecting'));
      isAuthenticatedRef.current = false;

      try {
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          diagnosticsLogger.log('info', 'socket', `WebSocket connection opened to ${wsUrl}`);
          // Authenticate with the per-device credential in the first WS message
          ws.send(
            JSON.stringify({
              type: 'auth',
              deviceId,
              credential,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'auth_ok') {
              isAuthenticatedRef.current = true;
              setStatus('connected');
              setConnectionError(null);
              backoffDelayRef.current = 1000;
              requestWakeLock();
              diagnosticsLogger.log('info', 'socket', `Authenticated successfully as device ${deviceId}`);

              if (data.pcId && deviceId && credential) {
                savePc({
                  pcId: data.pcId,
                  name: data.pcName || deviceName || 'AeroKin PC',
                  deviceId,
                  credential,
                  lanHost: host || undefined,
                  lastSeen: Date.now(),
                  pairedVia: 'lan',
                });
                setActivePcState(getActivePc());
              }

              if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
              pingIntervalRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
                }
              }, 2000);
              return;
            }

            if (data.type === 'tail_logs_response' && Array.isArray(data.entries)) {
              setAgentLogs(data.entries);
              return;
            }

            if (data.type === 'server_ping' && typeof data.t === 'number') {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'server_pong', t: data.t }));
              }
              return;
            }

            if (data.type === 'devices' && Array.isArray(data.list)) {
              setDevices(data.list);
            } else if (data.type === 'pong' && typeof data.t === 'number') {
              const rtt = Date.now() - data.t;
              setLatency(rtt);
            } else if (data.type === 'nowplaying') {
              setNowPlaying({
                id: data.id,
                app: data.app,
                title: data.title,
                artist: data.artist,
                art: data.art,
                status: data.status || 'none',
                position: data.position,
                duration: data.duration,
                canSeek: data.canSeek ?? false,
                canNext: data.canNext ?? true,
                canPrev: data.canPrev ?? true,
                capabilities: data.capabilities,
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
            } else if (data.type === 'desktop_monitors' && Array.isArray(data.monitors)) {
              setDesktopMonitors(data.monitors);
            } else if (data.type === 'desktop_status') {
              setDesktopStatus({
                state: data.state || 'stopped',
                monitor: data.monitor,
                stats: data.stats,
                error: data.error,
              });
              if (data.stats) {
                setDesktopStats(data.stats);
              }
            } else if (data.type === 'desktop_stats' && data.stats) {
              setDesktopStats(data.stats);
            } else if (data.type === 'volume' && typeof data.volume === 'number') {
              const norm =
                data.volume <= 1.0 && data.volume > 0
                  ? Math.round(data.volume * 100)
                  : Math.round(data.volume);
              setVolume(norm);
            } else if (data.type === 'screenshot_response') {
              setLastScreenshot(data);
            } else if (data.type === 'stats_data' && data.data) {
              setSystemStats(data.data);
            } else if (data.type === 'clipboard_data') {
              setLastClipboardText(data.text);
              setLastClipboardLength(data.length);
              setClipboardError(null);
            } else if (data.type === 'clipboard_ack') {
              setClipboardError(null);
            } else if (data.type === 'clipboard_error') {
              setClipboardError(data.error);
            } else if (data.type === 'action_result') {
              setLastActionResult(data);
            } else if (data.type === 'launcher_list' && Array.isArray(data.entries)) {
              setLauncherEntries(data.entries);
            } else if (data.type === 'features_status' && data.flags) {
              setFeatureFlags(data.flags);
            }
          } catch {}
        };

        ws.onclose = (event) => {
          if (!isMounted) return;
          releaseWakeLock();
          isAuthenticatedRef.current = false;
          setLastCloseCode(event.code);
          setLastCloseReason(event.reason || '');
          diagnosticsLogger.log(
            'warn',
            'socket',
            `WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`
          );
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }

          // 4001: Invalid or revoked credential -> clear stored credentials and return to pairing
          if (event.code === 4001) {
            clearStoredDeviceCredentials();
            setDeviceId(null);
            setCredential(null);
            setStatus('unauthorized');
            setConnectionError(event.reason || 'Device revoked or invalid credential.');
            return;
          }

          // 1008: Policy violation or disallowed origin -> do NOT reconnect-loop
          if (event.code === 1008) {
            setStatus('disconnected');
            setConnectionError(
              event.reason || 'Connection rejected: Policy violation or disallowed Origin'
            );
            return;
          }

          // 1000: Clean close / intentional logout -> do NOT reconnect
          if (event.code === 1000) {
            setStatus('disconnected');
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
          const jitter = Math.floor(Math.random() * 500);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMounted) connect();
          }, delay + jitter);
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
      isAuthenticatedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [credential, deviceId, host, isHosted, connectTrigger]);

  const runLatencyTest = useCallback(async (): Promise<{ min: number; avg: number; max: number; p95: number }> => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('Socket not connected');
    }

    const rtts: number[] = [];
    const count = 10;

    for (let i = 0; i < count; i++) {
      const sendTime = Date.now();
      const rtt = await new Promise<number>((resolve) => {
        const timer = setTimeout(() => {
          resolve(100);
        }, 1000);

        const onMsg = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'pong' && data.t === sendTime) {
              clearTimeout(timer);
              ws.removeEventListener('message', onMsg);
              resolve(Math.max(1, Date.now() - sendTime));
            }
          } catch {}
        };

        ws.addEventListener('message', onMsg);
        try {
          ws.send(JSON.stringify({ type: 'ping', t: sendTime }));
        } catch {
          clearTimeout(timer);
          ws.removeEventListener('message', onMsg);
          resolve(100);
        }
      });

      rtts.push(rtt);
      if (i < count - 1) {
        await new Promise((r) => setTimeout(r, 40));
      }
    }

    const sorted = [...rtts].sort((a, b) => a - b);
    const min = sorted[0] ?? 1;
    const max = sorted[sorted.length - 1] ?? 1;
    const avg = Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? max;

    const result = { min, avg, max, p95 };
    diagnosticsLogger.log(
      'info',
      'socket',
      `Latency Test Results (10 samples): min=${min}ms, avg=${avg}ms, max=${max}ms, p95=${p95}ms`
    );

    return result;
  }, []);

  return {
    status,
    latency,
    host,
    isHosted,
    connectionError,
    deviceId,
    credential,
    deviceName,
    devices,
    pairingCode,
    pairingAwaitingApproval,
    token: pairingCode || credential || null,
    activePc,
    switchPc,
    setToken: setPairingCode,
    setHost,
    setPairingCode,
    connectManually,
    pairDevice,
    renameDevice,
    revokeDevice,
    revokeAllDevices,
    logout,
    unpairThisDevice,
    sendMove,
    sendClick,
    sendButton,
    sendScroll,
    sendAbsMove,
    sendAbsClick,
    sendAbsButton,
    sendKey,
    sendText,
    startDesktopStream,
    stopDesktopStream,
    requestMonitors,
    desktopMonitors,
    desktopStatus,
    desktopStats,
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
    lastCloseCode,
    lastCloseReason,
    agentLogs,
    requestAgentLogs,
    runLatencyTest,
    requestScreenshot,
    lastScreenshot,
    subscribeStats,
    unsubscribeStats,
    systemStats,
    getClipboard,
    setClipboard,
    setClipboardAndPaste,
    clearClipboardHistory,
    lastClipboardText,
    lastClipboardLength,
    clipboardError,
    executeQuickAction,
    requestLauncherList,
    lastActionResult,
    launcherEntries,
    featureFlags,
  };
}