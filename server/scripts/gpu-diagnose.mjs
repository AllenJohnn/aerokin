/**
 * AEROKIN GPU Diagnostics Script
 *
 * Runs the real GPU telemetry source chain:
 * 1. Locates nvidia-smi binary
 * 2. Runs raw nvidia-smi query and displays raw stdout
 * 3. Parses structured GPU stats
 * 4. Runs Windows performance counter probe
 * 5. Displays formatted telemetry report
 */

import { GpuStatsProvider } from '../dist/stats/GpuStatsProvider.js';
import { execSync } from 'node:child_process';

console.log('====================================================');
console.log('AEROKIN GPU & HARDWARE THERMAL TELEMETRY DIAGNOSTIC');
console.log('====================================================\n');

const provider = new GpuStatsProvider();
const smiPath = provider.findNvidiaSmi();

console.log(`[1] NVIDIA SMI Location: ${smiPath || 'NOT FOUND'}`);

if (smiPath) {
  try {
    const rawCmd = `"${smiPath}" --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr --format=csv,noheader,nounits`;
    console.log(`[2] Raw nvidia-smi execution: ${rawCmd}`);
    const rawOutput = execSync(rawCmd, { encoding: 'utf8', timeout: 3000 });
    console.log(`Raw Output:`);
    console.log('----------------------------------------------------');
    console.log(rawOutput.trim());
    console.log('----------------------------------------------------\n');

    const parsed = provider.parseNvidiaSmiOutput(rawOutput);
    console.log('[3] Parsed Structured Telemetry:');
    console.dir(parsed, { depth: null });
  } catch (err) {
    console.error('[2] nvidia-smi execution error:', err.message);
  }
}

console.log('\n[4] Full Provider Sample (Source Chain Fallbacks):');
const stats = await provider.sample();
console.dir(stats, { depth: null });

console.log('\n====================================================');
console.log(`Result: ${stats.available ? 'GPU TELEMETRY ACTIVE' : 'GPU TELEMETRY UNAVAILABLE'}`);
if (stats.available) {
  console.log(`GPU: ${stats.name}`);
  console.log(`Utilization: ${stats.utilizationPercent}%`);
  console.log(`VRAM: ${stats.memoryUsedBytes ? Math.round(stats.memoryUsedBytes / (1024 * 1024)) : '?'} / ${stats.memoryTotalBytes ? Math.round(stats.memoryTotalBytes / (1024 * 1024)) : '?'} MB`);
  console.log(`Temperature: ${stats.temperatureCelsius !== null ? `${stats.temperatureCelsius}°C` : 'N/A'}`);
  console.log(`Source: ${stats.source}`);
} else {
  console.log(`Reason: ${stats.note}`);
}
console.log('====================================================');
