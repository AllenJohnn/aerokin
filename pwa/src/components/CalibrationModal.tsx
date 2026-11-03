import React, { useState, useEffect, useRef } from 'react';
import { CalibrationData } from '../engine/airPointer';
import { triggerHaptic } from '../utils/haptics';
import { ArrowRight, ArrowUp, Check, X, Compass } from '@phosphor-icons/react';

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

      // Check if sweep threshold met (> 35 deg/s)
      if (mag > 35 && samplesRef.current.length >= 8) {
        // Average recent samples to find dominant axis
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="w-full max-w-sm rounded-lg bg-hw-surface border border-hw-border shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-hw-surface-raised border-b border-hw-border">
          <div className="flex items-center gap-2">
            <Compass size={18} className="text-hw-primary" weight="bold" />
            <span className="font-display font-bold uppercase tracking-wider text-xs text-hw-text">
              Air Pointer Calibration
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-hw-text-muted hover:text-hw-text hover:bg-white/5 active:scale-95 transition-all"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center text-center">
          {step === 'right' && (
            <>
              <div className="w-16 h-16 rounded-full bg-hw-surface-sunken border border-hw-border flex items-center justify-center mb-4 text-hw-primary shadow-hw-well">
                <ArrowRight size={32} weight="bold" className="animate-pulse" />
              </div>
              <h3 className="font-display font-bold text-base text-hw-text uppercase tracking-wide">
                Step 1: Sweep Right
              </h3>
              <p className="font-sans text-xs text-hw-text-muted mt-2 leading-relaxed">
                Hold your phone naturally and firmly flick or sweep it to the right across the air.
              </p>
              <div className="w-full mt-6 bg-hw-surface-sunken p-2.5 rounded border border-hw-border-subtle">
                <div className="flex justify-between text-[10px] font-mono text-hw-text-dim mb-1">
                  <span>DETECTING VELOCITY</span>
                  <span>{peakRate} deg/s</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-hw-primary transition-all duration-75"
                    style={{ width: `${Math.min(100, (peakRate / 40) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {step === 'up' && (
            <>
              <div className="w-16 h-16 rounded-full bg-hw-surface-sunken border border-hw-border flex items-center justify-center mb-4 text-hw-active shadow-hw-well">
                <ArrowUp size={32} weight="bold" className="animate-pulse" />
              </div>
              <h3 className="font-display font-bold text-base text-hw-text uppercase tracking-wide">
                Step 2: Sweep Up
              </h3>
              <p className="font-sans text-xs text-hw-text-muted mt-2 leading-relaxed">
                Now pitch or sweep the phone upward like pointing at the top of your PC display.
              </p>
              <div className="w-full mt-6 bg-hw-surface-sunken p-2.5 rounded border border-hw-border-subtle">
                <div className="flex justify-between text-[10px] font-mono text-hw-text-dim mb-1">
                  <span>DETECTING VELOCITY</span>
                  <span>{peakRate} deg/s</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-hw-active transition-all duration-75"
                    style={{ width: `${Math.min(100, (peakRate / 40) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400">
                <Check size={32} weight="bold" />
              </div>
              <h3 className="font-display font-bold text-base text-hw-text uppercase tracking-wide">
                Calibration Calibrated
              </h3>
              <p className="font-sans text-xs text-hw-text-muted mt-2">
                Optimal coordinate axes and signs have been locked into hardware memory.
              </p>

              <div className="w-full mt-4 p-3 rounded bg-hw-surface-sunken border border-hw-border-subtle text-left font-mono text-[11px] space-y-1">
                <div className="flex justify-between text-hw-text-muted">
                  <span>YAW AXIS</span>
                  <span className="text-hw-text font-bold uppercase">{detectedYawAxis} ({detectedYawSign > 0 ? '+1' : '-1'})</span>
                </div>
                <div className="flex justify-between text-hw-text-muted">
                  <span>PITCH AXIS</span>
                  <span className="text-hw-text font-bold uppercase">{detectedPitchAxis} ({detectedPitchSign > 0 ? '+1' : '-1'})</span>
                </div>
              </div>

              <button
                onClick={handleFinish}
                className="w-full mt-6 py-2.5 px-4 rounded bg-hw-primary hover:bg-hw-primary-hover active:scale-[0.98] text-white font-display font-bold text-xs uppercase tracking-wider transition-all shadow-hw-btn"
              >
                Save & Apply Calibration
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
