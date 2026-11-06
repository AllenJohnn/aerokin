import React, { useEffect, useState, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { AerokinLogo } from '@ui';
import {
  Copy,
  Check,
  DeviceMobile,
  ArrowClockwise,
  ShieldCheck,
  WifiHigh,
  Broadcast,
  Globe,
  Stop,
  PencilSimple,
  Trash,
  DownloadSimple,
  CaretDown,
  CaretUp,
  BatteryCharging,
  BatteryFull,
  CheckCircle,
  Warning,
  Desktop,
  MusicNotes,
  X,
  Cpu,
  HardDrive,
  Power,
  Lightning,
  ClipboardText,
  Camera,
  RocketLaunch,
  ArrowUp,
  ArrowDown,
  ListChecks,
  Pause,
  Play,
} from '@phosphor-icons/react';

export interface FeatureFlags {
  clipboard: boolean;
  screenshot: boolean;
  quickActions: boolean;
  launcher: boolean;
  remoteAccess: boolean;
  remotePower: boolean;
  fileUpload: boolean;
}

export interface CountdownState {
  active: boolean;
  action: 'shutdown' | 'restart' | 'sign_out' | null;
  secondsRemaining: number;
}

export interface RecentAction {
  action: string;
  time: number;
  success: boolean;
}

export interface EnrichedDevice {
  deviceId: string;
  name: string;
  platform: string;
  revoked?: boolean;
  createdAt?: number;
  lastSeen?: number;
  isConnected: boolean;
  clientIp?: string;
  currentLatency: number | null;
  latencyHistory: number[];
  battery?: { percent: number | null; charging?: boolean | null } | null;
}

export interface PendingApproval {
  requestId: string;
  name: string;
  platform: string;
  clientIp: string;
  expiresInSeconds: number;
}

export interface PcStats {
  hostname: string;
  lanIp: string;
  port: number;
  uptime: number;
  power: {
    hasBattery: boolean;
    batteryPercent: number | null;
    isCharging: boolean;
    acConnected: boolean;
  };
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'pairing' | 'desktop' | 'media' | 'input' | 'security' | 'system';
  message: string;
}

export interface WebRtcStatus {
  pcId: string;
  signalingUrl: string | null;
  signalingConnected: boolean;
  turnConfigured: boolean;
  remotePairPayload: string | null;
}

export interface DesktopDashboardProps {
  onSwitchToPhoneView: () => void;
}

export const DesktopDashboard: React.FC<DesktopDashboardProps> = ({ onSwitchToPhoneView }) => {
  // Real-time State
  const [isConnectedToAgent, setIsConnectedToAgent] = useState(true);
  const [devices, setDevices] = useState<EnrichedDevice[]>([]);
  const [activeCode, setActiveCode] = useState<string>('');
  const [codeExpiresIn, setCodeExpiresIn] = useState<number>(0);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const [approvalCountdown, setApprovalCountdown] = useState<number>(30);
  const [pcStats, setPcStats] = useState<PcStats | null>(null);
  const [desktopStream, setDesktopStream] = useState<any>(null);
  const [mediaStatus, setMediaStatus] = useState<any>(null);

  // Features, Actions & System Telemetry State
  const [features, setFeatures] = useState<FeatureFlags>({
    clipboard: true,
    screenshot: true,
    quickActions: true,
    launcher: true,
    remoteAccess: false,
    remotePower: false,
    fileUpload: false,
  });
  const [countdownState, setCountdownState] = useState<CountdownState>({
    active: false,
    action: null,
    secondsRemaining: 0,
  });
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const [clipboardSharedCount, setClipboardSharedCount] = useState<number>(0);
  const [systemTelemetry, setSystemTelemetry] = useState<any>(null);
  const [isInputPaused, setIsInputPaused] = useState<boolean>(false);

  // QR Code data URLs
  const [pairQrUrl, setPairQrUrl] = useState<string | null>(null);
  const [remoteQrUrl, setRemoteQrUrl] = useState<string | null>(null);
  const [pairMode, setPairMode] = useState<'lan' | 'remote'>('lan');
  const [webrtcStatus, setWebrtcStatus] = useState<WebRtcStatus | null>(null);
  const [trustQrUrl, setTrustQrUrl] = useState<string | null>(null);
  const [showTrustDetails, setShowTrustDetails] = useState<boolean>(false);

  // Copy feedback states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Inline editing states for device rename
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [renameInputValue, setRenameInputValue] = useState<string>('');

  // Logs section states
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilterCategory, setLogFilterCategory] = useState<string>('all');
  const [logFilterLevel, setLogFilterLevel] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [autoScrollLogs, setAutoScrollLogs] = useState<boolean>(true);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // 1. Initial Snapshot & Server-Sent Events (SSE) Stream
  useEffect(() => {
    let sse: EventSource | null = null;
    let reconnectTimeout: any = null;

    function connectSSE() {
      sse = new EventSource('/api/dashboard/events');

      sse.onopen = () => {
        setIsConnectedToAgent(true);
      };

      sse.onerror = () => {
        setIsConnectedToAgent(false);
        if (sse) sse.close();
        reconnectTimeout = setTimeout(connectSSE, 2000);
      };

      sse.addEventListener('init', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.devices) setDevices(data.devices);
          if (data.pairing) {
            setActiveCode(data.pairing.code || '');
            setCodeExpiresIn(data.pairing.expiresInSeconds || 0);
            setPendingApproval(data.pairing.pendingApproval || null);
            if (data.pairing.pendingApproval) {
              setApprovalCountdown(data.pairing.pendingApproval.expiresInSeconds || 30);
            }
          }
          if (data.pc) setPcStats(data.pc);
          if (data.desktop) setDesktopStream(data.desktop);
          if (data.media) setMediaStatus(data.media);
          if (data.features) setFeatures(data.features);
          if (data.actions) {
            if (data.actions.countdown) setCountdownState(data.actions.countdown);
            if (Array.isArray(data.actions.recent)) setRecentActions(data.actions.recent);
          }
          if (typeof data.clipboardSharedCount === 'number') {
            setClipboardSharedCount(data.clipboardSharedCount);
          }
          if (typeof data.isPaused === 'boolean') {
            setIsInputPaused(data.isPaused);
          }
          if (data.webrtc) {
            setWebrtcStatus(data.webrtc);
          } else if (data.pairing?.pcId) {
            setWebrtcStatus({
              pcId: data.pairing.pcId,
              signalingUrl: data.pairing.signalingUrl || null,
              signalingConnected: false,
              turnConfigured: !!data.pairing.signalingUrl,
              remotePairPayload: data.pairing.remotePairPayload || null,
            });
          }
          if (data.systemStats) setSystemTelemetry(data.systemStats);
        } catch {}
      });

      sse.addEventListener('webrtc_status', (e) => {
        try {
          const w = JSON.parse(e.data);
          if (w) {
            setWebrtcStatus((prev) => ({
              pcId: w.pcId || prev?.pcId || '',
              signalingUrl: w.signalingUrl || prev?.signalingUrl || null,
              signalingConnected: !!w.signalingConnected,
              turnConfigured: !!w.turnConfigured,
              remotePairPayload: w.remotePairPayload || prev?.remotePairPayload || null,
            }));
          }
        } catch {}
      });

      sse.addEventListener('pause_status', (e) => {
        try {
          const p = JSON.parse(e.data);
          if (p && typeof p.paused === 'boolean') setIsInputPaused(p.paused);
        } catch {}
      });

      sse.addEventListener('features_update', (e) => {
        try {
          const f = JSON.parse(e.data);
          if (f) setFeatures(f);
        } catch {}
      });

      sse.addEventListener('countdown_update', (e) => {
        try {
          const c = JSON.parse(e.data);
          if (c) setCountdownState(c);
        } catch {}
      });

      sse.addEventListener('system_stats', (e) => {
        try {
          const s = JSON.parse(e.data);
          if (s) setSystemTelemetry(s);
        } catch {}
      });

      sse.addEventListener('devices_update', (e) => {
        try {
          const list = JSON.parse(e.data);
          if (Array.isArray(list)) setDevices(list);
        } catch {}
      });

      sse.addEventListener('latency_sample', (e) => {
        try {
          const sample = JSON.parse(e.data);
          setDevices((prev) =>
            prev.map((d) => {
              if (d.deviceId === sample.deviceId) {
                return {
                  ...d,
                  currentLatency: sample.rtt,
                  latencyHistory: sample.history || [...d.latencyHistory, sample.rtt].slice(-60),
                };
              }
              return d;
            })
          );
        } catch {}
      });

      sse.addEventListener('pairing_update', (e) => {
        try {
          const data = JSON.parse(e.data);
          setActiveCode(data.code || '');
          setCodeExpiresIn(data.expiresInSeconds || 0);
        } catch {}
      });

      sse.addEventListener('pairing_request', (e) => {
        try {
          const req = JSON.parse(e.data);
          setPendingApproval(req);
          setApprovalCountdown(req.expiresInSeconds || 30);
        } catch {}
      });

      sse.addEventListener('approval_resolved', (e) => {
        setPendingApproval(null);
      });

      sse.addEventListener('desktop_status', (e) => {
        try {
          const info = JSON.parse(e.data);
          setDesktopStream(info);
        } catch {}
      });

      sse.addEventListener('desktop_stats', (e) => {
        try {
          const stats = JSON.parse(e.data);
          setDesktopStream((prev: any) => (prev ? { ...prev, stats } : { stats }));
        } catch {}
      });

      sse.addEventListener('media_status', (e) => {
        try {
          const status = JSON.parse(e.data);
          setMediaStatus(status);
        } catch {}
      });

      sse.addEventListener('log_entry', (e) => {
        try {
          const entry = JSON.parse(e.data);
          setLogs((prev) => [...prev.slice(-999), entry]);
        } catch {}
      });
    }

    connectSSE();

    // Fetch initial log snapshot
    fetch('/api/logs?limit=200')
      .then((res) => res.json())
      .then((data) => {
        if (data.entries && Array.isArray(data.entries)) {
          setLogs(data.entries);
        }
      })
      .catch(() => {});

    return () => {
      if (sse) sse.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // 2. Countdown Timers
  useEffect(() => {
    const timer = setInterval(() => {
      setCodeExpiresIn((prev) => Math.max(0, prev - 1));
      setApprovalCountdown((prev) => Math.max(0, prev - 1));
      setPcStats((prev) => (prev ? { ...prev, uptime: prev.uptime + 1 } : null));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Periodic poll for stats & actions (every 3s)
  useEffect(() => {
    const fetchPoll = () => {
      fetch('/api/dashboard/stats')
        .then((r) => r.json())
        .then((s) => {
          if (s && !s.error) setSystemTelemetry(s);
        })
        .catch(() => {});

      fetch('/api/dashboard/actions')
        .then((r) => r.json())
        .then((d) => {
          if (d.recent) setRecentActions(d.recent);
          if (d.countdown) setCountdownState(d.countdown);
        })
        .catch(() => {});
    };

    fetchPoll();
    const interval = setInterval(fetchPoll, 3000);
    return () => clearInterval(interval);
  }, []);

  // Tick shutdown countdown if active
  useEffect(() => {
    if (!countdownState.active || countdownState.secondsRemaining <= 0) return;
    const timer = setInterval(() => {
      setCountdownState((prev) => {
        if (!prev.active || prev.secondsRemaining <= 0) return prev;
        return {
          ...prev,
          secondsRemaining: Math.max(0, prev.secondsRemaining - 1),
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdownState.active, countdownState.secondsRemaining]);

  // Cancel shutdown action
  const handleCancelCountdown = async () => {
    try {
      const res = await fetch('/api/dashboard/actions/cancel', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setCountdownState({ active: false, action: null, secondsRemaining: 0 });
      }
    } catch {}
  };

  // Toggle feature flag
  const handleToggleFeature = async (key: keyof FeatureFlags) => {
    const nextVal = !features[key];
    const updated = { ...features, [key]: nextVal };
    setFeatures(updated);
    try {
      const res = await fetch('/api/dashboard/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const data = await res.json();
      if (data.flags) {
        setFeatures(data.flags);
      }
    } catch {
      setFeatures(features);
    }
  };

  // 3. Generate QR Codes
  useEffect(() => {
    if (!pcStats) return;

    const currentPairUrl = activeCode
      ? `https://${pcStats.lanIp}:${pcStats.port}/#code=${activeCode}`
      : `https://${pcStats.lanIp}:${pcStats.port}/`;

    QRCode.toDataURL(currentPairUrl, {
      margin: 1,
      scale: 6,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then(setPairQrUrl)
      .catch(() => {});

    const certTrustUrl = `http://${pcStats.lanIp}:8080`;
    QRCode.toDataURL(certTrustUrl, {
      margin: 1,
      scale: 5,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then(setTrustQrUrl)
      .catch(() => {});

    const pcId = webrtcStatus?.pcId || 'pc_host';
    const signaling = webrtcStatus?.signalingUrl;
    const hostedBase = (window.location.origin.includes('localhost') ? 'https://app.aerokin.com' : window.location.origin).replace(/\/+$/, '');
    const remotePayload = activeCode
      ? `${hostedBase}/#agent=${pcId}${signaling ? `&signal=${encodeURIComponent(signaling)}` : ''}&code=${activeCode}`
      : `${hostedBase}/#agent=${pcId}`;

    QRCode.toDataURL(remotePayload, {
      margin: 1,
      scale: 6,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then(setRemoteQrUrl)
      .catch(() => {});
  }, [activeCode, pcStats, webrtcStatus]);

  // 4. Auto-scroll logs
  useEffect(() => {
    if (autoScrollLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, autoScrollLogs]);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Actions
  const handleRegenerateCode = async () => {
    try {
      const res = await fetch('/api/pair/regenerate', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setActiveCode(data.code);
        setCodeExpiresIn(data.expiresInSeconds);
      }
    } catch {}
  };

  const handleTogglePause = async () => {
    try {
      const res = await fetch('/api/dashboard/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !isInputPaused }),
      });
      const data = await res.json();
      if (typeof data.paused === 'boolean') {
        setIsInputPaused(data.paused);
      }
    } catch {}
  };

  const handleRespondApproval = async (approved: boolean) => {
    if (!pendingApproval) return;
    try {
      await fetch('/api/pair/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: pendingApproval.requestId, approved }),
      });
      setPendingApproval(null);
    } catch {}
  };

  const handleRenameDevice = async (deviceId: string) => {
    if (!renameInputValue.trim()) {
      setEditingDeviceId(null);
      return;
    }
    try {
      await fetch('/api/devices/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, name: renameInputValue.trim() }),
      });
      setEditingDeviceId(null);
      setRenameInputValue('');
    } catch {}
  };

  const handleDisconnectDevice = async (deviceId: string) => {
    try {
      await fetch('/api/devices/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
    } catch {}
  };

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      await fetch('/api/devices/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
    } catch {}
  };

  const handleRevokeAllDevices = async () => {
    if (!window.confirm('Revoke and disconnect all paired devices?')) return;
    try {
      await fetch('/api/devices/revoke-all', { method: 'POST' });
    } catch {}
  };

  const handleStopDesktop = async () => {
    try {
      await fetch('/api/desktop/stop', { method: 'POST' });
    } catch {}
  };

  // Filtering Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logFilterCategory !== 'all' && log.category !== logFilterCategory) return false;
      if (logFilterLevel !== 'all' && log.level !== logFilterLevel) return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        return log.message.toLowerCase().includes(q) || log.category.includes(q);
      }
      return true;
    });
  }, [logs, logFilterCategory, logFilterLevel, logSearchQuery]);

  const activeConnectedDevices = useMemo(() => {
    return devices.filter((d) => d.isConnected && !d.revoked);
  }, [devices]);

  const hasConnectedDevices = activeConnectedDevices.length > 0;

  // Format uptime (seconds -> Xh Ym Zs)
  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Connection Quality label & color
  const getConnectionQuality = (rtt: number | null) => {
    if (rtt === null || rtt === undefined) return { label: 'Connecting', color: 'text-muted-foreground', bg: 'bg-muted/30' };
    if (rtt < 12) return { label: 'Excellent', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (rtt < 30) return { label: 'Good', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    if (rtt < 60) return { label: 'Fair', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    return { label: 'Weak', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' };
  };

  // Render SVG Polyline Sparkline for 60-sample Latency
  const renderSparkline = (history: number[]) => {
    if (!history || history.length < 2) {
      return (
        <div className="h-10 w-full flex items-center justify-center text-[11px] font-mono text-muted-foreground/50 border border-border/40 rounded-lg bg-surface/50">
          Gathering round-trip latency samples...
        </div>
      );
    }

    const width = 240;
    const height = 40;
    const min = Math.min(...history);
    const max = Math.max(...history, min + 5);
    const range = max - min || 1;

    const points = history
      .map((val, idx) => {
        const x = (idx / (history.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const currentVal = history[history.length - 1];

    return (
      <div className="flex flex-col gap-1 w-full max-w-[280px]">
        <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
          <span>Min {min}ms</span>
          <span className="font-semibold text-foreground">{currentVal}ms</span>
          <span>Max {max}ms</span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-10 overflow-visible rounded border border-border/40 bg-surface/40 p-1"
        >
          <polyline
            fill="none"
            stroke="#FF5A1F"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] w-full bg-[#07070B] text-[#F5F5F7] flex flex-col justify-between select-none">
      {/* Top Banner: Reconnecting */}
      {!isConnectedToAgent && (
        <div className="w-full bg-amber-500/20 border-b border-amber-500/40 text-amber-300 text-xs px-4 py-2 flex items-center justify-center gap-2 font-mono">
          <Warning size={16} />
          <span>Agent not reachable — reconnecting...</span>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-5xl mx-auto w-full px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <AerokinLogo size={28} withWordmark />
            <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-white/10 text-muted-foreground bg-white/[0.02]">
              PC Agent
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Remote Input Pause Toggle */}
            <button
              onClick={handleTogglePause}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                isInputPaused
                  ? 'border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground'
              }`}
              title={
                isInputPaused
                  ? 'Remote input is currently paused. Click to resume.'
                  : 'Immediately pause remote touch/mouse/keyboard input from all connected phones.'
              }
            >
              {isInputPaused ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span>Input Paused (Click to Resume)</span>
                </>
              ) : (
                <>
                  <Pause size={14} />
                  <span>Pause Input</span>
                </>
              )}
            </button>

            {/* Live Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  hasConnectedDevices ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'
                }`}
              />
              <span className="text-foreground">
                {hasConnectedDevices
                  ? `${activeConnectedDevices.length} Connected`
                  : 'Awaiting Connection'}
              </span>
            </div>

            <button
              onClick={onSwitchToPhoneView}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Open mobile simulator"
            >
              <DeviceMobile size={15} />
              <span>Mobile Simulator</span>
            </button>
          </div>
        </header>

        {/* Active Dangerous Action Countdown Banner (Shutdown / Restart / Sign Out) */}
        <AnimatePresence>
          {countdownState.active && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="rounded-2xl border-2 border-rose-500 bg-rose-950/60 backdrop-blur-md p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="rgba(244,63,94,0.2)"
                      strokeWidth="3"
                      fill="transparent"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="#f43f5e"
                      strokeWidth="3"
                      fill="transparent"
                      strokeDasharray={125.6}
                      strokeDashoffset={125.6 * (1 - countdownState.secondsRemaining / 10)}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <span className="absolute font-mono text-xs font-bold text-rose-400">
                    {countdownState.secondsRemaining}s
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <Warning size={18} className="text-rose-400 animate-pulse" />
                    <h3 className="text-sm font-bold text-rose-200 uppercase tracking-wide">
                      System Action Requested: {countdownState.action?.replace('_', ' ')}
                    </h3>
                  </div>
                  <p className="text-xs text-rose-300/80 mt-0.5">
                    10-second cancelable delay in progress from remote phone. Cancel immediately to prevent system termination.
                  </p>
                </div>
              </div>

              <button
                onClick={handleCancelCountdown}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                <X size={15} />
                <span>Abort Action ({countdownState.secondsRemaining}s)</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating / Prominent Pairing Approval Request (State B) */}
        <AnimatePresence>
          {pendingApproval && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="rounded-2xl border-2 border-[#FF5A1F] bg-[#0E0E17] p-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6"
            >
              <div className="flex items-center gap-4">
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="3"
                      fill="transparent"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="#FF5A1F"
                      strokeWidth="3"
                      fill="transparent"
                      strokeDasharray={125.6}
                      strokeDashoffset={125.6 * (1 - approvalCountdown / 30)}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <span className="absolute font-mono text-xs font-semibold text-[#FF5A1F]">
                    {approvalCountdown}s
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      Pairing Request: {pendingApproval.name}
                    </h3>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.08] text-muted-foreground">
                      {pendingApproval.platform}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Client IP: <span className="font-mono text-foreground">{pendingApproval.clientIp}</span>. Authorize this device to control your PC?
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => handleRespondApproval(false)}
                  className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl border border-white/20 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-foreground transition-colors"
                >
                  Deny
                </button>
                <button
                  onClick={() => handleRespondApproval(true)}
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-[#FF5A1F] hover:bg-[#e04f1a] text-black text-xs font-semibold shadow transition-colors"
                >
                  Approve Connection
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* State A: NOT CONNECTED (Big Pairing Card) */}
        {!hasConnectedDevices && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Primary Pairing Card */}
            <div className="md:col-span-8 rounded-2xl bg-surface border border-border p-6 flex flex-col gap-6 shadow-sm">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Connect Your Phone Remote
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scan the QR code or enter the 8-digit pairing code on your mobile device
                  </p>
                </div>

                <button
                  onClick={handleRegenerateCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-raised hover:bg-white/[0.08] text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title="Generate new 8-digit code"
                >
                  <ArrowClockwise size={14} />
                  <span>Regenerate</span>
                </button>
              </div>

              {/* Pairing Transport Toggle */}
              <div className="flex items-center gap-2 p-1 bg-raised rounded-xl border border-border w-fit text-xs font-medium">
                <button
                  onClick={() => setPairMode('lan')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                    pairMode === 'lan'
                      ? 'bg-[#FF5A1F] text-black font-semibold shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <WifiHigh size={14} />
                  <span>Local Wi-Fi (LAN)</span>
                </button>
                <button
                  onClick={() => setPairMode('remote')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${
                    pairMode === 'remote'
                      ? 'bg-[#FF5A1F] text-black font-semibold shadow'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Globe size={14} />
                  <span>Remote WebRTC (Anywhere)</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-8 py-2">
                {/* Big QR Code */}
                <div className="p-3 bg-white rounded-2xl border border-border shadow-md flex-shrink-0 flex flex-col items-center">
                  {(pairMode === 'lan' ? pairQrUrl : remoteQrUrl) ? (
                    <img
                      src={pairMode === 'lan' ? pairQrUrl! : remoteQrUrl!}
                      alt={pairMode === 'lan' ? 'LAN Pairing QR Code' : 'Remote WebRTC Pairing QR Code'}
                      className="w-44 h-44 object-contain"
                    />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center font-mono text-xs text-black">
                      Generating QR...
                    </div>
                  )}
                  <span className="text-[10px] font-mono text-neutral-800 font-semibold mt-1">
                    {pairMode === 'lan' ? 'Direct Wi-Fi / LAN' : 'WebRTC P2P / Remote'}
                  </span>
                </div>

                {/* 8-Digit Code Display with Animated Ring */}
                <div className="flex-1 flex flex-col gap-4 w-full">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Pairing Code
                    </span>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="font-mono text-3xl font-bold tracking-[0.2em] text-[#FF5A1F] bg-raised px-4 py-2 rounded-xl border border-border tabular-nums select-all">
                        {activeCode || '--------'}
                      </div>

                      {/* Expiration Countdown Ring */}
                      <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-10 h-10 transform -rotate-90">
                          <circle
                            cx="20"
                            cy="20"
                            r="16"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="2.5"
                            fill="transparent"
                          />
                          <circle
                            cx="20"
                            cy="20"
                            r="16"
                            stroke="#FF5A1F"
                            strokeWidth="2.5"
                            fill="transparent"
                            strokeDasharray={100.5}
                            strokeDashoffset={100.5 * (1 - codeExpiresIn / 120)}
                            className="transition-all duration-1000 ease-linear"
                          />
                        </svg>
                        <span className="absolute font-mono text-[10px] text-muted-foreground">
                          {codeExpiresIn}s
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* LAN and Remote Copy Rows */}
                  {pairMode === 'lan' && pcStats && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                      <div className="flex items-center justify-between text-xs bg-raised px-3 py-1.5 rounded-lg border border-border/50">
                        <span className="font-mono text-muted-foreground truncate max-w-[260px]">
                          https://{pcStats.lanIp}:{pcStats.port}/#code={activeCode}
                        </span>
                        <button
                          onClick={() =>
                            handleCopy(
                              `https://${pcStats.lanIp}:${pcStats.port}/#code=${activeCode}`,
                              'lan_url'
                            )
                          }
                          className="p-1 hover:text-[#FF5A1F] transition-colors"
                          title="Copy LAN URL"
                        >
                          {copiedKey === 'lan_url' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs bg-raised px-3 py-1.5 rounded-lg border border-border/50">
                        <span className="font-mono text-muted-foreground truncate max-w-[260px]">
                          https://aerokin.local:{pcStats.port}/#code={activeCode}
                        </span>
                        <button
                          onClick={() =>
                            handleCopy(
                              `https://aerokin.local:${pcStats.port}/#code=${activeCode}`,
                              'mdns_url'
                            )
                          }
                          className="p-1 hover:text-[#FF5A1F] transition-colors"
                          title="Copy mDNS URL"
                        >
                          {copiedKey === 'mdns_url' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {pairMode === 'remote' && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                      {/* Remote Payload URI */}
                      <div className="flex items-center justify-between text-xs bg-raised px-3 py-1.5 rounded-lg border border-border/50">
                        <span className="font-mono text-muted-foreground truncate max-w-[260px]">
                          {`https://app.aerokin.com/#agent=${webrtcStatus?.pcId || 'pc_host'}&code=${activeCode}`}
                        </span>
                        <button
                          onClick={() =>
                            handleCopy(
                              webrtcStatus?.remotePairPayload ||
                                `https://app.aerokin.com/#agent=${webrtcStatus?.pcId || 'pc_host'}${webrtcStatus?.signalingUrl ? `&signal=${encodeURIComponent(webrtcStatus.signalingUrl)}` : ''}&code=${activeCode}`,
                              'remote_uri'
                            )
                          }
                          className="p-1 hover:text-[#FF5A1F] transition-colors"
                          title="Copy Remote Pairing URI"
                        >
                          {copiedKey === 'remote_uri' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>

                      {/* Host PC ID */}
                      <div className="flex items-center justify-between text-xs bg-raised px-3 py-1.5 rounded-lg border border-border/50">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-[10px] text-muted-foreground uppercase">PC ID:</span>
                          <span className="text-foreground font-semibold">{webrtcStatus?.pcId || 'pc_host'}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(webrtcStatus?.pcId || 'pc_host', 'pc_id_copy')}
                          className="p-1 hover:text-[#FF5A1F] transition-colors"
                          title="Copy Host PC ID"
                        >
                          {copiedKey === 'pc_id_copy' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Collapsed Certificate Setup Card (HTTP Port 8080) */}
              <div className="border border-border rounded-xl bg-raised overflow-hidden">
                <button
                  onClick={() => setShowTrustDetails(!showTrustDetails)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-medium text-foreground hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    <span>SSL Certificate Trust Setup (Port 8080)</span>
                  </div>
                  {showTrustDetails ? <CaretUp size={14} /> : <CaretDown size={14} />}
                </button>

                {showTrustDetails && (
                  <div className="px-4 pb-4 pt-2 border-t border-border flex flex-col sm:flex-row items-center gap-4 text-xs text-muted-foreground">
                    <div className="p-2 bg-white rounded-xl shadow-sm flex-shrink-0">
                      {trustQrUrl ? (
                        <img src={trustQrUrl} alt="CA Profile QR" className="w-24 h-24 object-contain" />
                      ) : (
                        <div className="w-24 h-24 flex items-center justify-center font-mono text-[10px] text-black">
                          Loading...
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 leading-relaxed">
                      <p className="text-foreground font-medium">One-Time iOS Root CA Profile Install:</p>
                      <ol className="list-decimal list-inside space-y-1 text-[11px]">
                        <li>Scan QR code with iPhone Camera to open <span className="font-mono text-foreground">http://{pcStats?.lanIp}:8080</span>.</li>
                        <li>Tap <strong>Allow</strong> &rarr; Profile Downloaded.</li>
                        <li>Open iOS <strong>Settings</strong> &rarr; Profile Downloaded &rarr; Install.</li>
                        <li>Go to <strong>Settings &rarr; General &rarr; About &rarr; Certificate Trust Settings</strong> and enable Full Trust for AEROKIN CA.</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Checklist Card */}
            <div className="md:col-span-4 rounded-2xl bg-surface border border-border p-6 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-foreground">Quick Setup Checklist</h3>
              <div className="flex flex-col gap-4 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Install Local CA</span>
                    <p className="text-muted-foreground text-[11px] mt-0.5">
                      Ensures zero SSL warnings over local HTTPS.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#FF5A1F] text-black flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Scan & Approve</span>
                    <p className="text-muted-foreground text-[11px] mt-0.5">
                      Scan pairing QR. Click Approve on the PC when prompted.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Add to Home Screen</span>
                    <p className="text-muted-foreground text-[11px] mt-0.5">
                      In Safari, tap Share &rarr; Add to Home Screen for fullscreen trackpad & remote.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* State C: CONNECTED (Device Cards + PC Stats) */}
        {hasConnectedDevices && (
          <div className="flex flex-col gap-6">
            {/* Top Connected Status Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-2xl border border-border">
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold text-foreground">
                  {activeConnectedDevices.length} Connected Controller{activeConnectedDevices.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {desktopStream?.state === 'active' && (
                  <button
                    onClick={handleStopDesktop}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-medium transition-colors"
                  >
                    <Stop size={14} />
                    <span>Stop Desktop Stream</span>
                  </button>
                )}

                <button
                  onClick={handleRevokeAllDevices}
                  className="px-3 py-1.5 rounded-xl border border-border bg-raised hover:bg-white/[0.08] text-xs text-muted-foreground hover:text-rose-400 transition-colors"
                >
                  Revoke All
                </button>
              </div>
            </div>

            {/* Devices Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {activeConnectedDevices.map((dev) => {
                const quality = getConnectionQuality(dev.currentLatency);
                const isEditing = editingDeviceId === dev.deviceId;

                return (
                  <div
                    key={dev.deviceId}
                    className="rounded-2xl bg-surface border border-border p-6 flex flex-col justify-between gap-6 shadow-sm"
                  >
                    {/* Device Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-raised border border-border flex items-center justify-center text-foreground flex-shrink-0">
                          <DeviceMobile size={20} />
                        </div>

                        <div>
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={renameInputValue}
                                onChange={(e) => setRenameInputValue(e.target.value)}
                                className="bg-raised border border-[#FF5A1F] rounded-lg px-2.5 py-1 text-xs text-foreground font-medium outline-none"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameDevice(dev.deviceId);
                                  if (e.key === 'Escape') setEditingDeviceId(null);
                                }}
                              />
                              <button
                                onClick={() => handleRenameDevice(dev.deviceId)}
                                className="p-1 rounded bg-[#FF5A1F] text-black"
                              >
                                <Check size={12} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-foreground">{dev.name}</h3>
                              <button
                                onClick={() => {
                                  setEditingDeviceId(dev.deviceId);
                                  setRenameInputValue(dev.name);
                                }}
                                className="text-muted-foreground hover:text-foreground p-0.5"
                                title="Rename device"
                              >
                                <PencilSimple size={12} />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-muted-foreground">
                            <span>{dev.platform}</span>
                            <span>•</span>
                            <span>{dev.clientIp || '127.0.0.1'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Connection Quality Pill */}
                      <div
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium ${quality.bg} ${quality.color}`}
                      >
                        <WifiHigh size={13} />
                        <span>{quality.label}</span>
                        {dev.currentLatency !== null && (
                          <span className="tabular-nums font-semibold ml-0.5">
                            {dev.currentLatency}ms
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Latency RTT Sparkline */}
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-border/60">
                      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                        Live Round-Trip Latency (Last 60 samples)
                      </span>
                      {renderSparkline(dev.latencyHistory)}
                    </div>

                    {/* Active Desktop Remote Status */}
                    {desktopStream?.state === 'active' && (
                      <div className="p-3 rounded-xl bg-raised border border-border flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Desktop size={16} className="text-[#FF5A1F]" />
                          <div>
                            <span className="font-semibold text-foreground">Desktop Stream Active</span>
                            <span className="font-mono text-[11px] text-muted-foreground ml-2">
                              {desktopStream.stats?.fps || 0} fps • {desktopStream.stats?.bitrateKbps || 0} kbps
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleStopDesktop}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-[11px] font-medium transition-colors"
                        >
                          Stop
                        </button>
                      </div>
                    )}

                    {/* Active Media Status */}
                    {mediaStatus?.nowPlaying && mediaStatus.nowPlaying.title && (
                      <div className="p-3 rounded-xl bg-raised border border-border flex items-center gap-3 text-xs">
                        <MusicNotes size={16} className="text-[#FF5A1F] flex-shrink-0" />
                        <div className="truncate">
                          <div className="font-semibold text-foreground truncate">
                            {mediaStatus.nowPlaying.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {mediaStatus.nowPlaying.artist || mediaStatus.nowPlaying.app || 'Now Playing'}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Phone Battery Status */}
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60 text-muted-foreground">
                      <span>Phone Battery</span>
                      {dev.battery && dev.battery.percent !== null ? (
                        <div className="flex items-center gap-1.5 font-mono text-foreground font-medium">
                          {dev.battery.charging ? (
                            <BatteryCharging size={15} className="text-emerald-400" />
                          ) : (
                            <BatteryFull size={15} />
                          )}
                          <span>{dev.battery.percent}%</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60 italic">
                          Not available on this device
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60 text-xs">
                      <button
                        onClick={() => handleDisconnectDevice(dev.deviceId)}
                        className="px-3 py-1.5 rounded-lg border border-border bg-raised hover:bg-white/[0.08] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Disconnect
                      </button>
                      <button
                        onClick={() => handleRevokeDevice(dev.deviceId)}
                        className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* PC Host Stats Card */}
        {pcStats && (
          <div className="rounded-2xl bg-surface border border-border p-5 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-muted-foreground text-[10px] uppercase">Hostname</span>
                <div className="text-foreground font-semibold mt-0.5">{pcStats.hostname}</div>
              </div>

              <div>
                <span className="text-muted-foreground text-[10px] uppercase">LAN IPv4</span>
                <div className="text-foreground font-semibold mt-0.5">{pcStats.lanIp}</div>
              </div>

              <div>
                <span className="text-muted-foreground text-[10px] uppercase">Port</span>
                <div className="text-foreground font-semibold mt-0.5">{pcStats.port}</div>
              </div>

              <div>
                <span className="text-muted-foreground text-[10px] uppercase">Uptime</span>
                <div className="text-foreground font-semibold mt-0.5">{formatUptime(pcStats.uptime)}</div>
              </div>
            </div>

            {/* PC Battery: Rendered only if host has a battery (laptops); cleanly omitted on desktop PCs */}
            {pcStats.power.hasBattery && pcStats.power.batteryPercent !== null && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-raised border border-border">
                {pcStats.power.isCharging ? (
                  <BatteryCharging size={16} className="text-emerald-400" />
                ) : (
                  <BatteryFull size={16} />
                )}
                <span>PC Battery: {pcStats.power.batteryPercent}%</span>
                {pcStats.power.isCharging && <span className="text-[10px] text-emerald-400">(Charging)</span>}
              </div>
            )}
          </div>
        )}

        {/* Remote WebRTC Status & Internet Access Card */}
        <div className="rounded-2xl bg-surface border border-border p-6 flex flex-col gap-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-raised border border-border flex items-center justify-center text-[#FF5A1F]">
                <Globe size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Remote WebRTC & Internet Access
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Direct peer-to-peer control from your iPhone anywhere over the internet (No Tailscale / AnyDesk)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
                  webrtcStatus?.signalingConnected
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : webrtcStatus?.signalingUrl
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-white/5 border-white/10 text-muted-foreground'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    webrtcStatus?.signalingConnected
                      ? 'bg-emerald-400 animate-pulse'
                      : webrtcStatus?.signalingUrl
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-neutral-500'
                  }`}
                />
                <span>
                  {webrtcStatus?.signalingConnected
                    ? 'Signaling Online'
                    : webrtcStatus?.signalingUrl
                    ? 'Connecting...'
                    : 'LAN-Only (Signaling Unset)'}
                </span>
              </span>

              {webrtcStatus?.remotePairPayload && (
                <button
                  onClick={() =>
                    handleCopy(webrtcStatus.remotePairPayload!, 'remote_payload_btn')
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-raised hover:bg-white/[0.08] text-xs text-foreground font-medium transition-colors"
                  title="Copy Remote Pairing Link"
                >
                  {copiedKey === 'remote_payload_btn' ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : (
                    <Copy size={14} />
                  )}
                  <span>Copy Remote Link</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {/* Host PC ID */}
            <div className="p-3.5 rounded-xl bg-raised border border-border/60 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Host PC ID
              </div>
              <div className="flex items-center justify-between gap-2 font-mono text-sm text-foreground font-bold">
                <span className="text-[#FF5A1F]">{webrtcStatus?.pcId || 'pc_host'}</span>
                <button
                  onClick={() => handleCopy(webrtcStatus?.pcId || 'pc_host', 'pc_id_tile')}
                  className="p-1 hover:text-[#FF5A1F] text-muted-foreground transition-colors"
                  title="Copy PC ID"
                >
                  {copiedKey === 'pc_id_tile' ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
              <div className="text-[10px] text-muted-foreground">Persistent hardware identifier</div>
            </div>

            {/* Signaling Server */}
            <div className="p-3.5 rounded-xl bg-raised border border-border/60 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Signaling Service
              </div>
              <div className="font-mono text-xs text-foreground truncate" title={webrtcStatus?.signalingUrl || 'Self-hosted local'}>
                {webrtcStatus?.signalingUrl || 'Not configured'}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {webrtcStatus?.signalingConnected
                  ? 'WebSocket room ready'
                  : webrtcStatus?.signalingUrl
                  ? 'Reconnecting...'
                  : 'Set AEROKIN_SIGNALING_URL'}
              </div>
            </div>

            {/* STUN / TURN Relay */}
            <div className="p-3.5 rounded-xl bg-raised border border-border/60 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                NAT Traversal (STUN/TURN)
              </div>
              <div className="font-mono text-xs text-foreground font-semibold flex items-center gap-1.5">
                <ShieldCheck size={14} className={webrtcStatus?.turnConfigured ? 'text-emerald-400' : 'text-neutral-400'} />
                <span>{webrtcStatus?.turnConfigured ? 'Coturn HMAC-SHA1' : 'Standard STUN'}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {webrtcStatus?.turnConfigured ? 'Direct P2P + Relay fallback' : 'P2P direct hole punching'}
              </div>
            </div>

            {/* Transport Hierarchy */}
            <div className="p-3.5 rounded-xl bg-raised border border-border/60 flex flex-col justify-between gap-2">
              <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Multi-Path Priority
              </div>
              <div className="font-mono text-[11px] text-foreground font-medium">
                LAN &rarr; P2P &rarr; TURN
              </div>
              <div className="text-[10px] text-emerald-400">Zero 3rd-party SaaS relays</div>
            </div>
          </div>
        </div>

        {/* System Telemetry & Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* 1. System Telemetry Card (7 cols) */}
          <div className="md:col-span-7 rounded-2xl bg-surface border border-border p-6 flex flex-col gap-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Cpu size={18} className="text-[#FF5A1F]" />
                <h3 className="text-sm font-semibold text-foreground">System Telemetry</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-raised border border-border text-muted-foreground">
                Agent CPU: {systemTelemetry?.agentCpuPercent != null ? `${systemTelemetry.agentCpuPercent.toFixed(2)}%` : '<0.02%'}
              </span>
            </div>

            {systemTelemetry ? (
              <div className="flex flex-col gap-4 text-xs font-mono">
                {/* CPU & RAM Quick Bars */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-raised border border-border/60 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>CPU TOTAL</span>
                      <span className="text-foreground font-semibold">
                        {systemTelemetry.cpu?.totalPercent != null ? `${systemTelemetry.cpu.totalPercent.toFixed(1)}%` : '0%'}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#FF5A1F] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, systemTelemetry.cpu?.totalPercent || 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground/80">
                      {systemTelemetry.cpu?.cores?.length || 0} logical cores
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-raised border border-border/60 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>RAM USAGE</span>
                      <span className="text-foreground font-semibold">
                        {systemTelemetry.memory?.usedPercent != null ? `${systemTelemetry.memory.usedPercent.toFixed(1)}%` : '0%'}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, systemTelemetry.memory?.usedPercent || 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground/80">
                      {systemTelemetry.memory ? `${(systemTelemetry.memory.usedBytes / 1e9).toFixed(1)} / ${(systemTelemetry.memory.totalBytes / 1e9).toFixed(1)} GB` : ''}
                    </span>
                  </div>
                </div>

                {/* Storage & Network */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Storage Drives</span>
                    {systemTelemetry.disks && systemTelemetry.disks.length > 0 ? (
                      systemTelemetry.disks.map((d: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-[11px] bg-raised px-2.5 py-1.5 rounded-lg border border-border/40">
                          <span className="font-semibold text-foreground">{d.mount}</span>
                          <span className="text-muted-foreground">
                            {d.usedGb} / {d.totalGb} GB ({d.percent}%)
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-muted-foreground text-[11px]">Primary drive active</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase text-muted-foreground">Network I/O</span>
                    <div className="bg-raised p-2.5 rounded-lg border border-border/40 flex flex-col gap-1 text-[11px]">
                      <div className="flex items-center justify-between text-emerald-400">
                        <span className="flex items-center gap-1"><ArrowDown size={11} /> DOWN</span>
                        <span>{systemTelemetry.network?.rxRateKbps != null ? `${systemTelemetry.network.rxRateKbps.toFixed(1)} KB/s` : '0.0 KB/s'}</span>
                      </div>
                      <div className="flex items-center justify-between text-blue-400">
                        <span className="flex items-center gap-1"><ArrowUp size={11} /> UP</span>
                        <span>{systemTelemetry.network?.txRateKbps != null ? `${systemTelemetry.network.txRateKbps.toFixed(1)} KB/s` : '0.0 KB/s'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GPU & Thermal honest reporting */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>GPU Engine: <strong className="text-foreground">{systemTelemetry.gpu?.available && (systemTelemetry.gpu.utilizationPercent !== null || systemTelemetry.gpu.utilization !== null) ? `${systemTelemetry.gpu.utilizationPercent ?? systemTelemetry.gpu.utilization}%${systemTelemetry.gpu.name ? ` (${systemTelemetry.gpu.name})` : ''}` : (systemTelemetry.gpu?.note || 'Not available')}</strong></span>
                  <span>Hardware Thermal: <strong className="text-foreground">{systemTelemetry.temperature?.available && systemTelemetry.temperature.celsius !== null ? `${systemTelemetry.temperature.celsius}°C` : (systemTelemetry.temperatures?.available ? `${systemTelemetry.temperatures.main}°C` : (systemTelemetry.temperature?.note || 'Not available'))}</strong></span>
                </div>

                {/* Media Diagnostics Card */}
                <div className="pt-2.5 border-t border-border/40 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between font-semibold text-foreground">
                    <span className="flex items-center gap-1.5"><MusicNotes size={13} className="text-[#FF5A1F]" /> Media Detection:</span>
                    <span className="font-mono text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                      {mediaStatus?.nowPlaying?.status === 'playing' ? 'Active Playing' : 'Idle / Ready'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                    <div>SMTC Native Bridge: <strong className="text-foreground">Online</strong></div>
                    <div>Process Fallback: <strong className="text-foreground">VLC / MPC-HC</strong></div>
                    <div>Master Volume: <strong className="text-foreground">{mediaStatus?.volume != null ? `${mediaStatus.volume}%` : '50%'}</strong></div>
                    <div>Seek Profile: <strong className="text-foreground">VLC (Alt+Arrow)</strong></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground font-mono">
                Awaiting telemetry stream from PC agent...
              </div>
            )}
          </div>

          {/* 2. Security & Features Panel (5 cols) */}
          <div className="md:col-span-5 rounded-2xl bg-surface border border-border p-6 flex flex-col gap-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground">Features & Security</h3>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">Enforced</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Loopback management control. Disabled features are rejected by the server at the protocol boundary.
            </p>

            <div className="flex flex-col gap-3 text-xs">
              {/* Clipboard Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-raised border border-border/60">
                <div className="flex items-center gap-2.5">
                  <ClipboardText size={16} className="text-[#FF5A1F]" />
                  <div>
                    <div className="font-semibold text-foreground">Clipboard Sync</div>
                    <div className="text-[10px] text-muted-foreground">Text-only, max 100 KB, zero logs</div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFeature('clipboard')}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                    features.clipboard ? 'bg-[#FF5A1F]' : 'bg-white/20'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-black shadow transition-transform ${
                      features.clipboard ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Screenshot Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-raised border border-border/60">
                <div className="flex items-center gap-2.5">
                  <Camera size={16} className="text-[#FF5A1F]" />
                  <div>
                    <div className="font-semibold text-foreground">Screenshot Capture</div>
                    <div className="text-[10px] text-muted-foreground">Native Win32 BitBlt, 8 MB limit</div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFeature('screenshot')}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                    features.screenshot ? 'bg-[#FF5A1F]' : 'bg-white/20'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-black shadow transition-transform ${
                      features.screenshot ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Quick Actions Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-raised border border-border/60">
                <div className="flex items-center gap-2.5">
                  <Lightning size={16} className="text-[#FF5A1F]" />
                  <div>
                    <div className="font-semibold text-foreground">Quick Actions</div>
                    <div className="text-[10px] text-muted-foreground">Lock, sleep, volume, safe inputs</div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFeature('quickActions')}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                    features.quickActions ? 'bg-[#FF5A1F]' : 'bg-white/20'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-black shadow transition-transform ${
                      features.quickActions ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Launcher Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-raised border border-border/60">
                <div className="flex items-center gap-2.5">
                  <RocketLaunch size={16} className="text-[#FF5A1F]" />
                  <div>
                    <div className="font-semibold text-foreground">App Launcher</div>
                    <div className="text-[10px] text-muted-foreground">launcher.json allow-list only</div>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleFeature('launcher')}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 ${
                    features.launcher ? 'bg-[#FF5A1F]' : 'bg-white/20'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-black shadow transition-transform ${
                      features.launcher ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Clipboard Shared Counter Notice (Part 4) */}
              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Clipboard shared: <strong className="text-foreground">{clipboardSharedCount} items</strong></span>
                <span className="text-[10px] text-emerald-400">Zero log leakage</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Recent Remote Actions List */}
        <div className="rounded-2xl bg-surface border border-border p-6 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <ListChecks size={18} className="text-[#FF5A1F]" />
              <h3 className="text-sm font-semibold text-foreground">Recent Remote Actions</h3>
            </div>
            {countdownState.active && (
              <button
                onClick={handleCancelCountdown}
                className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <X size={14} />
                <span>Cancel {countdownState.action?.replace('_', ' ')} ({countdownState.secondsRemaining}s)</span>
              </button>
            )}
          </div>

          {recentActions.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground font-mono">
              No recent actions executed from mobile controllers.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {recentActions.slice(0, 9).map((act, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-raised border border-border/50 flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        act.success ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span className="text-foreground font-medium uppercase text-[11px]">
                      {act.action.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(act.time).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logs Section (Collapsible Drawer) */}
        <div className="border border-border rounded-2xl bg-surface overflow-hidden flex flex-col">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-xs font-medium text-foreground hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold">Event & Diagnostic Logs</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-raised border border-border text-muted-foreground">
                {logs.length} entries
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{showLogs ? 'Collapse' : 'Expand'}</span>
              {showLogs ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </div>
          </button>

          {showLogs && (
            <div className="p-5 border-t border-border flex flex-col gap-4">
              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Category Filter Chips */}
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  {['all', 'pairing', 'desktop', 'media', 'input', 'security', 'system'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setLogFilterCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg border transition-colors ${
                        logFilterCategory === cat
                          ? 'bg-[#FF5A1F] border-[#FF5A1F] text-black font-semibold'
                          : 'bg-raised border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {cat.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Level Filter & Actions */}
                <div className="flex items-center gap-2">
                  <select
                    value={logFilterLevel}
                    onChange={(e) => setLogFilterLevel(e.target.value)}
                    className="bg-raised border border-border rounded-lg px-2 py-1 text-xs text-foreground font-mono outline-none"
                  >
                    <option value="all">ALL LEVELS</option>
                    <option value="info">INFO</option>
                    <option value="warn">WARN</option>
                    <option value="error">ERROR</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    className="bg-raised border border-border rounded-lg px-3 py-1 text-xs text-foreground font-mono placeholder:text-muted-foreground/50 outline-none w-36"
                  />

                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoScrollLogs}
                      onChange={(e) => setAutoScrollLogs(e.target.checked)}
                      className="rounded accent-[#FF5A1F]"
                    />
                    <span>Auto-scroll</span>
                  </label>

                  <button
                    onClick={() => {
                      const text = filteredLogs
                        .map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] [${l.category.toUpperCase()}] ${l.message}`)
                        .join('\n');
                      handleCopy(text, 'all_logs');
                    }}
                    className="p-1.5 rounded-lg border border-border bg-raised hover:bg-white/[0.08] text-foreground transition-colors"
                    title="Copy displayed logs"
                  >
                    {copiedKey === 'all_logs' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>

                  <a
                    href="/api/logs/download"
                    download
                    className="p-1.5 rounded-lg border border-border bg-raised hover:bg-white/[0.08] text-foreground transition-colors"
                    title="Download full log file (.txt)"
                  >
                    <DownloadSimple size={14} />
                  </a>
                </div>
              </div>

              {/* Log List View */}
              <div
                ref={logsContainerRef}
                className="max-h-72 overflow-y-auto rounded-xl border border-border bg-black/60 p-3 flex flex-col gap-1 font-mono text-[11px]"
              >
                {filteredLogs.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No matching log events recorded.
                  </div>
                ) : (
                  filteredLogs.map((entry) => {
                    const levelColors: Record<string, string> = {
                      info: 'text-muted-foreground',
                      warn: 'text-amber-400 font-semibold',
                      error: 'text-rose-400 font-bold',
                    };
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-2 py-0.5 border-b border-white/[0.03] hover:bg-white/[0.02]"
                      >
                        <span className="text-muted-foreground/60 flex-shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                        <span
                          className={`uppercase text-[10px] px-1 rounded flex-shrink-0 ${
                            levelColors[entry.level] || 'text-muted-foreground'
                          }`}
                        >
                          [{entry.level}]
                        </span>
                        <span className="text-[#FF5A1F] flex-shrink-0 uppercase text-[10px]">
                          [{entry.category}]
                        </span>
                        <span className="text-foreground break-all">{entry.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-muted-foreground">
          <span>AeroKin PC Remote Agent</span>
          <button onClick={onSwitchToPhoneView} className="hover:text-foreground transition-colors">
            Switch to mobile view &rarr;
          </button>
        </footer>
      </div>
    </div>
  );
};
