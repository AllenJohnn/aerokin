import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MonitorInfo } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

export interface CaptureOptions {
  monitor: MonitorInfo;
  fps: number;
  scale: number;
  quality: number;
}

export type FrameCallback = (
  packet: Buffer,
  width: number,
  height: number,
  sequence: number,
  timestampMs: number
) => void;

export type ErrorCallback = (error: Error, isSecureScreen?: boolean) => void;
export type ExitCallback = (code: number | null) => void;

export interface CaptureAdapter {
  start(options: CaptureOptions): Promise<void>;
  stop(): Promise<void>;
  onFrame(callback: FrameCallback): void;
  onError(callback: ErrorCallback): void;
  onExit(callback: ExitCallback): void;
  isAvailable(): boolean;
  getFfmpegPath(): string | null;
}

/**
 * Searches common locations on Windows for ffmpeg.exe.
 */
export function findFfmpegPath(): string | null {
  // 1. Pinned local tools directory (git-ignored)
  const localToolsPaths = [
    path.join(ROOT_DIR, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    path.join(ROOT_DIR, 'tools', 'ffmpeg.exe'),
    path.join(ROOT_DIR, 'server', 'tools', 'ffmpeg.exe'),
  ];
  for (const p of localToolsPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 2. WinGet user links directory
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const wingetLink = path.join(
      localAppData,
      'Microsoft',
      'WinGet',
      'Links',
      'ffmpeg.exe'
    );
    if (fs.existsSync(wingetLink)) return wingetLink;

    // Check WinGet Packages directory
    const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPackages)) {
      try {
        const dirs = fs.readdirSync(wingetPackages);
        for (const dir of dirs) {
          if (dir.toLowerCase().includes('ffmpeg')) {
            const candidate = path.join(wingetPackages, dir);
            // Search 2 levels deep
            if (fs.existsSync(candidate)) {
              const subdirs = fs.readdirSync(candidate);
              for (const sub of subdirs) {
                const exe1 = path.join(candidate, sub, 'bin', 'ffmpeg.exe');
                if (fs.existsSync(exe1)) return exe1;
                const exe2 = path.join(candidate, sub, 'ffmpeg.exe');
                if (fs.existsSync(exe2)) return exe2;
              }
            }
          }
        }
      } catch {}
    }
  }

  // 3. System PATH check
  const pathEnv = process.env.PATH || '';
  const pathEntries = pathEnv.split(path.delimiter);
  for (const dir of pathEntries) {
    const candidate = path.join(dir, 'ffmpeg.exe');
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export class WindowsFfmpegCaptureAdapter implements CaptureAdapter {
  private ffmpegProc: ChildProcess | null = null;
  private isRunning = false;
  private currentOptions: CaptureOptions | null = null;
  private frameCallback: FrameCallback | null = null;
  private errorCallback: ErrorCallback | null = null;
  private exitCallback: ExitCallback | null = null;
  private frameSequence = 0;
  private restartAttempts = 0;
  private readonly maxRestarts = 3;
  private restartTimeout: NodeJS.Timeout | null = null;
  private customFfmpegPath: string | null = null;

  constructor(customPath?: string) {
    this.customFfmpegPath = customPath || null;
  }

  public getFfmpegPath(): string | null {
    if (this.customFfmpegPath && fs.existsSync(this.customFfmpegPath)) {
      return this.customFfmpegPath;
    }
    return findFfmpegPath();
  }

  public isAvailable(): boolean {
    return this.getFfmpegPath() !== null;
  }

  public onFrame(callback: FrameCallback): void {
    this.frameCallback = callback;
  }

  public onError(callback: ErrorCallback): void {
    this.errorCallback = callback;
  }

  public onExit(callback: ExitCallback): void {
    this.exitCallback = callback;
  }

  public async start(options: CaptureOptions): Promise<void> {
    if (this.isRunning) {
      await this.stop();
    }

    const ffmpegPath = this.getFfmpegPath();
    if (!ffmpegPath) {
      const err = new Error(
        'FFmpeg executable not found. Please install via: "winget install Gyan.FFmpeg.Essentials" or place ffmpeg.exe into aerokin/tools/'
      );
      this.errorCallback?.(err);
      throw err;
    }

    this.isRunning = true;
    this.currentOptions = options;
    this.restartAttempts = 0;

    await this.spawnCapture(ffmpegPath, options, false);
  }

  private async spawnCapture(
    ffmpegPath: string,
    options: CaptureOptions,
    isFallbackGdi = false
  ): Promise<void> {
    const { monitor, fps, scale, quality } = options;

    const targetWidth = Math.max(320, Math.round((monitor.bounds.width * scale) / 2) * 2);
    const targetHeight = Math.max(240, Math.round((monitor.bounds.height * scale) / 2) * 2);

    const args: string[] = [];

    if (!isFallbackGdi) {
      // Primary: DirectX Desktop Duplication API (ddagrab)
      args.push(
        '-nostdin',
        '-loglevel',
        'warning',
        '-f',
        'lavfi',
        '-i',
        `ddagrab=framerate=${fps}:draw_mouse=1`
      );
    } else {
      // Fallback: GDI Grab
      args.push(
        '-nostdin',
        '-loglevel',
        'warning',
        '-f',
        'gdigrab',
        '-framerate',
        String(fps),
        '-draw_mouse',
        '1',
        '-offset_x',
        String(monitor.bounds.x),
        '-offset_y',
        String(monitor.bounds.y),
        '-video_size',
        `${monitor.bounds.width}x${monitor.bounds.height}`,
        '-i',
        'desktop'
      );
    }

    // Video filters & MJPEG encode
    args.push(
      '-vf',
      `scale=${targetWidth}:${targetHeight}`,
      '-c:v',
      'mjpeg',
      '-q:v',
      String(quality),
      '-f',
      'image2pipe',
      'pipe:1'
    );

    let stdoutBuffer = Buffer.alloc(0);
    let stderrLog = '';

    const proc = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.ffmpegProc = proc;

    proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString('utf8');
      stderrLog += msg;
      if (stderrLog.length > 4096) {
        stderrLog = stderrLog.slice(-4096);
      }

      // Detect Windows secure desktop / UAC or lock screen access denial
      if (
        msg.includes('error 5') ||
        msg.includes('Access is denied') ||
        msg.includes('Desktop duplication access denied')
      ) {
        this.errorCallback?.(
          new Error('PC screen is locked or displaying a secure UAC prompt'),
          true
        );
      }
    });

    // JPEG SOI = 0xFF 0xD8, EOI = 0xFF 0xD9
    const SOI = Buffer.from([0xff, 0xd8]);
    const EOI = Buffer.from([0xff, 0xd9]);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);

      let searchOffset = 0;
      while (true) {
        const soiIdx = stdoutBuffer.indexOf(SOI, searchOffset);
        if (soiIdx === -1) {
          if (stdoutBuffer.length > 2) {
            stdoutBuffer = stdoutBuffer.subarray(stdoutBuffer.length - 2);
          }
          break;
        }

        const eoiIdx = stdoutBuffer.indexOf(EOI, soiIdx + 2);
        if (eoiIdx === -1) {
          // Incomplete JPEG; keep remaining buffer starting from SOI
          if (soiIdx > 0) {
            stdoutBuffer = stdoutBuffer.subarray(soiIdx);
          }
          break;
        }

        // Full JPEG frame extracted
        const jpegFrame = stdoutBuffer.subarray(soiIdx, eoiIdx + 2);
        stdoutBuffer = stdoutBuffer.subarray(eoiIdx + 2);
        searchOffset = 0;

        if (this.isRunning && this.frameCallback && jpegFrame.length > 100) {
          const seq = ++this.frameSequence;
          const nowMs = Date.now();

          // 16-byte binary metadata header:
          // [0..3]: 'AERO' (magic)
          // [4..7]: uint32 sequence
          // [8..11]: uint32 timestamp
          // [12..13]: uint16 width
          // [14..15]: uint16 height
          const header = Buffer.alloc(16);
          header.write('AERO', 0, 4, 'ascii');
          header.writeUInt32LE(seq, 4);
          header.writeUInt32LE(nowMs >>> 0, 8);
          header.writeUInt16LE(targetWidth, 12);
          header.writeUInt16LE(targetHeight, 14);

          const fullPacket = Buffer.concat([header, jpegFrame]);
          this.frameCallback(fullPacket, targetWidth, targetHeight, seq, nowMs);
        }
      }
    });

    proc.on('exit', (code) => {
      this.ffmpegProc = null;

      if (!this.isRunning) {
        this.exitCallback?.(code);
        return;
      }

      // Check if primary ddagrab failed and we haven't tried gdigrab yet
      if (!isFallbackGdi && (stderrLog.includes('ddagrab') || code !== 0)) {
        console.warn('[DesktopStream] ddagrab failed; attempting gdigrab fallback...');
        this.spawnCapture(ffmpegPath, options, true).catch((e) => {
          this.errorCallback?.(e);
        });
        return;
      }

      // Auto-restart with exponential backoff if unexpected exit
      if (this.restartAttempts < this.maxRestarts) {
        this.restartAttempts++;
        const delayMs = Math.min(3000, 500 * Math.pow(2, this.restartAttempts - 1));
        console.warn(
          `[DesktopStream] FFmpeg exited with code ${code}. Reconnecting in ${delayMs}ms (attempt ${this.restartAttempts}/${this.maxRestarts})...`
        );
        this.restartTimeout = setTimeout(() => {
          if (this.isRunning && this.currentOptions) {
            this.spawnCapture(ffmpegPath, this.currentOptions, isFallbackGdi).catch((e) => {
              this.errorCallback?.(e);
            });
          }
        }, delayMs);
      } else {
        const error = new Error(
          `FFmpeg exited unexpectedly with code ${code}. Log: ${stderrLog.trim().slice(-200)}`
        );
        this.errorCallback?.(error);
        this.exitCallback?.(code);
      }
    });

    proc.on('error', (err) => {
      this.errorCallback?.(err);
    });
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.currentOptions = null;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.ffmpegProc) {
      const proc = this.ffmpegProc;
      this.ffmpegProc = null;
      try {
        proc.kill('SIGINT');
        // Force kill after 500ms if still running
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {}
        }, 500);
      } catch {}
    }
  }
}
