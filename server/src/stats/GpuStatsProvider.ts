/**
 * AEROKIN GPU & Hardware Thermal Telemetry Provider
 *
 * Real source chain:
 * 1. nvidia-smi (NVIDIA discrete / laptop GPUs)
 * 2. Windows Performance Counters (\GPU Engine(*)\Utilization Percentage)
 * 3. Explicit "not available" with specific diagnostic reason
 *
 * Distinguishes 0% (idle) from null (unavailable).
 */

import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

export interface GpuStats {
  available: boolean;
  name: string | null;
  utilizationPercent: number | null; // 0..100, or null if sensor unavailable
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  temperatureCelsius: number | null;
  powerDrawWatts: number | null;
  clockMhz: number | null;
  source: 'nvidia-smi' | 'windows-counters' | 'none';
  note: string;
}

export class GpuStatsProvider {
  private nvidiaSmiPath: string | null | undefined = undefined;
  private cachedStats: GpuStats = {
    available: false,
    name: null,
    utilizationPercent: null,
    memoryUsedBytes: null,
    memoryTotalBytes: null,
    temperatureCelsius: null,
    powerDrawWatts: null,
    clockMhz: null,
    source: 'none',
    note: 'not available',
  };
  private lastSampleTime = 0;
  private sampleInProgress: Promise<GpuStats> | null = null;
  private readonly cacheTtlMs = 1500;

  /**
   * Locate nvidia-smi binary on Windows
   */
  public findNvidiaSmi(): string | null {
    if (this.nvidiaSmiPath !== undefined) {
      return this.nvidiaSmiPath;
    }

    const candidatePaths = [
      'nvidia-smi', // Check PATH
      'C:\\Windows\\System32\\nvidia-smi.exe',
      'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe',
    ];

    for (const p of candidatePaths) {
      try {
        if (p === 'nvidia-smi') {
          // Verify via where.exe
          // We will test direct execution in queryNvidiaSmi
          this.nvidiaSmiPath = p;
          return p;
        }
        if (fs.existsSync(p)) {
          this.nvidiaSmiPath = p;
          return p;
        }
      } catch {
        // Continue checking
      }
    }

    this.nvidiaSmiPath = null;
    return null;
  }

  /**
   * Set explicit nvidia-smi path (useful for testing)
   */
  public setNvidiaSmiPath(p: string | null): void {
    this.nvidiaSmiPath = p;
  }

  /**
   * Parse CSV output from nvidia-smi
   */
  public parseNvidiaSmiOutput(output: string): GpuStats | null {
    if (!output || typeof output !== 'string') return null;

    const lines = output
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    if (lines.length === 0) return null;

    // Format: name, utilization.gpu, memory.used, memory.total, temperature.gpu, power.draw, clocks.gr
    const firstLine = lines[0];
    const parts = firstLine.split(',').map((p) => p.trim());
    if (parts.length < 2) return null;

    const name = parts[0] || 'NVIDIA GPU';
    const rawUtil = parts[1];
    let utilizationPercent: number | null = null;
    if (rawUtil && rawUtil !== '[Not Supported]' && rawUtil !== 'N/A') {
      const parsed = parseFloat(rawUtil);
      if (!isNaN(parsed) && isFinite(parsed)) {
        utilizationPercent = Math.max(0, Math.min(100, Math.round(parsed)));
      }
    }

    let memoryUsedBytes: number | null = null;
    if (parts[2] && parts[2] !== '[Not Supported]' && parts[2] !== 'N/A') {
      const mb = parseFloat(parts[2]);
      if (!isNaN(mb) && isFinite(mb)) {
        memoryUsedBytes = Math.round(mb * 1024 * 1024);
      }
    }

    let memoryTotalBytes: number | null = null;
    if (parts[3] && parts[3] !== '[Not Supported]' && parts[3] !== 'N/A') {
      const mb = parseFloat(parts[3]);
      if (!isNaN(mb) && isFinite(mb)) {
        memoryTotalBytes = Math.round(mb * 1024 * 1024);
      }
    }

    let temperatureCelsius: number | null = null;
    if (parts[4] && parts[4] !== '[Not Supported]' && parts[4] !== 'N/A') {
      const temp = parseFloat(parts[4]);
      if (!isNaN(temp) && isFinite(temp)) {
        temperatureCelsius = Math.round(temp * 10) / 10;
      }
    }

    let powerDrawWatts: number | null = null;
    if (parts[5] && parts[5] !== '[Not Supported]' && parts[5] !== 'N/A') {
      const w = parseFloat(parts[5]);
      if (!isNaN(w) && isFinite(w)) {
        powerDrawWatts = Math.round(w * 10) / 10;
      }
    }

    let clockMhz: number | null = null;
    if (parts[6] && parts[6] !== '[Not Supported]' && parts[6] !== 'N/A') {
      const mhz = parseFloat(parts[6]);
      if (!isNaN(mhz) && isFinite(mhz)) {
        clockMhz = Math.round(mhz);
      }
    }

    return {
      available: utilizationPercent !== null,
      name,
      utilizationPercent,
      memoryUsedBytes,
      memoryTotalBytes,
      temperatureCelsius,
      powerDrawWatts,
      clockMhz,
      source: 'nvidia-smi',
      note: utilizationPercent !== null ? 'NVIDIA SMI sensor' : 'NVIDIA GPU present, utilization not supported',
    };
  }

  /**
   * Parse Windows Performance Counter output for GPU Engine
   */
  public parseWindowsCounterOutput(output: string): GpuStats | null {
    if (!output || typeof output !== 'string') return null;

    try {
      const parsed = JSON.parse(output);
      const samples = Array.isArray(parsed) ? parsed : [parsed];
      if (samples.length === 0) return null;

      // Group samples by LUID or process, and find max/sum 3D or compute utilization
      let maxUtil = 0;
      let hasValidSample = false;

      // Sum utilization across active engines
      const luidMap = new Map<string, number>();

      for (const s of samples) {
        if (!s || typeof s.CookedValue !== 'number') continue;
        hasValidSample = true;
        const inst = String(s.InstanceName || s.Path || '');
        // Extract LUID if present
        const luidMatch = inst.match(/luid_0x[0-9a-fA-F]+_0x[0-9a-fA-F]+/i);
        const luidKey = luidMatch ? luidMatch[0].toLowerCase() : 'default_gpu';

        const current = luidMap.get(luidKey) || 0;
        luidMap.set(luidKey, current + s.CookedValue);
      }

      if (!hasValidSample) return null;

      for (const total of luidMap.values()) {
        if (total > maxUtil) {
          maxUtil = total;
        }
      }

      const util = Math.max(0, Math.min(100, Math.round(maxUtil)));

      return {
        available: true,
        name: 'DirectX GPU Engine',
        utilizationPercent: util,
        memoryUsedBytes: null,
        memoryTotalBytes: null,
        temperatureCelsius: null,
        powerDrawWatts: null,
        clockMhz: null,
        source: 'windows-counters',
        note: 'Windows GPU Engine performance counter',
      };
    } catch {
      return null;
    }
  }

  /**
   * Execute nvidia-smi command
   */
  private queryNvidiaSmi(binaryPath: string): Promise<GpuStats | null> {
    return new Promise((resolve) => {
      const cmd = `"${binaryPath}" --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr --format=csv,noheader,nounits`;
      exec(cmd, { timeout: 800 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve(null);
        }
        const stats = this.parseNvidiaSmiOutput(stdout);
        resolve(stats);
      });
    });
  }

  /**
   * Query Windows performance counters for GPU Engine utilization
   */
  private queryWindowsCounters(): Promise<GpuStats | null> {
    return new Promise((resolve) => {
      const psCmd =
        'powershell -NoProfile -Command "Get-Counter \'\\GPU Engine(*)\\Utilization Percentage\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Where-Object { $_.CookedValue -gt 0 } | Select-Object -Property InstanceName, CookedValue | ConvertTo-Json -Compress"';

      exec(psCmd, { timeout: 1200 }, (err, stdout) => {
        if (err || !stdout || stdout.trim().length === 0) {
          // If no counters are > 0, check if counters are available at all to confirm 0% (idle)
          const probeCmd =
            'powershell -NoProfile -Command "Get-Counter \'\\GPU Engine(*)\\Utilization Percentage\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Select-Object -First 1 -Property CookedValue | ConvertTo-Json -Compress"';
          exec(probeCmd, { timeout: 800 }, (probeErr, probeStdout) => {
            if (probeErr || !probeStdout || probeStdout.trim().length === 0) {
              return resolve(null);
            }
            // Counter exists and returned data -> GPU is idle (0%)
            resolve({
              available: true,
              name: 'DirectX GPU Engine',
              utilizationPercent: 0,
              memoryUsedBytes: null,
              memoryTotalBytes: null,
              temperatureCelsius: null,
              powerDrawWatts: null,
              clockMhz: null,
              source: 'windows-counters',
              note: 'Windows GPU Engine performance counter (idle)',
            });
          });
          return;
        }

        const stats = this.parseWindowsCounterOutput(stdout);
        resolve(stats);
      });
    });
  }

  /**
   * Sample GPU stats using the prioritized source chain
   */
  public async sample(): Promise<GpuStats> {
    const now = Date.now();
    if (now - this.lastSampleTime < this.cacheTtlMs && this.cachedStats.available) {
      return this.cachedStats;
    }

    if (this.sampleInProgress) {
      return this.sampleInProgress;
    }

    this.sampleInProgress = (async () => {
      try {
        // Step 1: nvidia-smi
        const smiPath = this.findNvidiaSmi();
        if (smiPath) {
          const smiStats = await this.queryNvidiaSmi(smiPath);
          if (smiStats) {
            this.cachedStats = smiStats;
            this.lastSampleTime = Date.now();
            return smiStats;
          }
        }

        // Step 2: Windows Counters
        const winStats = await this.queryWindowsCounters();
        if (winStats) {
          this.cachedStats = winStats;
          this.lastSampleTime = Date.now();
          return winStats;
        }

        // Step 3: Explicit not available
        const fallbackStats: GpuStats = {
          available: false,
          name: null,
          utilizationPercent: null,
          memoryUsedBytes: null,
          memoryTotalBytes: null,
          temperatureCelsius: null,
          powerDrawWatts: null,
          clockMhz: null,
          source: 'none',
          note: smiPath
            ? 'nvidia-smi failed and Windows GPU counters unavailable'
            : 'No supported GPU sensor (NVIDIA SMI or Windows GPU counters) available',
        };
        this.cachedStats = fallbackStats;
        this.lastSampleTime = Date.now();
        return fallbackStats;
      } finally {
        this.sampleInProgress = null;
      }
    })();

    return this.sampleInProgress;
  }

  /**
   * Synchronous getter returning latest cached stats without blocking
   */
  public getCachedStats(): GpuStats {
    return this.cachedStats;
  }
}
