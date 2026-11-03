import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard, GlowButton, Slider, Toggle, Pill } from '@ui';
import { triggerHaptic } from '../utils/haptics';
import { SlidersHorizontal, X, Compass, Radio } from 'lucide-react';

export interface AirMouseTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right') => void;
  onEngagedChange?: (engaged: boolean) => void;
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

export const AirMouseTab: React.FC<AirMouseTabProps> = ({
  sendMove,
  sendClick,
  onEngagedChange,
}) => {
  const [settings, setSettings] = useState<AirSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [isEngaged, setIsEngaged] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [liveTelemetry, setLiveTelemetry] = useState({ yaw: 0, pitch: 0, speed: 0 });
  const [ripple, setRipple] = useState<{ id: number; x: number; y: number } | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const isEngagedRef = useRef(isEngaged);
  isEngagedRef.current = isEngaged;

  // Sync engaged status upwards
  useEffect(() => {
    onEngagedChange?.(isEngaged);
  }, [isEngaged, onEngagedChange]);

  const updateSettings = (partial: Partial<AirSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Sensor refs for 60Hz loop
  const accumRef = useRef({ dx: 0, dy: 0 });
  const emaRef = useRef({ x: 0, y: 0 });
  const lastTimeRef = useRef<number>(performance.now());
  const lastTelemetryUpdateRef = useRef<number>(0);
  const pointerDownRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const disengage = useCallback(
    (upX?: number, upY?: number) => {
      setIsEngaged(false);
      triggerHaptic('light');

      if (pointerDownRef.current) {
        const { time, x, y } = pointerDownRef.current;
        const elapsed = Date.now() - time;
        const dist = upX !== undefined && upY !== undefined ? Math.hypot(upX - x, upY - y) : 0;

        // Left click only if press < 200ms AND moved < 8px
        if (elapsed < 200 && dist < 8) {
          sendClick('left');
          triggerHaptic('heavy');
          if (upX !== undefined && upY !== undefined) {
            setRipple({ id: Date.now(), x: upX, y: upY });
          }
        }
        pointerDownRef.current = null;
      }
    },
    [sendClick]
  );

  // Window blur and visibility change handlers
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
          yaw = (rr.beta || 0) * nx + (rr.gamma || 0) * ny + (rr.alpha || 0) * nz;
        } else {
          yaw = rr.alpha || 0;
        }
        pitch = rr.beta || 0;
      } else {
        // Flat Grip: TV-remote mapping (screen facing up)
        yaw = rr.alpha || 0;
        pitch = rr.beta || 0;
      }

      let rawX = currentCfg.swapAxes ? pitch : yaw;
      let rawY = currentCfg.swapAxes ? yaw : pitch;

      if (currentCfg.invertX) rawX = -rawX;
      if (currentCfg.invertY) rawY = -rawY;

      // Deadzone filter
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

      // Throttle live telemetry updates to ~15Hz (every ~66ms)
      if (now - lastTelemetryUpdateRef.current >= 66) {
        lastTelemetryUpdateRef.current = now;
        const speed = Math.hypot(filteredX, filteredY);
        setLiveTelemetry({
          yaw: Math.round(filteredX * 10) / 10,
          pitch: Math.round(filteredY * 10) / 10,
          speed: Math.min(speed, 60),
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

  // Pointer Events handling with setPointerCapture
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    pointerDownRef.current = { time: Date.now(), x: e.clientX, y: e.clientY };
    setIsEngaged(true);
    triggerHaptic('medium');
    lastTimeRef.current = performance.now();

    setRipple({ id: Date.now(), x: localX, y: localY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
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

  // Speed glow factor: 0.1 to 0.7
  const glowIntensity = isEngaged ? Math.min(0.2 + (liveTelemetry.speed / 50) * 0.5, 0.75) : 0;

  return (
    <div className="relative flex flex-col h-full w-full justify-between gap-3 p-4">
      {/* Top Status & Sheet Trigger */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill status={isEngaged ? 'online' : 'idle'} size="sm">
            {isEngaged ? `AIR 6DOF (${settings.grip}) · 60Hz` : 'HOLD PAD TO ENGAGE'}
          </Pill>
        </div>

        <button
          onClick={() => {
            triggerHaptic('light');
            setShowSettingsSheet(true);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-xs font-mono text-aerokin-muted hover:text-white hover:border-aerokin-cyan/40 transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-aerokin-cyan" />
          <span>Config</span>
        </button>
      </div>

      {/* Main Hold-to-Engage Spatial Air Pad */}
      <div className="relative flex-1 flex flex-col justify-center items-center">
        {/* Dynamic Speed Glow Aura surrounding the pad */}
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl transition-opacity duration-150 blur-2xl"
          style={{
            background: 'radial-gradient(circle, rgba(34,211,238,0.4) 0%, rgba(124,92,255,0.2) 60%, transparent 80%)',
            opacity: glowIntensity,
          }}
        />

        <div
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          className={`relative w-full h-full rounded-3xl border transition-all duration-300 ease-aerokin flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none touch-none overflow-hidden ${
            isEngaged
              ? 'bg-gradient-to-b from-[#7C5CFF]/15 via-black/40 to-[#22D3EE]/15 border-aerokin-cyan/60 shadow-glow-md'
              : 'bg-aerokin-surface border-aerokin-border hover:border-white/20 active:scale-[0.985]'
          }`}
        >
          {/* Top specular highlight edge */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          {/* Tap Ripple Effect */}
          {ripple && (
            <motion.span
              key={ripple.id}
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 4, opacity: 0 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="pointer-events-none absolute w-16 h-16 rounded-full bg-aerokin-cyan/30"
              style={{
                left: ripple.x - 32,
                top: ripple.y - 32,
              }}
            />
          )}

          {/* Visual 6DOF Gyroscopic Reticle & Orbiting Radar Ring */}
          <div className="relative flex items-center justify-center">
            {/* Outer Velocity Radar Ring */}
            <motion.div
              animate={{
                rotate: isEngaged ? 360 : 0,
                scale: isEngaged ? [1, 1.05, 1] : 1,
              }}
              transition={{
                rotate: { duration: 8, repeat: Infinity, ease: 'linear' },
                scale: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
              }}
              className={`relative flex items-center justify-center rounded-full border border-dashed transition-all duration-300 ${
                isEngaged
                  ? 'h-36 w-36 border-aerokin-cyan/80 shadow-glow-cyan'
                  : 'h-28 w-28 border-white/20'
              }`}
            >
              {/* Radar orbiting dot */}
              {isEngaged && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-aerokin-cyan shadow-glow-sm" />
              )}
            </motion.div>

            {/* Inner Gyro Follower Reticle */}
            <div
              className={`absolute flex items-center justify-center rounded-full border transition-all duration-100 ${
                isEngaged
                  ? 'h-14 w-14 border-aerokin-cyan/60 bg-aerokin-cyan/10'
                  : 'h-10 w-10 border-white/30 bg-white/[0.03]'
              }`}
              style={{
                transform: isEngaged
                  ? `translate(${liveTelemetry.yaw * 3.5}px, ${liveTelemetry.pitch * 3.5}px)`
                  : 'none',
              }}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full transition-transform duration-75 ${
                  isEngaged ? 'bg-aerokin-cyan shadow-glow-sm scale-125' : 'bg-white/40'
                }`}
              />
            </div>
          </div>

          <span className="font-sans font-bold text-lg text-white mt-6 tracking-tight">
            {isEngaged ? 'AIR MOUSE ACTIVE' : 'HOLD TO MOVE AIR'}
          </span>

          <span className="font-mono text-xs text-aerokin-muted mt-1.5">
            {isEngaged
              ? `Yaw: ${liveTelemetry.yaw > 0 ? `+${liveTelemetry.yaw}` : liveTelemetry.yaw}° · Pitch: ${
                  liveTelemetry.pitch > 0 ? `+${liveTelemetry.pitch}` : liveTelemetry.pitch
                }°`
              : 'Tap Pad: Left Click · Release to stop'}
          </span>
        </div>
      </div>

      {/* Secondary Left / Right Physical Click Buttons */}
      <div className="w-full grid grid-cols-2 gap-3 z-10">
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

      {/* Settings Bottom Sheet with drag-to-dismiss via motion/react */}
      <AnimatePresence>
        {showSettingsSheet && (
          <div className="fixed inset-0 z-50 flex items-end">
            {/* Backdrop blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettingsSheet(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            {/* Slide-up sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) {
                  setShowSettingsSheet(false);
                }
              }}
              className="relative w-full max-h-[85vh] rounded-t-3xl border-t border-white/10 bg-[#0C0C14] p-5 pb-safe shadow-2xl flex flex-col gap-4 overflow-y-auto"
            >
              {/* Drag handle */}
              <div className="w-12 h-1.5 rounded-full bg-white/20 mx-auto -mt-1 cursor-grab" />

              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-aerokin-cyan" />
                  <span className="font-sans font-bold text-white text-base">
                    Gyroscope Calibration
                  </span>
                </div>
                <button
                  onClick={() => setShowSettingsSheet(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-aerokin-muted hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grip Mode */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-xs uppercase tracking-wider text-aerokin-muted">
                  Orientation &amp; Grip Mode
                </span>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      updateSettings({ grip: 'Flat' });
                    }}
                    className={`py-2.5 px-3 rounded-xl border font-mono text-xs flex flex-col items-center gap-1 transition-all ${
                      settings.grip === 'Flat'
                        ? 'bg-aerokin-cyan/20 border-aerokin-cyan text-white shadow-glow-sm'
                        : 'bg-white/[0.04] border-white/10 text-aerokin-muted hover:text-white'
                    }`}
                  >
                    <span className="font-bold">Flat (Remote)</span>
                    <span className="text-[10px] opacity-75">Screen facing up</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      updateSettings({ grip: 'Auto' });
                    }}
                    className={`py-2.5 px-3 rounded-xl border font-mono text-xs flex flex-col items-center gap-1 transition-all ${
                      settings.grip === 'Auto'
                        ? 'bg-aerokin-cyan/20 border-aerokin-cyan text-white shadow-glow-sm'
                        : 'bg-white/[0.04] border-white/10 text-aerokin-muted hover:text-white'
                    }`}
                  >
                    <span className="font-bold">Auto (Gravity 3D)</span>
                    <span className="text-[10px] opacity-75">Any holding angle</span>
                  </button>
                </div>
              </div>

              {/* Sliders */}
              <Slider
                label="Sensitivity Scale"
                value={settings.sensitivity}
                onChange={(val) => updateSettings({ sensitivity: val })}
                min={0.5}
                max={5.0}
                step={0.1}
                unit="x"
              />

              <Slider
                label="Tremor Deadzone"
                value={settings.deadzone}
                onChange={(val) => updateSettings({ deadzone: val })}
                min={0.2}
                max={3.0}
                step={0.1}
                unit="°/s"
              />

              <Slider
                label="EMA Smoothing Filter"
                value={settings.smoothing}
                onChange={(val) => updateSettings({ smoothing: val })}
                min={0.1}
                max={0.9}
                step={0.05}
              />

              {/* Inversion Toggles */}
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

              <GlowButton
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setShowSettingsSheet(false)}
                className="mt-2"
              >
                Save &amp; Close
              </GlowButton>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
