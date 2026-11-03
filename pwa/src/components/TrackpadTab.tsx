import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard, GlowButton, Slider } from '@ui';
import { triggerHaptic } from '../utils/haptics';
import { SlidersHorizontal, MousePointer } from 'lucide-react';

export interface TrackpadTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right') => void;
  sendScroll: (dy: number) => void;
}

interface TouchPoint {
  id: number;
  x: number;
  y: number;
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
  const [activeTouches, setActiveTouches] = useState<TouchPoint[]>([]);

  const prevTouchRef = useRef<{ x: number; y: number }[]>([]);
  const touchMetaRef = useRef({
    startTime: 0,
    maxTouchCount: 1,
    distanceMoved: 0,
    velocity: { vx: 0, vy: 0 },
  });

  const momentumAnimRef = useRef<number | null>(null);

  const handleSensitivityChange = (val: number) => {
    setSensitivity(val);
    localStorage.setItem('aerokin_trackpad_sens', val.toString());
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Cancel any running momentum decay
    if (momentumAnimRef.current) {
      cancelAnimationFrame(momentumAnimRef.current);
      momentumAnimRef.current = null;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const touches = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
    prevTouchRef.current = touches;

    const localTouches = Array.from(e.touches).map((t, idx) => ({
      id: idx,
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    }));
    setActiveTouches(localTouches);

    touchMetaRef.current = {
      startTime: Date.now(),
      maxTouchCount: e.touches.length,
      distanceMoved: 0,
      velocity: { vx: 0, vy: 0 },
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const count = e.touches.length;

    if (count > touchMetaRef.current.maxTouchCount) {
      touchMetaRef.current.maxTouchCount = count;
    }

    const localTouches = Array.from(e.touches).map((t, idx) => ({
      id: idx,
      x: t.clientX - rect.left,
      y: t.clientY - rect.top,
    }));
    setActiveTouches(localTouches);

    const prev = prevTouchRef.current;
    if (prev.length === 0) {
      prevTouchRef.current = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
      return;
    }

    if (count === 1 && prev.length >= 1) {
      // 1-Finger Drag: Mouse Move with dynamic velocity acceleration
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const dx = currentX - prev[0].x;
      const dy = currentY - prev[0].y;
      const dist = Math.hypot(dx, dy);

      touchMetaRef.current.distanceMoved += dist;
      touchMetaRef.current.velocity = { vx: dx, vy: dy };

      // Acceleration curve
      const accel = 1 + Math.min(dist / 14, 2.8);
      sendMove(Math.round(dx * sensitivity * accel), Math.round(dy * sensitivity * accel));

      prevTouchRef.current = [{ x: currentX, y: currentY }];
    } else if (count === 2 && prev.length >= 2) {
      // 2-Finger Drag: Vertical Scroll
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const prevAvgY = (prev[0].y + prev[1].y) / 2;
      const deltaY = -(avgY - prevAvgY); // Natural scrolling direction

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
    const { startTime, maxTouchCount, distanceMoved, velocity } = touchMetaRef.current;
    const elapsed = Date.now() - startTime;

    if (e.touches.length === 0) {
      setActiveTouches([]);

      if (elapsed < 240 && distanceMoved < 10) {
        if (maxTouchCount === 1) {
          // 1-Finger tap: Left Click
          triggerHaptic('medium');
          sendClick('left');
        } else if (maxTouchCount === 2) {
          // 2-Finger tap: Right Click
          triggerHaptic('heavy');
          sendClick('right');
        }
      } else if (distanceMoved >= 10 && (Math.abs(velocity.vx) > 3 || Math.abs(velocity.vy) > 3)) {
        // Momentum release physics
        let vx = velocity.vx * 0.75;
        let vy = velocity.vy * 0.75;

        const decay = () => {
          vx *= 0.88;
          vy *= 0.88;

          if (Math.hypot(vx, vy) > 0.4) {
            sendMove(Math.round(vx * sensitivity), Math.round(vy * sensitivity));
            momentumAnimRef.current = requestAnimationFrame(decay);
          } else {
            momentumAnimRef.current = null;
          }
        };

        momentumAnimRef.current = requestAnimationFrame(decay);
      }

      prevTouchRef.current = [];
    }
  };

  // Cleanup momentum on unmount
  useEffect(() => {
    return () => {
      if (momentumAnimRef.current) {
        cancelAnimationFrame(momentumAnimRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full justify-between gap-3 p-4">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MousePointer className="w-4 h-4 text-aerokin-cyan" />
          <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
            PRECISION TRACKPAD
          </span>
        </div>

        <button
          onClick={() => {
            triggerHaptic('light');
            setShowSettings(!showSettings);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-mono text-aerokin-muted hover:text-white hover:border-aerokin-cyan/40 transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-aerokin-cyan" />
          <span>{showSettings ? 'Close' : 'Speed'}</span>
        </button>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
              <Slider
                label="Pointer Acceleration Scale"
                value={sensitivity}
                onChange={handleSensitivityChange}
                min={0.6}
                max={3.0}
                step={0.1}
                unit="x"
              />
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Glass Trackpad Surface */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full flex-1 rounded-3xl bg-aerokin-surface border border-aerokin-border flex flex-col items-center justify-center p-6 text-center select-none active:border-aerokin-cyan/40 transition-colors shadow-glass overflow-hidden cursor-crosshair touch-none"
      >
        {/* Top edge specular line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent" />

        {/* Dynamic Finger Ripple & Cursor Trail */}
        {activeTouches.map((touch) => (
          <div
            key={touch.id}
            className="pointer-events-none absolute rounded-full bg-aerokin-cyan/25 -translate-x-1/2 -translate-y-1/2 blur-sm animate-pulse"
            style={{
              left: touch.x,
              top: touch.y,
              width: 56,
              height: 56,
            }}
          />
        ))}

        {/* Guide Graphics */}
        <div className="pointer-events-none flex flex-col items-center opacity-65">
          <div className="h-16 w-16 rounded-2xl border border-dashed border-white/25 flex items-center justify-center mb-3">
            <span className="h-2 w-2 rounded-full bg-aerokin-cyan shadow-glow-cyan" />
          </div>
          <span className="font-sans text-sm font-semibold text-white">
            Precision Touch Surface
          </span>
          <span className="font-mono text-[11px] text-aerokin-muted mt-1.5 text-center leading-relaxed">
            1 Finger: Slide to Move · Tap for Left Click<br />
            2 Fingers: Slide to Scroll · Tap for Right Click
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
