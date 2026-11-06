import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { getOrCreateLocalCaAndCert } from './ca.js';
import { isLoopbackRequest, isLoopbackIp, normalizeIp } from './loopback.js';
import { serverLogger, LogEntry } from './logger.js';
import { getHostPowerStatus } from './power.js';
import {
  createMoveCoalescer,
  createScroller,
  handleClick,
  handleButton,
  handleScroll,
  handleAbsMove,
  handleAbsClick,
  handleAbsButton,
  handleKey,
  handleText,
  setInputBackend,
} from './input.js';
import {
  validateClientMessage,
  ConnectionRateLimiter,
  WS_MAX_PAYLOAD_BYTES,
  WS_CLOSE_POLICY_VIOLATION,
} from './protocol.js';
import { parseAllowedOrigins, isOriginAllowed } from './origin.js';
import { MediaManager } from './media-manager.js';
import { DeviceStore, DevicePublicInfo } from './device-store.js';
import { PairingManager } from './pairing-manager.js';
import { StreamService, MonitorService } from './desktop/index.js';
import { FeatureManager } from './features/FeatureManager.js';
import { SystemStatsService } from './stats/SystemStatsService.js';
import { SignalingClient } from './transport/SignalingClient.js';
import { ClipboardService } from './clipboard/ClipboardService.js';
import { ScreenshotService } from './screenshot/ScreenshotService.js';
import { QuickActionService } from './actions/QuickActionService.js';
import { PowerActionExecutor } from './actions/PowerActionExecutor.js';
import { InputBackend } from './input/InputBackend.js';

export interface ServerConfig {
  port: number;
  lanIp: string;
  token?: string; // Optional legacy token
  legacyToken?: string;
  publicDir: string;
  certsDir: string;
  allowedOrigins?: Set<string>;
  deviceStore?: DeviceStore;
  pairingManager?: PairingManager;
  streamService?: StreamService;
  featureManager?: FeatureManager;
  statsService?: SystemStatsService;
  clipboardService?: ClipboardService;
  screenshotService?: ScreenshotService;
  quickActionService?: QuickActionService;
  powerExecutor?: PowerActionExecutor;
  inputBackend?: InputBackend;
}

export interface ActivityEvent {
  id: string;
  time: number;
  type: 'move' | 'click' | 'button' | 'scroll' | 'media' | 'ping' | 'connect' | 'disconnect';
  summary: string;
}

/**
 * Returns true if the HTTP request originated from the local machine (loopback).
 */
const isLoopback = isLoopbackRequest;

export function startServer(config: ServerConfig): {
  httpsServer: https.Server;
  wss: WebSocketServer;
  desktopWss: WebSocketServer;
  streamService: StreamService;
  mediaManager: MediaManager;
  deviceStore: DeviceStore;
  pairingManager: PairingManager;
  featureManager: FeatureManager;
  statsService: SystemStatsService;
  clipboardService: ClipboardService;
  screenshotService: ScreenshotService;
  quickActionService: QuickActionService;
  revokeDevice: (deviceId: string) => void;
  revokeAll: (exceptDeviceId?: string) => void;
  broadcastDevices: () => void;
} {
  const app = express();
  const allowedOrigins =
    config.allowedOrigins || parseAllowedOrigins(process.env.AEROKIN_ALLOWED_ORIGINS);

  const deviceStore = config.deviceStore || new DeviceStore(config.certsDir);
  const pairingManager = config.pairingManager || new PairingManager();
  const featureManager = config.featureManager || new FeatureManager();
  const statsService = config.statsService || new SystemStatsService();
  const clipboardService = config.clipboardService || new ClipboardService();
  const screenshotService = config.screenshotService || new ScreenshotService();
  if (config.inputBackend) {
    setInputBackend(config.inputBackend);
  }
  const quickActionService =
    config.quickActionService ||
    new QuickActionService(undefined, config.powerExecutor, config.inputBackend);

  // In-memory state for desktop localhost dashboard
  const activeSockets = new Set<WebSocket>();
  const socketsByDeviceId = new Map<string, Set<WebSocket>>();
  const unauthConnectionsByIp = new Map<string, number>();
  const latencyHistoryByDevice = new Map<string, number[]>();
  const phoneBatteryByDevice = new Map<string, { percent: number | null; charging: boolean | null }>();
  const sseClients = new Set<express.Response>();

  let lastLatency: number | null = null;
  const eventBuffer: ActivityEvent[] = [];

  function broadcastDashboardEvent(event: string, data: any) {
    if (sseClients.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Hook action countdown changes to SSE
  quickActionService.onCountdownChange((state) => {
    broadcastDashboardEvent('countdown_update', state);
  });

  // Hook feature flag changes to SSE and active sockets
  featureManager.onFlagsChange((flags) => {
    broadcastDashboardEvent('features_update', flags);
    const flagsPayload = JSON.stringify({ type: 'features_status', flags });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(flagsPayload);
        } catch {}
      }
    }
  });

  function recordDeviceLatency(deviceId: string, rtt: number) {
    let hist = latencyHistoryByDevice.get(deviceId);
    if (!hist) {
      hist = [];
      latencyHistoryByDevice.set(deviceId, hist);
    }
    hist.push(rtt);
    if (hist.length > 60) {
      hist.shift();
    }
    lastLatency = rtt;
    broadcastDashboardEvent('latency_sample', {
      deviceId,
      rtt,
      history: hist,
    });
  }

  function getEnrichedDeviceList() {
    const devs = deviceStore.listDevices();
    return devs.map((d) => {
      const devSockets = socketsByDeviceId.get(d.deviceId);
      const isConnected = !!devSockets && devSockets.size > 0;
      let clientIp = '';
      if (isConnected && devSockets) {
        for (const s of devSockets) {
          const rawIp = (s as any)._socket?.remoteAddress || '';
          if (rawIp) {
            clientIp = normalizeIp(rawIp);
            break;
          }
        }
      }
      const history = latencyHistoryByDevice.get(d.deviceId) || [];
      const currentLatency = history.length > 0 ? history[history.length - 1] : null;
      const battery = phoneBatteryByDevice.get(d.deviceId) || null;

      return {
        ...d,
        isConnected,
        clientIp: clientIp || undefined,
        currentLatency,
        latencyHistory: history,
        battery,
      };
    });
  }

  function getFullDashboardStatus() {
    const activeCode = pairingManager.getActiveCode();
    const currentCode = activeCode ? activeCode.code : '';
    const pairUrl = currentCode ? `https://${config.lanIp}:${config.port}/#code=${currentCode}` : '';
    const mdnsUrl = currentCode ? `https://aerokin.local:${config.port}/#code=${currentCode}` : '';
    const pcId = deviceStore.getPcId();
    const signalingUrl = (process.env.AEROKIN_SIGNALING_URL || '').trim();
    const remotePairPayload = currentCode
      ? `aerokin://pair?pcId=${pcId}&code=${currentCode}${signalingUrl ? `&signaling=${encodeURIComponent(signalingUrl)}` : ''}`
      : '';

    return {
      devices: getEnrichedDeviceList(),
      pairing: {
        code: currentCode,
        expiresInSeconds: activeCode ? activeCode.validForSeconds : 0,
        url: pairUrl,
        mdnsUrl,
        remotePairPayload: remotePairPayload || undefined,
        pcId,
        signalingUrl: signalingUrl || undefined,
        pendingApproval: pairingManager.getPendingApproval(),
      },
      desktop: streamService.getSessionInfo(),
      media: mediaManager.getCurrentStatus(),
      pc: {
        hostname: os.hostname(),
        lanIp: config.lanIp,
        port: config.port,
        uptime: Math.round(os.uptime()),
        power: getHostPowerStatus(),
      },
      recentEvents: eventBuffer.slice(-25),
      systemStats: statsService.collectSynchronousMetrics(),
      actions: {
        recent: quickActionService.getRecentActions(),
        countdown: quickActionService.getCountdownState(),
      },
      features: featureManager.getFlags(),
      clipboardSharedCount: clipboardService.getHistory().length,
    };
  }

  // 2s server-side ping to measure exact RTT per connected device
  const serverPingInterval = setInterval(() => {
    const now = Date.now();
    for (const [deviceId, sockets] of socketsByDeviceId.entries()) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'server_ping', t: now }));
          } catch {}
        }
      }
    }
  }, 2000);

  // Hook serverLogger entries to real-time dashboard event stream
  serverLogger.on('entry', (entry) => {
    broadcastDashboardEvent('log_entry', entry);
  });

  // Hook pairing approvals to dashboard event stream
  pairingManager.on('approval_requested', (req) => {
    broadcastDashboardEvent('pairing_request', req);
  });

  pairingManager.on('approval_resolved', (ev) => {
    broadcastDashboardEvent('approval_resolved', ev);
  });

  // Hook feature flags and action countdowns to dashboard event stream
  featureManager.onFlagsChange((flags) => {
    broadcastDashboardEvent('features_update', flags);
  });

  quickActionService.onCountdownChange((state) => {
    broadcastDashboardEvent('countdown_update', state);
  });

  function recordEvent(type: ActivityEvent['type'], summary: string) {
    const event: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      time: Date.now(),
      type,
      summary,
    };
    eventBuffer.push(event);
    if (eventBuffer.length > 50) {
      eventBuffer.shift();
    }
  }

  // Initialize StreamService for live desktop remote
  const streamService = config.streamService || new StreamService({ deviceStore });

  function broadcastDesktopStatus() {
    const payload = JSON.stringify({
      type: 'desktop_status',
      state: streamService.getState(),
      backend: streamService.getActiveBackend(),
      monitor: streamService.getActiveMonitor(),
      stats: streamService.getStats(),
    });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  function broadcastDesktopStats(stats: any) {
    const payload = JSON.stringify({
      type: 'desktop_stats',
      stats,
    });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  streamService.setOnStatusChange((state, error) => {
    broadcastDesktopStatus();
    broadcastDashboardEvent('desktop_status', streamService.getSessionInfo());
    if (error) {
      recordEvent('disconnect', `Desktop stream error: ${error}`);
    }
  });

  streamService.setOnBackendChange(() => {
    broadcastDesktopStatus();
    broadcastDashboardEvent('desktop_status', streamService.getSessionInfo());
  });

  streamService.setOnStatsUpdate((stats) => {
    broadcastDesktopStats(stats);
    broadcastDashboardEvent('desktop_stats', stats);
  });

  function closeDeviceSockets(deviceId: string) {
    if (streamService.getSessionInfo().deviceId === deviceId) {
      streamService.stopSession('Device revoked');
    }
    const set = socketsByDeviceId.get(deviceId);
    if (set) {
      for (const socket of set) {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(4001, 'Device revoked');
        }
      }
      socketsByDeviceId.delete(deviceId);
    }
  }

  function broadcastDevices() {
    const payload = JSON.stringify({
      type: 'devices',
      list: deviceStore.listDevices(),
    });
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
    broadcastDashboardEvent('devices_update', getEnrichedDeviceList());
  }

  function revokeDevice(deviceId: string) {
    deviceStore.revokeDevice(deviceId);
    closeDeviceSockets(deviceId);
    broadcastDevices();
  }

  function revokeAll(exceptDeviceId?: string) {
    const revoked = deviceStore.revokeAllDevices(exceptDeviceId);
    for (const id of revoked) {
      closeDeviceSockets(id);
    }
    broadcastDevices();
  }

  // Initialize MediaManager (Tier 1: Keys, Tier 2: SMTC, Tier 3: Profiles)
  const mediaManager = new MediaManager();

  // Broadcast state changes to all authorized clients
  mediaManager.setOnStateChange((nowPlaying, sessions, volume, muted) => {
    const payloadNowPlaying = JSON.stringify({
      type: 'nowplaying',
      ...nowPlaying,
      volume,
      muted,
    });
    const payloadSessions = JSON.stringify({
      type: 'sessions',
      list: sessions,
    });

    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payloadNowPlaying);
        ws.send(payloadSessions);
      }
    }
    broadcastDashboardEvent('media_status', mediaManager.getCurrentStatus());
  });

  // Body parsing for JSON
  app.use(express.json({ limit: '16kb' }));

  // Serve static PWA files from public folder
  app.use(express.static(config.publicDir));

  // Health check endpoint (accessible to all; CORS enabled ONLY for allow-listed origins)
  app.options('/health', (req, res) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.sendStatus(204);
    } else {
      res.sendStatus(403);
    }
  });

  app.get('/health', (req, res) => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
    res.json({ status: 'ok', service: 'aerokin-server' });
  });

  // REST API: Pairing CORS preflight
  app.options('/api/pair', (req, res) => {
    const origin = req.headers.origin;
    if (isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.sendStatus(204);
    } else {
      res.sendStatus(403);
    }
  });

  // REST API: Pairing submission (Phone submits 8-digit code + device info)
  app.post('/api/pair', async (req, res) => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      res.status(403).json({ error: 'Forbidden: Disallowed Origin' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    const clientIp = req.socket.remoteAddress || 'unknown';
    const { code, name, platform } = req.body || {};

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Pairing code is required' });
      return;
    }

    const deviceName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : 'Mobile Device';
    const devicePlatform = typeof platform === 'string' && platform.trim() ? platform.trim().slice(0, 32) : 'Browser';

    const result = await pairingManager.submitPairing(code, deviceName, devicePlatform, clientIp);
    if (!result.ok) {
      res.status(result.lockedOut ? 429 : 403).json({
        error: result.error || 'Pairing failed',
        lockedOut: result.lockedOut,
        remainingSeconds: result.remainingSeconds,
      });
      return;
    }

    // On PC operator approval: issue 32-byte cryptographic credential, store SHA-256 hash on disk
    const isRemote = req.body?.remote === true || req.body?.pairedVia === 'remote';
    const { deviceId, rawCredential } = deviceStore.addDevice(deviceName, devicePlatform, {
      pairedVia: isRemote ? 'remote' : 'lan',
      remote: isRemote,
    });

    res.json({
      ok: true,
      deviceId,
      credential: rawCredential,
      name: deviceName,
      pcId: deviceStore.getPcId(),
      pcName: deviceStore.getPcIdentity().name,
    });
  });

  // REST API: Pairing info (Active Code & URLs) - LOOPBACK ONLY (403 for LAN, NO CORS)
  app.get('/api/pair', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const activeCode = pairingManager.getActiveCode();
    const currentCode = activeCode ? activeCode.code : '';
    const pairUrl = currentCode ? `https://${config.lanIp}:${config.port}/#code=${currentCode}` : '';
    const mdnsUrl = currentCode ? `https://aerokin.local:${config.port}/#code=${currentCode}` : '';

    const rawHosted = (process.env.AEROKIN_HOSTED_URL || '').trim().replace(/\/+$/, '');
    const hostedPairUrl = (rawHosted && currentCode)
      ? `${rawHosted}/#host=${config.lanIp}:${config.port}&code=${currentCode}`
      : undefined;

    const pcId = deviceStore.getPcId();
    const signalingUrl = (process.env.AEROKIN_SIGNALING_URL || '').trim();
    const remotePairPayload = currentCode
      ? `aerokin://pair?pcId=${pcId}&code=${currentCode}${signalingUrl ? `&signaling=${encodeURIComponent(signalingUrl)}` : ''}`
      : '';

    res.json({
      url: pairUrl,
      mdnsUrl,
      remotePairPayload: remotePairPayload || undefined,
      pcId,
      signalingUrl: signalingUrl || undefined,
      hostedUrl: rawHosted || undefined,
      hostedPairUrl,
      code: currentCode,
      expiresInSeconds: activeCode ? activeCode.validForSeconds : 0,
      lanIp: config.lanIp,
      port: config.port,
    });
  });

  // REST API: Live Server Status & Recent Events - LOOPBACK ONLY (403 for LAN)
  app.get('/api/status', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    res.json({
      activeClients: activeSockets.size,
      connectedClients: activeSockets.size,
      lastLatency,
      recentEvents: eventBuffer.slice(-25),
      mediaStatus: mediaManager.getCurrentStatus(),
      devices: deviceStore.listDevices(),
    });
  });

  // Dedicated PC Dashboard Route (Loopback only, serves index.html)
  app.get('/dashboard', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).send('Forbidden: /dashboard is restricted to the local PC.');
      return;
    }
    res.sendFile(path.join(config.publicDir, 'index.html'));
  });

  // REST API: Full Dashboard Status Snapshot - LOOPBACK ONLY (403 for LAN)
  app.get('/api/dashboard/status', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }
    res.json(getFullDashboardStatus());
  });

  // REST API: Real-time Dashboard Server-Sent Events (SSE) Stream - LOOPBACK ONLY (403 for LAN)
  app.get('/api/dashboard/events', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders?.();

    // Send initial snapshot as 'init' event
    res.write(`event: init\ndata: ${JSON.stringify(getFullDashboardStatus())}\n\n`);

    sseClients.add(res);

    // Keepalive comment ping every 15s to keep connection open through proxies
    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 15_000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // REST API: Dashboard Pairing Approval - LOOPBACK ONLY (403 for LAN)
  app.post('/api/pair/approve', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const { requestId, approved } = req.body || {};
    if (typeof requestId !== 'string') {
      res.status(400).json({ error: 'requestId is required' });
      return;
    }

    const ok = pairingManager.respondApproval(requestId, Boolean(approved), 'dashboard');
    res.json({ ok });
  });

  // REST API: Regenerate 8-digit Pairing Code - LOOPBACK ONLY (403 for LAN)
  app.post('/api/pair/regenerate', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const newCode = pairingManager.generateCode();
    broadcastDashboardEvent('pairing_update', {
      code: newCode.code,
      expiresInSeconds: newCode.validForSeconds,
    });

    res.json({
      ok: true,
      code: newCode.code,
      expiresInSeconds: newCode.validForSeconds,
    });
  });

  // REST API: Rename Device - LOOPBACK ONLY (403 for LAN)
  app.post('/api/devices/rename', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const { deviceId, name } = req.body || {};
    if (typeof deviceId !== 'string' || typeof name !== 'string') {
      res.status(400).json({ error: 'deviceId and name are required' });
      return;
    }

    deviceStore.renameDevice(deviceId, name.trim().slice(0, 64));
    broadcastDevices();
    res.json({ ok: true });
  });

  // REST API: Disconnect Live Device Sockets - LOOPBACK ONLY (403 for LAN)
  app.post('/api/devices/disconnect', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const { deviceId } = req.body || {};
    if (typeof deviceId !== 'string') {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    closeDeviceSockets(deviceId);
    broadcastDevices();
    res.json({ ok: true });
  });

  // REST API: Revoke Device - LOOPBACK ONLY (403 for LAN)
  app.post('/api/devices/revoke', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const { deviceId } = req.body || {};
    if (typeof deviceId !== 'string') {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    revokeDevice(deviceId);
    res.json({ ok: true });
  });

  // REST API: Revoke All Devices - LOOPBACK ONLY (403 for LAN)
  app.post('/api/devices/revoke-all', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    revokeAll();
    res.json({ ok: true });
  });

  // REST API: Stop Desktop Remote Stream - LOOPBACK ONLY (403 for LAN)
  app.post('/api/desktop/stop', async (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    await streamService.stopSession('Terminated from PC Dashboard');
    res.json({ ok: true });
  });

  // REST API: Cancel Action Countdown - LOOPBACK ONLY (403 for LAN)
  app.post('/api/dashboard/actions/cancel', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }
    const result = quickActionService.cancelCountdown();
    res.json(result);
  });

  // REST API: Get/Update Feature Flags - LOOPBACK ONLY (403 for LAN)
  app.get('/api/dashboard/features', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }
    res.json(featureManager.getFlags());
  });

  app.post('/api/dashboard/features', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }
    const updated = featureManager.updateFlags(req.body || {});
    res.json({ ok: true, flags: updated });
  });

  // REST API: Live System Stats - LOOPBACK ONLY (403 for LAN)
  app.get('/api/dashboard/stats', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }
    res.json(statsService.collectSynchronousMetrics());
  });

  // REST API: Quick Actions & Launcher Info - LOOPBACK ONLY (403 for LAN)
  app.get('/api/dashboard/actions', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }
    res.json({
      recent: quickActionService.getRecentActions(),
      countdown: quickActionService.getCountdownState(),
      launcherEntries: quickActionService.getLauncherEntries(),
    });
  });

  // REST API: Fetch In-Memory Log Entries - LOOPBACK ONLY (403 for LAN)
  app.get('/api/logs', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const since = Number(req.query.since) || 0;
    const limit = Math.min(1000, Number(req.query.limit) || 200);
    res.json({ entries: serverLogger.getEntries(since, limit) });
  });

  // REST API: Download Redacted Log File (.txt) - LOOPBACK ONLY (403 for LAN)
  app.get('/api/logs/download', (req, res) => {
    if (!isLoopback(req)) {
      res.status(403).json({ error: 'Forbidden: Loopback only' });
      return;
    }

    const entries = serverLogger.getEntries(0, 1000);
    const lines = entries.map(
      (e) =>
        `[${new Date(e.timestamp).toISOString()}] [${e.level.toUpperCase()}] [${e.category.toUpperCase()}] ${e.message}`
    );
    const text = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="aerokin-logs-${Date.now()}.txt"`
    );
    res.send(text);
  });

  // Get or create Local Root CA & 365-day Leaf Cert with SANs
  const certs = getOrCreateLocalCaAndCert(config.certsDir, config.lanIp);

  const httpsServer = https.createServer(
    {
      key: certs.serverKeyPem,
      cert: certs.serverCertPem,
    },
    app
  );

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: WS_MAX_PAYLOAD_BYTES,
    perMessageDeflate: false,
  });

  const desktopWss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
  });

  desktopWss.on('connection', (ws: WebSocket, req) => {
    if (req.socket && typeof req.socket.setNoDelay === 'function') {
      req.socket.setNoDelay(true);
    }
    const clientIp = req.socket.remoteAddress || 'unknown';
    let isStreamAuth = false;
    let streamDeviceId: string | null = null;

    // 1. Check query parameters ?deviceId=...&credential=...
    try {
      const parsedUrl = new URL(req.url || '', `https://${req.headers.host || config.lanIp}`);
      const dId = parsedUrl.searchParams.get('deviceId');
      const cred = parsedUrl.searchParams.get('credential');
      if (dId && cred && deviceStore.verifyCredential(dId, cred)) {
        isStreamAuth = true;
        streamDeviceId = dId;
        streamService.handleStreamSocket(ws, dId, clientIp);
      }
    } catch {}

    // 2. 5s auth timeout if not authenticated via query params
    let authTimeout: NodeJS.Timeout | null = null;
    if (!isStreamAuth) {
      authTimeout = setTimeout(() => {
        if (!isStreamAuth) {
          try {
            ws.close(4001, 'Stream auth timeout (5s)');
          } catch {}
        }
      }, 5000);

      ws.on('message', (data: Buffer | string) => {
        if (isStreamAuth) return;
        try {
          const raw = typeof data === 'string' ? data : data.toString('utf8');
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            parsed.type === 'auth' &&
            typeof parsed.deviceId === 'string' &&
            typeof parsed.credential === 'string'
          ) {
            if (deviceStore.verifyCredential(parsed.deviceId, parsed.credential)) {
              isStreamAuth = true;
              streamDeviceId = parsed.deviceId;
              if (authTimeout) {
                clearTimeout(authTimeout);
                authTimeout = null;
              }
              ws.send(JSON.stringify({ type: 'stream_auth_ok', deviceId: parsed.deviceId }));
              streamService.handleStreamSocket(ws, parsed.deviceId, clientIp);
              return;
            }
          }
        } catch {}

        if (authTimeout) {
          clearTimeout(authTimeout);
          authTimeout = null;
        }
        try {
          ws.close(4001, 'Unauthorized stream socket');
        } catch {}
      });
    }

    ws.on('close', () => {
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }
    });
  });

  httpsServer.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, config.lanIp, config.port, allowedOrigins)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const parsedUrl = new URL(req.url || '/', `https://${req.headers.host || config.lanIp}`);
      if (parsedUrl.pathname === '/desktop/stream') {
        desktopWss.handleUpgrade(req, socket, head, (ws) => {
          desktopWss.emit('connection', ws, req);
        });
      } else {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket, req) => {
    if (req.socket && typeof req.socket.setNoDelay === 'function') {
      req.socket.setNoDelay(true);
    }
    const clientIp = req.socket.remoteAddress || 'unknown';

    // 1. Concurrency limit: max 4 concurrent unauthenticated connections per IP
    const currentUnauth = unauthConnectionsByIp.get(clientIp) || 0;
    if (currentUnauth >= 4) {
      ws.close(WS_CLOSE_POLICY_VIOLATION, 'Too many unauthenticated connections from IP');
      return;
    }
    unauthConnectionsByIp.set(clientIp, currentUnauth + 1);

    let isAuthenticated = false;
    let authenticatedDeviceId: string | null = null;
    let coalescer: ReturnType<typeof createMoveCoalescer> | null = null;
    let scroller: ReturnType<typeof createScroller> | null = null;
    const rateLimiter = new ConnectionRateLimiter();
    let lastMoveLogTime = 0;
    let invalidMessageCount = 0;

    // Strict 5s authentication timeout
    let authTimeout: NodeJS.Timeout | null = setTimeout(() => {
      if (!isAuthenticated) {
        cleanup();
        ws.close(4001, 'Authentication timed out (5s)');
      }
    }, 5000);

    const cleanup = () => {
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }
      if (!isAuthenticated) {
        const remaining = Math.max(0, (unauthConnectionsByIp.get(clientIp) || 1) - 1);
        if (remaining === 0) {
          unauthConnectionsByIp.delete(clientIp);
        } else {
          unauthConnectionsByIp.set(clientIp, remaining);
        }
      }
      activeSockets.delete(ws);
      if (authenticatedDeviceId) {
        const set = socketsByDeviceId.get(authenticatedDeviceId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            socketsByDeviceId.delete(authenticatedDeviceId);
          }
        }
      }
      if (coalescer) {
        coalescer.destroy();
        coalescer = null;
      }
      if (scroller) {
        scroller.destroy();
        scroller = null;
      }
      statsService.unsubscribe(`${clientIp}_${authenticatedDeviceId || 'client'}`);
      recordEvent('disconnect', 'Client disconnected');
    };

    // Optional legacy query-token check if enabled
    try {
      const parsedUrl = new URL(
        req.url || '',
        `https://${req.headers.host || config.lanIp}`
      );
      const queryToken = parsedUrl.searchParams.get('token');
      const legacySecret = config.legacyToken || config.token;

      if (process.env.AEROKIN_LEGACY_TOKEN === '1' && queryToken && legacySecret) {
        if (queryToken === legacySecret) {
          console.warn('[SECURITY WARNING] Insecure query-token connection accepted (AEROKIN_LEGACY_TOKEN=1).');
          completeAuthentication('legacy_query_device', 'Legacy Device');
        }
      }
    } catch {}

    function completeAuthentication(deviceId: string, deviceName: string) {
      isAuthenticated = true;
      authenticatedDeviceId = deviceId;
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }
      const remaining = Math.max(0, (unauthConnectionsByIp.get(clientIp) || 1) - 1);
      if (remaining === 0) {
        unauthConnectionsByIp.delete(clientIp);
      } else {
        unauthConnectionsByIp.set(clientIp, remaining);
      }

      let devSockets = socketsByDeviceId.get(deviceId);
      if (!devSockets) {
        devSockets = new Set();
        socketsByDeviceId.set(deviceId, devSockets);
      }
      devSockets.add(ws);

      activeSockets.add(ws);
      recordEvent('connect', `Authorized device connected: ${deviceName}`);

      // Initialize per-connection move coalescer and scroller
      coalescer = createMoveCoalescer(8);
      scroller = createScroller();

      // Handshake greeting
      ws.send(
        JSON.stringify({
          type: 'auth_ok',
          deviceId,
          pcId: deviceStore.getPcId(),
          pcName: deviceStore.getPcIdentity().name,
        })
      );
      ws.send(JSON.stringify({ type: 'hello', ok: true }));

      // Send initial media status and sessions list
      const initialStatus = mediaManager.getCurrentStatus();
      ws.send(JSON.stringify({ type: 'sessions', list: initialStatus.sessions }));
      ws.send(
        JSON.stringify({
          type: 'nowplaying',
          ...initialStatus.nowPlaying,
          volume: initialStatus.volume,
          muted: initialStatus.muted,
        })
      );

      // Send current device list
      ws.send(JSON.stringify({ type: 'devices', list: deviceStore.listDevices() }));

      // Send initial feature flags
      ws.send(JSON.stringify({ type: 'features_status', flags: featureManager.getFlags() }));

      // Send initial desktop status and monitors
      ws.send(JSON.stringify({ type: 'desktop_monitors', monitors: MonitorService.listMonitors() }));
      ws.send(
        JSON.stringify({
          type: 'desktop_status',
          state: streamService.getState(),
          backend: streamService.getActiveBackend(),
          monitor: streamService.getActiveMonitor(),
          stats: streamService.getStats(),
        })
      );
    }

    ws.on('message', async (data: Buffer | string) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf8');

        // Tiny maxPayload until auth (512 bytes)
        if (!isAuthenticated && raw.length > 512) {
          cleanup();
          ws.close(WS_CLOSE_POLICY_VIOLATION, 'Handshake frame too large');
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          invalidMessageCount++;
          if (invalidMessageCount > 50) {
            ws.close(WS_CLOSE_POLICY_VIOLATION, 'Too many malformed messages');
          }
          return;
        }

        const msg = validateClientMessage(parsed);
        if (!msg) {
          invalidMessageCount++;
          if (invalidMessageCount > 50) {
            ws.close(WS_CLOSE_POLICY_VIOLATION, 'Too many invalid messages');
          }
          return;
        }

        // Before authentication, ONLY 'auth' messages are processed. Drop all input!
        if (!isAuthenticated) {
          if (msg.type !== 'auth') {
            return;
          }

          const valid = deviceStore.verifyCredential(msg.deviceId, msg.credential);
          if (!valid) {
            cleanup();
            ws.close(4001, 'Unauthorized: Invalid or revoked device credential');
            return;
          }

          const dev = deviceStore.getDevice(msg.deviceId);
          completeAuthentication(msg.deviceId, dev?.name || 'Device');
          return;
        }

        // Per-connection token bucket rate limit check
        const rateResult = rateLimiter.check(msg.type);
        if (!rateResult.ok) {
          if (rateResult.closeConnection) {
            ws.close(
              WS_CLOSE_POLICY_VIOLATION,
              rateResult.reason || 'Rate limit exceeded: sustained flood'
            );
          }
          return;
        }

        switch (msg.type) {
          case 'auth':
            // Already authenticated; ignore duplicate auth
            break;

          case 'logout':
            cleanup();
            ws.close(1000, 'User logged out');
            break;

          case 'device_list':
            ws.send(JSON.stringify({ type: 'devices', list: deviceStore.listDevices() }));
            break;

          case 'device_rename':
            deviceStore.renameDevice(msg.deviceId, msg.name);
            broadcastDevices();
            break;

          case 'device_revoke':
            revokeDevice(msg.deviceId);
            break;

          case 'device_revoke_all':
            revokeAll(msg.exceptCurrent ? authenticatedDeviceId || undefined : undefined);
            break;

          case 'server_pong':
            if (authenticatedDeviceId && typeof msg.t === 'number') {
              const rtt = Math.max(1, Math.round(Date.now() - msg.t));
              recordDeviceLatency(authenticatedDeviceId, rtt);
            }
            break;

          case 'battery':
            if (authenticatedDeviceId) {
              phoneBatteryByDevice.set(authenticatedDeviceId, {
                percent: msg.percent,
                charging: msg.charging ?? null,
              });
              broadcastDashboardEvent('devices_update', getEnrichedDeviceList());
            }
            break;

          case 'tail_logs':
            if (ws.readyState === WebSocket.OPEN) {
              const limit = Math.min(200, typeof msg.limit === 'number' ? msg.limit : 50);
              const entries = serverLogger.getEntries(0, limit);
              ws.send(JSON.stringify({ type: 'tail_logs_response', entries }));
            }
            break;

          case 'ping':
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'pong', t: msg.t }));
              lastLatency = Math.max(1, Math.round(Date.now() - msg.t));
              if (authenticatedDeviceId) {
                const hist = latencyHistoryByDevice.get(authenticatedDeviceId);
                if (!hist || hist.length === 0) {
                  recordDeviceLatency(authenticatedDeviceId, lastLatency);
                }
              }
            }
            break;

          case 'move':
            // Coalesced per connection (~8ms flush, float carry, capped +/-200)
            coalescer?.addMove(msg.dx, msg.dy);
            const now = Date.now();
            if (now - lastMoveLogTime >= 250) {
              lastMoveLogTime = now;
              recordEvent('move', `dx: ${msg.dx.toFixed(1)}, dy: ${msg.dy.toFixed(1)}`);
            }
            break;

          case 'click':
            // Immediate click execution
            await handleClick(msg.button);
            recordEvent('click', `button: ${msg.button}`);
            break;

          case 'button':
            // Mouse button down / up for dragging
            await handleButton(msg.button, msg.state);
            recordEvent('button', `${msg.button} ${msg.state}`);
            break;

          case 'scroll':
            // Scrolled per connection with float carry and unit scaling
            await scroller?.scroll(msg.dy, msg.dx);
            recordEvent(
              'scroll',
              `dy: ${msg.dy.toFixed(1)}${msg.dx !== 0 ? ` dx: ${msg.dx.toFixed(1)}` : ''}`
            );
            break;

          case 'media':
            // Universal Media Action (scoped to session if provided)
            const mediaRes = await mediaManager.handleMediaCommand(msg.action, undefined, (msg as any).sessionId);
            recordEvent('media', `${msg.action} (Tier ${mediaRes.tier}, ${mediaRes.latencyMs}ms)`);
            break;

          case 'seekby':
            // Seek relative seconds (positive or negative)
            const seekByRes = await mediaManager.handleMediaCommand('seekby', msg.seconds, (msg as any).sessionId);
            recordEvent(
              'media',
              `seekby ${msg.seconds}s (Tier ${seekByRes.tier}, ${seekByRes.latencyMs}ms)`
            );
            break;

          case 'seekto':
            // Seek absolute position
            const seekToRes = await mediaManager.handleMediaCommand('seekto', msg.position, (msg as any).sessionId);
            recordEvent(
              'media',
              `seekto ${msg.position}s (Tier ${seekToRes.tier}, ${seekToRes.latencyMs}ms)`
            );
            break;

          case 'session':
            // Pick active SMTC media session
            await mediaManager.handleMediaCommand('session', msg.id);
            recordEvent('media', `session ${msg.id}`);
            break;

          case 'setvolume':
            // Direct master volume scalar (0-100)
            await mediaManager.handleMediaCommand('setvolume', msg.level);
            recordEvent('media', `setvolume ${msg.level}%`);
            break;

          case 'getvolume':
            const volRes = await mediaManager.handleMediaCommand('getvolume');
            if (ws.readyState === WebSocket.OPEN && volRes) {
              ws.send(JSON.stringify({ type: 'volume', volume: volRes.detail }));
            }
            break;

          case 'desktop_monitors': {
            const list = MonitorService.listMonitors(true);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'desktop_monitors', monitors: list }));
            }
            break;
          }

          case 'desktop_start': {
            recordEvent(
              'connect',
              `Desktop stream request (preset: ${msg.preset || 'balanced'}, codec: ${msg.codec || 'h264'}, monitor: ${msg.monitorId || 'primary'})`
            );
            const startRes = await streamService.startSession({
              monitorId: msg.monitorId,
              preset: msg.preset,
              customScale: msg.customScale,
              customFps: msg.customFps,
              codec: msg.codec,
            });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'desktop_status',
                  state: streamService.getState(),
                  backend: streamService.getActiveBackend(),
                  monitor: startRes.monitor,
                  stats: streamService.getStats(),
                  error: startRes.error,
                })
              );
            }
            break;
          }

          case 'desktop_stop': {
            recordEvent('disconnect', 'Desktop stream stop requested');
            await streamService.stopSession('Client requested stop');
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'desktop_status',
                  state: 'stopped',
                })
              );
            }
            break;
          }

          case 'abs_move': {
            handleAbsMove(msg.x, msg.y, msg.monitorId);
            break;
          }

          case 'abs_click': {
            await handleAbsClick(msg.button, msg.count, msg.x, msg.y, msg.monitorId);
            recordEvent('click', `abs_click ${msg.button} x${msg.count || 1}`);
            break;
          }

          case 'abs_button': {
            await handleAbsButton(msg.button, msg.state, msg.x, msg.y, msg.monitorId);
            recordEvent('button', `abs_button ${msg.button} ${msg.state}`);
            break;
          }

          case 'key': {
            await handleKey(msg.key, msg.action, msg.modifiers);
            recordEvent(
              'move',
              `key: ${msg.key} ${msg.action || 'tap'}${
                msg.modifiers?.length ? ` (${msg.modifiers.join('+')})` : ''
              }`
            );
            break;
          }

          case 'text': {
            await handleText(msg.text);
            recordEvent('move', `text (${msg.text.length} chars)`);
            break;
          }

          case 'screenshot_request': {
            if (!featureManager.isEnabled('screenshot')) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'screenshot_response',
                    success: false,
                    error: 'Screenshot feature is disabled on PC dashboard',
                  })
                );
              }
              break;
            }
            const result = await screenshotService.capture({
              target: msg.target,
              monitorId: msg.monitorId,
              includeCursor: msg.includeCursor,
            });
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'screenshot_response',
                  ...result,
                })
              );
            }
            break;
          }

          case 'stats_subscribe': {
            const subId = `${clientIp}_${authenticatedDeviceId || 'client'}`;
            statsService.subscribe(subId, (sample) => {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.send(JSON.stringify({ type: 'stats_data', data: sample }));
                } catch {}
              }
            });
            break;
          }

          case 'stats_unsubscribe': {
            const subId = `${clientIp}_${authenticatedDeviceId || 'client'}`;
            statsService.unsubscribe(subId);
            break;
          }

          case 'clipboard_get': {
            if (!featureManager.isEnabled('clipboard')) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'clipboard_error',
                    error: 'Clipboard feature is disabled on PC dashboard',
                  })
                );
              }
              break;
            }
            const clip = await clipboardService.getPcClipboard();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'clipboard_data',
                  text: clip.text,
                  length: clip.length,
                })
              );
            }
            break;
          }

          case 'clipboard_set': {
            if (!featureManager.isEnabled('clipboard')) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'clipboard_error',
                    error: 'Clipboard feature is disabled on PC dashboard',
                  })
                );
              }
              break;
            }
            const setRes = await clipboardService.setPcClipboard(msg.text);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'clipboard_ack',
                  success: setRes.success,
                })
              );
            }
            break;
          }

          case 'clipboard_set_and_paste': {
            if (!featureManager.isEnabled('clipboard')) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'clipboard_error',
                    error: 'Clipboard feature is disabled on PC dashboard',
                  })
                );
              }
              break;
            }
            const pasteRes = await clipboardService.setPcClipboard(msg.text);
            if (pasteRes.success) {
              await handleKey('v', 'tap', ['ctrl']);
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'clipboard_ack',
                  success: pasteRes.success,
                })
              );
            }
            break;
          }

          case 'clipboard_clear_history': {
            clipboardService.clearHistory();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'clipboard_history', history: [] }));
            }
            break;
          }

          case 'quick_action': {
            if (!featureManager.isEnabled('quickActions') && msg.action !== 'cancel_shutdown') {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'action_result',
                    success: false,
                    action: msg.action,
                    error: 'Quick Actions feature is disabled on PC dashboard',
                  })
                );
              }
              break;
            }
            if (msg.action === 'launch_app' && !featureManager.isEnabled('launcher')) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'action_result',
                    success: false,
                    action: msg.action,
                    error: 'App Launcher is disabled on PC dashboard',
                  })
                );
              }
              break;
            }
            const actionRes = await quickActionService.executeAction(msg.action, msg.payload);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'action_result',
                  ...actionRes,
                })
              );
            }
            break;
          }

          case 'launcher_list': {
            if (!featureManager.isEnabled('launcher')) {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'launcher_list', entries: [] }));
              }
              break;
            }
            const entries = quickActionService.getLauncherEntries();
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'launcher_list', entries }));
            }
            break;
          }

          case 'features_get': {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'features_status',
                  flags: featureManager.getFlags(),
                })
              );
            }
            break;
          }
        }
      } catch {
        // Ignore parse errors or handler rejections; never crash
      }
    });

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  let signalingClient: SignalingClient | null = null;
  const signalingUrl = (process.env.AEROKIN_SIGNALING_URL || '').trim();
  if (signalingUrl) {
    try {
      signalingClient = new SignalingClient({
        signalingUrl,
        pcId: deviceStore.getPcId(),
        onRegistered: (iceServers) => {
          console.log(`[Remote] Registered with signaling server at ${signalingUrl}. ${iceServers.length} ICE servers.`);
        },
      });
    } catch (e: any) {
      console.warn(`[Remote] Could not connect to signaling server at ${signalingUrl}:`, e?.message);
    }
  }

  httpsServer.on('close', () => {
    clearInterval(serverPingInterval);
    signalingClient?.close();
  });

  httpsServer.listen(config.port, '0.0.0.0');

  return {
    httpsServer,
    wss,
    desktopWss,
    streamService,
    mediaManager,
    deviceStore,
    pairingManager,
    featureManager,
    statsService,
    clipboardService,
    screenshotService,
    quickActionService,
    signalingClient,
    revokeDevice,
    revokeAll,
    broadcastDevices,
  };
}
