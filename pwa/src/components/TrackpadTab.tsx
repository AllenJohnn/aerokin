import React, { useRef, useState, useEffect, useCallback } from 'react';
import { triggerHaptic } from '../utils/haptics';
import { useGesture } from '@use-gesture/react';

interface TrackpadTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right' | 'middle') => void;
  sendButton: (button: 'left' | 'right' | 'middle', state: 'down' | 'up') => void;
  sendScroll: (dy: number, dx?: number) => void;
  isConnected: boolean;
  onOpenSettings: () => void;
}

const STORAGE_HINT_SEEN = 'aerokin_trackpad_hint_seen';

export const TrackpadTab: React.FC<TrackpadTabProps> = ({
  sendMove,
  sendClick,
  sendButton,
  sendScroll,
  isConnected,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);

  // Remainder accumulation for sub-pixel accuracy
  const remainderXRef = useRef(0);
  const remainderYRef = useRef(0);
  const scrollRemainderRef = useRef(0);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const lastTapTimeRef = useRef(0);
  const isInertiaActiveRef = useRef(false);
  const inertiaAnimRef = useRef<number | null>(null);

  // Hint visibility: fades out after first use
  const [showHint, setShowHint] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !localStorage.getItem(STORAGE_HINT_SEEN);
  });

  const dismissHint = useCallback(() => {
    if (showHint) {
      setShowHint(false);
      localStorage.setItem(STORAGE_HINT_SEEN, 'true');
    }
  }, [showHint]);

  // Stop active inertia
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

  // Bind trackpad gestures
  const bind = useGesture(
    {
      onDragStart: () => {
        stopInertia();
        dismissHint();
      },
      onDrag: ({
        delta: [dx, dy],
        velocity: [vx, vy],
        touches,
        elapsedTime,
        distance: [distX, distY],
        active,
        first,
        last,
      }) => {
        if (!isConnected) return;

        // Two-Finger Gestures (Scroll or Right Click)
        if (touches >= 2) {
          if (last && elapsedTime < 180 && Math.hypot(distX, distY) < 6) {
            sendClick('right');
            triggerHaptic('medium');
            return;
          }

          flushScroll(dy * 0.4);
          return;
        }

        // Single-Finger Gestures
        if (first) {
          const now = performance.now();
          if (now - lastTapTimeRef.current < 280) {
            setIsDragging(true);
            sendButton('left', 'down');
            triggerHaptic('heavy');
          }
        }

        if (active) {
          const speed = Math.hypot(vx, vy);
          const accel = 1.0 + Math.min(2.5, speed * 1.25);
          flushMove(dx * accel, dy * accel);
        }

        if (last) {
          const totalDist = Math.hypot(distX, distY);
          const now = performance.now();

          if (elapsedTime < 180 && totalDist < 6) {
            if (!isDragging) {
              sendClick('left');
              triggerHaptic('light');
              lastTapTimeRef.current = now;
            }
          }

          if (isDragging) {
            setIsDragging(false);
            sendButton('left', 'up');
            triggerHaptic('medium');
            lastTapTimeRef.current = 0;
          }

          if (touches >= 2 && Math.abs(vy) > 0.4) {
            isInertiaActiveRef.current = true;
            let currentVy = vy * 12.0 * Math.sign(dy);

            const stepInertia = () => {
              if (!isInertiaActiveRef.current || Math.abs(currentVy) < 0.5) {
                stopInertia();
                return;
              }
              flushScroll(currentVy);
              currentVy *= 0.92;
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

  const handleLeftClickBar = () => {
    sendClick('left');
    triggerHaptic('light');
    dismissHint();
  };

  const handleRightClickBar = () => {
    sendClick('right');
    triggerHaptic('medium');
    dismissHint();
  };

  return (
    <div className="flex-1 flex flex-col justify-between px-gutter py-3 w-full h-full select-none max-w-lg mx-auto">
      {/* Plain surface with subtle hint that fades after first use */}
      <div
        ref={padRef}
        {...bind()}
        className={`relative flex-1 w-full rounded-2xl bg-surface border border-border flex flex-col items-center justify-center p-6 select-none touch-none transition-colors ${
          isDragging ? 'border-optic-red' : ''
        }`}
      >
        {/* Drag status indicator (optic red ONLY when active drag is engaged) */}
        {isDragging && (
          <div className="absolute top-4 left-4 flex items-center gap-1.5 text-xs text-optic-red font-medium">
            <span className="w-2 h-2 rounded-full bg-optic-red" />
            <span>Dragging</span>
          </div>
        )}

        {/* Subtle hint that fades after first use */}
        <div
          className={`pointer-events-none text-center transition-opacity duration-300 ${
            showHint ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p className="text-sm font-medium text-foreground">
            Precision trackpad
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            1-finger move · 2-finger scroll · Tap to click
          </p>
        </div>
      </div>

      {/* Left and right click bars at the bottom */}
      <div className="flex items-center gap-3 pt-3">
        <button
          onClick={handleLeftClickBar}
          className="h-12 flex-1 rounded-xl border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-transform active:scale-[0.97] min-h-[48px]"
        >
          Left click
        </button>

        <button
          onClick={handleRightClickBar}
          className="h-12 flex-1 rounded-xl border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-transform active:scale-[0.97] min-h-[48px]"
        >
          Right click
        </button>
      </div>
    </div>
  );
};
