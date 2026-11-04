import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/Sheet';
import { ThemeMode } from '../theme/tokens';
import { AirPointerConfig, CalibrationData } from '../engine/airPointer';
import { triggerHaptic } from '../utils/haptics';
import { Slider } from './ui/Slider';
import { Copy, Check, ArrowClockwise } from '@phosphor-icons/react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  config: AirPointerConfig;
  onConfigChange: (newConfig: Partial<AirPointerConfig>) => void;
  calibration: CalibrationData;
  onResetCalibration: () => void;
  onOpenCalibrationWizard: () => void;
  seekMethod: 'auto' | 'keys';
  onSeekMethodChange: (method: 'auto' | 'keys') => void;
  token?: string | null;
  onOpenAuthModal?: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onOpenChange,
  theme,
  onThemeChange,
  config,
  onConfigChange,
  calibration,
  onResetCalibration,
  onOpenCalibrationWizard,
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                      ? 'bg-accent text-white'
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
                      ? 'bg-accent text-white'
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
                    className="p-2 rounded-lg border border-border bg-raised text-muted-foreground hover:text-foreground transition-colors"
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
                  className="px-3 py-1.5 rounded-lg border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-colors"
                >
                  Calibrate
                </button>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-border" />

          {/* Section 2: Media */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                      ? 'bg-accent text-white'
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
                      ? 'bg-accent text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Keys
                </button>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-border" />

          {/* Section 3: Appearance */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Appearance
            </h3>

            {/* Theme segmented control */}
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground">Theme</span>
              <div className="inline-flex rounded-xl bg-raised p-1 border border-border">
                {(['system', 'light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      onThemeChange(t);
                      triggerHaptic('light');
                    }}
                    className={`capitalize px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      theme === t
                        ? 'bg-accent text-white'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-border" />

          {/* Section 4: Connection */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                    className="p-2 rounded-lg border border-border bg-raised hover:bg-border text-foreground transition-colors"
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
                    className="px-3 py-1.5 rounded-lg border border-border bg-raised hover:bg-border text-foreground text-xs font-medium transition-colors"
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
