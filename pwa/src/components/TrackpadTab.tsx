import React, { useRef, useState } from 'react';
import { GlassCard, GlowButton, Slider } from '@ui';
import { triggerHaptic } from '../utils/haptics';

export interface TrackpadTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right') => void;
  sendScroll: (dy: number) => void;
}

export const TrackpadTab: React.FC<TrackpadTabProps> = ({
  sendMove,
  sendClick,
  sendScroll,
}) => {
  const [sensitivity, setSensitivity] = useState(() => {
    try {
      const saved = localStorage.getItem('aerokin_trackpad_sens');
      return saved ? parseFloat(saved) : 1.4;
    } catch {
      return 1.4;
    }
  });

  const [showSettings, setShowSettings] = useState(false);

  const prevTouchRef = useRef<{ x: number; y: number }[]>([]);
  const touchMetaRef = useRef({
    startTime: 0,
    maxTouchCount: 1,
    distanceMoved: 0,
  });

  const handleSensitivityChange = (val: number) => {
    setSensitivity(val);
    localStorage.setItem('aerokin_trackpad_sens', val.toString());
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touches = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
    prevTouchRef.current = touches;
    touchMetaRef.current = {
      startTime: Date.now(),
      maxTouchCount: e.touches.length,
      distanceMoved: 0,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const count = e.touches.length;
    if (count > touchMetaRef.current.maxTouchCount) {
      touchMetaRef.current.maxTouchCount = count;
    }

    const prev = prevTouchRef.current;
    if (prev.length === 0) {
      prevTouchRef.current = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
      return;
    }

    if (count === 1 && prev.length >= 1) {
      // One-finger Drag: Mouse Move with dynamic velocity acceleration
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - prev[0].x;
      const dy = currentY - prev[0].y;
      const dist = Math.hypot(dx, dy);

      touchMetaRef.current.distanceMoved += dist;

      // Acceleration curve
      const accel = 1 + Math.min(dist / 14, 2.8);
      sendMove(Math.round(dx * sensitivity * accel), Math.round(dy * sensitivity * accel));

      prevTouchRef.current = [{ x: currentX, y: currentY }];
    } else if (count === 2 && prev.length >= 2) {
      // Two-finger Drag: Vertical Scroll
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const prevAvgY = (prev[0].y + prev[1].y) / 2;
      const deltaY = -(avgY - prevAvgY); // Natural scrolling

      touchMetaRef.current.distanceMoved += Math.abs(deltaY);

      if (Math.abs(deltaY) >= 1) {
        sendScroll(Math.round(deltaY * 2.2));
      }

      prevTouchRef.current = [
        { x: e.touches[0].clientX, y: e.touches[0].clientY },
        { x: e.touches[1].clientX, y: e.touches[1].clientY },
      ];
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Check if this interaction was a quick stationary tap (< 220ms, < 10px moved)
    const { startTime, maxTouchCount, distanceMoved } = touchMetaRef.current;
    const elapsed = Date.now() - startTime;

    if (e.touches.length === 0) {
      if (elapsed < 240 && distanceMoved < 10) {
        if (maxTouchCount === 1) {
          // One-finger tap = Left Click
          triggerHaptic('medium');
          sendClick('left');
        } else if (maxTouchCount === 2) {
          // Two-finger tap = Right Click
          triggerHaptic('heavy');
          sendClick('right');
        }
      }
      prevTouchRef.current = [];
    }
  };

  return (
    <div className="flex flex-col h-full w-full justify-between gap-3 p-4">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
          PRECISION TRACKPAD
        </span>

        <button
          onClick={() => {
            triggerHaptic('light');
            setShowSettings(!showSettings);
          }}
          className={`px-3 py-1 rounded-xl border text-xs font-mono transition-colors ${
            showSettings
              ? 'bg-aerokin-cyan/20 border-aerokin-cyan/40 text-aerokin-cyan'
              : 'bg-white/[0.04] border-white/10 text-aerokin-muted hover:text-white'
          }`}
        >
          {showSettings ? 'Close' : 'Speed ⚙'}
        </button>
      </div>

      {showSettings ? (
        <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
          <Slider
            label="Trackpad Pointer Speed"
            value={sensitivity}
            onChange={handleSensitivityChange}
            min={0.6}
            max={3.0}
            step={0.1}
            unit="x"
          />
        </GlassCard>
      ) : null}

      {/* Main Trackpad Glass Surface */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full flex-1 rounded-3xl bg-aerokin-surface border border-aerokin-border flex flex-col items-center justify-center p-6 text-center select-none active:border-aerokin-cyan/40 transition-colors shadow-glass overflow-hidden"
      >
        {/* Top edge specular shine */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Center Guide Graphics */}
        <div className="pointer-events-none flex flex-col items-center opacity-60">
          <div className="h-16 w-16 rounded-2xl border border-dashed border-white/30 flex items-center justify-center mb-3">
            <span className="h-2 w-2 rounded-full bg-aerokin-cyan shadow-glow-cyan" />
          </div>
          <span className="font-sans text-sm font-semibold text-white">
            Touchpad Surface
          </span>
          <span className="font-mono text-[11px] text-aerokin-muted mt-1 text-center leading-relaxed">
            1-Finger Slide: Move · Tap: Left Click<br />
            2-Finger Slide: Scroll · 2-Finger Tap: Right Click
          </span>
        </div>
      </div>

      {/* Bottom Physical Buttons */}
      <div className="w-full grid grid-cols-2 gap-3">
        <GlowButton
          variant="secondary"
          size="lg"
          onClick={() => {
            triggerHaptic('heavy');
            sendClick('left');
          }}
        >
          Left Click
        </GlowButton>

        <GlowButton
          variant="secondary"
          size="lg"
          onClick={() => {
            triggerHaptic('heavy');
            sendClick('right');
          }}
        >
          Right Click
        </GlowButton>
      </div>
    </div>
  );
};
