import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { GlassCard, Pill } from '@ui';
import { MediaAction } from '../hooks/useAerokinSocket';
import { triggerHaptic } from '../utils/haptics';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Volume1,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface MediaTabProps {
  sendMedia: (action: MediaAction) => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({ sendMedia }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(65); // 0-100 visual dial

  const dialRef = useRef<HTMLDivElement | null>(null);
  const lastAngleRef = useRef<number | null>(null);

  const handleAction = (action: MediaAction, hapticType: 'light' | 'medium' | 'heavy' = 'medium') => {
    triggerHaptic(hapticType);

    if (action === 'playpause') {
      setIsPlaying((prev) => !prev);
    } else if (action === 'mute') {
      setIsMuted((prev) => !prev);
    } else if (action === 'fullscreen') {
      setIsFullscreen((prev) => !prev);
    }

    sendMedia(action);
  };

  // Circular Volume Dial Drag & Detent Haptics
  const handleDialPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    updateDialFromPointer(e);
  };

  const handleDialPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0) {
      updateDialFromPointer(e);
    }
  };

  const handleDialPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    lastAngleRef.current = null;
  };

  const updateDialFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;

    // Angle in radians [-PI, PI]
    let angle = Math.atan2(dy, dx);
    // Convert to degrees [0, 360]
    let deg = (angle * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;

    if (lastAngleRef.current !== null) {
      let diff = deg - lastAngleRef.current;
      // Handle 360 wrap-around
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      // Every ~12 degrees is a volume step
      if (Math.abs(diff) >= 8) {
        if (diff > 0) {
          // Clockwise: Volume Up
          triggerHaptic('light');
          sendMedia('volup');
          setVolumeLevel((prev) => Math.min(prev + 4, 100));
        } else {
          // Counter-Clockwise: Volume Down
          triggerHaptic('light');
          sendMedia('voldown');
          setVolumeLevel((prev) => Math.max(prev - 4, 0));
        }
        lastAngleRef.current = deg;
      }
    } else {
      lastAngleRef.current = deg;
    }
  };

  // Dial SVG geometry
  const dialAngle = (volumeLevel / 100) * 270 - 135; // [-135deg to +135deg]

  return (
    <div className="flex flex-col h-full w-full justify-between gap-3.5 p-4 overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
          WINDOWS MEDIA REMOTE
        </span>
        <Pill status="online" size="sm">
          READY
        </Pill>
      </div>

      {/* Main Playback Hero Cluster */}
      <GlassCard variant="default" padding="lg" className="flex flex-col items-center justify-center gap-5">
        {/* Large Central Play / Pause Button with Morph */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          onClick={() => handleAction('playpause', 'heavy')}
          className="relative h-24 w-24 rounded-full bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] p-[2px] shadow-glow-lg flex items-center justify-center cursor-pointer select-none group"
        >
          <div className="h-full w-full rounded-full bg-[#07070B]/80 backdrop-blur-xl flex items-center justify-center group-hover:bg-[#07070B]/60 transition-colors">
            <motion.div
              key={isPlaying ? 'pause' : 'play'}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {isPlaying ? (
                <Pause className="w-10 h-10 text-white fill-white" />
              ) : (
                <Play className="w-10 h-10 text-white fill-white ml-1" />
              )}
            </motion.div>
          </div>
        </motion.button>

        {/* Primary Scrub / Skip Controls */}
        <div className="w-full grid grid-cols-4 gap-2">
          {/* Skip Previous */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => handleAction('prev', 'medium')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 active:bg-white/[0.08] transition-colors"
          >
            <SkipBack className="w-5 h-5 text-white mb-1" />
            <span className="font-mono text-[9px] text-aerokin-muted uppercase">Prev</span>
          </motion.button>

          {/* Seek -10s */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => handleAction('seekback', 'medium')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 active:bg-white/[0.08] transition-colors"
          >
            <RotateCcw className="w-5 h-5 text-aerokin-cyan mb-1" />
            <span className="font-mono text-[9px] text-aerokin-muted uppercase">-10s</span>
          </motion.button>

          {/* Seek +10s */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => handleAction('seekfwd', 'medium')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 active:bg-white/[0.08] transition-colors"
          >
            <RotateCw className="w-5 h-5 text-aerokin-cyan mb-1" />
            <span className="font-mono text-[9px] text-aerokin-muted uppercase">+10s</span>
          </motion.button>

          {/* Skip Next */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => handleAction('next', 'medium')}
            className="flex flex-col items-center justify-center p-3 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-white/20 active:bg-white/[0.08] transition-colors"
          >
            <SkipForward className="w-5 h-5 text-white mb-1" />
            <span className="font-mono text-[9px] text-aerokin-muted uppercase">Next</span>
          </motion.button>
        </div>
      </GlassCard>

      {/* Tactile Circular Volume Dial with Detent Haptics */}
      <GlassCard variant="default" padding="md" className="flex items-center justify-between gap-4">
        {/* Rotary Dial */}
        <div
          ref={dialRef}
          onPointerDown={handleDialPointerDown}
          onPointerMove={handleDialPointerMove}
          onPointerUp={handleDialPointerUp}
          onPointerCancel={handleDialPointerUp}
          className="relative w-28 h-28 rounded-full border border-white/15 bg-white/[0.03] flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none shadow-glass flex-shrink-0"
        >
          {/* Dial Arc Background */}
          <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="5"
              strokeDasharray="188"
              strokeDashoffset="47"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="url(#dialGrad)"
              strokeWidth="5"
              strokeDasharray="188"
              strokeDashoffset={188 - (volumeLevel / 100) * 141}
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="dialGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7C5CFF" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
          </svg>

          {/* Rotating Knob Core */}
          <div
            className="w-16 h-16 rounded-full bg-[#0C0C14] border border-white/20 flex items-center justify-center shadow-lg transition-transform"
            style={{ transform: `rotate(${dialAngle}deg)` }}
          >
            {/* Notch indicator */}
            <div className="absolute top-1.5 w-1.5 h-3 rounded-full bg-aerokin-cyan shadow-glow-sm" />
          </div>

          <div className="pointer-events-none absolute font-mono text-[10px] font-bold text-white">
            {volumeLevel}%
          </div>
        </div>

        {/* Quick Stepper Buttons */}
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-aerokin-muted uppercase tracking-wider">
              Volume Rotary
            </span>
            <span className="font-mono text-[10px] text-aerokin-cyan">Detent Haptic</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                triggerHaptic('light');
                sendMedia('voldown');
                setVolumeLevel((v) => Math.max(v - 5, 0));
              }}
              className="py-2.5 px-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 flex items-center justify-center gap-1.5"
            >
              <Volume1 className="w-4 h-4 text-white" />
              <span className="font-mono text-xs text-white">Vol −</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                triggerHaptic('light');
                sendMedia('volup');
                setVolumeLevel((v) => Math.min(v + 5, 100));
              }}
              className="py-2.5 px-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 flex items-center justify-center gap-1.5"
            >
              <Volume2 className="w-4 h-4 text-white" />
              <span className="font-mono text-xs text-white">Vol +</span>
            </motion.button>
          </div>

          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => handleAction('mute', 'heavy')}
            className={`py-2 px-3 rounded-xl border font-mono text-xs flex items-center justify-center gap-1.5 transition-colors ${
              isMuted
                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                : 'bg-white/[0.04] border-white/10 text-aerokin-muted hover:text-white'
            }`}
          >
            <VolumeX className="w-4 h-4" />
            <span>{isMuted ? 'Muted (Tap to Unmute)' : 'Mute Master Audio'}</span>
          </motion.button>
        </div>
      </GlassCard>

      {/* Presentation & Display Cluster */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => handleAction('fullscreen', 'heavy')}
        className={`w-full py-3.5 px-4 rounded-2xl border font-mono text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
          isFullscreen
            ? 'bg-aerokin-cyan/20 border-aerokin-cyan text-white shadow-glow-sm'
            : 'bg-white/[0.04] border-white/10 text-white hover:border-white/25 active:bg-white/[0.08]'
        }`}
      >
        {isFullscreen ? (
          <>
            <Minimize2 className="w-4 h-4 text-aerokin-cyan" />
            <span>Exit Fullscreen (F)</span>
          </>
        ) : (
          <>
            <Maximize2 className="w-4 h-4 text-aerokin-cyan" />
            <span>Toggle Fullscreen (F)</span>
          </>
        )}
      </motion.button>
    </div>
  );
};
