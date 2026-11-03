import React, { useEffect, useRef, useState } from 'react';
import { AirPointerEngine, AirPointerConfig, CalibrationData } from '../engine/airPointer';
import { triggerHaptic } from '../utils/haptics';
import { useDrag } from '@use-gesture/react';
import {
  Pause,
  Play,
  Cursor,
  HandPointing,
  ArrowsVertical,
} from '@phosphor-icons/react';

interface AirMouseTabProps {
  sendMove: (dx: number, dy: number) => void;
  sendClick: (button: 'left' | 'right' | 'middle') => void;
  sendScroll: (dy: number, dx?: number) => void;
  isBackpressured: () => boolean;
  config: AirPointerConfig;
  calibration: CalibrationData;
  onOpenSettings: () => void;
}

export const AirMouseTab: React.FC<AirMouseTabProps> = ({
  sendMove,
  sendClick,
  sendScroll,
  isBackpressured,
  config,
  calibration,
  onOpenSettings,
}) => {
  const engineRef = useRef<AirPointerEngine | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isHoldEngaged, setIsHoldEngaged] = useState(false);
  const [reticlePos, setReticlePos] = useState({ x: 0, y: 0 });
  const [isStationary, setIsStationary] = useState(true);

  // Initialize and update the AirPointerEngine
  useEffect(() => {
    const engine = new AirPointerEngine(
      (dx, dy) => sendMove(dx, dy),
      isBackpressured,
      config,
      calibration
    );
    engineRef.current = engine;

    return () => {
      engineRef.current = null;
    };
  }, [sendMove, isBackpressured]);

  // Keep engine config and calibration synced
  useEffect(() => {
    engineRef.current?.updateConfig(config);
  }, [config]);

  useEffect(() => {
    engineRef.current?.updateCalibration(calibration);
  }, [calibration]);

  useEffect(() => {
    engineRef.current?.setPaused(isPaused);
  }, [isPaused]);

  useEffect(() => {
    engineRef.current?.setHoldEngaged(isHoldEngaged);
  }, [isHoldEngaged]);

  // Animation frame loop: flushes accumulated moves at 60Hz and updates HUD reticle
  useEffect(() => {
    let animId: number;
    let lastHudUpdate = 0;

    const renderLoop = (time: number) => {
      if (engineRef.current) {
        engineRef.current.flushFrame();

        // Update HUD reticle at ~24Hz to save CPU
        if (time - lastHudUpdate > 40) {
          lastHudUpdate = time;
          const telemetry = engineRef.current.getTelemetry();
          setIsStationary(telemetry.isStationary);
          // Scale filtered rates into reticle crosshair offset (-30px to +30px)
          const rx = Math.max(-32, Math.min(32, telemetry.filteredYaw * 1.2));
          const ry = Math.max(-32, Math.min(32, -telemetry.filteredPitch * 1.2));
          setReticlePos({ x: rx, y: ry });
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Listen to DeviceMotionEvent
  useEffect(() => {
    let lastTime = performance.now();

    const handleMotion = (e: DeviceMotionEvent) => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000.0;
      lastTime = now;

      if (!e.rotationRate) return;

      const rot = {
        alpha: e.rotationRate.alpha,
        beta: e.rotationRate.beta,
        gamma: e.rotationRate.gamma,
      };

      const grav = e.accelerationIncludingGravity
        ? {
            x: e.accelerationIncludingGravity.x,
            y: e.accelerationIncludingGravity.y,
            z: e.accelerationIncludingGravity.z,
          }
        : null;

      engineRef.current?.processMotion(rot, grav, dt);
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, []);

  // Handle OK Button tap with 120ms anti-slip pointer freeze
  const handleOkPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    engineRef.current?.freezePointer(300); // Freeze during press
    triggerHaptic('medium');
  };

  const handleOkPointerUp = (e: React.PointerEvent) => {
    engineRef.current?.freezePointer(120); // Hold freeze for 120ms after release
    sendClick('left');
    triggerHaptic('light');
  };

  const handleRightClick = () => {
    engineRef.current?.freezePointer(120);
    sendClick('right');
    triggerHaptic('medium');
  };

  // Scroll wheel strip gesture binding using @use-gesture/react
  const lastDetentRef = useRef(0);
  const bindWheelStrip = useDrag(
    ({ movement: [, my], velocity: [, vy], direction: [, dy], active, first }) => {
      if (first) {
        lastDetentRef.current = my;
      }

      const deltaY = my - lastDetentRef.current;
      // Scroll detent notch every 14px of thumb travel
      if (Math.abs(deltaY) >= 14) {
        const notches = Math.trunc(deltaY / 14);
        sendScroll(-notches);
        triggerHaptic('detent');
        lastDetentRef.current = my;
      }

      // Add slight flick inertia when released with high velocity
      if (!active && Math.abs(vy) > 0.5) {
        const inertiaNotches = Math.round(vy * 3 * dy);
        if (inertiaNotches !== 0) {
          sendScroll(-inertiaNotches);
          triggerHaptic('light');
        }
      }
    },
    {
      pointer: { capture: true },
      preventDefault: true,
    }
  );

  return (
    <div className="flex-1 flex flex-col justify-between p-4 max-w-md mx-auto w-full h-full select-none">
      {/* 1. Machined Reticle Display & OLED Telemetry HUD */}
      <div className="w-full rounded-lg bg-hw-surface border border-hw-border p-3.5 shadow-hw-well flex flex-col">
        {/* Top Status Strip */}
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-hw-border-subtle">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full transition-all ${
                isPaused
                  ? 'bg-amber-500 shadow-[0_0_6px_#f59e0b]'
                  : isStationary
                  ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                  : 'bg-hw-active shadow-[0_0_8px_var(--hw-active)]'
              }`}
            />
            <span className="font-display font-bold uppercase text-[11px] tracking-wider text-hw-text">
              {isPaused ? 'PAUSED' : isStationary ? 'STATIONARY LOCK' : 'TRACKING 6-DOF'}
            </span>
          </div>

          <button
            onClick={() => {
              setIsPaused((p) => !p);
              triggerHaptic('medium');
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border transition-all ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-hw-surface-raised text-hw-text-muted border-hw-border-milled hover:text-hw-text'
            }`}
          >
            {isPaused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>

        {/* Reticle Sight Window */}
        <div className="relative w-full h-36 rounded bg-hw-oled-bg border border-hw-border-subtle overflow-hidden flex items-center justify-center">
          {/* Subtle Grid Lines */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:16px_16px]" />

          {/* Viewfinder Corner Brackets */}
          <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t border-l border-white/20 pointer-events-none" />
          <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t border-r border-white/20 pointer-events-none" />
          <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b border-l border-white/20 pointer-events-none" />
          <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b border-r border-white/20 pointer-events-none" />

          {/* Crosshair Axes */}
          <div className="absolute w-full h-[1px] bg-white/10" />
          <div className="absolute h-full w-[1px] bg-white/10" />

          {/* Calibrated Center Ring */}
          <div className="absolute w-12 h-12 rounded-full border border-white/15 pointer-events-none" />
          <div className="absolute w-24 h-24 rounded-full border border-white/5 pointer-events-none" />

          {/* Kinetic Dynamic Reticle Crosshair Dot */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full pointer-events-none transition-transform duration-75 flex items-center justify-center"
            style={{
              transform: `translate(${reticlePos.x}px, ${reticlePos.y}px)`,
            }}
          >
            <div className="w-2 h-2 rounded-full bg-hw-active shadow-[0_0_8px_var(--hw-active)]" />
            <div className="absolute w-6 h-6 rounded-full border border-hw-active/40" />
          </div>

          {/* Mode Pill in Reticle */}
          <div className="absolute bottom-2 left-3 font-mono text-[9px] text-hw-text-dim uppercase tracking-wider">
            {config.mode.toUpperCase()} · {(config.fineSensitivity).toFixed(1)}x
          </div>

          <div className="absolute bottom-2 right-3 font-mono text-[9px] text-hw-text-dim uppercase tracking-wider">
            X:{reticlePos.x >= 0 ? '+' : ''}{reticlePos.x.toFixed(0)} Y:{reticlePos.y >= 0 ? '+' : ''}{reticlePos.y.toFixed(0)}
          </div>
        </div>
      </div>

      {/* 2. Controls Section */}
      {config.mode === 'magic' ? (
        /* LG webOS Magic Remote Controls Layout */
        <div className="flex-1 flex gap-3 my-3">
          {/* Left: Tactical Transport Buttons (OK Button + Right Click) */}
          <div className="flex-1 flex flex-col gap-3">
            {/* Massive Tactile OK / Left-Click Dial Button */}
            <div
              onPointerDown={handleOkPointerDown}
              onPointerUp={handleOkPointerUp}
              className="flex-1 rounded-xl bg-hw-surface-raised border border-hw-border-milled shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex flex-col items-center justify-center p-4 cursor-pointer select-none transition-all touch-none relative overflow-hidden group"
            >
              {/* Beveled Rim Accent */}
              <div className="absolute inset-1 rounded-lg border border-white/5 pointer-events-none" />
              <div className="w-14 h-14 rounded-full bg-hw-surface-hl border border-hw-border flex items-center justify-center shadow-hw-bevel mb-2 group-active:scale-95 transition-transform">
                <Cursor size={26} className="text-hw-primary" weight="bold" />
              </div>
              <span className="font-display font-bold text-sm tracking-widest text-hw-text uppercase">
                OK / CLICK
              </span>
              <span className="font-mono text-[9px] text-hw-text-dim mt-1 uppercase">
                TAP TO CLICK · FREEZES TREMOR
              </span>
            </div>

            {/* Secondary Right Click Button */}
            <button
              onClick={handleRightClick}
              className="h-14 rounded-lg bg-hw-surface border border-hw-border-milled shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] font-display font-bold text-xs uppercase tracking-wider text-hw-text hover:text-white flex items-center justify-center gap-2 transition-all"
            >
              <span>RIGHT CLICK</span>
            </button>
          </div>

          {/* Right: Vertical Scroll Wheel Strip with Detent Notches */}
          <div
            {...bindWheelStrip()}
            className="w-16 rounded-xl bg-hw-surface-sunken border border-hw-border shadow-hw-well flex flex-col items-center justify-between py-3 cursor-ns-resize touch-none select-none relative overflow-hidden"
          >
            <span className="font-mono text-[9px] text-hw-text-dim uppercase tracking-wider">UP</span>

            {/* Milled Detent Ribs */}
            <div className="flex flex-col items-center gap-1.5 opacity-60">
              <ArrowsVertical size={16} className="text-hw-text-muted mb-1" />
              <div className="w-6 h-0.5 rounded-full bg-white/20" />
              <div className="w-8 h-1 rounded-full bg-hw-primary/60" />
              <div className="w-6 h-0.5 rounded-full bg-white/20" />
              <div className="w-8 h-1 rounded-full bg-hw-primary/60" />
              <div className="w-6 h-0.5 rounded-full bg-white/20" />
            </div>

            <span className="font-mono text-[9px] text-hw-text-dim uppercase tracking-wider">DOWN</span>
          </div>
        </div>
      ) : (
        /* Hold Mode: Thumb-to-Engage Pad */
        <div className="flex-1 flex flex-col gap-3 my-3">
          <div
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setIsHoldEngaged(true);
              triggerHaptic('medium');
            }}
            onPointerUp={() => {
              setIsHoldEngaged(false);
              triggerHaptic('light');
            }}
            onPointerCancel={() => setIsHoldEngaged(false)}
            className={`flex-1 rounded-xl border flex flex-col items-center justify-center p-6 cursor-pointer touch-none select-none transition-all ${
              isHoldEngaged
                ? 'bg-hw-surface-hl border-hw-active shadow-hw-btn-pressed'
                : 'bg-hw-surface-raised border-hw-border-milled shadow-hw-btn'
            }`}
          >
            <div
              className={`w-16 h-16 rounded-full border flex items-center justify-center mb-3 transition-all ${
                isHoldEngaged
                  ? 'bg-hw-active/20 border-hw-active text-hw-active scale-105'
                  : 'bg-hw-surface-sunken border-hw-border text-hw-text-muted'
              }`}
            >
              <HandPointing size={32} weight="bold" />
            </div>
            <span className="font-display font-bold text-sm tracking-widest text-hw-text uppercase">
              {isHoldEngaged ? 'TRACKING ENGAGED' : 'HOLD THUMB TO MOVE'}
            </span>
            <span className="font-mono text-[10px] text-hw-text-dim mt-1.5">
              Release thumb to freeze pointer
            </span>
          </div>

          <button
            onClick={handleRightClick}
            className="h-12 rounded-lg bg-hw-surface border border-hw-border shadow-hw-btn font-display font-bold text-xs uppercase tracking-wider text-hw-text"
          >
            RIGHT CLICK
          </button>
        </div>
      )}

      {/* 3. Bottom Utility Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-hw-border-subtle text-[11px] font-mono text-hw-text-muted">
        <span>GYRO: {calibration.calibrated ? 'CALIBRATED' : 'DEFAULT'}</span>
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
