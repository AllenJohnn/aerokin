import React from 'react';
import { Drawer } from 'vaul';
import { ThemePreset } from '../theme/tokens';
import { AirPointerConfig, CalibrationData } from '../engine/airPointer';
import { triggerHaptic } from '../utils/haptics';
import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import {
  Gear,
  X,
  Compass,
  Palette,
  SlidersHorizontal,
  HandPointing,
  PlayCircle,
  ArrowsClockwise,
} from '@phosphor-icons/react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemePreset;
  onThemeChange: (theme: ThemePreset) => void;
  config: AirPointerConfig;
  onConfigChange: (newConfig: Partial<AirPointerConfig>) => void;
  calibration: CalibrationData;
  onResetCalibration: () => void;
  onOpenCalibrationWizard: () => void;
  seekMethod: 'auto' | 'keys';
  onSeekMethodChange: (method: 'auto' | 'keys') => void;
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
}) => {
  return (
    <Drawer.Root open={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] rounded-t-2xl bg-hw-surface border-t border-hw-border-milled shadow-2xl flex flex-col focus:outline-none">
          {/* Hardware Grip Drag Handle */}
          <div className="mx-auto w-12 h-1.5 rounded-full bg-white/20 mt-3 mb-2" />

          {/* Drawer Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-hw-border">
            <div className="flex items-center gap-2">
              <Gear size={20} className="text-hw-primary" weight="bold" />
              <Drawer.Title className="font-display font-bold text-sm text-hw-text uppercase tracking-wider">
                Remote Settings
              </Drawer.Title>
            </div>
            <Drawer.Close asChild>
              <button
                className="p-1.5 rounded text-hw-text-muted hover:text-hw-text hover:bg-white/5 active:scale-95 transition-all"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Drawer.Close>
          </div>

          {/* Drawer Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-xs select-none">
            {/* 1. Hardware Theme Presets */}
            <div>
              <div className="flex items-center gap-1.5 text-hw-text-muted mb-2 font-mono uppercase text-[10px] tracking-wider">
                <Palette size={14} />
                <span>HARDWARE THEME PRESET</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onThemeChange('decepticon');
                    triggerHaptic('light');
                  }}
                  className={`p-3 rounded border text-left flex flex-col justify-between transition-all ${
                    theme === 'decepticon'
                      ? 'bg-hw-surface-raised border-hw-primary shadow-hw-btn ring-1 ring-hw-primary/40'
                      : 'bg-hw-surface-sunken border-hw-border-subtle opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold uppercase text-xs text-hw-text">
                      DECEPTICON
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FF2E2E] shadow-[0_0_6px_#FF2E2E]" />
                  </div>
                  <span className="text-[10px] text-hw-text-dim mt-1">
                    Gunmetal · Purple · Optic Red
                  </span>
                </button>

                <button
                  onClick={() => {
                    onThemeChange('aero');
                    triggerHaptic('light');
                  }}
                  className={`p-3 rounded border text-left flex flex-col justify-between transition-all ${
                    theme === 'aero'
                      ? 'bg-hw-surface-raised border-hw-primary shadow-hw-btn ring-1 ring-hw-primary/40'
                      : 'bg-hw-surface-sunken border-hw-border-subtle opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold uppercase text-xs text-hw-text">
                      AERO
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full bg-[#22D3EE] shadow-[0_0_6px_#22D3EE]" />
                  </div>
                  <span className="text-[10px] text-hw-text-dim mt-1">
                    Midnight · Violet · Cyan
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Pointer Mode */}
            <div>
              <div className="flex items-center gap-1.5 text-hw-text-muted mb-2 font-mono uppercase text-[10px] tracking-wider">
                <HandPointing size={14} />
                <span>AIR POINTER MODE</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onConfigChange({ mode: 'magic' });
                    triggerHaptic('light');
                  }}
                  className={`p-2.5 rounded border text-left transition-all ${
                    config.mode === 'magic'
                      ? 'bg-hw-surface-raised border-hw-primary shadow-hw-btn ring-1 ring-hw-primary/40'
                      : 'bg-hw-surface-sunken border-hw-border-subtle opacity-75'
                  }`}
                >
                  <div className="font-display font-bold uppercase text-xs text-hw-text">
                    MAGIC (ALWAYS-ON)
                  </div>
                  <div className="text-[10px] text-hw-text-dim mt-0.5">
                    LG webOS style · Continuous tracking
                  </div>
                </button>

                <button
                  onClick={() => {
                    onConfigChange({ mode: 'hold' });
                    triggerHaptic('light');
                  }}
                  className={`p-2.5 rounded border text-left transition-all ${
                    config.mode === 'hold'
                      ? 'bg-hw-surface-raised border-hw-primary shadow-hw-btn ring-1 ring-hw-primary/40'
                      : 'bg-hw-surface-sunken border-hw-border-subtle opacity-75'
                  }`}
                >
                  <div className="font-display font-bold uppercase text-xs text-hw-text">
                    HOLD TO ENGAGE
                  </div>
                  <div className="text-[10px] text-hw-text-dim mt-0.5">
                    Moves only when thumb is pressed
                  </div>
                </button>
              </div>
            </div>

            {/* 3. Sensitivity Controls */}
            <div>
              <div className="flex items-center justify-between mb-2 font-mono uppercase text-[10px] tracking-wider text-hw-text-muted">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal size={14} />
                  <span>SENSITIVITY</span>
                </div>
                <span className="text-hw-primary font-bold">
                  {(config.fineSensitivity).toFixed(2)}x
                </span>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {(['slow', 'medium', 'fast'] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      onConfigChange({ sensitivityPreset: preset });
                      triggerHaptic('light');
                    }}
                    className={`py-1.5 px-3 rounded uppercase font-display font-bold text-xs tracking-wider border transition-all ${
                      config.sensitivityPreset === preset
                        ? 'bg-hw-primary text-white border-hw-primary shadow-hw-btn'
                        : 'bg-hw-surface-sunken text-hw-text-muted border-hw-border-subtle'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Radix Fine Slider */}
              <div className="bg-hw-surface-sunken p-3 rounded border border-hw-border-subtle">
                <div className="flex justify-between text-[10px] font-mono text-hw-text-dim mb-2">
                  <span>PRECISION (0.5x)</span>
                  <span>RAPID FLICK (2.5x)</span>
                </div>
                <Slider.Root
                  value={[config.fineSensitivity]}
                  onValueChange={([val]) => {
                    onConfigChange({ fineSensitivity: val });
                  }}
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  className="relative flex items-center select-none touch-none w-full h-5"
                >
                  <Slider.Track className="bg-white/10 relative grow rounded-full h-1.5">
                    <Slider.Range className="absolute bg-hw-primary rounded-full h-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-4 h-4 bg-white rounded-full shadow-md focus:outline-none cursor-pointer"
                    aria-label="Fine Sensitivity"
                  />
                </Slider.Root>
              </div>
            </div>

            {/* 4. Calibration Wizard */}
            <div>
              <div className="flex items-center gap-1.5 text-hw-text-muted mb-2 font-mono uppercase text-[10px] tracking-wider">
                <Compass size={14} />
                <span>GYROSCOPIC CALIBRATION</span>
              </div>
              <div className="bg-hw-surface-sunken p-3 rounded border border-hw-border-subtle flex items-center justify-between">
                <div>
                  <div className="font-display font-bold text-xs text-hw-text">
                    {calibration.calibrated ? 'CALIBRATED & LOCKED' : 'FACTORY DEFAULT'}
                  </div>
                  <div className="font-mono text-[10px] text-hw-text-dim mt-0.5">
                    {calibration.calibrated
                      ? `Yaw: ${calibration.yawAxis} (${calibration.yawSign > 0 ? '+1' : '-1'}) · Pitch: ${calibration.pitchAxis} (${calibration.pitchSign > 0 ? '+1' : '-1'})`
                      : 'Run wizard for personalized hand posture'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {calibration.calibrated && (
                    <button
                      onClick={() => {
                        onResetCalibration();
                        triggerHaptic('medium');
                      }}
                      className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-hw-text-muted hover:text-hw-text"
                      title="Reset to factory"
                    >
                      <ArrowsClockwise size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onOpenChange(false);
                      onOpenCalibrationWizard();
                    }}
                    className="py-1.5 px-3 rounded bg-hw-surface-raised border border-hw-border-milled font-display font-bold text-xs uppercase text-hw-text shadow-hw-btn active:scale-95 transition-all"
                  >
                    Calibrate
                  </button>
                </div>
              </div>
            </div>

            {/* 5. Media Seek Method */}
            <div>
              <div className="flex items-center gap-1.5 text-hw-text-muted mb-2 font-mono uppercase text-[10px] tracking-wider">
                <PlayCircle size={14} />
                <span>MEDIA SEEK METHOD</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onSeekMethodChange('auto');
                    triggerHaptic('light');
                  }}
                  className={`p-2.5 rounded border text-left transition-all ${
                    seekMethod === 'auto'
                      ? 'bg-hw-surface-raised border-hw-primary shadow-hw-btn ring-1 ring-hw-primary/40'
                      : 'bg-hw-surface-sunken border-hw-border-subtle opacity-75'
                  }`}
                >
                  <div className="font-display font-bold uppercase text-xs text-hw-text">
                    AUTO (SMTC + KEYS)
                  </div>
                  <div className="text-[10px] text-hw-text-dim mt-0.5">
                    Windows timeline with hotkey fallback
                  </div>
                </button>

                <button
                  onClick={() => {
                    onSeekMethodChange('keys');
                    triggerHaptic('light');
                  }}
                  className={`p-2.5 rounded border text-left transition-all ${
                    seekMethod === 'keys'
                      ? 'bg-hw-surface-raised border-hw-primary shadow-hw-btn ring-1 ring-hw-primary/40'
                      : 'bg-hw-surface-sunken border-hw-border-subtle opacity-75'
                  }`}
                >
                  <div className="font-display font-bold uppercase text-xs text-hw-text">
                    KEYS ONLY
                  </div>
                  <div className="text-[10px] text-hw-text-dim mt-0.5">
                    Strict hardware arrow & J/L keys
                  </div>
                </button>
              </div>
            </div>

            {/* 6. Advanced Hardware Invert / Swap */}
            <div className="pt-2 border-t border-hw-border-subtle space-y-3">
              <div className="text-[10px] font-mono text-hw-text-dim uppercase tracking-wider">
                ADVANCED AXIS OVERRIDES
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-hw-text font-mono">Invert X (Horizontal)</span>
                <Switch.Root
                  checked={config.invertX}
                  onCheckedChange={(checked) => onConfigChange({ invertX: checked })}
                  className="w-9 h-5 bg-hw-surface-sunken border border-hw-border-subtle rounded-full relative data-[state=checked]:bg-hw-primary focus:outline-none cursor-pointer"
                >
                  <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-hw-text font-mono">Invert Y (Vertical)</span>
                <Switch.Root
                  checked={config.invertY}
                  onCheckedChange={(checked) => onConfigChange({ invertY: checked })}
                  className="w-9 h-5 bg-hw-surface-sunken border border-hw-border-subtle rounded-full relative data-[state=checked]:bg-hw-primary focus:outline-none cursor-pointer"
                >
                  <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-hw-text font-mono">Swap X / Y Axes</span>
                <Switch.Root
                  checked={config.swapAxes}
                  onCheckedChange={(checked) => onConfigChange({ swapAxes: checked })}
                  className="w-9 h-5 bg-hw-surface-sunken border border-hw-border-subtle rounded-full relative data-[state=checked]:bg-hw-primary focus:outline-none cursor-pointer"
                >
                  <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
