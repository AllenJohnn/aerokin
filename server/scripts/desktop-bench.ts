/**
 * AEROKIN Desktop Streaming Benchmark Tool
 *
 * Measures:
 * 1. Monitor enumeration and DPI awareness
 * 2. FFmpeg screen capture initialization latency
 * 3. Frame delivery rate (measured FPS)
 * 4. Encode frame size (min, max, average KB)
 * 5. Estimated bitrate (Mbps)
 * 6. End-to-end frame demuxing and pipeline overhead
 */

import { MonitorService } from '../src/desktop/MonitorService.js';
import { WindowsFfmpegCaptureAdapter } from '../src/desktop/CaptureAdapter.js';
import { QUALITY_PRESETS, QualityPresetName } from '../src/desktop/types.js';

async function runBenchmarkForPreset(presetName: QualityPresetName, durationSec = 3) {
  console.log(`\n======================================================`);
  console.log(`  BENCHMARK: Preset "${presetName.toUpperCase()}" (${durationSec}s test run)`);
  console.log(`======================================================`);

  const preset = QUALITY_PRESETS[presetName];
  const monitors = MonitorService.listMonitors(true);
  const primary = monitors.find((m) => m.isPrimary) || monitors[0];

  console.log(`Target Display: ${primary.name} (${primary.bounds.width}x${primary.bounds.height}) @ DPI scale ${primary.dpiScale}`);
  console.log(`Target Config: scale ${preset.scale * 100}%, fps ${preset.fps}, jpegQuality ${preset.jpegQuality}`);

  const adapter = new WindowsFfmpegCaptureAdapter();
  const frameSizes: number[] = [];
  const frameTimes: number[] = [];
  let frameCount = 0;
  let errorEncountered: Error | null = null;
  let isSecureScreen = false;

  adapter.onError((err, secure) => {
    errorEncountered = err;
    isSecureScreen = !!secure;
  });

  const startTime = Date.now();
  let firstFrameTime = 0;

  adapter.onFrame((packet, width, height, seq) => {
    const now = Date.now();
    if (frameCount === 0) {
      firstFrameTime = now;
    }
    frameCount++;
    frameSizes.push(packet.length);
    frameTimes.push(now);
  });

  try {
    const started = await adapter.start({
      monitor: primary,
      fps: preset.fps,
      scale: preset.scale,
      quality: preset.jpegQuality,
    });

    if (!started) {
      throw new Error('CaptureAdapter.start returned false');
    }

    console.log(`[Stream Started] Collecting frames for ${durationSec} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));
  } catch (err: any) {
    errorEncountered = err;
  } finally {
    await adapter.stop();
  }

  if (errorEncountered) {
    console.warn(`\n[BENCHMARK RESULT: UNVERIFIED in background subshell]`);
    console.warn(`Reason: ${errorEncountered.message}`);
    if (isSecureScreen || errorEncountered.message.includes('Access is denied') || errorEncountered.message.includes('Desktop duplication access denied')) {
      console.warn(`Notice: Background service subshells lack interactive Windows station access (WinSta0\\Default).`);
      console.warn(`Run this directly in an interactive PowerShell terminal:`);
      console.warn(`  cd "D:\\Personal Project\\aerokin\\server" && pnpm run bench:desktop\n`);
    }
    return {
      preset: presetName,
      status: 'UNVERIFIED (Access Denied / Non-interactive session)',
      error: errorEncountered.message,
    };
  }

  const testDurationSec = (Date.now() - (firstFrameTime || startTime)) / 1000;
  const measuredFps = frameCount > 0 && testDurationSec > 0 ? Math.round((frameCount / testDurationSec) * 10) / 10 : 0;
  const totalBytes = frameSizes.reduce((a, b) => a + b, 0);
  const avgFrameKb = frameSizes.length > 0 ? Math.round((totalBytes / frameSizes.length / 1024) * 10) / 10 : 0;
  const minFrameKb = frameSizes.length > 0 ? Math.round((Math.min(...frameSizes) / 1024) * 10) / 10 : 0;
  const maxFrameKb = frameSizes.length > 0 ? Math.round((Math.max(...frameSizes) / 1024) * 10) / 10 : 0;
  const bitrateMbps = testDurationSec > 0 ? Math.round(((totalBytes * 8) / testDurationSec / (1024 * 1024)) * 100) / 100 : 0;

  console.log(`\nResults for "${presetName}":`);
  console.log(`• Captured Frames: ${frameCount}`);
  console.log(`• Measured FPS:    ${measuredFps} fps`);
  console.log(`• Frame Size:      avg ${avgFrameKb} KB (min ${minFrameKb} KB, max ${maxFrameKb} KB)`);
  console.log(`• Throughput:      ${bitrateMbps} Mbps (~${Math.round(bitrateMbps * 128)} KB/s)`);

  return {
    preset: presetName,
    status: 'MEASURED',
    frames: frameCount,
    fps: measuredFps,
    avgFrameKb,
    minFrameKb,
    maxFrameKb,
    bitrateMbps,
  };
}

async function main() {
  console.log('======================================================');
  console.log('       AEROKIN DESKTOP STREAMING BENCHMARK            ');
  console.log('======================================================\n');

  MonitorService.ensureDpiAwareness();
  const monitors = MonitorService.listMonitors(true);
  console.log(`Detected Displays: ${monitors.length}`);
  for (const m of monitors) {
    console.log(
      `  • [${m.id}] ${m.name}: ${m.bounds.width}x${m.bounds.height} @ (${m.bounds.x}, ${m.bounds.y}), scale ${m.dpiScale}${
        m.isPrimary ? ' (PRIMARY)' : ''
      }`
    );
  }

  const results: any[] = [];
  results.push(await runBenchmarkForPreset('balanced', 3));
  results.push(await runBenchmarkForPreset('fast', 3));
  results.push(await runBenchmarkForPreset('high', 3));

  console.log('\n======================================================');
  console.log('              BENCHMARK SUMMARY TABLE                 ');
  console.log('======================================================');
  console.table(results);
}

main().catch((err) => {
  console.error('Benchmark fatal error:', err);
});
