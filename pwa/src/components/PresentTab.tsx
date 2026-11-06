import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import {
  ProjectorScreen,
  CaretLeft,
  CaretRight,
  Play,
  Pause,
  ArrowCounterClockwise,
  Flag,
  Crosshair,
  Desktop,
  Stop,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import { triggerHaptic } from '../utils/haptics';
import { requestWakeLock, releaseWakeLock } from '../utils/wakelock';

export interface PresentTabProps {
  onSendKey: (key: string, action?: 'down' | 'up' | 'tap', modifiers?: string[]) => void;
  onSendMove: (dx: number, dy: number) => void;
}

export const PresentTab: React.FC<PresentTabProps> = ({ onSendKey, onSendMove }) => {
  // Key mode: 'arrows' (Right / Left) or 'pages' (PageDown / PageUp)
  const [keyMode, setKeyMode] = useState<'arrows' | 'pages'>('arrows');

  // Presentation Timer state
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [laps, setLaps] = useState<number[]>([]);

  // Laser Pointer Mode state
  const [laserMode, setLaserMode] = useState<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Request screen wake lock while present screen is open
  useEffect(() => {
    requestWakeLock();
    return () => {
      releaseWakeLock();
    };
  }, []);

  // Timer ticker
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const handleNext = () => {
    triggerHaptic('light');
    if (keyMode === 'arrows') {
      onSendKey('Right', 'tap');
    } else {
      onSendKey('PageDown', 'tap');
    }
  };

  const handlePrev = () => {
    triggerHaptic('light');
    if (keyMode === 'arrows') {
      onSendKey('Left', 'tap');
    } else {
      onSendKey('PageUp', 'tap');
    }
  };

  const handleStartSlides = () => {
    triggerHaptic('medium');
    onSendKey('F5', 'tap');
  };

  const handleEndSlides = () => {
    triggerHaptic('medium');
    onSendKey('Escape', 'tap');
  };

  const handleBlackScreen = () => {
    triggerHaptic('light');
    onSendKey('b', 'tap');
  };

  const handleWhiteScreen = () => {
    triggerHaptic('light');
    onSendKey('w', 'tap');
  };

  // Timer actions
  const toggleTimer = () => {
    triggerHaptic('light');
    setTimerRunning((prev) => !prev);
  };

  const handleLap = () => {
    triggerHaptic('light');
    setLaps((prev) => [elapsedSeconds, ...prev].slice(0, 10));
  };

  const handleResetTimer = () => {
    triggerHaptic('light');
    setTimerRunning(false);
    setElapsedSeconds(0);
    setLaps([]);
  };

  const formatTimer = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Laser Pointer touch handlers (reuses cursor movements)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStartRef.current) {
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;
      const dx = (curX - touchStartRef.current.x) * 1.5;
      const dy = (curY - touchStartRef.current.y) * 1.5;

      touchStartRef.current = { x: curX, y: curY };
      onSendMove(dx, dy);
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  return (
    <div className="flex-1 flex flex-col bg-background text-foreground px-4 py-3 overflow-y-auto max-w-lg mx-auto w-full pb-20 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ProjectorScreen size={20} className="text-[#FF5A1F]" />
            Slide Remote
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Key remote for PowerPoint, Keynote & Google Slides.
          </p>
        </div>

        {/* Key mapping selector */}
        <div className="flex rounded-lg bg-card border border-border/40 p-0.5 text-xs">
          <button
            onClick={() => setKeyMode('arrows')}
            className={`px-2 py-1 rounded-md transition-colors ${
              keyMode === 'arrows'
                ? 'bg-[#FF5A1F] text-white font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Arrows
          </button>
          <button
            onClick={() => setKeyMode('pages')}
            className={`px-2 py-1 rounded-md transition-colors ${
              keyMode === 'pages'
                ? 'bg-[#FF5A1F] text-white font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            PgUp/Dn
          </button>
        </div>
      </div>

      {/* Presentation Timer Bar */}
      <div className="bg-card border border-border/40 rounded-2xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold font-mono text-foreground tracking-tight">
            {formatTimer(elapsedSeconds)}
          </div>
          {laps.length > 0 && (
            <div className="text-[11px] font-mono text-muted-foreground">
              Lap {laps.length}: {formatTimer(laps[0])}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTimer}
            className={`p-2.5 rounded-xl text-white transition-colors ${
              timerRunning
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {timerRunning ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
          </button>
          <button
            onClick={handleLap}
            disabled={!timerRunning}
            className="p-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors disabled:opacity-40"
          >
            <Flag size={16} />
          </button>
          <button
            onClick={handleResetTimer}
            className="p-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowCounterClockwise size={16} />
          </button>
        </div>
      </div>

      {/* Primary Slide Controls (Big Touch Buttons) */}
      <div className="grid grid-cols-2 gap-3 min-h-[200px]">
        {/* Previous Slide */}
        <button
          onClick={handlePrev}
          className="rounded-3xl bg-card border-2 border-border/40 flex flex-col items-center justify-center gap-2 p-6 hover:bg-secondary/30 active:scale-[0.98] active:border-[#FF5A1F] transition-all select-none"
        >
          <CaretLeft size={48} weight="bold" className="text-muted-foreground" />
          <span className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
            Previous
          </span>
          <span className="text-[11px] text-muted-foreground/60 font-mono">
            {keyMode === 'arrows' ? '← Left Arrow' : 'Page Up'}
          </span>
        </button>

        {/* Next Slide */}
        <button
          onClick={handleNext}
          className="rounded-3xl bg-[#FF5A1F] text-white flex flex-col items-center justify-center gap-2 p-6 shadow-xl hover:brightness-110 active:scale-[0.98] transition-all select-none"
        >
          <CaretRight size={48} weight="bold" className="text-white" />
          <span className="text-sm font-bold tracking-wider uppercase">Next Slide</span>
          <span className="text-[11px] text-white/80 font-mono">
            {keyMode === 'arrows' ? 'Right Arrow →' : 'Page Down'}
          </span>
        </button>
      </div>

      {/* Presentation Control Actions */}
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={handleStartSlides}
          className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-1.5 hover:bg-secondary/40 active:scale-[0.98] transition-all"
        >
          <Play size={18} className="text-emerald-400" />
          <span className="text-xs font-medium text-foreground">Start</span>
          <span className="text-[10px] text-muted-foreground font-mono">F5</span>
        </button>

        <button
          onClick={handleEndSlides}
          className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-1.5 hover:bg-secondary/40 active:scale-[0.98] transition-all"
        >
          <Stop size={18} className="text-red-400" />
          <span className="text-xs font-medium text-foreground">End</span>
          <span className="text-[10px] text-muted-foreground font-mono">Esc</span>
        </button>

        <button
          onClick={handleBlackScreen}
          className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-1.5 hover:bg-secondary/40 active:scale-[0.98] transition-all"
        >
          <div className="w-4 h-4 rounded bg-black border border-white/20" />
          <span className="text-xs font-medium text-foreground">Black</span>
          <span className="text-[10px] text-muted-foreground font-mono">B</span>
        </button>

        <button
          onClick={handleWhiteScreen}
          className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-1.5 hover:bg-secondary/40 active:scale-[0.98] transition-all"
        >
          <div className="w-4 h-4 rounded bg-white" />
          <span className="text-xs font-medium text-foreground">White</span>
          <span className="text-[10px] text-muted-foreground font-mono">W</span>
        </button>
      </div>

      {/* Laser Pointer Mode */}
      <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Crosshair size={16} className="text-[#FF5A1F]" />
              <span>Laser Pointer Mode</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Guide the mouse cursor smoothly across your slides.
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              setLaserMode((prev) => !prev);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              laserMode
                ? 'bg-[#FF5A1F] text-white'
                : 'bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {laserMode ? 'Laser Active' : 'Enable'}
          </button>
        </div>

        {laserMode && (
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full h-32 rounded-xl bg-black border border-[#FF5A1F]/30 flex flex-col items-center justify-center text-center p-4 touch-none select-none cursor-crosshair relative overflow-hidden"
          >
            <div className="w-3 h-3 rounded-full bg-[#FF5A1F] animate-ping opacity-60 absolute" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5A1F] shadow-[0_0_12px_#FF5A1F] mb-2" />
            <span className="text-xs font-medium text-white/90">Touch & Drag to Move Pointer</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Reuses precision trackpad engine
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
