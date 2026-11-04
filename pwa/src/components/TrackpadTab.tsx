import React, { useRef, useState, useEffect, useCallback } from 'react';
import { triggerHaptic } from '../utils/haptics';
import {
  TrackpadGestureEngine,
  TrackpadIntent,
  loadTrackpadConfig,
} from '../engine/trackpadGestures';

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
  const engineRef = useRef<TrackpadGestureEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = new TrackpadGestureEngine(loadTrackpadConfig());
  }

  const [isDragging, setIsDragging] = useState(false);
  const momentumAnimRef = useRef<number | null>(null);
  const lastMomentumTimeRef = useRef<number>(0);

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

  // Dispatch recognizer intents to parent callbacks
  const dispatchIntents = useCallback(
    (intents: TrackpadIntent[]) => {
      for (const intent of intents) {
        switch (intent.type) {
          case 'move':
            if (isConnected) sendMove(intent.dx, intent.dy);
            break;
          case 'click':
            if (isConnected) sendClick(intent.button);
            break;
          case 'button':
            if (isConnected) sendButton(intent.button, intent.state);
            break;
          case 'scroll':
            if (isConnected) sendScroll(intent.dy, intent.dx);
            break;
          case 'haptic':
            triggerHaptic(intent.style);
            break;
          case 'drag_status':
            setIsDragging(intent.isDragging);
            break;
        }
      }
    },
    [isConnected, sendMove, sendClick, sendButton, sendScroll]
  );

  // Momentum animation loop (only active if momentum is enabled in config)
  const stopMomentumLoop = useCallback(() => {
    if (momentumAnimRef.current !== null) {
      cancelAnimationFrame(momentumAnimRef.current);
      momentumAnimRef.current = null;
    }
    engineRef.current?.stopMomentum();
  }, []);

  const startMomentumLoop = useCallback(() => {
    if (momentumAnimRef.current !== null) return;
    lastMomentumTimeRef.current = performance.now();

    const step = (now: number) => {
      const dt = Math.min(50, now - lastMomentumTimeRef.current);
      lastMomentumTimeRef.current = now;

      const engine = engineRef.current;
      if (!engine || !engine.isMomentumActive()) {
        momentumAnimRef.current = null;
        return;
      }

      const intents = engine.stepMomentum(dt);
      dispatchIntents(intents);

      if (engine.isMomentumActive()) {
        momentumAnimRef.current = requestAnimationFrame(step);
      } else {
        momentumAnimRef.current = null;
      }
    };

    momentumAnimRef.current = requestAnimationFrame(step);
  }, [dispatchIntents]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dismissHint();
    stopMomentumLoop();

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    const intents =
      engineRef.current?.processEvent({
        type: 'down',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      }) || [];
    dispatchIntents(intents);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const intents =
      engineRef.current?.processEvent({
        type: 'move',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      }) || [];
    dispatchIntents(intents);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const engine = engineRef.current;
    const intents =
      engine?.processEvent({
        type: 'up',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      }) || [];
    dispatchIntents(intents);

    if (engine?.isMomentumActive()) {
      startMomentumLoop();
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    stopMomentumLoop();
    const intents =
      engineRef.current?.processEvent({
        type: 'cancel',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
      }) || [];
    dispatchIntents(intents);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMomentumLoop();
      const intents =
        engineRef.current?.processEvent({
          type: 'cancel',
          id: 0,
          x: 0,
          y: 0,
          time: performance.now(),
        }) || [];
      dispatchIntents(intents);
    };
  }, [stopMomentumLoop, dispatchIntents]);

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
      {/* Precision Trackpad Surface with pointer capture and state machine gesture handling */}
      <div
        ref={padRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'none' }}
        className={`relative flex-1 w-full rounded-2xl bg-surface border border-border flex flex-col items-center justify-center p-6 select-none touch-none overscroll-none transition-colors ${
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
