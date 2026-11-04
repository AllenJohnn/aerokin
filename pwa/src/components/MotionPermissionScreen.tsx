import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AerokinLogo } from '@ui';
import { triggerHaptic } from '../utils/haptics';

export interface MotionPermissionScreenProps {
  onPermissionGranted: () => void;
  theme?: string;
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
    <div className="relative flex flex-col justify-between min-h-[100dvh] w-full px-gutter pt-safe pb-safe bg-bg text-foreground select-none overflow-hidden">
      {/* Centered Hero Content with Lots of Whitespace */}
      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto w-full py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="flex flex-col items-center"
        >
          <div className="mb-6">
            <AerokinLogo size={56} />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Aerokin
          </h1>

          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Control your PC from your iPhone.
          </p>
        </motion.div>
      </div>

      {/* Bottom Action Area */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 34, delay: 0.05 }}
        className="w-full max-w-sm mx-auto pb-4 flex flex-col items-center"
      >
        <button
          onClick={handleRequestMotion}
          className="w-full h-12 min-h-[48px] rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-pressed text-black text-sm font-semibold transition-transform active:scale-[0.97] flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Enable motion
        </button>

        {errorMsg && (
          <p className="mt-3 text-xs text-error text-center">
            {errorMsg}
          </p>
        )}
      </motion.div>
    </div>
  );
};
