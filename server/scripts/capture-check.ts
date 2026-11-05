/**
 * AEROKIN Screen Capture Diagnostics Check
 *
 * Runs each capture backend (ddagrab and gdigrab) for 5 seconds on the target monitor,
 * measuring:
 * - Frames captured
 * - Frame rate (measured FPS)
 * - Frame size in bytes (average, min, max)
 * - Complete FFmpeg stderr output
 */

import { spawn } from 'node:child_process';
import { MonitorService } from '../src/desktop/MonitorService.js';
import {
  findFfmpegPath,
  buildFfmpegArgs,
  CaptureOptions,
} from '../src/desktop/CaptureAdapter.js';
import { CaptureBackend, MonitorInfo } from '../src/desktop/types.js';

interface BackendResult {
  backend: CaptureBackend;
  durationSec: number;
  frameCount: number;
  fps: number;
  avgBytes: number;
  minBytes: number;
  maxBytes: number;
  stderr: string;
  error?: string;
}

async function testBackend(
  ffmpegPath: string,
  monitor: MonitorInfo,
  backend: CaptureBackend,
  durationSec = 5
): Promise<BackendResult> {
  console.log(`\n======================================================`);
  console.log(`  TESTING BACKEND: ${backend.toUpperCase()} (${durationSec}s run)`);
  console.log(`======================================================`);

  const options: CaptureOptions = {
    monitor,
    fps: 30,
    scale: 1.0,
    quality: 3,
  };

  const args = buildFfmpegArgs(options, backend);
  console.log(`Command: ffmpeg ${args.join(' ')}\n`);

  const frameSizes: number[] = [];
  let stderrLog = '';
  let stdoutBuffer = Buffer.alloc(0);

  const SOI = Buffer.from([0xff, 0xd8]);
  const EOI = Buffer.from([0xff, 0xd9]);

  const proc = spawn(ffmpegPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const startTime = Date.now();
  let firstFrameTime = 0;

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stderrLog += text;
    process.stderr.write(`[ffmpeg stderr] ${text}`);
  });

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
        if (soiIdx > 0) {
          stdoutBuffer = stdoutBuffer.subarray(soiIdx);
        }
        break;
      }

      const jpegFrame = stdoutBuffer.subarray(soiIdx, eoiIdx + 2);
      stdoutBuffer = stdoutBuffer.subarray(eoiIdx + 2);
      searchOffset = 0;

      if (jpegFrame.length > 100) {
        if (frameSizes.length === 0) {
          firstFrameTime = Date.now();
        }
        frameSizes.push(jpegFrame.length);
      }
    }
  });

  await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));

  try {
    proc.kill('SIGINT');
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
    }, 400);
  } catch {}

  const elapsedSec = (Date.now() - (firstFrameTime || startTime)) / 1000;
  const count = frameSizes.length;
  const totalBytes = frameSizes.reduce((a, b) => a + b, 0);
  const avgBytes = count > 0 ? Math.round(totalBytes / count) : 0;
  const minBytes = count > 0 ? Math.min(...frameSizes) : 0;
  const maxBytes = count > 0 ? Math.max(...frameSizes) : 0;
  const measuredFps = count > 0 && elapsedSec > 0 ? Math.round((count / elapsedSec) * 10) / 10 : 0;

  console.log(`\n--- ${backend.toUpperCase()} Summary ---`);
  console.log(`• Captured Frames: ${count}`);
  console.log(`• Measured FPS:    ${measuredFps}`);
  console.log(
    `• Frame Size:      avg ${avgBytes} B (${Math.round((avgBytes / 1024) * 10) / 10} KB) [min: ${minBytes} B, max: ${maxBytes} B]`
  );
  console.log(`• FFmpeg stderr log length: ${stderrLog.length} chars`);

  return {
    backend,
    durationSec,
    frameCount: count,
    fps: measuredFps,
    avgBytes,
    minBytes,
    maxBytes,
    stderr: stderrLog.trim(),
  };
}

async function main() {
  console.log('--- AEROKIN Desktop Capture Backend Check ---');

  const ffmpegPath = findFfmpegPath();
  if (!ffmpegPath) {
    console.error('ERROR: ffmpeg.exe was not found in PATH, WinGet, or tools directory.');
    process.exit(1);
  }
  console.log(`FFmpeg binary: ${ffmpegPath}`);

  const monitors = MonitorService.listMonitors(true);
  const primary = monitors.find((m) => m.isPrimary) || monitors[0];
  console.log(
    `Display: ${primary.name} (${primary.id}) - ${primary.bounds.width}x${primary.bounds.height} @ DPI ${primary.dpiScale}`
  );

  const results: Record<string, BackendResult> = {};

  // 1. Check ddagrab (5s)
  results.ddagrab = await testBackend(ffmpegPath, primary, 'ddagrab', 5);

  // 2. Check gdigrab (5s)
  results.gdigrab = await testBackend(ffmpegPath, primary, 'gdigrab', 5);

  console.log('\n======================================================');
  console.log('  FINAL CAPTURE CHECK REPORT');
  console.log('======================================================');

  for (const [name, res] of Object.entries(results)) {
    console.log(`\n[${name.toUpperCase()}]`);
    console.log(`  Frames:   ${res.frameCount}`);
    console.log(`  FPS:      ${res.fps}`);
    console.log(`  Avg Size: ${res.avgBytes} bytes (${Math.round((res.avgBytes / 1024) * 10) / 10} KB)`);
    if (res.frameCount === 0) {
      console.log(`  Status:   NO FRAMES CAPTURED`);
      if (
        res.stderr.includes('Desktop duplication access denied') ||
        res.stderr.includes('Access is denied')
      ) {
        console.log(
          `  Note:     Access denied in background subshell (WinSta0\\Default required).`
        );
      }
    } else {
      console.log(`  Status:   ACTIVE & DELIVERING FRAMES`);
    }
  }

  console.log('\nTo run on interactive desktop:');
  console.log('  pnpm --filter aerokin-server run capture:check\n');
}

main().catch((err) => {
  console.error('[Error] Capture check failed:', err);
  process.exit(1);
});
