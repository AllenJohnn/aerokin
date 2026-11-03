import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GlassCard, GlowButton, Slider, Toggle, Pill } from '@ui';
import { triggerHaptic } from '../utils/haptics';

export interface AirMouseTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right') => void;
}

interface AirSettings {
  sensitivity: number;
  deadzone: number;
  smoothing: number;
  invertX: boolean;
  invertY: boolean;
  swapAxes: boolean;
  grip: 'Flat' | 'Auto';
}

const DEFAULT_SETTINGS: AirSettings = {
  sensitivity: 2.2,
  deadzone: 1.2,
  smoothing: 0.35,
  invertX: false,
  invertY: false,
  swapAxes: false,
  grip: 'Flat',
};

const STORAGE_KEY = 'aerokin_airmouse_settings';

export const AirMouseTab: React.FC<AirMouseTabProps> = ({ sendMove, sendClick }) => {
  const [settings, setSettings] = useState<AirSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [isEngaged, setIsEngaged] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [liveTelemetry, setLiveTelemetry] = useState({ yaw: 0, pitch: 0 });

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const isEngagedRef = useRef(isEngaged);
  isEngagedRef.current = isEngaged;

  // Persist settings changes
  const updateSettings = (partial: Partial<AirSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Sensor state refs for 60Hz loop
  const accumRef = useRef({ dx: 0, dy: 0 });
  const emaRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(performance.now());
  const lastTelemetryUpdateRef = useRef<number>(0);
  const pointerDownRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const disengage = useCallback((upX?: number, upY?: number) => {
    setIsEngaged(false);
    triggerHaptic('light');

    if (pointerDownRef.current) {
      const { time, x, y } = pointerDownRef.current;
      const elapsed = Date.now() - time;
      const dist = upX !== undefined && upY !== undefined ? Math.hypot(upX - x, upY - y) : 0;

      // Left click only if press < 200ms AND moved < 8px (fixes iOS double-click)
      if (elapsed < 200 && dist < 8) {
        sendClick('left');
        triggerHaptic('heavy');
      }
      pointerDownRef.current = null;
    }
  }, [sendClick]);

  // Window blur and visibility change handlers to safely disengage
  useEffect(() => {
    const handleBlur = () => disengage();
    const handleVisibility = () => {
      if (document.hidden) disengage();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [disengage]);

  // 1. DeviceMotion sensor listener (accumulates rotationRate)
  useEffect(() => {
    const handleMotion = (e: DeviceMotionEvent) => {
      if (!isEngagedRef.current) return;
      const rr = e.rotationRate;
      if (!rr) return;

      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      const currentCfg = settingsRef.current;

      let yaw = 0;
      let pitch = 0;

      if (currentCfg.grip === 'Auto' && e.accelerationIncludingGravity) {
        // Auto Grip: yaw = rotationRate vector dotted with normalized gravity vector
        const gx = e.accelerationIncludingGravity.x || 0;
        const gy = e.accelerationIncludingGravity.y || 0;
        const gz = e.accelerationIncludingGravity.z || 0;
        const norm = Math.hypot(gx, gy, gz);

        if (norm > 0.2) {
          const nx = gx / norm;
          const ny = gy / norm;
          const nz = gz / norm;
          // In flat phone orientation, nz ~ 1 -> yaw = rr.alpha
          yaw = (rr.beta || 0) * nx + (rr.gamma || 0) * ny + (rr.alpha || 0) * nz;
        } else {
          yaw = rr.alpha || 0;
        }
        pitch = rr.beta || 0;
      } else {
        // Flat Grip: TV-remote mapping (screen facing up)
        // Yaw (Z-axis / alpha) -> horizontal cursor displacement dx
        // Pitch (X-axis / beta) -> vertical cursor displacement dy
        yaw = rr.alpha || 0;
        pitch = rr.beta || 0;
      }

      let rawX = currentCfg.swapAxes ? pitch : yaw;
      let rawY = currentCfg.swapAxes ? yaw : pitch;

      if (currentCfg.invertX) rawX = -rawX;
      if (currentCfg.invertY) rawY = -rawY;

      // Deadzone threshold (ignore resting hand tremors)
      const absX = Math.abs(rawX);
      const absY = Math.abs(rawY);
      const filteredX = absX < currentCfg.deadzone ? 0 : rawX;
      const filteredY = absY < currentCfg.deadzone ? 0 : rawY;

      // Exponential Moving Average (EMA) smoothing
      const alphaEMA = currentCfg.smoothing;
      emaRef.current.x = emaRef.current.x * (1 - alphaEMA) + filteredX * alphaEMA;
      emaRef.current.y = emaRef.current.y * (1 - alphaEMA) + filteredY * alphaEMA;

      accumRef.current.dx += emaRef.current.x * currentCfg.sensitivity * 30 * dt;
      accumRef.current.dy += emaRef.current.y * currentCfg.sensitivity * 30 * dt;

      // Throttle live telemetry updates to ~15Hz (every ~66ms) to avoid unnecessary React re-renders
      if (now - lastTelemetryUpdateRef.current >= 66) {
        lastTelemetryUpdateRef.current = now;
        setLiveTelemetry({
          yaw: Math.round(filteredX * 10) / 10,
          pitch: Math.round(filteredY * 10) / 10,
        });
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, []);

  // 2. 60Hz Dispatch Loop via requestAnimationFrame
  useEffect(() => {
    let animId: number;

    const tick = () => {
      if (isEngagedRef.current) {
        const dx = accumRef.current.dx;
        const dy = accumRef.current.dy;

        if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
          sendMove(Math.round(dx), Math.round(dy));
          accumRef.current.dx = 0;
          accumRef.current.dy = 0;
        }
      } else {
        accumRef.current.dx = 0;
        accumRef.current.dy = 0;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [sendMove]);

  // Pointer Events handling on Hold-to-Engage pad with setPointerCapture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture not supported
    }

    pointerDownRef.current = { time: Date.now(), x: e.clientX, y: e.clientY };
    setIsEngaged(true);
    triggerHaptic('medium');
    lastTimeRef.current = performance.now();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
    disengage(e.clientX, e.clientY);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    disengage();
  };

  const handlePointerLeave = () => {
    if (!pointerDownRef.current) {
      disengage();
    }
  };

  return (
    <div className="flex flex-col h-full w-full justify-between gap-3 p-4">
      {/* Top Telemetry & Settings Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill status={isEngaged ? 'online' : 'idle'} size="sm">
            {isEngaged ? `AIR GYRO (${settings.grip}) · 60Hz` : 'STANDBY · HOLD PAD'}
          </Pill>
        </div>

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
          {showSettings ? 'Close' : 'Gyro Settings ⚙'}
        </button>
      </div>

      {/* Settings Panel Drawer */}
      {showSettings ? (
        <GlassCard variant="default" padding="md" className="flex-1 overflow-y-auto flex flex-col gap-4">
          <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
            Air Mouse Calibration
          </span>

          {/* Grip Mode Selection */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-wider text-aerokin-muted">
              Grip Mode
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateSettings({ grip: 'Flat' })}
                className={`py-2 px-3 rounded-xl border font-mono text-xs transition-colors ${
                  settings.grip === 'Flat'
                    ? 'bg-aerokin-cyan/20 border-aerokin-cyan text-white shadow-glow-sm'
                    : 'bg-white/[0.04] border-white/10 text-aerokin-muted hover:text-white'
                }`}
              >
                Flat (Remote)
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ grip: 'Auto' })}
                className={`py-2 px-3 rounded-xl border font-mono text-xs transition-colors ${
                  settings.grip === 'Auto'
                    ? 'bg-aerokin-cyan/20 border-aerokin-cyan text-white shadow-glow-sm'
                    : 'bg-white/[0.04] border-white/10 text-aerokin-muted hover:text-white'
                }`}
              >
                Auto (Gravity 3D)
              </button>
            </div>
          </div>

          <Slider
            label="Sensitivity"
            value={settings.sensitivity}
            onChange={(val) => updateSettings({ sensitivity: val })}
            min={0.5}
            max={5.0}
            step={0.1}
            unit="x"
          />

          <Slider
            label="Deadzone Filter"
            value={settings.deadzone}
            onChange={(val) => updateSettings({ deadzone: val })}
            min={0.2}
            max={3.0}
            step={0.1}
            unit="°/s"
          />

          <div className="flex flex-col gap-3 pt-2 border-t border-white/[0.06]">
            <Toggle
              label="Invert X Axis (Yaw)"
              checked={settings.invertX}
              onChange={(val) => updateSettings({ invertX: val })}
            />
            <Toggle
              label="Invert Y Axis (Pitch)"
              checked={settings.invertY}
              onChange={(val) => updateSettings({ invertY: val })}
            />
            <Toggle
              label="Swap X / Y Axes"
              checked={settings.swapAxes}
              onChange={(val) => updateSettings({ swapAxes: val })}
            />
          </div>
        </GlassCard>
      ) : (
        /* Main Hold-to-Engage Air Surface using Pointer Events */
        <div className="flex-1 flex flex-col justify-center items-center gap-4">
          <div
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerLeave}
            className={`relative w-full flex-1 rounded-3xl border transition-all duration-300 ease-aerokin flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none touch-none ${
              isEngaged
                ? 'bg-gradient-to-b from-[#7C5CFF]/20 to-[#22D3EE]/20 border-aerokin-cyan/60 shadow-glow-md scale-[0.99]'
                : 'bg-aerokin-surface border-aerokin-border hover:border-white/20 active:scale-[0.98]'
            }`}
          >
            {/* Top specular highlight */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Visual Gyroscope Radar Reticle */}
            <div
              className={`relative flex items-center justify-center rounded-full border border-dashed transition-all duration-300 ${
                isEngaged
                  ? 'h-32 w-32 border-aerokin-cyan shadow-glow-cyan'
                  : 'h-24 w-24 border-white/20'
              }`}
            >
              <div
                className={`h-4 w-4 rounded-full transition-transform duration-100 ${
                  isEngaged ? 'bg-aerokin-cyan shadow-glow-sm' : 'bg-white/40'
                }`}
                style={{
                  transform: isEngaged
                    ? `translate(${liveTelemetry.yaw * 3}px, ${liveTelemetry.pitch * 3}px)`
                    : 'none',
                }}
              />
            </div>

            <span className="font-sans font-bold text-lg text-white mt-4 tracking-tight">
              {isEngaged ? 'AIR MOUSE ENGAGED' : 'HOLD TO MOVE AIR'}
            </span>
            <span className="font-mono text-xs text-aerokin-muted mt-1">
              {isEngaged ? 'Wave iPhone to guide PC cursor · Tap to Click' : 'Tap pad: Left Click'}
            </span>
          </div>

          {/* Secondary Physical Action Buttons */}
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
      )}
    </div>
  );
};
