import React, { useRef, useState, useEffect, useCallback } from 'react';
import { triggerHaptic } from '../utils/haptics';
import { useGesture } from '@use-gesture/react';
import { HandPointing, ArrowsVertical, Cursor } from '@phosphor-icons/react';

interface TrackpadTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right' | 'middle') => void;
  sendButton: (button: 'left' | 'right' | 'middle', state: 'down' | 'up') => void;
  sendScroll: (dy: number, dx?: number) => void;
  isConnected: boolean;
  onOpenSettings: () => void;
}

export const TrackpadTab: React.FC<TrackpadTabProps> = ({
  sendMove,
  sendClick,
  sendButton,
  sendScroll,
  isConnected,
  onOpenSettings,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);

  // Remainder accumulation for sub-pixel accuracy
  const remainderXRef = useRef(0);
  const remainderYRef = useRef(0);
  const scrollRemainderRef = useRef(0);

  // Drag-and-drop state (tap then hold-drag)
  const [isDragging, setIsDragging] = useState(false);
  const lastTapTimeRef = useRef(0);
  const isInertiaActiveRef = useRef(false);
  const inertiaAnimRef = useRef<number | null>(null);

  // Stop any active inertia immediately upon new interaction
  const stopInertia = useCallback(() => {
    isInertiaActiveRef.current = false;
    if (inertiaAnimRef.current !== null) {
      cancelAnimationFrame(inertiaAnimRef.current);
      inertiaAnimRef.current = null;
    }
  }, []);

  // Flush accumulated move deltas
  const flushMove = useCallback(
    (dx: number, dy: number) => {
      if (!isConnected) return;

      const totalX = dx + remainderXRef.current;
      const totalY = dy + remainderYRef.current;

      const sendX = Math.round(totalX * 100) / 100;
      const sendY = Math.round(totalY * 100) / 100;

      if (Math.abs(sendX) >= 0.05 || Math.abs(sendY) >= 0.05) {
        remainderXRef.current = totalX - sendX;
        remainderYRef.current = totalY - sendY;
        sendMove(sendX, sendY);
      } else {
        remainderXRef.current = totalX;
        remainderYRef.current = totalY;
      }
    },
    [sendMove, isConnected]
  );

  // Flush accumulated scroll deltas
  const flushScroll = useCallback(
    (dy: number) => {
      if (!isConnected) return;

      const total = dy + scrollRemainderRef.current;
      const sendVal = Math.trunc(total);

      if (sendVal !== 0) {
        scrollRemainderRef.current = total - sendVal;
        sendScroll(sendVal);
        triggerHaptic('detent');
      } else {
        scrollRemainderRef.current = total;
      }
    },
    [sendScroll, isConnected]
  );

  // Bind trackpad gestures with @use-gesture/react
  const bind = useGesture(
    {
      onDragStart: ({ event }) => {
        stopInertia();
      },
      onDrag: ({
        delta: [dx, dy],
        velocity: [vx, vy],
        touches,
        tap,
        elapsedTime,
        distance: [distX, distY],
        active,
        first,
        last,
      }) => {
        if (!isConnected) return;

        // Two-Finger Gestures (Scroll or Right Click)
        if (touches >= 2) {
          // If released quickly as a two-finger tap (< 180ms, < 6px): right click
          if (last && elapsedTime < 180 && Math.hypot(distX, distY) < 6) {
            sendClick('right');
            triggerHaptic('medium');
            return;
          }

          // Two-finger scroll: accumulate vertical delta (scaled for feel)
          flushScroll(dy * 0.4);
          return;
        }

        // Single-Finger Gestures
        if (first) {
          const now = performance.now();
          // Check for tap-then-hold within 280ms to engage drag
          if (now - lastTapTimeRef.current < 280) {
            setIsDragging(true);
            sendButton('left', 'down');
            triggerHaptic('heavy');
          }
        }

        if (active) {
          // Velocity-based acceleration curve (in px/ms)
          const speed = Math.hypot(vx, vy); // px/ms
          const accel = 1.0 + Math.min(2.5, speed * 1.25);

          const moveX = dx * accel;
          const moveY = dy * accel;

          flushMove(moveX, moveY);
        }

        if (last) {
          const totalDist = Math.hypot(distX, distY);
          const now = performance.now();

          // Handle single-finger tap (< 180ms, < 6px)
          if (elapsedTime < 180 && totalDist < 6) {
            if (!isDragging) {
              sendClick('left');
              triggerHaptic('light');
              lastTapTimeRef.current = now;
            }
          }

          // Release drag state if active
          if (isDragging) {
            setIsDragging(false);
            sendButton('left', 'up');
            triggerHaptic('medium');
            lastTapTimeRef.current = 0;
          }

          // Two-finger inertia scroll on release
          if (touches >= 2 && Math.abs(vy) > 0.4) {
            isInertiaActiveRef.current = true;
            let currentVy = vy * 12.0 * Math.sign(dy);

            const stepInertia = () => {
              if (!isInertiaActiveRef.current || Math.abs(currentVy) < 0.5) {
                stopInertia();
                return;
              }
              flushScroll(currentVy);
              currentVy *= 0.92; // Friction decay
              inertiaAnimRef.current = requestAnimationFrame(stepInertia);
            };
            inertiaAnimRef.current = requestAnimationFrame(stepInertia);
          }
        }
      },
    },
    {
      drag: {
        filterTaps: false,
        pointer: { capture: true },
        preventScroll: true,
      },
    }
  );

  useEffect(() => {
    return () => {
      stopInertia();
      if (isDragging) {
        sendButton('left', 'up');
      }
    };
  }, [stopInertia, isDragging, sendButton]);

  return (
    <div className="flex-1 flex flex-col justify-between p-4 max-w-md mx-auto w-full h-full select-none">
      {/* Top Trackpad Header Strip */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-hw-surface border border-hw-border shadow-hw-well mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full transition-all ${
              isDragging
                ? 'bg-hw-active shadow-[0_0_8px_var(--hw-active)]'
                : 'bg-hw-primary shadow-[0_0_6px_var(--hw-primary)]'
            }`}
          />
          <span className="font-display font-bold uppercase text-[11px] tracking-wider text-hw-text">
            {isDragging ? 'DRAG ENGAGED (HOLDING BUTTON)' : 'PRECISION TRACKPAD'}
          </span>
        </div>

        <div className="font-mono text-[10px] text-hw-text-dim">
          1-FINGER MOVE · 2-FINGER SCROLL
        </div>
      </div>

      {/* Main Machined Anodized Trackpad Surface */}
      <div
        ref={padRef}
        {...bind()}
        className={`flex-1 rounded-2xl border transition-all cursor-crosshair select-none touch-none relative overflow-hidden flex flex-col items-center justify-center p-6 ${
          isDragging
            ? 'bg-hw-surface-hl border-hw-active shadow-hw-btn-pressed'
            : 'bg-hw-surface-sunken border-hw-border-milled shadow-hw-well active:border-hw-primary/60'
        }`}
      >
        {/* Subtle Machined Milled Edge Accent */}
        <div className="absolute inset-2 rounded-xl border border-white/5 pointer-events-none" />

        {/* Center Target Crosshair */}
        <div className="w-20 h-20 rounded-full border border-white/5 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center">
            <div
              className={`w-2 h-2 rounded-full transition-colors ${
                isDragging ? 'bg-hw-active shadow-[0_0_8px_var(--hw-active)]' : 'bg-white/20'
              }`}
            />
          </div>
        </div>

        {/* Instruction Badge */}
        <div className="absolute bottom-4 font-mono text-[10px] text-hw-text-dim text-center space-y-0.5 pointer-events-none">
          <div>Tap = Left Click · 2-Finger Tap = Right Click</div>
          <div>Double-Tap & Hold = Drag & Drop</div>
        </div>
      </div>

      {/* Bottom Tactile Bar */}
      <div className="flex items-center justify-between pt-3 text-[11px] font-mono text-hw-text-muted">
        <span>ACCELERATION: VELOCITY-BASED</span>
        <button
          onClick={onOpenSettings}
          className="hover:text-hw-text underline underline-offset-4 decoration-hw-border hover:decoration-hw-primary transition-all"
        >
          CONFIGURE CONTROLS
        </button>
      </div>
    </div>
  );
};
