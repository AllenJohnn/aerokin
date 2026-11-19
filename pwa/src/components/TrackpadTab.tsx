import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Keyboard, X } from '@phosphor-icons/react';
import { triggerHaptic } from '../utils/haptics';
import {
  TrackpadGestureEngine,
  TrackpadIntent,
  TrackpadConfig,
  loadTrackpadConfig,
} from '../engine/trackpadGestures';

interface TrackpadTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right' | 'middle') => void;
  sendButton: (button: 'left' | 'right' | 'middle', state: 'down' | 'up') => void;
  sendScroll: (dy: number, dx?: number) => void;
  sendKey?: (key: string, action?: 'down' | 'up' | 'tap', modifiers?: string[]) => void;
  sendText?: (text: string) => void;
  isConnected: boolean;
  onOpenSettings: () => void;
  trackpadConfig?: TrackpadConfig;
}

const STORAGE_HINT_SEEN = 'aerokin_trackpad_hint_seen';

export const TrackpadTab: React.FC<TrackpadTabProps> = ({
  sendMove,
  sendClick,
  sendButton,
  sendScroll,
  sendKey,
  sendText,
  isConnected,
  trackpadConfig,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const engineRef = useRef<TrackpadGestureEngine | null>(null);

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [latchedModifiers, setLatchedModifiers] = useState<Record<string, boolean>>({
    ctrl: false,
    alt: false,
    shift: false,
    win: false,
  });

  const toggleModifier = (mod: 'ctrl' | 'alt' | 'shift' | 'win') => {
    triggerHaptic('light');
    setLatchedModifiers((prev) => ({ ...prev, [mod]: !prev[mod] }));
  };

  const getActiveModifiers = useCallback((): string[] => {
    return Object.entries(latchedModifiers)
      .filter(([_, active]) => active)
      .map(([mod]) => mod);
  }, [latchedModifiers]);

  const clearLatchedModifiers = useCallback(() => {
    setLatchedModifiers({
      ctrl: false,
      alt: false,
      shift: false,
      win: false,
    });
  }, []);

  const handleKeyTap = (key: string) => {
    triggerHaptic('light');
    if (isConnected && sendKey) {
      sendKey(key, 'tap', getActiveModifiers());
    }
    clearLatchedModifiers();
  };

  const handleToggleKeyboard = () => {
    triggerHaptic('light');
    setShowKeyboard((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => hiddenInputRef.current?.focus(), 60);
      } else {
        hiddenInputRef.current?.blur();
      }
      return next;
    });
    dismissHint();
  };

  if (!engineRef.current) {
    engineRef.current = new TrackpadGestureEngine(trackpadConfig || loadTrackpadConfig());
  }

  useEffect(() => {
    if (trackpadConfig && engineRef.current) {
      engineRef.current.updateConfig(trackpadConfig);
    }
  }, [trackpadConfig]);

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
          case 'shortcut':
            if (isConnected && sendKey) {
              if (intent.action === 'task_view') {
                sendKey('Tab', 'tap', ['win']);
              } else if (intent.action === 'show_desktop') {
                sendKey('d', 'tap', ['win']);
              } else if (intent.action === 'app_switch_next') {
                sendKey('Tab', 'tap', ['alt']);
              } else if (intent.action === 'app_switch_prev') {
                sendKey('Tab', 'tap', ['alt', 'shift']);
              }
            }
            break;
        }
      }
    },
    [isConnected, sendMove, sendClick, sendButton, sendScroll, sendKey]
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
    const coalesced =
      typeof (e.nativeEvent as any)?.getCoalescedEvents === 'function'
        ? (e.nativeEvent as any).getCoalescedEvents()
        : null;

    if (coalesced && coalesced.length > 1) {
      for (const ce of coalesced) {
        const intents =
          engineRef.current?.processEvent({
            type: 'move',
            id: ce.pointerId,
            x: ce.clientX,
            y: ce.clientY,
            time: performance.now(),
          }) || [];
        dispatchIntents(intents);
      }
      return;
    }

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
    <div className="relative flex-1 flex flex-col justify-between px-gutter py-3 w-full h-full select-none max-w-lg mx-auto">
      {/* Hidden iOS Virtual Keyboard Input */}
      <input
        ref={hiddenInputRef}
        type="text"
        className="absolute opacity-0 pointer-events-none -top-10 left-0 w-1 h-1"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        onChange={(e) => {
          const val = e.target.value;
          if (val) {
            if (isConnected && sendText) {
              sendText(val);
            }
            e.target.value = '';
          }
        }}
        onKeyDown={(e) => {
          const key = e.key;
          const lowerKey = key.toLowerCase();

          const keyMap: Record<string, string> = {
            Backspace: 'backspace',
            Enter: 'enter',
            Tab: 'tab',
            Escape: 'escape',
            Esc: 'escape',
            ArrowUp: 'arrowup',
            ArrowDown: 'arrowdown',
            ArrowLeft: 'arrowleft',
            ArrowRight: 'arrowright',
            Delete: 'delete',
            Home: 'home',
            End: 'end',
            PageUp: 'pageup',
            PageDown: 'pagedown',
            Insert: 'insert',
          };

          const hasPhysicalMod = e.ctrlKey || e.altKey || e.metaKey;
          const mods: string[] = [];
          if (e.ctrlKey) mods.push('ctrl');
          if (e.altKey) mods.push('alt');
          if (e.shiftKey) mods.push('shift');
          if (e.metaKey) mods.push('win');

          for (const m of getActiveModifiers()) {
            if (!mods.includes(m)) mods.push(m);
          }

          if (keyMap[key]) {
            e.preventDefault();
            if (isConnected && sendKey) {
              sendKey(keyMap[key], 'tap', mods);
            }
            clearLatchedModifiers();
            return;
          }

          if (hasPhysicalMod && key.length === 1) {
            e.preventDefault();
            if (isConnected && sendKey) {
              sendKey(lowerKey, 'tap', mods);
            }
            clearLatchedModifiers();
            return;
          }
        }}
      />

      {/* Floating Virtual Keyboard & Shortcut Bar */}
      <AnimatePresence>
        {showKeyboard && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute top-3 left-1/2 -translate-x-1/2 w-[95%] max-w-lg bg-[#0A0A0E]/95 border border-border/80 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl z-30 flex flex-col gap-2"
          >
            {/* Row 1: Sticky Modifiers, Keyboard Focus, Close */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 flex-1 overflow-x-auto py-0.5 no-scrollbar">
                {(['ctrl', 'alt', 'shift', 'win'] as const).map((mod) => {
                  const isLatched = latchedModifiers[mod];
                  return (
                    <button
                      key={mod}
                      onClick={() => toggleModifier(mod)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all shrink-0 ${
                        isLatched
                          ? 'bg-accent text-black shadow-sm'
                          : 'bg-surface border border-border text-foreground hover:border-accent'
                      }`}
                    >
                      {mod.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              {/* Native iOS text input trigger */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  hiddenInputRef.current?.focus();
                }}
                className="px-2.5 py-1 rounded-lg bg-surface border border-border text-foreground text-[11px] font-medium hover:border-accent shrink-0 flex items-center gap-1"
              >
                <Keyboard size={13} />
                <span>Type</span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowKeyboard(false);
                  hiddenInputRef.current?.blur();
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-raised transition-colors shrink-0"
                aria-label="Close keyboard bar"
              >
                <X size={15} />
              </button>
            </div>

            {/* Row 2: PC Navigation & Action Keys */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
              {[
                { label: 'Esc', key: 'escape' },
                { label: 'Tab', key: 'tab' },
                { label: 'Enter', key: 'enter' },
                { label: '⌫', key: 'backspace' },
                { label: 'Del', key: 'delete' },
                { label: 'Space', key: 'space' },
                { label: '←', key: 'arrowleft' },
                { label: '↑', key: 'arrowup' },
                { label: '↓', key: 'arrowdown' },
                { label: '→', key: 'arrowright' },
              ].map((k) => (
                <button
                  key={k.key}
                  onClick={() => handleKeyTap(k.key)}
                  className="px-2 py-1 rounded-md bg-surface/80 border border-border/70 text-foreground text-[11px] font-mono hover:bg-raised active:scale-95 transition-transform shrink-0"
                >
                  {k.label}
                </button>
              ))}
            </div>

            {/* Row 3: Shortcut Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
              {[
                { label: 'Ctrl+C', key: 'c', mods: ['ctrl'] },
                { label: 'Ctrl+V', key: 'v', mods: ['ctrl'] },
                { label: 'Ctrl+Z', key: 'z', mods: ['ctrl'] },
                { label: 'Ctrl+A', key: 'a', mods: ['ctrl'] },
                { label: 'Alt+Tab', key: 'tab', mods: ['alt'] },
                { label: 'Win+D', key: 'd', mods: ['win'] },
              ].map((sc) => (
                <button
                  key={sc.label}
                  onClick={() => {
                    triggerHaptic('light');
                    if (isConnected && sendKey) {
                      sendKey(sc.key, 'tap', sc.mods);
                    }
                  }}
                  className="px-2 py-1 rounded-md bg-raised border border-border/60 text-muted-foreground hover:text-foreground text-[10px] font-mono hover:border-border active:scale-95 transition-transform shrink-0"
                >
                  {sc.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <p className="text-sm font-medium text-foreground">Precision trackpad</p>
          <p className="text-xs text-muted-foreground mt-1">
            1-finger move · 2-finger scroll · 3-finger swipe
          </p>
        </div>
      </div>

      {/* Left, Keyboard, and Right click bars at the bottom */}
      <div className="flex items-center gap-2.5 pt-3">
        <button
          onClick={handleLeftClickBar}
          className="h-12 flex-1 rounded-xl border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-transform active:scale-[0.97] min-h-[48px]"
        >
          Left click
        </button>

        <button
          onClick={handleToggleKeyboard}
          aria-label="Toggle floating keyboard"
          title="Virtual Keyboard & Shortcuts"
          className={`h-12 w-12 rounded-xl border flex items-center justify-center transition-all active:scale-[0.95] min-h-[48px] shrink-0 ${
            showKeyboard
              ? 'bg-accent/15 border-accent text-accent shadow-sm'
              : 'border-border bg-raised hover:bg-border text-foreground'
          }`}
        >
          <Keyboard size={20} />
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
