import React, { useState } from 'react';
import { AerokinLogo, GlowButton, GlassCard, Pill } from '@ui';
import { triggerHaptic } from '../utils/haptics';

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
      // iOS 13+ requires explicit permission requested within user interaction event
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
          setErrorMsg('Motion permission was denied. Tap "Allow" when prompted by iOS.');
        }
      } else {
        // Non-iOS devices or already granted
        onPermissionGranted();
      }
    } catch (err) {
      // If error or cancelled
      onPermissionGranted(); // Fallback so user can still access Trackpad & Media
    }
  };

  return (
    <div className="flex flex-col items-center justify-between h-full w-full p-6 pt-safe pb-safe text-center">
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm">
        <AerokinLogo size="lg" animated className="mb-6" />

        <h1 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tightest text-white leading-tight">
          AEROKIN
        </h1>

        <p className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan mt-2">
          Move the air. Move your PC.
        </p>

        <p className="font-sans text-xs text-aerokin-muted mt-6 max-w-xs leading-relaxed">
          Transform your iPhone into a 6-axis spatial air mouse, precision trackpad, and Windows media controller.
        </p>

        {errorMsg && (
          <div className="mt-4">
            <Pill status="error" size="sm">
              {errorMsg}
            </Pill>
          </div>
        )}
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        <GlassCard variant="subtle" padding="sm" className="text-[11px] text-aerokin-muted">
          iOS requires a one-time gesture permission to read gyro sensors.
        </GlassCard>

        <GlowButton
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleRequestMotion}
        >
          Enable Motion Sensors
        </GlowButton>
      </div>
    </div>
  );
};
