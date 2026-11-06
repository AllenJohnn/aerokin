import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Cpu,
  HardDrives,
  ArrowsDownUp,
  BatteryCharging,
  BatteryFull,
  Clock,
  Graph,
  Pulse,
  ListNumbers,
  Warning,
  CheckCircle,
} from '@phosphor-icons/react';
import { SystemStatsData } from '../hooks/useAerokinSocket';

export interface SystemTabProps {
  stats: SystemStatsData | null;
  onSubscribe: (intervalMs?: number) => void;
  onUnsubscribe: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec <= 0 || !Number.isFinite(bytesPerSec)) return '0 KB/s';
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const SystemTab: React.FC<SystemTabProps> = ({ stats, onSubscribe, onUnsubscribe }) => {
  // Sparkline history (last 60 samples)
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [ramHistory, setRamHistory] = useState<number[]>([]);

  // Subscribe on mount, unsubscribe on unmount
  useEffect(() => {
    onSubscribe(1000);
    return () => {
      onUnsubscribe();
    };
  }, [onSubscribe, onUnsubscribe]);

  // Update sparklines with incoming 1 Hz samples
  useEffect(() => {
    if (!stats) return;
    setCpuHistory((prev) => [...prev, stats.cpu.totalPercent].slice(-60));
    setRamHistory((prev) => [...prev, stats.ram.percent].slice(-60));
  }, [stats]);

  // Generate lightweight SVG sparkline path
  const renderSparkline = (data: number[], color = '#FF5A1F') => {
    if (data.length < 2) return null;
    const width = 120;
    const height = 30;
    const step = width / (data.length - 1);
    const points = data.map((val, idx) => {
      const x = idx * step;
      const y = height - (Math.max(0, Math.min(100, val)) / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return (
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points.join(' ')}
        />
      </svg>
    );
  };

  if (!stats) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
          className="w-7 h-7 border-2 border-[#FF5A1F] border-t-transparent rounded-full mb-3"
        />
        <p className="text-sm font-medium text-foreground">Connecting to Hardware Telemetry...</p>
        <p className="text-xs text-muted-foreground mt-1">
          Starting 1 Hz low-overhead agent sampler.
        </p>
      </div>
    );
  }

  const { cpu, ram, disks, network, power, gpu, temperature, topProcesses, uptimeSeconds } = stats;

  return (
    <div className="flex-1 flex flex-col bg-background text-foreground px-4 py-3 overflow-y-auto max-w-lg mx-auto w-full pb-20 space-y-3">
      {/* Header & Agent CPU banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Cpu size={20} className="text-[#FF5A1F]" />
            System Monitor
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time hardware sensors, memory and network metrics.
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            Agent CPU: {cpu.agentCpuPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Primary Metrics Grid (Calm Big Numbers) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* CPU Card */}
        <div className="bg-card border border-border/40 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Cpu size={14} className="text-[#FF5A1F]" />
              Total CPU
            </span>
            <span className="text-[11px]">{cpu.coresPercent.length} Cores</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground font-mono">
              {cpu.totalPercent}%
            </span>
            <div className="opacity-90">{renderSparkline(cpuHistory, '#FF5A1F')}</div>
          </div>
          <div className="w-full bg-muted/40 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-[#FF5A1F] h-full rounded-full transition-all duration-300"
              style={{ width: `${cpu.totalPercent}%` }}
            />
          </div>
        </div>

        {/* RAM Card */}
        <div className="bg-card border border-border/40 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Graph size={14} className="text-orange-400" />
              Memory
            </span>
            <span className="text-[11px] font-mono">{formatBytes(ram.usedBytes)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold tracking-tight text-foreground font-mono">
              {ram.percent}%
            </span>
            <div className="opacity-90">{renderSparkline(ramHistory, '#F59E0B')}</div>
          </div>
          <div className="w-full bg-muted/40 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${ram.percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Per-Core Distribution */}
      {cpu.coresPercent.length > 0 && (
        <div className="bg-card border border-border/40 rounded-2xl p-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
            <span>Per-Core CPU Load</span>
            <span className="text-[11px] font-mono">0% - 100%</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {cpu.coresPercent.map((coreUsage, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                  <span>C{idx}</span>
                  <span className={coreUsage > 80 ? 'text-[#FF5A1F] font-semibold' : ''}>
                    {coreUsage}%
                  </span>
                </div>
                <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${coreUsage}%`,
                      backgroundColor: coreUsage > 80 ? '#FF5A1F' : 'rgba(255, 90, 31, 0.7)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Network & Power Status Bar */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Network Card */}
        <div className="bg-card border border-border/40 rounded-2xl p-3 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <ArrowsDownUp size={14} className="text-[#FF5A1F]" />
            Network Traffic
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground flex items-center gap-1">↓ Down:</span>
            <span className="font-mono font-medium text-foreground">
              {formatRate(network.downBytesPerSec)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">↑ Up:</span>
            <span className="font-mono font-medium text-foreground">
              {formatRate(network.upBytesPerSec)}
            </span>
          </div>
        </div>

        {/* Battery & Uptime Card */}
        <div className="bg-card border border-border/40 rounded-2xl p-3 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            {power.isCharging ? (
              <BatteryCharging size={14} className="text-emerald-400" />
            ) : (
              <BatteryFull size={14} className="text-[#FF5A1F]" />
            )}
            Power & Uptime
          </div>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">Battery:</span>
            <span className="font-mono font-medium text-foreground">
              {power.hasBattery && power.batteryPercent !== null
                ? `${power.batteryPercent}% ${power.isCharging ? '(Charging)' : ''}`
                : power.acConnected
                  ? 'AC Power'
                  : 'Desktop PC'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock size={12} /> Uptime:
            </span>
            <span className="font-mono font-medium text-foreground">
              {formatUptime(uptimeSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* Disk Drives */}
      {disks.length > 0 && (
        <div className="bg-card border border-border/40 rounded-2xl p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <HardDrives size={14} className="text-[#FF5A1F]" />
            Storage Volumes
          </div>
          <div className="space-y-2 pt-1">
            {disks.map((d) => (
              <div key={d.drive} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-medium text-foreground">{d.drive}</span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {formatBytes(d.usedBytes)} / {formatBytes(d.totalBytes)} ({d.percent}%)
                  </span>
                </div>
                <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${d.percent}%`,
                      backgroundColor: d.percent > 90 ? '#EF4444' : '#FF5A1F',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Processes (Read-Only) */}
      {(topProcesses.byRam.length > 0 || topProcesses.byCpu.length > 0) && (
        <div className="bg-card border border-border/40 rounded-2xl p-3 space-y-2.5">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <ListNumbers size={14} className="text-[#FF5A1F]" />
            Top Processes by Memory (Read-Only)
          </div>
          <div className="space-y-1.5 divide-y divide-border/20 pt-1">
            {topProcesses.byRam.slice(0, 5).map((proc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs pt-1.5 first:pt-0"
              >
                <span className="truncate max-w-[200px] text-foreground font-mono">
                  {proc.name}
                </span>
                <span className="font-mono text-muted-foreground text-[11px] shrink-0">
                  {proc.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GPU & Temperature Status Notices */}
      <div className="bg-muted/20 border border-border/30 rounded-2xl p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">GPU Utilization:</span>
          <span className="font-mono text-muted-foreground/80">
            {gpu.available && gpu.utilizationPercent !== null
              ? `${gpu.utilizationPercent}%${(gpu as any).name ? ` (${(gpu as any).name})` : ''}`
              : gpu.note || 'not available'}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border/20 pt-1.5">
          <span className="text-muted-foreground">Hardware Temperature:</span>
          <span className="font-mono text-muted-foreground/80">
            {temperature.available && temperature.celsius !== null
              ? `${temperature.celsius}°C${temperature.note ? ` (${temperature.note})` : ''}`
              : temperature.note || 'not available'}
          </span>
        </div>
      </div>
    </div>
  );
};
