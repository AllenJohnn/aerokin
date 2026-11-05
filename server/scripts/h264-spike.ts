/**
 * AEROKIN H.264 WebCodecs Streaming Spike
 *
 * Isolated experiment testing low-latency H.264 video streaming over WebSocket
 * decoded by browser WebCodecs VideoDecoder.
 *
 * Runs on a standalone port (default: 8444) without modifying production app.
 */

import { spawn, ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { findFfmpegPath } from '../src/desktop/CaptureAdapter.js';
import { MonitorService } from '../src/desktop/MonitorService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = parseInt(process.env.H264_SPIKE_PORT || '8444', 10);

interface EncoderOption {
  name: string;
  args: string[];
}

function detectAvailableEncoders(ffmpegPath: string): string[] {
  console.log('[H.264 Spike] Detecting available encoders...');
  const candidates = ['h264_nvenc', 'h264_mf', 'libx264'];
  const working: string[] = [];

  for (const enc of candidates) {
    try {
      const res = spawn(
        ffmpegPath,
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=duration=0.2:size=320x240:rate=15',
          '-c:v',
          enc,
          '-f',
          'null',
          '-',
        ],
        { stdio: 'ignore', windowsHide: true }
      );

      // Synchronously wait for process
      const start = Date.now();
      while (res.exitCode === null && Date.now() - start < 3000) {
        // spin wait
      }
      if (res.exitCode === 0) {
        working.push(enc);
      }
    } catch {}
  }

  return working;
}

function chooseEncoder(ffmpegPath: string): EncoderOption {
  const working = detectAvailableEncoders(ffmpegPath);
  console.log(`[H.264 Spike] Detected working encoders on this host: ${working.join(', ') || 'none'}`);

  if (working.includes('h264_nvenc')) {
    console.log('[H.264 Spike] Selecting NVIDIA NVENC hardware encoder (h264_nvenc)');
    return {
      name: 'h264_nvenc (Hardware: NVIDIA)',
      args: [
        '-c:v',
        'h264_nvenc',
        '-preset',
        'p1',
        '-tune',
        'll',
        '-zerolatency',
        '1',
        '-g',
        '30',
        '-keyint_min',
        '30',
        '-b:v',
        '2M',
        '-maxrate',
        '3M',
        '-bufsize',
        '1M',
        '-pix_fmt',
        'yuv420p',
      ],
    };
  }

  console.log('[H.264 Spike] Selecting software encoder (libx264)');
  return {
    name: 'libx264 (Software: CPU)',
    args: [
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'zerolatency',
      '-g',
      '30',
      '-keyint_min',
      '30',
      '-b:v',
      '2M',
      '-maxrate',
      '3M',
      '-bufsize',
      '1M',
      '-pix_fmt',
      'yuv420p',
    ],
  };
}

class H264StreamSpike {
  private server: http.Server;
  private wss: WebSocketServer;
  private ffmpegProc: ChildProcess | null = null;
  private activeWs: WebSocket | null = null;
  private encoder: EncoderOption;
  private ffmpegPath: string;

  constructor() {
    this.ffmpegPath = findFfmpegPath() || 'ffmpeg';
    this.encoder = chooseEncoder(this.ffmpegPath);

    this.server = http.createServer((req, res) => {
      // Serve the standalone test page directly from HTTP server as well
      const testPagePath = path.resolve(__dirname, '../../pwa/public/h264-test.html');
      if (req.url === '/' || req.url === '/h264-test.html') {
        if (fs.existsSync(testPagePath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fs.readFileSync(testPagePath));
          return;
        }
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[H.264 Spike] Client connected to spike stream.');
      this.handleClient(ws);
    });
  }

  private handleClient(ws: WebSocket) {
    if (this.activeWs && this.activeWs !== ws) {
      try {
        this.activeWs.close(1000, 'Replaced by new viewer');
      } catch {}
    }
    this.activeWs = ws;

    // Send metadata message
    ws.send(
      JSON.stringify({
        type: 'h264_init',
        encoder: this.encoder.name,
        fps: 30,
        gop: 30,
      })
    );

    this.startFfmpegCapture();

    ws.on('close', () => {
      console.log('[H.264 Spike] Client disconnected.');
      if (this.activeWs === ws) {
        this.activeWs = null;
        this.stopFfmpeg();
      }
    });

    ws.on('error', (err) => {
      console.warn('[H.264 Spike] Client socket error:', err.message);
      if (this.activeWs === ws) {
        this.activeWs = null;
        this.stopFfmpeg();
      }
    });
  }

  private startFfmpegCapture() {
    this.stopFfmpeg();

    MonitorService.ensureDpiAwareness();
    const primary = MonitorService.getPrimaryMonitor();
    const width = Math.round((primary.bounds.width * 0.75) / 2) * 2;
    const height = Math.round((primary.bounds.height * 0.75) / 2) * 2;

    const args = [
      '-nostdin',
      '-loglevel',
      'warning',
      '-f',
      'gdigrab',
      '-framerate',
      '30',
      '-draw_mouse',
      '1',
      '-offset_x',
      String(primary.bounds.x),
      '-offset_y',
      String(primary.bounds.y),
      '-video_size',
      `${primary.bounds.width}x${primary.bounds.height}`,
      '-i',
      'desktop',
      '-vf',
      `scale=${width}:${height}`,
      ...this.encoder.args,
      '-f',
      'h264',
      'pipe:1',
    ];

    console.log(`[H.264 Spike] Spawning FFmpeg H.264 pipeline (${width}x${height} @ 30fps)...`);
    const proc = spawn(this.ffmpegPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.ffmpegProc = proc;

    proc.stderr?.on('data', (d: Buffer) => {
      console.warn('[H.264 FFmpeg]', d.toString('utf8').trim());
    });

    let buffer = Buffer.alloc(0);
    const START_CODE_4 = Buffer.from([0x00, 0x00, 0x00, 0x01]);
    const START_CODE_3 = Buffer.from([0x00, 0x00, 0x01]);

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (!this.activeWs || this.activeWs.readyState !== WebSocket.OPEN) return;

      buffer = Buffer.concat([buffer, chunk]);

      // Parse Annex B NAL units
      while (buffer.length > 4) {
        // Find first start code
        let scIdx = -1;
        let scLen = 4;

        for (let i = 0; i <= buffer.length - 4; i++) {
          if (
            buffer[i] === 0x00 &&
            buffer[i + 1] === 0x00 &&
            buffer[i + 2] === 0x00 &&
            buffer[i + 3] === 0x01
          ) {
            scIdx = i;
            scLen = 4;
            break;
          }
          if (
            buffer[i] === 0x00 &&
            buffer[i + 1] === 0x00 &&
            buffer[i + 2] === 0x01
          ) {
            scIdx = i;
            scLen = 3;
            break;
          }
        }

        if (scIdx === -1) {
          if (buffer.length > 4) buffer = buffer.subarray(buffer.length - 4);
          break;
        }

        // Find NEXT start code
        let nextScIdx = -1;
        for (let i = scIdx + scLen; i <= buffer.length - 4; i++) {
          if (
            (buffer[i] === 0x00 &&
              buffer[i + 1] === 0x00 &&
              buffer[i + 2] === 0x00 &&
              buffer[i + 3] === 0x01) ||
            (buffer[i] === 0x00 &&
              buffer[i + 1] === 0x00 &&
              buffer[i + 2] === 0x01)
          ) {
            nextScIdx = i;
            break;
          }
        }

        if (nextScIdx === -1) {
          // Keep current buffer from scIdx
          if (scIdx > 0) buffer = buffer.subarray(scIdx);
          break;
        }

        // Extract complete NAL unit including start code
        const nalUnit = buffer.subarray(scIdx, nextScIdx);
        buffer = buffer.subarray(nextScIdx);

        const nalHeaderByte = nalUnit[scLen];
        const nalType = nalHeaderByte & 0x1f;
        const isKeyframe = nalType === 5 || nalType === 7; // IDR or SPS

        // 5-byte protocol header:
        // [0]: isKey (1 = key, 0 = delta)
        // [1..4]: timestamp in ms (uint32 LE)
        const header = Buffer.alloc(5);
        header.writeUInt8(isKeyframe ? 1 : 0, 0);
        header.writeUInt32LE((Date.now() >>> 0), 1);

        const packet = Buffer.concat([header, nalUnit]);
        try {
          this.activeWs.send(packet);
        } catch {}
      }
    });

    proc.on('exit', (code) => {
      console.log(`[H.264 Spike] FFmpeg exited with code ${code}`);
      this.ffmpegProc = null;
    });
  }

  private stopFfmpeg() {
    if (this.ffmpegProc) {
      try {
        this.ffmpegProc.kill('SIGKILL');
      } catch {}
      this.ffmpegProc = null;
    }
  }

  public start() {
    this.server.listen(PORT, '0.0.0.0', () => {
      console.log('======================================================');
      console.log('      AEROKIN H.264 WEBCODECS SPIKE SERVER            ');
      console.log('======================================================');
      console.log(`  Spike Port:      ${PORT}`);
      console.log(`  Encoder:         ${this.encoder.name}`);
      console.log(`  Test Page URL:   http://localhost:${PORT}/`);
      console.log('======================================================\n');
    });
  }
}

const spike = new H264StreamSpike();
spike.start();
