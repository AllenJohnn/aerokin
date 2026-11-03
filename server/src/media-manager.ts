import { spawn, ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Win32Input } from './native/win32.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface NowPlayingData {
  id?: string;
  app?: string;
  title?: string;
  artist?: string;
  status: 'playing' | 'paused' | 'stopped' | 'none';
  position?: number;
  duration?: number;
  canSeek?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  art?: string;
}

export interface MediaSessionItem {
  id: string;
  app: string;
  title: string;
  current: boolean;
}

export interface MediaCommandResult {
  tier: 1 | 2 | 3;
  action: string;
  handled: boolean;
  latencyMs: number;
  detail?: string;
}

interface ProfileEntry {
  key: string;
  verified: boolean;
  note: string;
}

interface AppProfile {
  name: string;
  seekForward?: ProfileEntry;
  seekBackward?: ProfileEntry;
  fullscreen?: ProfileEntry;
  byTitle?: Record<
    string,
    {
      seekForward?: ProfileEntry;
      seekBackward?: ProfileEntry;
      fullscreen?: ProfileEntry;
    }
  >;
}

export class MediaManager {
  private sidecarProcess: ChildProcess | null = null;
  private sidecarReady = false;
  private pendingRequests: Array<{
    resolve: (val: any) => void;
    reject: (err: any) => void;
    startTime: number;
  }> = [];

  private currentStatus: {
    sessions: MediaSessionItem[];
    nowPlaying: NowPlayingData;
    volume: number;
    muted: boolean;
  } = {
    sessions: [],
    nowPlaying: { status: 'none' },
    volume: 50,
    muted: false,
  };

  private profilesData: {
    defaults: Record<string, ProfileEntry>;
    profiles: Record<string, AppProfile>;
  };

  private pollInterval: NodeJS.Timeout | null = null;
  private onStateChangeCallback?: (nowPlaying: NowPlayingData, sessions: MediaSessionItem[], volume: number, muted: boolean) => void;

  constructor(profilesPath?: string) {
    const resolvedPath = profilesPath || path.resolve(__dirname, 'profiles.json');
    try {
      this.profilesData = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch {
      this.profilesData = {
        defaults: {
          seekForward: { key: 'Right', verified: true, note: 'Default' },
          seekBackward: { key: 'Left', verified: true, note: 'Default' },
          fullscreen: { key: 'f', verified: true, note: 'Default' },
        },
        profiles: {},
      };
    }

    if (process.platform === 'win32') {
      this.initSidecar();
    }
  }

  public setOnStateChange(cb: (nowPlaying: NowPlayingData, sessions: MediaSessionItem[], volume: number, muted: boolean) => void) {
    this.onStateChangeCallback = cb;
  }

  private initSidecar() {
    const psScript = path.resolve(__dirname, '../scripts/media-sidecar.ps1');
    if (!fs.existsSync(psScript)) {
      console.warn('[MediaManager] Sidecar script not found at:', psScript);
      return;
    }

    try {
      this.sidecarProcess = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript], {
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      const rl = readline.createInterface({ input: this.sidecarProcess.stdout! });

      rl.on('line', (line) => {
        try {
          const json = JSON.parse(line);
          if (json.type === 'ready') {
            this.sidecarReady = true;
            this.startPolling();
          } else if (this.pendingRequests.length > 0) {
            const req = this.pendingRequests.shift()!;
            req.resolve(json);
          }
        } catch {}
      });

      this.sidecarProcess.on('exit', () => {
        this.sidecarReady = false;
        this.sidecarProcess = null;
        if (this.pollInterval) clearInterval(this.pollInterval);
      });
    } catch (err) {
      console.warn('[MediaManager] Failed to launch PowerShell sidecar:', err);
    }
  }

  private async sendSidecarCommand(cmdObj: any, timeoutMs = 2000): Promise<any> {
    if (!this.sidecarProcess || !this.sidecarReady || !this.sidecarProcess.stdin) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingRequests.findIndex((r) => r.resolve === resolve);
        if (idx !== -1) {
          this.pendingRequests.splice(idx, 1);
        }
        resolve(null);
      }, timeoutMs);

      this.pendingRequests.push({
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        startTime: performance.now(),
      });

      this.sidecarProcess!.stdin!.write(JSON.stringify(cmdObj) + '\n');
    });
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      await this.refreshStatus();
    }, 1000);
  }

  public async refreshStatus(): Promise<void> {
    const res = await this.sendSidecarCommand({ cmd: 'status' });
    if (res && res.ok && res.data) {
      const data = res.data;
      this.currentStatus = {
        sessions: data.sessions || [],
        nowPlaying: data.nowPlaying || { status: 'none' },
        volume: data.volume ?? 50,
        muted: !!data.muted,
      };

      this.onStateChangeCallback?.(
        this.currentStatus.nowPlaying,
        this.currentStatus.sessions,
        this.currentStatus.volume,
        this.currentStatus.muted
      );
    }
  }

  public getCurrentStatus() {
    return this.currentStatus;
  }

  /**
   * Universal Media Control Command Execution across 3 Tiers
   */
  public async handleMediaCommand(action: string, param?: any): Promise<MediaCommandResult> {
    const start = performance.now();

    // 1. SEEKING (seekby, seekto, seekfwd, seekback)
    if (action === 'seekby' || action === 'seekfwd' || action === 'seekback' || action === 'seekto') {
      const seconds = action === 'seekto' ? 0 : (param ?? (action === 'seekfwd' ? 10 : -10));

      // Tier 2: Try SMTC seek if session supports it
      if (this.sidecarReady && this.currentStatus.nowPlaying.canSeek) {
        const res =
          action === 'seekto'
            ? await this.sendSidecarCommand({ cmd: 'seekto', position: param })
            : await this.sendSidecarCommand({ cmd: 'seekby', seconds });

        if (res && res.handled) {
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: 'SMTC TryChangePlaybackPosition',
          };
        }
      }

      // Tier 3: Keystroke fallback matching foreground app
      const fg = Win32Input.getForegroundApp();
      const profile = this.findProfileForApp(fg);
      const isForward = seconds >= 0;
      const targetEntry = isForward
        ? profile.seekForward || this.profilesData.defaults.seekForward
        : profile.seekBackward || this.profilesData.defaults.seekBackward;

      const keyToSend = targetEntry.key;
      if (keyToSend.includes('+')) {
        await Win32Input.keyCombo(keyToSend);
      } else {
        await Win32Input.key(keyToSend, 'tap');
      }

      return {
        tier: 3,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: `Keystroke "${keyToSend}" (Profile: ${profile.name || 'Default'}, verified: ${targetEntry.verified})`,
      };
    }

    // 2. FULLSCREEN
    if (action === 'fullscreen') {
      const fg = Win32Input.getForegroundApp();
      const profile = this.findProfileForApp(fg);
      const targetEntry = profile.fullscreen || this.profilesData.defaults.fullscreen;

      const keyToSend = targetEntry.key;
      if (keyToSend.includes('+')) {
        await Win32Input.keyCombo(keyToSend);
      } else {
        await Win32Input.key(keyToSend, 'tap');
      }

      return {
        tier: 3,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: `Keystroke "${keyToSend}" (Profile: ${profile.name || 'Default'})`,
      };
    }

    // 3. PLAY/PAUSE, NEXT, PREV, STOP
    if (['playpause', 'next', 'prev', 'stop'].includes(action)) {
      // Tier 2: Try SMTC first
      if (this.sidecarReady) {
        const res = await this.sendSidecarCommand({ cmd: action });
        if (res && res.handled) {
          this.refreshStatus().catch(() => {});
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: 'SMTC Media Session Control',
          };
        }
      }

      // Tier 1: Hardware Media Keys
      await Win32Input.key(action, 'tap');
      return {
        tier: 1,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: `Hardware VK_${action.toUpperCase()}`,
      };
    }

    // 4. VOLUME & MUTE
    if (action === 'volup' || action === 'voldown') {
      await Win32Input.key(action, 'tap');
      return {
        tier: 1,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: 'Hardware Volume Key',
      };
    }

    if (action === 'mute') {
      if (this.sidecarReady) {
        const res = await this.sendSidecarCommand({ cmd: 'mute' });
        if (res && res.ok) {
          this.currentStatus.muted = !!res.muted;
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: 'Master Volume IAudioEndpointVolume Mute',
          };
        }
      }

      await Win32Input.key('mute', 'tap');
      return {
        tier: 1,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: 'Hardware VK_VOLUME_MUTE',
      };
    }

    // 5. DIRECT VOLUME SET (0-100)
    if (action === 'setvolume') {
      if (this.sidecarReady) {
        const res = await this.sendSidecarCommand({ cmd: 'setvolume', level: param });
        if (res && res.ok) {
          this.currentStatus.volume = res.volume;
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: `Master Volume set to ${param}%`,
          };
        }
      }
    }

    // 6. SESSION PICK
    if (action === 'session') {
      if (this.sidecarReady) {
        await this.sendSidecarCommand({ cmd: 'session', id: param });
        await this.refreshStatus();
        return {
          tier: 2,
          action,
          handled: true,
          latencyMs: Math.round(performance.now() - start),
          detail: `Selected session: ${param}`,
        };
      }
    }

    return {
      tier: 1,
      action,
      handled: false,
      latencyMs: Math.round(performance.now() - start),
      detail: 'Unhandled action',
    };
  }

  private findProfileForApp(fg: { processName: string; title: string } | null): {
    name?: string;
    seekForward?: ProfileEntry;
    seekBackward?: ProfileEntry;
    fullscreen?: ProfileEntry;
  } {
    if (!fg || !fg.processName) {
      return this.profilesData.defaults;
    }

    const proc = fg.processName.toLowerCase();
    const appCfg = this.profilesData.profiles[proc];

    if (!appCfg) {
      return this.profilesData.defaults;
    }

    if (appCfg.byTitle && fg.title) {
      for (const [pattern, titleCfg] of Object.entries(appCfg.byTitle)) {
        if (fg.title.toLowerCase().includes(pattern.toLowerCase())) {
          return {
            name: `${appCfg.name} - ${pattern}`,
            ...titleCfg,
          };
        }
      }
    }

    return {
      name: appCfg.name,
      seekForward: appCfg.seekForward,
      seekBackward: appCfg.seekBackward,
      fullscreen: appCfg.fullscreen,
    };
  }

  public dispose() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.sidecarProcess) {
      this.sidecarProcess.kill();
      this.sidecarProcess = null;
    }
  }
}
