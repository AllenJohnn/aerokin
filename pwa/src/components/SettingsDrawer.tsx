import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/Sheet';
import { AirPointerConfig, CalibrationData } from '../engine/airPointer';
import { TrackpadConfig } from '../engine/trackpadGestures';
import { triggerHaptic } from '../utils/haptics';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';
import { Copy, Check, ArrowClockwise } from '@phosphor-icons/react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  config: AirPointerConfig;
  onConfigChange: (newConfig: Partial<AirPointerConfig>) => void;
  calibration: CalibrationData;
  onResetCalibration: () => void;
  onOpenCalibrationWizard: () => void;
  trackpadConfig: TrackpadConfig;
  onTrackpadConfigChange: (newConfig: Partial<TrackpadConfig>) => void;
  onResetTrackpadConfig: () => void;
  seekMethod: 'auto' | 'keys';
  onSeekMethodChange: (method: 'auto' | 'keys') => void;
  token?: string | null;
  onOpenAuthModal?: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onOpenChange,
  config,
  onConfigChange,
  calibration,
  onResetCalibration,
  onOpenCalibrationWizard,
  trackpadConfig,
  onTrackpadConfigChange,
  onResetTrackpadConfig,
  seekMethod,
  onSeekMethodChange,
  token,
  onOpenAuthModal,
}) => {
  const [copiedToken, setCopiedToken] = useState(false);

  const handleCopyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopiedToken(true);
      triggerHaptic('light');
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="pb-safe">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm">
          {/* Section 1: Pointer */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Pointer
            </h3>

            {/* Speed slider row */}
            <div className="flex flex-col gap-2 py-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Speed</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {config.fineSensitivity.toFixed(2)}x
                </span>
              </div>
              <Slider
                value={[config.fineSensitivity]}
                min={0.5}
                max={2.5}
                step={0.05}
                onValueChange={([val]) => onConfigChange({ fineSensitivity: val })}
                aria-label="Pointer speed"
              />
            </div>

            {/* Mode segmented control */}
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground">Mode</span>
              <div className="inline-flex rounded-xl bg-raised p-1 border border-border">
                <button
                  onClick={() => {
                    onConfigChange({ mode: 'magic' });
                    triggerHaptic('light');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    config.mode === 'magic'
                      ? 'bg-accent text-black font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Magic
                </button>
                <button
                  onClick={() => {
                    onConfigChange({ mode: 'hold' });
                    triggerHaptic('light');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    config.mode === 'hold'
                      ? 'bg-accent text-black font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Hold
                </button>
              </div>
            </div>

            {/* Calibrate row */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm text-foreground">Calibration</p>
                <p className="text-xs text-muted-foreground">
                  {calibration.calibrated ? 'Calibrated' : 'Default'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {calibration.calibrated && (
                  <button
                    onClick={() => {
                      onResetCalibration();
                      triggerHaptic('medium');
                    }}
                    className="p-2 rounded-lg border border-border bg-raised text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Reset calibration"
                    aria-label="Reset calibration"
                  >
                    <ArrowClockwise size={16} />
                  </button>
                )}
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onOpenCalibrationWizard();
                  }}
                  className="px-3 py-1.5 rounded-lg border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-colors min-h-[44px] flex items-center justify-center"
                >
                  Calibrate
                </button>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-border" />

          {/* Section 2: Trackpad */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">
                Trackpad
              </h3>
              <button
                onClick={() => {
                  onResetTrackpadConfig();
                  triggerHaptic('medium');
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-raised active:scale-[0.97]"
                title="Reset trackpad to defaults"
                aria-label="Reset trackpad to defaults"
              >
                <ArrowClockwise size={13} />
                <span>Reset</span>
              </button>
            </div>

            {/* Pointer Speed Slider */}
            <div className="flex flex-col gap-2 py-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Pointer speed</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {trackpadConfig.pointerSpeed.toFixed(2)}x
                </span>
              </div>
              <Slider
                value={[trackpadConfig.pointerSpeed]}
                min={0.5}
                max={3.0}
                step={0.05}
                onValueChange={([val]) =>
                  onTrackpadConfigChange({ pointerSpeed: Math.round(val * 100) / 100 })
                }
                aria-label="Trackpad pointer speed"
              />
            </div>

            {/* Natural Scrolling Toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-sm text-foreground">Natural scrolling</span>
                <p className="text-xs text-muted-foreground">Fingers up scrolls page down</p>
              </div>
              <Switch
                checked={trackpadConfig.naturalScroll}
                onCheckedChange={(checked) => {
                  onTrackpadConfigChange({ naturalScroll: checked });
                  triggerHaptic('light');
                }}
                aria-label="Natural scrolling"
              />
            </div>

            {/* Vertical Scroll Speed Slider */}
            <div className="flex flex-col gap-2 py-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Vertical scroll speed</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {trackpadConfig.scrollSensitivityY.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[trackpadConfig.scrollSensitivityY]}
                min={0.05}
                max={1.5}
                step={0.05}
                onValueChange={([val]) =>
                  onTrackpadConfigChange({ scrollSensitivityY: Math.round(val * 100) / 100 })
                }
                aria-label="Vertical scroll speed"
              />
            </div>

            {/* Horizontal Scroll Speed Slider */}
            <div className="flex flex-col gap-2 py-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Horizontal scroll speed</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {trackpadConfig.scrollSensitivityX.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[trackpadConfig.scrollSensitivityX]}
                min={0.05}
                max={1.5}
                step={0.05}
                onValueChange={([val]) =>
                  onTrackpadConfigChange({ scrollSensitivityX: Math.round(val * 100) / 100 })
                }
                aria-label="Horizontal scroll speed"
              />
            </div>

            {/* Momentum Toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-sm text-foreground">Momentum</span>
                <p className="text-xs text-muted-foreground">Inertial glide on flick</p>
              </div>
              <Switch
                checked={trackpadConfig.momentum}
                onCheckedChange={(checked) => {
                  onTrackpadConfigChange({ momentum: checked });
                  triggerHaptic('light');
                }}
                aria-label="Momentum scrolling"
              />
            </div>

            {/* Momentum Decay Slider (Shown only when momentum is ON) */}
            {trackpadConfig.momentum && (
              <div className="flex flex-col gap-2 py-1 pl-3 border-l-2 border-border/80 ml-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-foreground">Momentum decay</span>
                    <p className="text-xs text-muted-foreground">Glide friction rate</p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {trackpadConfig.momentumDecay.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[trackpadConfig.momentumDecay]}
                  min={0.8}
                  max={0.98}
                  step={0.01}
                  onValueChange={([val]) =>
                    onTrackpadConfigChange({ momentumDecay: Math.round(val * 100) / 100 })
                  }
                  aria-label="Momentum decay"
                />
              </div>
            )}

            {/* Scroll Haptics Toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <span className="text-sm text-foreground">Scroll haptics</span>
                <p className="text-xs text-muted-foreground">Detent feedback when scrolling</p>
              </div>
              <Switch
                checked={trackpadConfig.scrollHaptics}
                onCheckedChange={(checked) => {
                  onTrackpadConfigChange({ scrollHaptics: checked });
                  triggerHaptic('light');
                }}
                aria-label="Scroll haptics"
              />
            </div>
          </div>

          <div className="h-[1px] bg-border" />

          {/* Section 3: Media */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Media
            </h3>

            {/* Seek method row */}
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground">Seek method</span>
              <div className="inline-flex rounded-xl bg-raised p-1 border border-border">
                <button
                  onClick={() => {
                    onSeekMethodChange('auto');
                    triggerHaptic('light');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    seekMethod === 'auto'
                      ? 'bg-accent text-black font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Auto
                </button>
                <button
                  onClick={() => {
                    onSeekMethodChange('keys');
                    triggerHaptic('light');
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    seekMethod === 'keys'
                      ? 'bg-accent text-black font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Keys
                </button>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-border" />

          {/* Section 3: Connection */}
          <div className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              Connection
            </h3>

            {/* Token row */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm text-foreground">Token</p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {token || 'None'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {token && (
                  <button
                    onClick={handleCopyToken}
                    className="p-2 rounded-lg border border-border bg-raised hover:bg-border text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Copy token"
                    aria-label="Copy token"
                  >
                    {copiedToken ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                  </button>
                )}
                {onOpenAuthModal && (
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      onOpenAuthModal();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-colors min-h-[44px] flex items-center justify-center"
                  >
                    Re-pair
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
