import React, { useState, useEffect, useRef } from 'react';
import { CalibrationData } from '../engine/airPointer';
import { triggerHaptic } from '../utils/haptics';
import { ArrowRight, ArrowUp, Check, X } from '@phosphor-icons/react';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCalibration: (data: CalibrationData) => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  onSaveCalibration,
}) => {
  const [step, setStep] = useState<'right' | 'up' | 'done'>('right');
  const [detectedYawAxis, setDetectedYawAxis] = useState<'alpha' | 'beta' | 'gamma'>('alpha');
  const [detectedYawSign, setDetectedYawSign] = useState<1 | -1>(1);
  const [detectedPitchAxis, setDetectedPitchAxis] = useState<'alpha' | 'beta' | 'gamma'>('beta');
  const [detectedPitchSign, setDetectedPitchSign] = useState<1 | -1>(1);
  const [peakRate, setPeakRate] = useState<number>(0);

  const samplesRef = useRef<Array<{ alpha: number; beta: number; gamma: number }>>([]);

  useEffect(() => {
    if (!isOpen) {
      setStep('right');
      setPeakRate(0);
      samplesRef.current = [];
      return;
    }

    const handleMotion = (e: DeviceMotionEvent) => {
      const rot = e.rotationRate;
      if (!rot) return;

      const alpha = rot.alpha ?? 0;
      const beta = rot.beta ?? 0;
      const gamma = rot.gamma ?? 0;

      const mag = Math.sqrt(alpha * alpha + beta * beta + gamma * gamma);
      setPeakRate((prev) => Math.max(prev, Math.round(mag)));

      samplesRef.current.push({ alpha, beta, gamma });
      if (samplesRef.current.length > 20) {
        samplesRef.current.shift();
      }

      if (mag > 35 && samplesRef.current.length >= 8) {
        let sumA = 0, sumB = 0, sumG = 0;
        for (const s of samplesRef.current) {
          sumA += s.alpha;
          sumB += s.beta;
          sumG += s.gamma;
        }

        const absA = Math.abs(sumA);
        const absB = Math.abs(sumB);
        const absG = Math.abs(sumG);

        let maxAxis: 'alpha' | 'beta' | 'gamma' = 'alpha';
        let maxVal = sumA;
        if (absB > absA && absB > absG) {
          maxAxis = 'beta';
          maxVal = sumB;
        } else if (absG > absA && absG > absB) {
          maxAxis = 'gamma';
          maxVal = sumG;
        }

        const sign: 1 | -1 = maxVal >= 0 ? 1 : -1;

        if (step === 'right') {
          setDetectedYawAxis(maxAxis);
          setDetectedYawSign(sign);
          triggerHaptic('success');
          samplesRef.current = [];
          setPeakRate(0);
          setStep('up');
        } else if (step === 'up') {
          setDetectedPitchAxis(maxAxis);
          setDetectedPitchSign(sign);
          triggerHaptic('success');
          samplesRef.current = [];
          setPeakRate(0);
          setStep('done');
        }
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isOpen, step]);

  if (!isOpen) return null;

  const handleFinish = () => {
    const data: CalibrationData = {
      yawAxis: detectedYawAxis,
      yawSign: detectedYawSign,
      pitchAxis: detectedPitchAxis,
      pitchSign: detectedPitchSign,
      calibrated: true,
    };
    onSaveCalibration(data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 select-none">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border overflow-hidden flex flex-col shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-sm font-semibold text-foreground">
            Calibration
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center text-center">
          {step === 'right' && (
            <>
              <div className="w-14 h-14 rounded-full bg-raised border border-border flex items-center justify-center mb-4 text-accent">
                <ArrowRight size={24} />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Step 1: Sweep right
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Hold your phone naturally and firmly sweep it to the right across the air.
              </p>
              <div className="w-full mt-6 bg-raised p-3 rounded-xl border border-border">
                <div className="flex justify-between text-xs font-mono tabular-nums text-muted-foreground mb-1.5">
                  <span>Velocity</span>
                  <span>{peakRate} deg/s</span>
                </div>
                <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-75"
                    style={{ width: `${Math.min(100, (peakRate / 40) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {step === 'up' && (
            <>
              <div className="w-14 h-14 rounded-full bg-raised border border-border flex items-center justify-center mb-4 text-accent">
                <ArrowUp size={24} />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Step 2: Sweep up
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Now sweep the phone upward toward your PC display.
              </p>
              <div className="w-full mt-6 bg-raised p-3 rounded-xl border border-border">
                <div className="flex justify-between text-xs font-mono tabular-nums text-muted-foreground mb-1.5">
                  <span>Velocity</span>
                  <span>{peakRate} deg/s</span>
                </div>
                <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-75"
                    style={{ width: `${Math.min(100, (peakRate / 40) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="w-14 h-14 rounded-full bg-success/10 border border-success/30 flex items-center justify-center mb-4 text-success">
                <Check size={24} />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Calibration complete
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Motion axes and directions have been updated.
              </p>

              <button
                onClick={handleFinish}
                className="w-full mt-6 h-12 min-h-[48px] rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-pressed text-black text-xs font-semibold transition-transform active:scale-[0.97]"
              >
                Save calibration
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
