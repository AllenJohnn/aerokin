import { spawn, ChildProcess } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  NowPlayingData,
  MediaSessionItem,
  DEFAULT_CAPABILITIES,
} from './types.js';
import { RunningProcessMediaInfo } from './ProcessMediaDetector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SmtcStatusResponse {
  sessions: MediaSessionItem[];
  nowPlaying: NowPlayingData;
  volume: number;
  muted: boolean;
  fallbackProcesses?: RunningProcessMediaInfo[];
}

export interface SmtcAdapterOptions {
  scriptPath?: string;
  autoStart?: boolean;
}

export class SmtcAdapter {
  private sidecarProcess: ChildProcess | null = null;
  private isReady = false;
  private scriptPath: string;
  private pendingRequests: Array<{
    resolve: (val: any) => void;
    reject: (err: any) => void;
    startTime: number;
  }> = [];

  constructor(options: SmtcAdapterOptions = {}) {
    this.scriptPath =
      options.scriptPath ||
      path.resolve(__dirname, '../../scripts/media-sidecar.ps1');

    if (options.autoStart !== false && process.platform === 'win32') {
      this.start();
    }
  }

  public start(): void {
    if (this.sidecarProcess) return;

    if (!fs.existsSync(this.scriptPath)) {
      console.warn('[SmtcAdapter] PowerShell sidecar script not found at:', this.scriptPath);
      return;
    }

    try {
      this.sidecarProcess = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath],
        {
          stdio: ['pipe', 'pipe', 'inherit'],
        }
      );

      const rl = readline.createInterface({ input: this.sidecarProcess.stdout! });

      rl.on('line', (line) => {
        try {
          const json = JSON.parse(line);
          if (json.type === 'ready') {
            this.isReady = true;
          } else if (this.pendingRequests.length > 0) {
            const req = this.pendingRequests.shift()!;
            req.resolve(json);
          }
        } catch {}
      });

      this.sidecarProcess.on('exit', () => {
        this.isReady = false;
        this.sidecarProcess = null;
      });
    } catch (err) {
      console.warn('[SmtcAdapter] Failed to spawn PowerShell sidecar:', err);
    }
  }

  public get ready(): boolean {
    return this.isReady;
  }

  public async sendCommand(cmdObj: any, timeoutMs = 2000): Promise<any> {
    if (!this.sidecarProcess || !this.isReady || !this.sidecarProcess.stdin) {
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

  public async getStatus(): Promise<SmtcStatusResponse | null> {
    const res = await this.sendCommand({ cmd: 'status' });
    if (res && res.ok && res.data) {
      const d = res.data;
      return {
        sessions: d.sessions || [],
        nowPlaying: d.nowPlaying || { status: 'none', capabilities: DEFAULT_CAPABILITIES },
        volume: typeof d.volume === 'number' ? Math.max(0, Math.min(100, Math.round(d.volume))) : 50,
        muted: Boolean(d.muted),
      };
    }
    return null;
  }

  public async setMasterVolume(level: number): Promise<{ volume: number } | null> {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    const res = await this.sendCommand({ cmd: 'setvolume', level: clamped });
    if (res && res.ok) {
      return { volume: Math.round(res.volume) };
    }
    return null;
  }

  public async toggleMute(): Promise<{ muted: boolean } | null> {
    const res = await this.sendCommand({ cmd: 'mute' });
    if (res && res.ok) {
      return { muted: Boolean(res.muted) };
    }
    return null;
  }

  public async selectSession(sessionId: string): Promise<boolean> {
    const res = await this.sendCommand({ cmd: 'session', id: sessionId });
    return Boolean(res && res.ok);
  }

  public dispose(): void {
    this.isReady = false;
    if (this.sidecarProcess) {
      this.sidecarProcess.kill();
      this.sidecarProcess = null;
    }
    this.pendingRequests.forEach((req) => req.resolve(null));
    this.pendingRequests = [];
  }
}
