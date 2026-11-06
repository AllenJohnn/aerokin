import { describe, it, expect } from 'vitest';
import { GpuStatsProvider } from '../src/stats/GpuStatsProvider.js';
import { SystemStatsService } from '../src/stats/SystemStatsService.js';

describe('GpuStatsProvider - Output Parsing & Fallback Chain', () => {
  const provider = new GpuStatsProvider();

  describe('nvidia-smi output parsing', () => {
    it('parses valid single-GPU output correctly', () => {
      const output = 'NVIDIA GeForce RTX 4060 Laptop GPU, 14, 1024, 8192, 48.5, 35.2, 1850\n';
      const stats = provider.parseNvidiaSmiOutput(output);

      expect(stats).not.toBeNull();
      expect(stats?.available).toBe(true);
      expect(stats?.name).toBe('NVIDIA GeForce RTX 4060 Laptop GPU');
      expect(stats?.utilizationPercent).toBe(14);
      expect(stats?.memoryUsedBytes).toBe(1024 * 1024 * 1024);
      expect(stats?.memoryTotalBytes).toBe(8192 * 1024 * 1024);
      expect(stats?.temperatureCelsius).toBe(48.5);
      expect(stats?.powerDrawWatts).toBe(35.2);
      expect(stats?.clockMhz).toBe(1850);
      expect(stats?.source).toBe('nvidia-smi');
    });

    it('distinguishes 0% (idle) from null (unavailable)', () => {
      const idleOutput = 'NVIDIA GeForce RTX 3080, 0, 500, 10240, 36.0, 12.0, 210\n';
      const stats = provider.parseNvidiaSmiOutput(idleOutput);

      expect(stats).not.toBeNull();
      expect(stats?.available).toBe(true);
      expect(stats?.utilizationPercent).toBe(0); // MUST be exactly 0, not null!
    });

    it('handles [Not Supported] and N/A values gracefully without throwing', () => {
      const output = 'NVIDIA Quadro P400, [Not Supported], [Not Supported], 2048, N/A, N/A, [Not Supported]\n';
      const stats = provider.parseNvidiaSmiOutput(output);

      expect(stats).not.toBeNull();
      expect(stats?.available).toBe(false);
      expect(stats?.utilizationPercent).toBeNull();
      expect(stats?.memoryUsedBytes).toBeNull();
      expect(stats?.memoryTotalBytes).toBe(2048 * 1024 * 1024);
      expect(stats?.temperatureCelsius).toBeNull();
      expect(stats?.powerDrawWatts).toBeNull();
      expect(stats?.clockMhz).toBeNull();
    });

    it('returns null on empty, whitespace, or header-only output', () => {
      expect(provider.parseNvidiaSmiOutput('')).toBeNull();
      expect(provider.parseNvidiaSmiOutput('   \n\n  ')).toBeNull();
      expect(provider.parseNvidiaSmiOutput('# gpu-name, utilization\n')).toBeNull();
      expect(provider.parseNvidiaSmiOutput('garbage invalid format')).toBeNull();
    });

    it('clamps out-of-range utilization values to 0..100', () => {
      const highOutput = 'NVIDIA RTX 4090, 120, 100, 24000, 50, 100, 2000\n';
      const lowOutput = 'NVIDIA RTX 4090, -5, 100, 24000, 50, 100, 2000\n';

      expect(provider.parseNvidiaSmiOutput(highOutput)?.utilizationPercent).toBe(100);
      expect(provider.parseNvidiaSmiOutput(lowOutput)?.utilizationPercent).toBe(0);
    });
  });

  describe('Windows Performance Counter parsing', () => {
    it('parses JSON counter samples and aggregates by LUID', () => {
      const counterJson = JSON.stringify([
        {
          InstanceName: 'pid_100_luid_0x00000000_0x0000f5ba_phys_0_eng_0_engtype_3d',
          CookedValue: 12.4,
        },
        {
          InstanceName: 'pid_100_luid_0x00000000_0x0000f5ba_phys_0_eng_1_engtype_copy',
          CookedValue: 3.1,
        },
      ]);

      const stats = provider.parseWindowsCounterOutput(counterJson);
      expect(stats).not.toBeNull();
      expect(stats?.available).toBe(true);
      expect(stats?.source).toBe('windows-counters');
      expect(stats?.utilizationPercent).toBe(16); // 12.4 + 3.1 = 15.5 -> rounded to 16
    });

    it('handles idle GPU counters (0% utilization)', () => {
      const counterJson = JSON.stringify([
        {
          InstanceName: 'pid_100_luid_0x00000000_0x0000f5ba_phys_0_eng_0_engtype_3d',
          CookedValue: 0,
        },
      ]);

      const stats = provider.parseWindowsCounterOutput(counterJson);
      expect(stats).not.toBeNull();
      expect(stats?.available).toBe(true);
      expect(stats?.utilizationPercent).toBe(0);
    });

    it('returns null on invalid or empty JSON', () => {
      expect(provider.parseWindowsCounterOutput('')).toBeNull();
      expect(provider.parseWindowsCounterOutput('not-json')).toBeNull();
      expect(provider.parseWindowsCounterOutput('[]')).toBeNull();
    });
  });

  describe('SystemStatsService GPU & Temperature integration', () => {
    it('integrates GPU stats into synchronous system metrics', () => {
      const statsService = new SystemStatsService();
      const mockProvider = new GpuStatsProvider();

      // Inject mock cached stats
      const mockGpuStats = mockProvider.parseNvidiaSmiOutput(
        'NVIDIA GeForce RTX 4060, 25, 2048, 8192, 52.0, 45.0, 2100\n'
      )!;

      // Override getCachedStats
      mockProvider.getCachedStats = () => mockGpuStats;
      statsService.setGpuProvider(mockProvider);

      const metrics = (statsService as any).collectSynchronousMetrics();
      expect(metrics.gpu.available).toBe(true);
      expect(metrics.gpu.name).toBe('NVIDIA GeForce RTX 4060');
      expect(metrics.gpu.utilizationPercent).toBe(25);
      expect(metrics.temperature.available).toBe(true);
      expect(metrics.temperature.celsius).toBe(52.0);
    });

    it('falls back gracefully when GPU is not available', () => {
      const statsService = new SystemStatsService();
      const mockProvider = new GpuStatsProvider();

      mockProvider.getCachedStats = () => ({
        available: false,
        name: null,
        utilizationPercent: null,
        memoryUsedBytes: null,
        memoryTotalBytes: null,
        temperatureCelsius: null,
        powerDrawWatts: null,
        clockMhz: null,
        source: 'none',
        note: 'No supported GPU sensor found',
      });
      statsService.setGpuProvider(mockProvider);

      const metrics = (statsService as any).collectSynchronousMetrics();
      expect(metrics.gpu.available).toBe(false);
      expect(metrics.gpu.utilizationPercent).toBeNull();
      expect(metrics.temperature.available).toBe(false);
      expect(metrics.temperature.celsius).toBeNull();
    });
  });
});
