import { WebSocket } from 'ws';
import { DeviceStore } from '../device-store.js';
import { MonitorService } from './MonitorService.js';
import { CaptureAdapter, WindowsFfmpegCaptureAdapter } from './CaptureAdapter.js';
import { FrameDeduplicator } from './FrameDeduplicator.js';
import { AdaptiveQualityManager } from './AdaptiveQualityManager.js';
import {
  MonitorInfo,
  QualityPresetName,
  QUALITY_PRESETS,
  DesktopStats,
  DesktopSessionState,
  CaptureBackend,
  VideoCodec,
  H264Encoder,
} from './types.js';

export interface StreamServiceConfig {
  deviceStore: DeviceStore;
  captureAdapter?: CaptureAdapter;
  deduplicator?: FrameDeduplicator;
  adaptiveQuality?: AdaptiveQualityManager;
  onStatusChange?: (state: DesktopSessionState, error?: string) => void;
  onStatsUpdate?: (stats: DesktopStats) => void;
  onBackendChange?: (backend: CaptureBackend) => void;
}

export class StreamService {
  private deviceStore: DeviceStore;
  private captureAdapter: CaptureAdapter;
  private deduplicator: FrameDeduplicator;
  private adaptiveQuality: AdaptiveQualityManager;
  private activeWs: WebSocket | null = null;
  private activeDeviceId: string | null = null;
  private activeClientIp: string | null = null;
  private state: DesktopSessionState = 'stopped';
  private selectedMonitor: MonitorInfo | null = null;
  private currentPreset: QualityPresetName = 'fast';
  private currentCodec: VideoCodec = 'h264';
  private isStarting = false;
  private pendingStartOptions: any = null;

  private originalConsoleTitle = 'AEROKIN SERVER';
  private statsInterval: NodeJS.Timeout | null = null;

  // Stats accumulators
  private frameCount = 0;
  private byteCount = 0;
  private droppedFrameCount = 0;
  private droppedInWindow = 0;
  private lastStatsTime = Date.now();
  private currentFps = 0;
  private currentBitrateKbps = 0;
  private lastWidth = 0;
  private lastHeight = 0;
  private currentSequence = 0;

  private onStatusChange?: (state: DesktopSessionState, error?: string) => void;
  private onStatsUpdate?: (stats: DesktopStats) => void;
  private onBackendChange?: (backend: CaptureBackend) => void;

  // Max bufferedAmount before adaptive frame dropping (256 KB)
  private readonly MAX_BUFFERED_BYTES = 256 * 1024;

  constructor(config: StreamServiceConfig) {
    this.deviceStore = config.deviceStore;
    this.captureAdapter = config.captureAdapter || new WindowsFfmpegCaptureAdapter();
    this.deduplicator = config.deduplicator || new FrameDeduplicator({ keepaliveIntervalMs: 1000 });
    this.adaptiveQuality = config.adaptiveQuality || new AdaptiveQualityManager('fast');
    this.onStatusChange = config.onStatusChange;
    this.onStatsUpdate = config.onStatsUpdate;
    this.onBackendChange = config.onBackendChange;

    this.captureAdapter.onFrame((packet, width, height, seq, nowMs, isKeyframe, codec) => {
      this.handleCapturedFrame(packet, width, height, seq, nowMs, isKeyframe, codec);
    });

    this.captureAdapter.onError((err, isSecureScreen) => {
      this.handleCaptureError(err, isSecureScreen);
    });

    this.captureAdapter.onExit(() => {
      if (this.state === 'active') {
        this.transitionState('stopped');
      }
    });

    this.captureAdapter.onBackendChange?.((backend) => {
      this.onBackendChange?.(backend);
      this.onStatusChange?.(this.state);
    });
  }

  public getState(): DesktopSessionState {
    return this.state;
  }

  public getActiveBackend(): CaptureBackend {
    return this.captureAdapter.getActiveBackend?.() || 'ddagrab';
  }

  public getActiveCodec(): VideoCodec {
    return this.captureAdapter.getActiveCodec?.() || this.currentCodec;
  }

  public getActiveEncoder(): H264Encoder | null {
    return this.captureAdapter.getActiveEncoder?.() || null;
  }

  public setOnStatusChange(cb?: (state: DesktopSessionState, error?: string) => void): void {
    this.onStatusChange = cb;
  }

  public setOnStatsUpdate(cb?: (stats: DesktopStats) => void): void {
    this.onStatsUpdate = cb;
  }

  public setOnBackendChange(cb?: (backend: CaptureBackend) => void): void {
    this.onBackendChange = cb;
  }

  public getActiveMonitor(): MonitorInfo | null {
    return this.selectedMonitor;
  }

  public getStats(): DesktopStats {
    return {
      fps: this.currentFps,
      bitrateKbps: this.currentBitrateKbps,
      droppedFrames: this.droppedFrameCount,
      frameSequence: this.currentSequence,
      width: this.lastWidth,
      height: this.lastHeight,
      backend: this.getActiveBackend(),
      codec: this.getActiveCodec(),
      encoder: this.getActiveEncoder() || undefined,
      activeTier: this.adaptiveQuality.getActiveTier(),
    };
  }

  public getSessionInfo(): {
    state: DesktopSessionState;
    deviceId: string | null;
    clientIp: string | null;
    monitor: MonitorInfo | null;
    preset: QualityPresetName;
    backend: CaptureBackend;
    codec: VideoCodec;
    encoder: H264Encoder | null;
    stats: DesktopStats;
  } {
    return {
      state: this.state,
      deviceId: this.activeDeviceId,
      clientIp: this.activeClientIp,
      monitor: this.selectedMonitor,
      preset: this.currentPreset,
      backend: this.getActiveBackend(),
      codec: this.getActiveCodec(),
      encoder: this.getActiveEncoder(),
      stats: this.getStats(),
    };
  }

  /**
   * Attaches an incoming authenticated WebSocket connection for desktop streaming.
   */
  public handleStreamSocket(ws: WebSocket, deviceId: string, clientIp: string): void {
    // Single active viewer policy: if existing stream socket is connected, close it cleanly
    if (this.activeWs && this.activeWs !== ws) {
      try {
        this.activeWs.close(1000, 'Replaced by new desktop viewing session');
      } catch {}
      this.activeWs = null;
    }

    this.activeWs = ws;
    this.activeDeviceId = deviceId;
    this.activeClientIp = clientIp;

    ws.on('close', () => {
      if (this.activeWs === ws) {
        this.stopSession('Viewer disconnected');
      }
    });

    ws.on('error', () => {
      if (this.activeWs === ws) {
        this.stopSession('Viewer connection error');
      }
    });
  }

  /**
   * Starts a desktop streaming session for the specified monitor and quality preset.
   */
  public async startSession(
    options: {
      monitorId?: string;
      preset?: QualityPresetName;
      customScale?: number;
      customFps?: number;
      codec?: VideoCodec;
      bitrateKbps?: number;
      isTestMode?: boolean;
    } = {}
  ): Promise<{ ok: boolean; monitor: MonitorInfo; error?: string }> {
    if (this.isStarting) {
      this.pendingStartOptions = options;
      return { ok: true, monitor: this.selectedMonitor || MonitorService.getMonitor() };
    }

    this.isStarting = true;
    try {
      const presetName = options.preset || 'fast';
      this.currentPreset = presetName;
      this.currentCodec = options.codec || 'h264';
      this.adaptiveQuality.setUserCap(presetName);

      const activeTier = this.adaptiveQuality.getActiveTier();
      const presetConfig = QUALITY_PRESETS[activeTier] || QUALITY_PRESETS.fast;

      const monitor = MonitorService.getMonitor(options.monitorId);
      this.selectedMonitor = monitor;

      const fps = options.customFps || presetConfig.fps;
      const scale = options.customScale || presetConfig.scale;
      const quality = presetConfig.jpegQuality;
      const bitrateKbps = options.bitrateKbps || presetConfig.bitrateKbps;

      this.transitionState('starting');

      await this.captureAdapter.start({
        monitor,
        fps,
        scale,
        quality,
        codec: this.currentCodec,
        bitrateKbps,
        isTestMode: options.isTestMode,
      });

      this.transitionState('active');
      this.startStatsTimer();
      this.setPcIndicator(true);

      return { ok: true, monitor };
    } catch (err: any) {
      const msg = err?.message || 'Failed to start screen capture';
      this.transitionState('error', msg);
      return {
        ok: false,
        monitor: this.selectedMonitor || MonitorService.getMonitor(),
        error: msg,
      };
    } finally {
      this.isStarting = false;
      if (this.pendingStartOptions) {
        const next = this.pendingStartOptions;
        this.pendingStartOptions = null;
        this.startSession(next).catch(() => {});
      }
    }
  }

  /**
   * Stops the active desktop stream session.
   */
  public async stopSession(reason = 'Session stopped'): Promise<void> {
    if (this.state === 'stopped') return;

    this.stopStatsTimer();
    this.setPcIndicator(false);
    this.transitionState('stopped');

    this.deduplicator.reset();
    this.adaptiveQuality.reset();

    await this.captureAdapter.stop();

    if (this.activeWs) {
      try {
        if (
          this.activeWs.readyState === WebSocket.OPEN ||
          this.activeWs.readyState === WebSocket.CONNECTING
        ) {
          this.activeWs.close(1000, reason);
        }
      } catch {}
      this.activeWs = null;
    }

    this.activeDeviceId = null;
    this.activeClientIp = null;
    this.selectedMonitor = null;
  }

  private handleCapturedFrame(
    packet: Buffer,
    width: number,
    height: number,
    seq: number,
    nowMs: number,
    isKeyframe = false,
    codec: VideoCodec = 'h264'
  ): void {
    this.lastWidth = width;
    this.lastHeight = height;
    this.currentSequence = seq;

    if (!this.activeWs || this.activeWs.readyState !== WebSocket.OPEN) {
      return;
    }

    // For MJPEG streams: Deduplicate consecutive identical frames (20-byte AER2 or 16-byte AERO metadata)
    if (codec === 'mjpeg' && packet.length > 20) {
      const jpegBytes = packet.subarray(20);
      const decision = this.deduplicator.shouldSend(jpegBytes);
      if (!decision.send) {
        return;
      }
    }

    // Adaptive Backpressure:
    // Drop frame immediately if client Wi-Fi buffer is backing up
    if (this.activeWs.bufferedAmount > this.MAX_BUFFERED_BYTES) {
      this.droppedFrameCount++;
      this.droppedInWindow++;
      return;
    }

    try {
      this.activeWs.send(packet, { binary: true, compress: false });
      this.frameCount++;
      this.byteCount += packet.length;
    } catch {
      this.droppedFrameCount++;
      this.droppedInWindow++;
    }
  }

  private handleCaptureError(err: Error, isSecureScreen = false): void {
    if (isSecureScreen) {
      console.warn('[DesktopStream] Secure desktop screen detected (UAC prompt or Windows Lock).');
      this.transitionState('secure_screen', err.message);
    } else {
      console.error('[DesktopStream] Screen capture error:', err.message);
      this.transitionState('error', err.message);
    }
  }

  private transitionState(newState: DesktopSessionState, errorMsg?: string): void {
    this.state = newState;
    this.onStatusChange?.(newState, errorMsg);
  }

  private startStatsTimer(): void {
    this.stopStatsTimer();
    this.frameCount = 0;
    this.byteCount = 0;
    this.droppedFrameCount = 0;
    this.droppedInWindow = 0;
    this.lastStatsTime = Date.now();

    this.statsInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = Math.max(0.1, (now - this.lastStatsTime) / 1000);

      this.currentFps = Math.round((this.frameCount / elapsedSec) * 10) / 10;
      this.currentBitrateKbps = Math.round(((this.byteCount * 8) / elapsedSec / 1024) * 10) / 10;

      this.frameCount = 0;
      this.byteCount = 0;
      this.lastStatsTime = now;

      // Check adaptive quality condition based on backlog
      const bufferedAmount = this.activeWs ? this.activeWs.bufferedAmount : 0;
      const { activeTier, changed } = this.adaptiveQuality.updateNetworkCondition(
        bufferedAmount,
        this.droppedInWindow
      );
      this.droppedInWindow = 0;

      if (changed && this.selectedMonitor && this.state === 'active') {
        console.log(`[DesktopStream] Adaptive quality adjusted active tier to: ${activeTier}`);
        const adaptedConfig = QUALITY_PRESETS[activeTier] || QUALITY_PRESETS.fast;
        this.captureAdapter
          .start({
            monitor: this.selectedMonitor,
            fps: adaptedConfig.fps,
            scale: adaptedConfig.scale,
            quality: adaptedConfig.jpegQuality,
          })
          .catch((err) => {
            console.warn('[DesktopStream] Failed to adapt capture tier:', err);
          });
      }

      const currentStats = this.getStats();
      this.onStatsUpdate?.(currentStats);
    }, 1000);
  }

  private stopStatsTimer(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    this.currentFps = 0;
    this.currentBitrateKbps = 0;
  }

  private setPcIndicator(active: boolean): void {
    if (active) {
      try {
        if (process.title) {
          this.originalConsoleTitle = process.title;
          process.title = 'AeroKin: REMOTE VIEWING ACTIVE';
        }
      } catch {}

      console.log('\n======================================================');
      console.log('  ✦ AEROKIN: REMOTE DESKTOP VIEWING ACTIVE ✦');
      console.log(
        `  Viewer: ${this.activeDeviceId || 'Mobile Client'} (${this.activeClientIp || 'LAN'})`
      );
      console.log(
        `  Display: ${this.selectedMonitor?.name || 'Primary'} (${this.selectedMonitor?.bounds.width}x${this.selectedMonitor?.bounds.height})`
      );
      console.log('  Type "stop-desktop" in terminal to terminate stream.');
      console.log('======================================================\n');
    } else {
      try {
        if (process.title && this.originalConsoleTitle) {
          process.title = this.originalConsoleTitle;
        }
      } catch {}
      console.log('[DesktopStream] Desktop remote session ended.');
    }
  }
}
