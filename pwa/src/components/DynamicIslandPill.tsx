import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LatencySparkline } from './LatencySparkline';
import { triggerHaptic } from '../utils/haptics';

export interface DynamicIslandPillProps {
  status: 'connected' | 'reconnecting' | 'unauthorized';
  latency: number | null;
  latencyHistory: number[];
  token: string | null;
  onOpenAuthModal: () => void;
}

export const DynamicIslandPill: React.FC<DynamicIslandPillProps> = ({
  status,
  latency,
  latencyHistory,
  token,
  onOpenAuthModal,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    triggerHaptic('light');
    if (status === 'unauthorized') {
      onOpenAuthModal();
      return;
    }
    setIsExpanded((prev) => !prev);
  };

  const statusColor =
    status === 'connected'
      ? 'bg-aerokin-cyan shadow-glow-cyan'
      : status === 'unauthorized'
      ? 'bg-red-500 shadow-glow-sm'
      : 'bg-amber-400 animate-pulse';

  return (
    <div className="relative flex flex-col items-center z-50">
      <motion.button
        layout
        onClick={handleClick}
        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-white/10 bg-[#07070B]/85 backdrop-blur-2xl shadow-glass transition-colors cursor-pointer select-none active:scale-[0.97] ${
          status === 'unauthorized'
            ? 'border-red-500/40 hover:border-red-500'
            : 'hover:border-aerokin-cyan/40'
        }`}
      >
        {/* Pulsing indicator dot */}
        <span className="relative flex h-2 w-2">
          {status === 'connected' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aerokin-cyan opacity-75" />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${statusColor}`} />
        </span>

        {/* Status label with animated text */}
        <span className="font-mono text-[11px] font-semibold tracking-mono text-[#F5F5F7] whitespace-nowrap">
          {status === 'connected'
            ? latency !== null
              ? `CONNECTED · ${latency}ms`
              : 'CONNECTED'
            : status === 'unauthorized'
            ? 'AUTH REQUIRED'
            : 'RECONNECTING'}
        </span>

        {/* Sparkline on connected state */}
        {status === 'connected' && (
          <LatencySparkline history={latencyHistory} width={44} height={14} className="ml-0.5 opacity-90" />
        )}
      </motion.button>

      {/* Expanded diagnostic dropdown */}
      <AnimatePresence>
        {isExpanded && status === 'connected' && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-full mt-2 w-64 p-3.5 rounded-2xl border border-white/10 bg-[#0C0C14]/95 backdrop-blur-2xl shadow-glow-md flex flex-col gap-2 font-mono text-xs z-50"
          >
            <div className="flex items-center justify-between text-aerokin-muted text-[10px] uppercase tracking-wider">
              <span>Telemetry</span>
              <span className="text-aerokin-cyan">60Hz Loop</span>
            </div>

            <div className="flex items-center justify-between text-white">
              <span className="text-aerokin-muted">Ping Latency</span>
              <span className="font-bold text-aerokin-cyan">{latency ?? 0} ms</span>
            </div>

            <div className="flex items-center justify-between text-white">
              <span className="text-aerokin-muted">Pairing Token</span>
              <span className="font-bold tracking-widest">{token || '---'}</span>
            </div>

            <div className="flex items-center justify-between text-white">
              <span className="text-aerokin-muted">Protocol</span>
              <span className="text-emerald-400">WSS (TLS 1.3)</span>
            </div>

            <button
              onClick={() => {
                triggerHaptic('light');
                setIsExpanded(false);
              }}
              className="mt-1 py-1 rounded-lg bg-white/[0.04] text-[10px] text-aerokin-muted hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
