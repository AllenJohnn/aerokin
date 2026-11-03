import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LatencySparkline } from './LatencySparkline';
import { triggerHaptic } from '../utils/haptics';

export interface DynamicIslandPillProps {
  status: 'connected' | 'reconnecting' | 'unauthorized' | 'disconnected';
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

  const ledClass =
    status === 'connected'
      ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
      : status === 'unauthorized'
      ? 'bg-hw-active shadow-[0_0_6px_var(--hw-active)]'
      : 'bg-amber-400 animate-pulse';

  return (
    <div className="relative flex flex-col items-center z-40 select-none">
      <motion.button
        layout
        onClick={handleClick}
        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-hw-oled-bg border border-hw-border-milled shadow-hw-well active:scale-[0.98] transition-all ${
          status === 'unauthorized'
            ? 'border-hw-active/50'
            : 'hover:border-hw-primary/60'
        }`}
      >
        {/* Hardware LED indicator lamp */}
        <span className="relative flex h-2 w-2">
          <span className={`relative inline-flex rounded-full h-2 w-2 ${ledClass}`} />
        </span>

        {/* OLED Text Readout */}
        <span className="font-mono text-[10.5px] font-bold tracking-wider text-hw-text whitespace-nowrap">
          {status === 'connected'
            ? latency !== null
              ? `CONNECTED · ${latency}ms`
              : 'CONNECTED'
            : status === 'unauthorized'
            ? 'AUTH REQUIRED'
            : 'RECONNECTING'}
        </span>

        {/* Latency Sparkline */}
        {status === 'connected' && (
          <LatencySparkline history={latencyHistory} width={40} height={12} className="ml-0.5 opacity-80" />
        )}
      </motion.button>

      {/* Expanded Machined Telemetry HUD */}
      <AnimatePresence>
        {isExpanded && status === 'connected' && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-full mt-2 w-64 p-3.5 rounded-xl border border-hw-border-milled bg-hw-surface-raised shadow-2xl flex flex-col gap-2 font-mono text-xs z-50"
          >
            <div className="flex items-center justify-between text-hw-text-dim text-[10px] uppercase tracking-wider">
              <span>HARDWARE TELEMETRY</span>
              <span className="text-hw-primary font-bold">60Hz CORE</span>
            </div>

            <div className="flex items-center justify-between text-hw-text">
              <span className="text-hw-text-muted">Round-trip RTT</span>
              <span className="font-bold text-hw-primary">{latency ?? 0} ms</span>
            </div>

            <div className="flex items-center justify-between text-hw-text">
              <span className="text-hw-text-muted">Pairing Token</span>
              <span className="font-bold tracking-widest">{token || '---'}</span>
            </div>

            <div className="flex items-center justify-between text-hw-text">
              <span className="text-hw-text-muted">Security Layer</span>
              <span className="text-emerald-400 font-bold">WSS (Local CA)</span>
            </div>

            <button
              onClick={() => {
                triggerHaptic('light');
                setIsExpanded(false);
              }}
              className="mt-1 py-1 rounded bg-hw-surface-sunken border border-hw-border-subtle text-[10px] text-hw-text-muted hover:text-hw-text transition-colors"
            >
              Close Telemetry
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
