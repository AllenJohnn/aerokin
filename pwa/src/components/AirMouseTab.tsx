import React, { useEffect, useRef, useState } from 'react';
import { AirPointerEngine, AirPointerConfig, CalibrationData } from '../engine/airPointer';
import { triggerHaptic } from '../utils/haptics';
import { useDrag } from '@use-gesture/react';
import { CaretUp, CaretDown } from '@phosphor-icons/react';

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
}) => {
  const engineRef = useRef<AirPointerEngine | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isHoldEngaged, setIsHoldEngaged] = useState(false);
  const [reticlePos, setReticlePos] = useState({ x: 0, y: 0 });

  // Initialize and keep AirPointerEngine reference
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

  // 60Hz frame loop to flush moves and update faint direction dot
  useEffect(() => {
    let animId: number;
    let lastHudUpdate = 0;

    const renderLoop = (time: number) => {
      if (engineRef.current) {
        engineRef.current.flushFrame();

        if (time - lastHudUpdate > 33) {
          lastHudUpdate = time;
          const telemetry = engineRef.current.getTelemetry();
          const rx = Math.max(-48, Math.min(48, telemetry.filteredYaw * 1.5));
          const ry = Math.max(-48, Math.min(48, -telemetry.filteredPitch * 1.5));
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

  // Handle OK button tap
  const handleOkPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    engineRef.current?.freezePointer(300);
    triggerHaptic('medium');
  };

  const handleOkPointerUp = (e: React.PointerEvent) => {
    engineRef.current?.freezePointer(120);
    sendClick('left');
    triggerHaptic('light');
  };

  const handleRightClick = () => {
    engineRef.current?.freezePointer(120);
    sendClick('right');
    triggerHaptic('medium');
  };

  // Scroll gesture binding
  const lastDetentRef = useRef(0);
  const bindScroll = useDrag(
    ({ movement: [, my], velocity: [, vy], direction: [, dy], active, first }) => {
      if (first) {
        lastDetentRef.current = my;
      }

      const deltaY = my - lastDetentRef.current;
      if (Math.abs(deltaY) >= 12) {
        const notches = Math.trunc(deltaY / 12);
        sendScroll(-notches);
        triggerHaptic('detent');
        lastDetentRef.current = my;
      }

      if (!active && Math.abs(vy) > 0.4) {
        const inertiaNotches = Math.round(vy * 2.5 * dy);
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

  const isHoldMode = config.mode === 'hold';

  return (
    <div className="flex-1 flex flex-col justify-between px-gutter py-3 w-full h-full select-none max-w-lg mx-auto">
      {/* ONE large pad filling the screen */}
      <div
        onPointerDown={(e) => {
          if (isHoldMode) {
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsHoldEngaged(true);
            triggerHaptic('medium');
          }
        }}
        onPointerUp={() => {
          if (isHoldMode) {
            setIsHoldEngaged(false);
            triggerHaptic('light');
          }
        }}
        onPointerCancel={() => {
          if (isHoldMode) setIsHoldEngaged(false);
        }}
        className="relative flex-1 w-full rounded-2xl bg-surface border border-border flex flex-col justify-between p-4 overflow-hidden touch-none"
      >
        {/* Top row inside pad: Pause text button */}
        <div className="flex items-center justify-between z-10">
          {/* Engaged indicator (optic red ONLY when hold-mode is actively engaged) */}
          <div className="flex items-center gap-2">
            {isHoldMode && isHoldEngaged && (
              <span className="flex items-center gap-1.5 text-xs text-optic-red font-medium">
                <span className="w-2 h-2 rounded-full bg-optic-red" />
                <span>Tracking</span>
              </span>
            )}
            {isPaused && (
              <span className="text-xs text-muted-foreground font-medium">
                Paused
              </span>
            )}
          </div>

          <button
            onClick={() => {
              setIsPaused((p) => !p);
              triggerHaptic('light');
            }}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg transition-colors active:scale-[0.97]"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>

        {/* Center: Faint live direction dot */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Faint center reference anchor */}
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />

          {/* Faint dot showing live pointer direction */}
          <div
            className="absolute w-3 h-3 rounded-full bg-accent/70 transition-transform duration-75 flex items-center justify-center"
            style={{
              transform: `translate(${reticlePos.x}px, ${reticlePos.y}px)`,
            }}
          />

          {isHoldMode && !isHoldEngaged && (
            <p className="absolute bottom-6 text-xs text-muted-foreground/60">
              Hold to move
            </p>
          )}
        </div>

        {/* Bottom controls row: Right click, OK solid circle (bottom center), Scroll */}
        <div className="z-10 flex items-center justify-between gap-3 pt-4">
          {/* Right click button */}
          <button
            onClick={handleRightClick}
            className="h-12 flex-1 max-w-[100px] rounded-xl border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-transform active:scale-[0.97] flex items-center justify-center min-h-[48px]"
          >
            Right click
          </button>

          {/* Big solid circle OK button at thumb reach (center) */}
          <div
            onPointerDown={handleOkPointerDown}
            onPointerUp={handleOkPointerUp}
            className="w-18 h-18 sm:w-20 sm:h-20 w-[72px] h-[72px] rounded-full bg-raised border border-border hover:border-accent/40 text-foreground text-sm font-semibold flex items-center justify-center cursor-pointer transition-transform active:scale-[0.97] select-none touch-none shadow-sm"
          >
            OK
          </div>

          {/* Scroll strip */}
          <div
            {...bindScroll()}
            className="h-12 flex-1 max-w-[100px] rounded-xl border border-border bg-raised hover:bg-border text-muted-foreground hover:text-foreground text-xs font-medium flex items-center justify-center gap-1 cursor-ns-resize touch-none select-none transition-transform active:scale-[0.97] min-h-[48px]"
            title="Scroll"
          >
            <CaretUp size={14} />
            <span>Scroll</span>
            <CaretDown size={14} />
          </div>
        </div>
      </div>
    </div>
  );
};
