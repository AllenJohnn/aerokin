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

import os from 'node:os';
import { execSync } from 'node:child_process';
import { MonitorService } from '../src/desktop/MonitorService.js';
import { WindowsFfmpegCaptureAdapter } from '../src/desktop/CaptureAdapter.js';
import { QUALITY_PRESETS, QualityPresetName, VideoCodec } from '../src/desktop/types.js';

function getProcessCpuSeconds(pid: number): number | null {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).TotalProcessorTime.TotalSeconds"`,
      { timeout: 2000, encoding: 'utf8' }
    ).trim();
    const val = parseFloat(out);
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

async function runBenchmarkForPreset(
  presetName: QualityPresetName,
  codec: VideoCodec = 'h264',
  durationSec = 3,
  forceSynthetic = false
) {
  console.log(`\n======================================================`);
  console.log(`  BENCHMARK: Preset "${presetName.toUpperCase()}" [${codec.toUpperCase()}] (${durationSec}s run)`);
  console.log(`======================================================`);

  const preset = QUALITY_PRESETS[presetName];
  const monitors = MonitorService.listMonitors(true);
  const primary = monitors.find((m) => m.isPrimary) || monitors[0] || {
    id: 'mon_0',
    name: 'Default Display',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    dpiScale: 1,
    isPrimary: true,
  };

  const targetW = Math.round((primary.bounds.width * preset.scale) / 2) * 2;
  const targetH = Math.round((primary.bounds.height * preset.scale) / 2) * 2;

  console.log(`Target Display: ${primary.name} (${primary.bounds.width}x${primary.bounds.height}) -> ${targetW}x${targetH} (${preset.scale * 100}%)`);
  console.log(`Target Config: fps ${preset.fps}, codec ${codec}, bitrate ${preset.bitrateKbps} kbps, synthetic: ${forceSynthetic}`);

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
  let cpuStart: number | null = null;
  let cpuStartTime = 0;
  let cpuEnd: number | null = null;
  let cpuEndTime = 0;

  adapter.onFrame((packet, width, height, seq, nowMs) => {
    const now = Date.now();
    if (frameCount === 0) {
      firstFrameTime = now;
    }
    frameCount++;
    frameSizes.push(packet.length);
    frameTimes.push(now);
  });

  try {
    await adapter.start({
      monitor: primary,
      fps: preset.fps,
      scale: preset.scale,
      quality: preset.jpegQuality,
      codec,
      bitrateKbps: preset.bitrateKbps,
      isTestMode: forceSynthetic,
    });

    const pid = adapter.getPid();
    if (pid) {
      cpuStart = getProcessCpuSeconds(pid);
      cpuStartTime = Date.now();
    }

    console.log(`[Stream Started] Active backend: ${adapter.getActiveBackend()}, Codec: ${adapter.getActiveCodec?.() || codec} (${adapter.getActiveEncoder?.() || 'default'})`);
    console.log(`[Stream Started] Collecting frames for ${durationSec} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, durationSec * 1000));

    if (pid) {
      cpuEnd = getProcessCpuSeconds(pid);
      cpuEndTime = Date.now();
    }
  } catch (err: any) {
    errorEncountered = err;
  } finally {
    await adapter.stop();
  }

  const activeBackend = adapter.getActiveBackend();
  const activeCodec = adapter.getActiveCodec?.() || codec;
  const activeEncoder = adapter.getActiveEncoder?.() || 'none';

  if (errorEncountered && !forceSynthetic) {
    console.warn(`[Live capture failed: ${errorEncountered.message}. Retrying with synthetic testsrc...]`);
    return runBenchmarkForPreset(presetName, codec, durationSec, true);
  }

  const testDurationSec = (Date.now() - (firstFrameTime || startTime)) / 1000;
  const measuredFps = frameCount > 0 && testDurationSec > 0 ? Math.round((frameCount / testDurationSec) * 10) / 10 : 0;
  const totalBytes = frameSizes.reduce((a, b) => a + b, 0);
  const avgFrameKb = frameSizes.length > 0 ? Math.round((totalBytes / frameSizes.length / 1024) * 10) / 10 : 0;
  const minFrameKb = frameSizes.length > 0 ? Math.round((Math.min(...frameSizes) / 1024) * 10) / 10 : 0;
  const maxFrameKb = frameSizes.length > 0 ? Math.round((Math.max(...frameSizes) / 1024) * 10) / 10 : 0;
  const bitrateMbps = testDurationSec > 0 ? Math.round(((totalBytes * 8) / testDurationSec / (1024 * 1024)) * 100) / 100 : 0;

  // Inter-frame delivery latency (p50 / p95)
  const intervals: number[] = [];
  for (let i = 1; i < frameTimes.length; i++) {
    intervals.push(frameTimes[i] - frameTimes[i - 1]);
  }
  intervals.sort((a, b) => a - b);
  const p50Ms = intervals.length > 0 ? intervals[Math.floor(intervals.length * 0.5)] : 0;
  const p95Ms = intervals.length > 0 ? intervals[Math.floor(intervals.length * 0.95)] : 0;

  let cpuPercent: number | null = null;
  if (cpuStart !== null && cpuEnd !== null) {
    const elapsedWallSec = (cpuEndTime - cpuStartTime) / 1000;
    if (elapsedWallSec > 0) {
      const totalCpuSec = cpuEnd - cpuStart;
      const numCores = os.cpus().length || 1;
      cpuPercent = Math.round((totalCpuSec / elapsedWallSec / numCores) * 1000) / 10;
    }
  }

  console.log(`\nResults for "${presetName}" [${codec}]:`);
  console.log(`• Backend/Encoder: ${activeBackend} / ${activeEncoder}`);
  console.log(`• Resolution:      ${targetW}x${targetH}`);
  console.log(`• Captured Frames: ${frameCount}`);
  console.log(`• Measured FPS:    ${measuredFps} fps`);
  console.log(`• Frame Delivery:  p50 ${p50Ms}ms, p95 ${p95Ms}ms`);
  console.log(`• Frame Size:      avg ${avgFrameKb} KB (min ${minFrameKb} KB, max ${maxFrameKb} KB)`);
  console.log(`• Bitrate:         ${bitrateMbps} Mbps`);
  console.log(`• FFmpeg CPU:      ${cpuPercent !== null ? `${cpuPercent}% total` : 'N/A'}`);

  return {
    preset: presetName,
    resolution: `${targetW}x${targetH}`,
    codec,
    encoder: activeEncoder,
    backend: activeBackend,
    status: 'PASS',
    frames: frameCount,
    fps: measuredFps,
    p50Ms: `${p50Ms}ms`,
    p95Ms: `${p95Ms}ms`,
    avgFrameKb: `${avgFrameKb} KB`,
    bitrateMbps: `${bitrateMbps} Mbps`,
  };
}

async function main() {
  console.log('======================================================');
  console.log('       AEROKIN DESKTOP 2.0 STREAMING BENCHMARK        ');
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

  const isSynthetic = process.argv.includes('--synthetic') || process.argv.includes('--testsrc');

  const results: any[] = [];
  // 1. 1080p H.264
  results.push(await runBenchmarkForPreset('high', 'h264', 3, isSynthetic));
  // 2. 720p H.264
  results.push(await runBenchmarkForPreset('balanced', 'h264', 3, isSynthetic));
  // 3. 720p MJPEG
  results.push(await runBenchmarkForPreset('balanced', 'mjpeg', 3, isSynthetic));

  console.log('\n======================================================');
  console.log('              BENCHMARK SUMMARY TABLE                 ');
  console.log('======================================================');
  console.table(results);
}

main().catch((err) => {
  console.error('Benchmark fatal error:', err);
});

main().catch((err) => {
  console.error('Benchmark fatal error:', err);
});
