import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Monitor,
  HandPointing,
  CursorClick,
  Keyboard as KeyboardIcon,
  ArrowsOut,
  ArrowsIn,
  ChartLine,
  X,
  Lock,
  ArrowCounterClockwise,
  Sliders,
  WarningCircle,
  Eye,
  EyeSlash,
} from '@phosphor-icons/react';
import { useDesktopStream } from '../hooks/useDesktopStream';
import {
  MonitorInfo,
  QualityPresetName,
  DesktopSettings,
  DesktopInputMode,
} from '../types/desktop';
import { triggerHaptic } from '../utils/haptics';
import {
  TrackpadGestureEngine,
  TrackpadIntent,
  loadTrackpadConfig,
} from '../engine/trackpadGestures';

export interface DesktopViewerProps {
  host: string | null;
  deviceId: string | null;
  credential: string | null;
  isHosted: boolean;
  active: boolean;
  monitors: MonitorInfo[];
  desktopStatus: {
    state: any;
    monitor?: MonitorInfo;
    stats?: any;
    error?: string;
  };
  desktopSettings: DesktopSettings;
  onUpdateDesktopSettings: (settings: Partial<DesktopSettings>) => void;
  onClose: () => void;
  sendAbsMove: (x: number, y: number, monitorId?: string) => void;
  sendAbsClick: (
    button: 'left' | 'right' | 'middle',
    count?: number,
    x?: number,
    y?: number,
    monitorId?: string
  ) => void;
  sendAbsButton: (
    button: 'left' | 'right' | 'middle',
    state: 'down' | 'up',
    x?: number,
    y?: number,
    monitorId?: string
  ) => void;
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right' | 'middle') => void;
  sendButton: (button: 'left' | 'right' | 'middle', state: 'down' | 'up') => void;
  sendScroll: (dy: number, dx?: number) => void;
  sendKey: (key: string, action?: 'down' | 'up' | 'tap', modifiers?: string[]) => void;
  sendText: (text: string) => void;
  startDesktopStream: (options?: {
    monitorId?: string;
    preset?: QualityPresetName;
    customScale?: number;
    customFps?: number;
    codec?: 'h264' | 'mjpeg';
  }) => void;
  stopDesktopStream: () => void;
  onRunLatencyTest?: () => Promise<{ min: number; avg: number; max: number; p95: number }>;
}

export const DesktopViewer: React.FC<DesktopViewerProps> = ({
  host,
  deviceId,
  credential,
  isHosted,
  active,
  monitors,
  desktopStatus,
  desktopSettings,
  onUpdateDesktopSettings,
  onClose,
  sendAbsMove,
  sendAbsClick,
  sendAbsButton,
  sendMove,
  sendClick,
  sendButton,
  sendScroll,
  sendKey,
  sendText,
  startDesktopStream,
  stopDesktopStream,
  onRunLatencyTest,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);

  const [isRunningLatencyTest, setIsRunningLatencyTest] = useState(false);
  const [latencyTestResult, setLatencyTestResult] = useState<{
    min: number;
    avg: number;
    max: number;
    p95: number;
  } | null>(null);

  // RAF throttlers for mouse/touch pointer moves
  const pendingAbsMoveRef = useRef<{ x: number; y: number } | null>(null);
  const absMoveRafIdRef = useRef<number | null>(null);

  const pendingRelMoveRef = useRef<{ dx: number; dy: number } | null>(null);
  const relMoveRafIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (absMoveRafIdRef.current !== null) cancelAnimationFrame(absMoveRafIdRef.current);
      if (relMoveRafIdRef.current !== null) cancelAnimationFrame(relMoveRafIdRef.current);
    };
  }, []);

  // Stream hook
  const {
    canvasRef,
    streamState,
    streamError,
    stats,
    zoom,
    pan,
    setZoom,
    setPan,
    resetZoomPan,
    toNormalizedMonitorCoords,
    reconnectStream,
  } = useDesktopStream({
    host,
    deviceId,
    credential,
    isHosted,
    active,
    serverState: desktopStatus.state,
    activeMonitor: desktopStatus.monitor,
  });

  // UI state
  const [showToolbar, setShowToolbar] = useState(true);
  const [showKeyBar, setShowKeyBar] = useState(false);
  const [showMonitorMenu, setShowMonitorMenu] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showStats, setShowStats] = useState(desktopSettings.showStats);
  const [inputMode, setInputMode] = useState<DesktopInputMode>(desktopSettings.inputMode);
  const [activePreset, setActivePreset] = useState<QualityPresetName>(
    desktopSettings.defaultPreset
  );
  const [selectedMonitorId, setSelectedMonitorId] = useState<string | undefined>(
    desktopStatus.monitor?.id || monitors.find((m) => m.isPrimary)?.id || monitors[0]?.id
  );

  // Latched sticky modifiers (Ctrl, Alt, Shift, Win)
  const [latchedModifiers, setLatchedModifiers] = useState<Record<string, boolean>>({
    ctrl: false,
    alt: false,
    shift: false,
    win: false,
  });

  // Alt+F4 confirmation dialog
  const [showAltF4Confirm, setShowAltF4Confirm] = useState(false);

  // Orientation notice
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });
  const [dismissPortraitNotice, setDismissPortraitNotice] = useState(false);

  // Auto-hide toolbar timer
  const toolbarTimerRef = useRef<NodeJS.Timeout | null>(null);

  const kickToolbarTimer = useCallback(() => {
    setShowToolbar(true);
    if (!desktopSettings.autoHideToolbar) return;
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    toolbarTimerRef.current = setTimeout(() => {
      setShowToolbar(false);
      setShowMonitorMenu(false);
      setShowPresetMenu(false);
    }, 4000);
  }, [desktopSettings.autoHideToolbar]);

  useEffect(() => {
    kickToolbarTimer();
    return () => {
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current);
    };
  }, [kickToolbarTimer]);

  // Orientation resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Request stream start on mount/active
  useEffect(() => {
    if (active) {
      startDesktopStream({
        monitorId: selectedMonitorId,
        preset: activePreset,
        codec: desktopSettings.preferredCodec || 'h264',
      });
    }
  }, [active, selectedMonitorId, activePreset, desktopSettings.preferredCodec, startDesktopStream]);

  // Fullscreen toggle with iOS fallback
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = async () => {
    triggerHaptic('light');
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
          setIsFullscreen(false);
        }
      }
    } catch {}
  };

  // Keyboard modifier toggle
  const toggleModifier = (mod: 'ctrl' | 'alt' | 'shift' | 'win') => {
    triggerHaptic('medium');
    setLatchedModifiers((prev) => ({
      ...prev,
      [mod]: !prev[mod],
    }));
  };

  const getActiveModifiers = (): string[] => {
    return Object.entries(latchedModifiers)
      .filter(([_, active]) => active)
      .map(([mod]) => mod);
  };

  const clearLatchedModifiers = () => {
    setLatchedModifiers({
      ctrl: false,
      alt: false,
      shift: false,
      win: false,
    });
  };

  // Dispatch key event and clear single-use latched modifiers
  const handleKeyTap = (keyName: string) => {
    triggerHaptic('light');
    const mods = getActiveModifiers();
    sendKey(keyName, 'tap', mods);
    clearLatchedModifiers();
  };

  const handleShortcutChip = (combo: string) => {
    triggerHaptic('medium');
    if (combo === 'Alt+F4') {
      setShowAltF4Confirm(true);
      return;
    }

    const parts = combo.split('+').map((s) => s.trim().toLowerCase());
    const mainKey = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    sendKey(mainKey, 'tap', mods);
  };

  // Touch gesture arbitration for Direct-Touch mode
  const touchStartRef = useRef<{
    time: number;
    clientX: number;
    clientY: number;
    isPinching: boolean;
    initialDistance: number;
    initialZoom: number;
    hasMoved: boolean;
    longPressTimer: NodeJS.Timeout | null;
  }>({
    time: 0,
    clientX: 0,
    clientY: 0,
    isPinching: false,
    initialDistance: 0,
    initialZoom: 1.0,
    hasMoved: false,
    longPressTimer: null,
  });

  const lastTapTimeRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  // Trackpad mode engine overlay instance
  const trackpadEngineRef = useRef<TrackpadGestureEngine | null>(null);
  if (!trackpadEngineRef.current) {
    trackpadEngineRef.current = new TrackpadGestureEngine(loadTrackpadConfig());
  }

  const dispatchTrackpadIntents = useCallback(
    (intents: TrackpadIntent[]) => {
      for (const intent of intents) {
        switch (intent.type) {
          case 'move':
            if (!pendingRelMoveRef.current) {
              pendingRelMoveRef.current = { dx: intent.dx, dy: intent.dy };
            } else {
              pendingRelMoveRef.current.dx += intent.dx;
              pendingRelMoveRef.current.dy += intent.dy;
            }
            if (relMoveRafIdRef.current === null) {
              relMoveRafIdRef.current = requestAnimationFrame(() => {
                relMoveRafIdRef.current = null;
                if (pendingRelMoveRef.current) {
                  sendMove(pendingRelMoveRef.current.dx, pendingRelMoveRef.current.dy);
                  pendingRelMoveRef.current = null;
                }
              });
            }
            break;
          case 'click':
            triggerHaptic('light');
            sendClick(intent.button);
            break;
          case 'button':
            triggerHaptic('medium');
            sendButton(intent.button, intent.state);
            break;
          case 'scroll':
            sendScroll(intent.dy, intent.dx);
            break;
          case 'haptic':
            triggerHaptic(intent.style);
            break;
        }
      }
    },
    [sendMove, sendClick, sendButton, sendScroll]
  );

  // Pointer event handlers for Trackpad mode
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    kickToolbarTimer();
    if (inputMode === 'trackpad') {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
      const intents =
        trackpadEngineRef.current?.processEvent({
          type: 'down',
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          time: performance.now(),
        }) || [];
      dispatchTrackpadIntents(intents);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inputMode === 'trackpad') {
      const intents =
        trackpadEngineRef.current?.processEvent({
          type: 'move',
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          time: performance.now(),
        }) || [];
      dispatchTrackpadIntents(intents);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inputMode === 'trackpad') {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      const intents =
        trackpadEngineRef.current?.processEvent({
          type: 'up',
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          time: performance.now(),
        }) || [];
      dispatchTrackpadIntents(intents);
    }
  };

  // Touch handlers for the canvas container (Direct-Touch Mode)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    kickToolbarTimer();
    if (inputMode === 'trackpad') return;

    // Direct-Touch Mode Gesture Arbitration
    if (e.touches.length === 2) {
      // 2-finger pinch/zoom init
      if (touchStartRef.current.longPressTimer) {
        clearTimeout(touchStartRef.current.longPressTimer);
        touchStartRef.current.longPressTimer = null;
      }
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchStartRef.current = {
        time: Date.now(),
        clientX: (t1.clientX + t2.clientX) / 2,
        clientY: (t1.clientY + t2.clientY) / 2,
        isPinching: true,
        initialDistance: dist || 1,
        initialZoom: zoom,
        hasMoved: false,
        longPressTimer: null,
      };
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      // Start long-press timer (500ms for right-click)
      const timer = setTimeout(() => {
        if (!touchStartRef.current.hasMoved) {
          triggerHaptic('heavy');
          const coords = toNormalizedMonitorCoords(startX, startY);
          if (coords) {
            sendAbsClick('right', 1, coords.x, coords.y, selectedMonitorId);
          }
        }
      }, 500);

      touchStartRef.current = {
        time: Date.now(),
        clientX: startX,
        clientY: startY,
        isPinching: false,
        initialDistance: 0,
        initialZoom: zoom,
        hasMoved: false,
        longPressTimer: timer,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    kickToolbarTimer();
    if (inputMode === 'trackpad') return;

    // Direct-Touch 2-finger pinch zoom
    if (e.touches.length === 2 && touchStartRef.current.isPinching) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = dist / (touchStartRef.current.initialDistance || 1);
      const newZoom = Math.max(1.0, Math.min(4.0, touchStartRef.current.initialZoom * ratio));
      setZoom(newZoom);

      // Pan with 2-finger midpoint delta
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dx = midX - touchStartRef.current.clientX;
      const dy = midY - touchStartRef.current.clientY;
      touchStartRef.current.clientX = midX;
      touchStartRef.current.clientY = midY;

      if (newZoom > 1.0) {
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      } else {
        setPan({ x: 0, y: 0 });
      }
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dist = Math.hypot(
        touch.clientX - touchStartRef.current.clientX,
        touch.clientY - touchStartRef.current.clientY
      );

      if (dist > 8) {
        touchStartRef.current.hasMoved = true;
        if (touchStartRef.current.longPressTimer) {
          clearTimeout(touchStartRef.current.longPressTimer);
          touchStartRef.current.longPressTimer = null;
        }

        // If zoomed in, 1-finger move pans the view
        if (zoom > 1.05) {
          const dx = touch.clientX - touchStartRef.current.clientX;
          const dy = touch.clientY - touchStartRef.current.clientY;
          touchStartRef.current.clientX = touch.clientX;
          touchStartRef.current.clientY = touch.clientY;
          setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
          return;
        }

        // In 1x scale, dragging sends mouse drag
        const coords = toNormalizedMonitorCoords(touch.clientX, touch.clientY);
        if (coords) {
          if (!isDraggingRef.current) {
            isDraggingRef.current = true;
            sendAbsButton('left', 'down', coords.x, coords.y, selectedMonitorId);
          } else {
            pendingAbsMoveRef.current = { x: coords.x, y: coords.y };
            if (absMoveRafIdRef.current === null) {
              absMoveRafIdRef.current = requestAnimationFrame(() => {
                absMoveRafIdRef.current = null;
                if (pendingAbsMoveRef.current) {
                  sendAbsMove(
                    pendingAbsMoveRef.current.x,
                    pendingAbsMoveRef.current.y,
                    selectedMonitorId
                  );
                  pendingAbsMoveRef.current = null;
                }
              });
            }
          }
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (inputMode === 'trackpad') return;

    if (touchStartRef.current.longPressTimer) {
      clearTimeout(touchStartRef.current.longPressTimer);
      touchStartRef.current.longPressTimer = null;
    }

    // Release mouse drag if active
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      const t = e.changedTouches[0];
      if (t) {
        const coords = toNormalizedMonitorCoords(t.clientX, t.clientY);
        if (coords) {
          sendAbsButton('left', 'up', coords.x, coords.y, selectedMonitorId);
        }
      }
      return;
    }

    // If movement was negligible, arbitrate single vs double tap
    if (!touchStartRef.current.hasMoved && !touchStartRef.current.isPinching) {
      const t = e.changedTouches[0];
      if (!t) return;

      const now = Date.now();
      const coords = toNormalizedMonitorCoords(t.clientX, t.clientY);
      if (!coords) return;

      if (now - lastTapTimeRef.current < 280) {
        // Double-tap detected
        triggerHaptic('medium');
        sendAbsClick('left', 2, coords.x, coords.y, selectedMonitorId);
        lastTapTimeRef.current = 0;
      } else {
        // Single tap
        triggerHaptic('light');
        const mods = getActiveModifiers();
        if (mods.length > 0) {
          // If modifiers latched, tap with modifiers
          for (const m of mods) sendKey(m, 'down');
          sendAbsClick('left', 1, coords.x, coords.y, selectedMonitorId);
          for (const m of mods) sendKey(m, 'up');
          clearLatchedModifiers();
        } else {
          sendAbsClick('left', 1, coords.x, coords.y, selectedMonitorId);
        }
        lastTapTimeRef.current = now;
      }
    }
  };

  const handleModeSwitch = (mode: DesktopInputMode) => {
    triggerHaptic('light');
    setInputMode(mode);
    onUpdateDesktopSettings({ inputMode: mode });
  };

  const handlePresetSelect = (preset: QualityPresetName) => {
    triggerHaptic('light');
    setActivePreset(preset);
    onUpdateDesktopSettings({ defaultPreset: preset });
    setShowPresetMenu(false);
    startDesktopStream({
      monitorId: selectedMonitorId,
      preset,
      codec: desktopSettings.preferredCodec || 'h264',
    });
  };

  const handleMonitorSelect = (monId: string) => {
    triggerHaptic('light');
    setSelectedMonitorId(monId);
    setShowMonitorMenu(false);
    startDesktopStream({
      monitorId: monId,
      preset: activePreset,
      codec: desktopSettings.preferredCodec || 'h264',
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-[100dvh] w-full bg-[#000000] text-foreground select-none overflow-hidden touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
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
            sendText(val);
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
            F1: 'f1',
            F2: 'f2',
            F3: 'f3',
            F4: 'f4',
            F5: 'f5',
            F6: 'f6',
            F7: 'f7',
            F8: 'f8',
            F9: 'f9',
            F10: 'f10',
            F11: 'f11',
            F12: 'f12',
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
            sendKey(keyMap[key], 'tap', mods);
            clearLatchedModifiers();
            return;
          }

          if (hasPhysicalMod && key.length === 1) {
            e.preventDefault();
            sendKey(lowerKey, 'tap', mods);
            clearLatchedModifiers();
            return;
          }
        }}
      />

      {/* Main Video/Canvas Viewport */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-black">
        <canvas ref={canvasRef} className="w-full h-full object-contain pointer-events-none" />

        {/* State Badges / Overlays */}
        {streamState === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 z-10">
            <span className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <p className="text-xs text-muted-foreground font-mono">
              Connecting to Windows Desktop...
            </p>
          </div>
        )}

        {streamState === 'secure_screen' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-2xl bg-surface border border-accent/30 shadow-lg flex items-center gap-2.5 z-20 max-w-sm">
            <Lock size={18} className="text-accent shrink-0" />
            <div className="text-left">
              <p className="text-xs font-semibold text-foreground">PC on Secure Desktop</p>
              <p className="text-[11px] text-muted-foreground">
                UAC prompt or lock screen active. Stream resumes when unlocked.
              </p>
            </div>
          </div>
        )}

        {streamState === 'reconnecting' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-optic-amber/10 border border-optic-amber/20 text-optic-amber flex items-center gap-2 z-20">
            <span className="w-2 h-2 rounded-full bg-optic-amber animate-ping" />
            <span className="text-xs font-mono font-medium">Reconnecting stream...</span>
          </div>
        )}

        {streamState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 gap-3 z-20 text-center max-w-sm mx-auto">
            <WarningCircle size={32} className="text-optic-red" />
            <p className="text-sm font-semibold text-foreground">Stream Disconnected</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {streamError || 'Unable to establish desktop stream connection.'}
            </p>
            <button
              onClick={() => {
                triggerHaptic('light');
                reconnectStream();
              }}
              className="mt-2 px-4 py-2 rounded-xl bg-surface border border-border text-foreground hover:border-accent text-xs font-semibold flex items-center gap-2"
            >
              <ArrowCounterClockwise size={14} />
              <span>Retry Stream</span>
            </button>
          </div>
        )}

        {/* Live Measured Stats Overlay */}
        {showStats && (
          <div className="absolute top-3 left-3 bg-black/85 border border-border/80 rounded-xl px-3 py-2 text-[10px] font-mono text-muted-foreground backdrop-blur-md z-30 space-y-0.5">
            <div className="text-foreground font-semibold mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-optic-green" />
                <span>DESKTOP REMOTE STREAM</span>
              </div>
            </div>
            <div>
              FPS: <span className="text-foreground">{stats.fps}</span>
            </div>
            <div>
              Latency (p50/p95):{' '}
              <span className="text-foreground">
                {stats.latencyP50 || stats.latencyMs || 0} /{' '}
                {stats.latencyP95 || stats.latencyMs || 0} ms
              </span>
            </div>
            <div>
              Decode / Paint:{' '}
              <span className="text-foreground">
                {stats.decodeMs || 0} / {stats.paintMs || 0} ms
              </span>
            </div>
            <div>
              Bitrate: <span className="text-foreground">{stats.bitrateKbps} kbps</span>
            </div>
            <div>
              Resolution:{' '}
              <span className="text-foreground">
                {stats.width}x{stats.height}
              </span>
            </div>
            <div>
              Tier:{' '}
              <span className="text-foreground capitalize">
                {stats.activeTier || activePreset}
                {stats.activeTier && stats.activeTier !== activePreset ? ' (adapted)' : ''}
              </span>
            </div>
            {stats.backend && (
              <div>
                Backend: <span className="text-foreground">{stats.backend}</span>
              </div>
            )}
            <div>
              Dropped: <span className="text-foreground">{stats.droppedFrames}</span>
            </div>
            <div>
              Zoom: <span className="text-foreground">{zoom.toFixed(1)}x</span>
            </div>

            <div className="pt-1.5 pointer-events-auto">
              <button
                onClick={async () => {
                  triggerHaptic('light');
                  if (onRunLatencyTest) {
                    setIsRunningLatencyTest(true);
                    try {
                      const res = await onRunLatencyTest();
                      setLatencyTestResult(res);
                      setTimeout(() => setLatencyTestResult(null), 5000);
                    } catch {}
                    setIsRunningLatencyTest(false);
                  }
                }}
                disabled={isRunningLatencyTest}
                className="w-full py-1 px-2 rounded-lg bg-raised hover:bg-border text-foreground font-medium text-[10px] border border-border transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
              >
                <span>
                  {isRunningLatencyTest ? 'Measuring (10 samples)...' : 'Run Latency Test'}
                </span>
              </button>
              {latencyTestResult && (
                <div className="mt-1 p-1 rounded bg-accent/10 border border-accent/30 text-accent text-[9px] leading-tight">
                  RTT min: {latencyTestResult.min}ms · avg: {latencyTestResult.avg}ms · max:{' '}
                  {latencyTestResult.max}ms · p95: {latencyTestResult.p95}ms
                </div>
              )}
            </div>
          </div>
        )}

        {/* Zoom Reset Pill (appears when zoomed > 1.0) */}
        {zoom > 1.05 && (
          <button
            onClick={() => {
              triggerHaptic('light');
              resetZoomPan();
            }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-surface/90 border border-border/80 text-[11px] font-mono text-foreground shadow-lg flex items-center gap-1.5 z-20 active:scale-95 transition-transform"
          >
            <ArrowCounterClockwise size={12} />
            <span>Reset Zoom ({zoom.toFixed(1)}x)</span>
          </button>
        )}

        {/* Portrait Orientation Advisory Hint */}
        {isPortrait && !dismissPortraitNotice && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-surface/80 border border-border/60 text-[11px] text-muted-foreground flex items-center gap-2 z-20 backdrop-blur-md">
            <span>Tip: Rotate phone to landscape for full screen</span>
            <button
              onClick={() => setDismissPortraitNotice(true)}
              className="text-foreground hover:text-accent p-0.5"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Floating Auto-Hiding Toolbar */}
      <AnimatePresence>
        {showToolbar && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#121217]/90 border border-border/80 rounded-2xl px-2 py-1.5 shadow-2xl backdrop-blur-xl z-30"
          >
            {/* Disconnect Button (Always Visible) */}
            <button
              onClick={() => {
                triggerHaptic('light');
                stopDesktopStream();
                onClose();
              }}
              className="w-10 h-10 rounded-xl bg-optic-red/10 border border-optic-red/20 text-optic-red hover:bg-optic-red/20 flex items-center justify-center transition-colors shrink-0"
              title="Disconnect Desktop Session"
              aria-label="Disconnect"
            >
              <X size={18} />
            </button>

            <div className="w-[1px] h-5 bg-border/60 mx-1" />

            {/* Input Mode Toggle (Direct Touch vs Trackpad) */}
            <button
              onClick={() => handleModeSwitch(inputMode === 'direct' ? 'trackpad' : 'direct')}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                inputMode === 'direct'
                  ? 'bg-accent/10 border border-accent/30 text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={inputMode === 'direct' ? 'Mode: Direct Touch' : 'Mode: Relative Trackpad'}
              aria-label="Switch input mode"
            >
              {inputMode === 'direct' ? <CursorClick size={18} /> : <HandPointing size={18} />}
            </button>

            {/* Virtual Keyboard Toggle */}
            <button
              onClick={() => {
                triggerHaptic('light');
                setShowKeyBar((prev) => !prev);
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                showKeyBar
                  ? 'bg-accent/10 border border-accent/30 text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Toggle Quick-Key Bar"
              aria-label="Toggle keyboard"
            >
              <KeyboardIcon size={18} />
            </button>

            {/* Monitor Picker (Visible if > 1 monitor) */}
            {monitors.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowMonitorMenu((prev) => !prev)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                    showMonitorMenu
                      ? 'bg-surface text-accent'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Select Target Monitor"
                  aria-label="Select monitor"
                >
                  <Monitor size={18} />
                </button>

                {showMonitorMenu && (
                  <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-xl p-1.5 shadow-xl min-w-[140px] z-40 space-y-1">
                    {monitors.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleMonitorSelect(m.id)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                          selectedMonitorId === m.id
                            ? 'bg-accent text-black font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-raised'
                        }`}
                      >
                        {m.name} {m.isPrimary ? '(P)' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quality Preset Menu */}
            <div className="relative">
              <button
                onClick={() => setShowPresetMenu((prev) => !prev)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                  showPresetMenu
                    ? 'bg-surface text-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Stream Quality Preset"
                aria-label="Select quality preset"
              >
                <Sliders size={18} />
              </button>

              {showPresetMenu && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-surface border border-border rounded-xl p-1.5 shadow-xl min-w-[120px] z-40 space-y-1">
                  {(['ultra', 'high', 'balanced', 'fast', 'tiny'] as QualityPresetName[]).map(
                    (p) => (
                      <button
                        key={p}
                        onClick={() => handlePresetSelect(p)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono capitalize transition-colors ${
                          activePreset === p
                            ? 'bg-accent text-black font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-raised'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Stats Overlay Toggle */}
            <button
              onClick={() => {
                triggerHaptic('light');
                setShowStats((prev) => {
                  const updated = !prev;
                  onUpdateDesktopSettings({ showStats: updated });
                  return updated;
                });
              }}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                showStats
                  ? 'bg-accent/10 border border-accent/30 text-accent'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Toggle Live Stream Metrics"
              aria-label="Toggle stats overlay"
            >
              <ChartLine size={18} />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors shrink-0"
              title="Fullscreen"
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick-Key Bar & Virtual Keyboard Trigger */}
      <AnimatePresence>
        {showKeyBar && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.15 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 w-[95%] max-w-lg bg-[#0A0A0A]/95 border border-border/80 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl z-40 flex flex-col gap-2"
          >
            {/* Top row: Sticky Modifiers and Virtual Keyboard trigger */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 flex-1 overflow-x-auto py-0.5 no-scrollbar">
                {(['ctrl', 'alt', 'shift', 'win'] as const).map((mod) => {
                  const isLatched = latchedModifiers[mod];
                  return (
                    <button
                      key={mod}
                      onClick={() => toggleModifier(mod)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all shrink-0 ${
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
                className="px-3 py-1.5 rounded-xl bg-surface border border-border text-foreground text-xs font-semibold hover:border-accent shrink-0 flex items-center gap-1.5"
              >
                <KeyboardIcon size={14} />
                <span>Type Text</span>
              </button>

              <button
                onClick={() => setShowKeyBar(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Second row: Navigation & Action Keys */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
              {[
                'Esc',
                'Tab',
                'Enter',
                'Backspace',
                'Del',
                'Space',
                'Left',
                'Up',
                'Down',
                'Right',
              ].map((k) => (
                <button
                  key={k}
                  onClick={() => handleKeyTap(k)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface/70 border border-border/60 text-foreground text-[11px] font-mono hover:bg-raised active:scale-95 transition-transform shrink-0"
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Third row: Shortcut Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
              {[
                'Ctrl+C',
                'Ctrl+V',
                'Ctrl+Z',
                'Ctrl+A',
                'Ctrl+S',
                'Alt+Tab',
                'Win+D',
                'Win+Tab',
                'Win+E',
                'Win+R',
                'F5',
                'F11',
                'Alt+F4',
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleShortcutChip(chip)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium shrink-0 transition-colors ${
                    chip === 'Alt+F4'
                      ? 'bg-optic-red/10 border border-optic-red/20 text-optic-red hover:bg-optic-red/20'
                      : 'bg-surface border border-border/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alt+F4 Confirmation Modal */}
      {showAltF4Confirm && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 z-50">
          <div className="bg-surface border border-border rounded-2xl p-5 max-w-xs w-full text-center shadow-2xl">
            <h3 className="text-sm font-bold text-foreground mb-1.5">Close Active Window?</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Sending <code className="font-mono text-optic-red">Alt+F4</code> will immediately
              close the current window on your PC.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAltF4Confirm(false)}
                className="flex-1 py-2 rounded-xl bg-raised border border-border text-xs font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  triggerHaptic('heavy');
                  setShowAltF4Confirm(false);
                  sendKey('f4', 'tap', ['alt']);
                }}
                className="flex-1 py-2 rounded-xl bg-optic-red text-white text-xs font-semibold"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
