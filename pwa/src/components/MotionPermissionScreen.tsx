import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AerokinLogo } from '@ui';
import { triggerHaptic } from '../utils/haptics';
import { ThemePreset } from '../theme/tokens';
import { Compass, Lightning, ShieldCheck, WarningCircle } from '@phosphor-icons/react';

export interface MotionPermissionScreenProps {
  onPermissionGranted: () => void;
  theme?: ThemePreset;
}

export const MotionPermissionScreen: React.FC<MotionPermissionScreenProps> = ({
  onPermissionGranted,
  theme = 'decepticon',
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRequestMotion = async () => {
    triggerHaptic('medium');
    setErrorMsg(null);

    try {
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
          .requestPermission === 'function'
      ) {
        const response = await (
          DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();

        if (response === 'granted') {
          triggerHaptic('heavy');
          onPermissionGranted();
        } else {
          setErrorMsg('Motion permission denied. Enable motion sensors in iOS Safari settings.');
        }
      } else {
        onPermissionGranted();
      }
    } catch {
      onPermissionGranted(); // Fallback to allow trackpad/media access
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-between min-h-[100dvh] w-full p-6 pt-safe pb-safe text-center select-none overflow-hidden bg-hw-bg text-hw-text">
      {/* Main Chassis Panel */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex flex-col items-center justify-center max-w-sm z-10 my-auto w-full"
      >
        {/* Animated Machined Logo */}
        <div className="p-4 rounded-2xl bg-hw-surface border border-hw-border shadow-hw-well mb-6">
          <AerokinLogo size={84} intro={true} animated={true} theme={theme} />
        </div>

        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-wider text-hw-text uppercase">
          AEROKIN
        </h1>

        <p className="font-mono text-xs uppercase tracking-[0.24em] text-hw-primary mt-2 font-bold">
          Move the air. Move your PC.
        </p>

        <p className="font-sans text-xs text-hw-text-muted mt-3 max-w-xs leading-relaxed">
          Machined 6-axis air pointer, haptic precision trackpad, and universal media console.
        </p>

        {/* Machined Hardware Spec Matrix */}
        <div className="grid grid-cols-3 gap-2 mt-6 w-full max-w-xs">
          <div className="flex flex-col items-center p-2.5 rounded-lg border border-hw-border-subtle bg-hw-surface-sunken">
            <Compass size={18} className="text-hw-primary mb-1" weight="bold" />
            <span className="font-mono text-[10px] text-hw-text font-bold">60Hz Gyro</span>
            <span className="font-mono text-[8.5px] text-hw-text-dim">1€ Filter</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg border border-hw-border-subtle bg-hw-surface-sunken">
            <Lightning size={18} className="text-amber-400 mb-1" weight="bold" />
            <span className="font-mono text-[10px] text-hw-text font-bold">&lt;15ms RTT</span>
            <span className="font-mono text-[8.5px] text-hw-text-dim">WebSocket</span>
          </div>
          <div className="flex flex-col items-center p-2.5 rounded-lg border border-hw-border-subtle bg-hw-surface-sunken">
            <ShieldCheck size={18} className="text-emerald-400 mb-1" weight="bold" />
            <span className="font-mono text-[10px] text-hw-text font-bold">Local CA</span>
            <span className="font-mono text-[8.5px] text-hw-text-dim">Zero Warning</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
            <WarningCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </motion.div>

      {/* Bottom Tactile Action Block */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm flex flex-col gap-3 z-10"
      >
        <div className="p-3 rounded-lg bg-hw-surface-sunken border border-hw-border-subtle text-[11px] font-mono text-hw-text-dim text-center">
          Tap below to initialize 6-DOF gyroscopic sensors for air mouse navigation.
        </div>

        <button
          onClick={handleRequestMotion}
          className="w-full py-4 px-6 rounded-xl bg-hw-primary hover:bg-hw-primary-hover active:scale-[0.98] text-white font-display font-bold text-sm uppercase tracking-wider transition-all shadow-hw-btn"
        >
          Initialize Remote Sensors
        </button>
      </motion.div>
    </div>
  );
};
