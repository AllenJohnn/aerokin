import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AerokinLogo, GlowButton, GlassCard, Pill } from '@ui';
import { triggerHaptic } from '../utils/haptics';
import { Compass, Zap, ShieldCheck } from 'lucide-react';

export interface MotionPermissionScreenProps {
  onPermissionGranted: () => void;
}

export const MotionPermissionScreen: React.FC<MotionPermissionScreenProps> = ({
  onPermissionGranted,
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
          setErrorMsg('Motion permission denied. Please allow motion sensors in iOS Safari settings.');
        }
      } else {
        onPermissionGranted();
      }
    } catch {
      onPermissionGranted(); // Fallback to allow trackpad/media access
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-between min-h-[100dvh] w-full p-6 pt-safe pb-safe text-center select-none overflow-hidden bg-aerokin-bg text-aerokin-text">
      {/* Ambient background aura */}
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-gradient-to-b from-[#7C5CFF]/20 to-[#22D3EE]/10 blur-3xl" />

      {/* Main hero area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex flex-col items-center justify-center max-w-sm z-10 my-auto"
      >
        {/* Animated Master Logo with anime.js line-draw intro */}
        <div className="relative mb-6">
          <AerokinLogo size={108} intro={true} animated={true} />
          {/* Subtle glow beacon ring */}
          <div className="pointer-events-none absolute inset-0 -m-4 rounded-full bg-aerokin-cyan/10 blur-xl animate-pulse" />
        </div>

        <h1 className="font-sans text-4xl sm:text-5xl font-extrabold tracking-tightest text-white leading-tight">
          AEROKIN
        </h1>

        <p className="font-mono text-xs uppercase tracking-[0.24em] text-aerokin-cyan mt-2.5 font-semibold">
          Move the air. Move your PC.
        </p>

        <p className="font-sans text-xs text-aerokin-muted mt-5 max-w-xs leading-relaxed">
          iPhone 6-axis spatial air mouse, precision haptic trackpad, and Windows media remote.
        </p>

        {/* Feature badges with Lucide icons */}
        <div className="grid grid-cols-3 gap-2 mt-7 w-full max-w-xs">
          <div className="flex flex-col items-center p-2 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <Compass className="w-4 h-4 text-aerokin-cyan mb-1" />
            <span className="font-mono text-[10px] text-white">60Hz Gyro</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <Zap className="w-4 h-4 text-purple-400 mb-1" />
            <span className="font-mono text-[10px] text-white">&lt;15ms Ping</span>
          </div>
          <div className="flex flex-col items-center p-2 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="font-mono text-[10px] text-white">Zero Install</span>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4">
            <Pill status="error" size="sm">
              {errorMsg}
            </Pill>
          </div>
        )}
      </motion.div>

      {/* Bottom CTA container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm flex flex-col gap-3 z-10"
      >
        <GlassCard variant="subtle" padding="sm" className="text-[11px] text-aerokin-muted">
          iOS requires a one-time gesture tap to engage the gyroscope sensors.
        </GlassCard>

        <GlowButton
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleRequestMotion}
          className="shadow-glow-md"
        >
          Enable Motion Sensors
        </GlowButton>
      </motion.div>
    </div>
  );
};
