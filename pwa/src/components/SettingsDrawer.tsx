import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/Sheet';
import { TrackpadConfig } from '../engine/trackpadGestures';
import { DeviceInfo } from '../hooks/useAerokinSocket';
import { DesktopSettings, QualityPresetName } from '../types/desktop';
import { triggerHaptic } from '../utils/haptics';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';
import {
  ArrowClockwise,
  DeviceMobile,
  PencilSimple,
  Trash,
  SignOut,
  Shield,
  Check,
} from '@phosphor-icons/react';

interface SettingsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  trackpadConfig: TrackpadConfig;
  onTrackpadConfigChange: (newConfig: Partial<TrackpadConfig>) => void;
  onResetTrackpadConfig: () => void;
  seekMethod: 'auto' | 'keys';
  onSeekMethodChange: (method: 'auto' | 'keys') => void;
  desktopSettings?: DesktopSettings;
  onDesktopSettingsChange?: (settings: Partial<DesktopSettings>) => void;
  token?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  devices?: DeviceInfo[];
  onRenameDevice?: (deviceId: string, name: string) => void;
  onRevokeDevice?: (deviceId: string) => void;
  onRevokeAllDevices?: (exceptCurrent?: boolean) => void;
  onLogout?: () => void;
  onUnpairThisDevice?: () => void;
  onOpenAuthModal?: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onOpenChange,
  trackpadConfig,
  onTrackpadConfigChange,
  onResetTrackpadConfig,
  seekMethod,
  onSeekMethodChange,
  desktopSettings,
  onDesktopSettingsChange,
  deviceId,
  deviceName,
  devices = [],
  onRenameDevice,
  onRevokeDevice,
  onRevokeAllDevices,
  onLogout,
  onUnpairThisDevice,
  onOpenAuthModal,
}) => {
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState('');

  const startRename = (id: string, currentName: string) => {
    setEditingDeviceId(id);
    setEditNameVal(currentName);
  };

  const saveRename = (id: string) => {
    const trimmed = editNameVal.trim();
    if (trimmed && onRenameDevice) {
      onRenameDevice(id, trimmed);
      triggerHaptic('light');
    }
    setEditingDeviceId(null);
  };

  const currentDevice = devices.find((d) => d.deviceId === deviceId);
  const otherDevices = devices.filter((d) => d.deviceId !== deviceId);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="pb-safe max-w-full overflow-x-hidden">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 text-sm">
          {/* Section 1: Trackpad */}
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

          {/* Section: Desktop Remote */}
          {desktopSettings && onDesktopSettingsChange && (
            <>
              <div className="space-y-4">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Desktop Remote
                </h3>

                {/* Default Input Mode */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-sm text-foreground">Default Input Mode</span>
                    <p className="text-xs text-muted-foreground">Touch style on desktop stream</p>
                  </div>
                  <div className="inline-flex rounded-xl bg-raised p-1 border border-border">
                    <button
                      onClick={() => {
                        onDesktopSettingsChange({ inputMode: 'direct' });
                        triggerHaptic('light');
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        desktopSettings.inputMode === 'direct'
                          ? 'bg-accent text-black font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Direct
                    </button>
                    <button
                      onClick={() => {
                        onDesktopSettingsChange({ inputMode: 'trackpad' });
                        triggerHaptic('light');
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                        desktopSettings.inputMode === 'trackpad'
                          ? 'bg-accent text-black font-semibold'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Trackpad
                    </button>
                  </div>
                </div>

                {/* Default Quality Preset */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-foreground">Default Quality</span>
                      <p className="text-xs text-muted-foreground">Resolution & compression scale</p>
                    </div>
                    <span className="font-mono text-xs capitalize text-muted-foreground">
                      {desktopSettings.defaultPreset}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(['ultra', 'high', 'balanced', 'fast', 'tiny'] as QualityPresetName[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          onDesktopSettingsChange({ defaultPreset: p });
                          triggerHaptic('light');
                        }}
                        className={`py-1.5 rounded-lg text-xs font-mono capitalize border transition-colors ${
                          desktopSettings.defaultPreset === p
                            ? 'bg-accent text-black font-semibold border-accent'
                            : 'bg-raised border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* FPS Cap Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-foreground">Frame rate cap</span>
                      <p className="text-xs text-muted-foreground">Target stream frames per second</p>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {desktopSettings.fpsCap} fps
                    </span>
                  </div>
                  <Slider
                    value={[desktopSettings.fpsCap]}
                    min={15}
                    max={60}
                    step={15}
                    onValueChange={([val]) =>
                      onDesktopSettingsChange({ fpsCap: Math.round(val) })
                    }
                    aria-label="Frame rate cap"
                  />
                </div>

                {/* Live Stats Overlay Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-sm text-foreground">Show stream stats</span>
                    <p className="text-xs text-muted-foreground">Display live FPS, bitrate, and latency</p>
                  </div>
                  <Switch
                    checked={desktopSettings.showStats}
                    onCheckedChange={(checked) => {
                      onDesktopSettingsChange({ showStats: checked });
                      triggerHaptic('light');
                    }}
                    aria-label="Show stream stats"
                  />
                </div>

                {/* Auto-Hide Toolbar Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-sm text-foreground">Auto-hide toolbar</span>
                    <p className="text-xs text-muted-foreground">Fade toolbar after 4 seconds of idle</p>
                  </div>
                  <Switch
                    checked={desktopSettings.autoHideToolbar}
                    onCheckedChange={(checked) => {
                      onDesktopSettingsChange({ autoHideToolbar: checked });
                      triggerHaptic('light');
                    }}
                    aria-label="Auto-hide toolbar"
                  />
                </div>
              </div>

              <div className="h-[1px] bg-border" />
            </>
          )}

          {/* Section 4: Devices & Security */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Shield size={16} className="text-accent" />
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Devices & Security
                </h3>
              </div>
              {onOpenAuthModal && (
                <button
                  onClick={() => {
                    onOpenChange(false);
                    onOpenAuthModal();
                  }}
                  className="text-xs text-accent hover:underline font-medium"
                >
                  + Pair New
                </button>
              )}
            </div>

            {/* This Device Card */}
            <div className="rounded-2xl bg-surface border border-border p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DeviceMobile size={18} className="text-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">
                    This Device
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-[11px] text-muted-foreground">Authenticated</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                {editingDeviceId === deviceId ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editNameVal}
                      onChange={(e) => setEditNameVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(deviceId!);
                        if (e.key === 'Escape') setEditingDeviceId(null);
                      }}
                      autoFocus
                      maxLength={32}
                      className="px-2 py-1 text-xs rounded bg-raised border border-border text-foreground w-full focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => saveRename(deviceId!)}
                      className="p-1 rounded text-accent hover:bg-raised"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-sm font-medium text-foreground truncate">
                      {currentDevice?.name || deviceName || "Allen's iPhone"}
                    </span>
                    <button
                      onClick={() =>
                        startRename(
                          deviceId || 'this_device',
                          currentDevice?.name || deviceName || "Allen's iPhone"
                        )
                      }
                      className="text-muted-foreground hover:text-foreground p-1"
                      title="Rename this device"
                    >
                      <PencilSimple size={13} />
                    </button>
                  </div>
                )}
                <span className="font-mono text-[11px] text-muted-foreground/60 shrink-0">
                  {deviceId ? `${deviceId.slice(0, 8)}...` : ''}
                </span>
              </div>

              {/* Action Buttons for This Device */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    onLogout?.();
                    onOpenChange(false);
                  }}
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-border bg-raised hover:bg-border text-xs text-foreground font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <SignOut size={14} />
                  <span>Logout</span>
                </button>

                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        'Unpair this device? You will need to enter a new 8-digit pairing code to reconnect.'
                      )
                    ) {
                      triggerHaptic('medium');
                      onUnpairThisDevice?.();
                      onOpenChange(false);
                    }
                  }}
                  className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl border border-optic-red/20 bg-optic-red/10 hover:bg-optic-red/20 text-xs text-optic-red font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash size={14} />
                  <span>Unpair</span>
                </button>
              </div>
            </div>

            {/* Other Paired Devices List */}
            {otherDevices.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Other Paired Devices ({otherDevices.length})</span>
                  <button
                    onClick={() => {
                      if (window.confirm('Revoke all other paired devices?')) {
                        triggerHaptic('medium');
                        onRevokeAllDevices?.(true);
                      }
                    }}
                    className="text-[11px] text-optic-red hover:underline font-medium"
                  >
                    Revoke Other
                  </button>
                </div>

                <div className="space-y-2">
                  {otherDevices.map((dev) => (
                    <div
                      key={dev.deviceId}
                      className="rounded-xl bg-surface border border-border p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex flex-col min-w-0">
                        {editingDeviceId === dev.deviceId ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editNameVal}
                              onChange={(e) => setEditNameVal(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename(dev.deviceId);
                                if (e.key === 'Escape') setEditingDeviceId(null);
                              }}
                              autoFocus
                              maxLength={32}
                              className="px-2 py-0.5 text-xs rounded bg-raised border border-border text-foreground w-36 focus:outline-none focus:border-accent"
                            />
                            <button
                              onClick={() => saveRename(dev.deviceId)}
                              className="p-1 rounded text-accent hover:bg-raised"
                              title="Save"
                            >
                              <Check size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-medium text-foreground truncate">
                              {dev.name}
                            </span>
                            <button
                              onClick={() => startRename(dev.deviceId, dev.name)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Rename device"
                            >
                              <PencilSimple size={12} />
                            </button>
                          </div>
                        )}
                        <span className="text-[10px] text-muted-foreground truncate">
                          {dev.platform} • Seen:{' '}
                          {dev.lastSeen ? new Date(dev.lastSeen).toLocaleTimeString() : 'Never'}
                          {dev.revoked && ' • [Revoked]'}
                        </span>
                      </div>

                      <button
                        onClick={() => {
                          if (window.confirm(`Revoke access for "${dev.name}"?`)) {
                            triggerHaptic('medium');
                            onRevokeDevice?.(dev.deviceId);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg border border-border bg-raised hover:bg-optic-red/10 hover:border-optic-red/30 hover:text-optic-red text-[11px] text-muted-foreground transition-colors shrink-0"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency Disconnect / Revoke All */}
            <div className="pt-2">
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      'Emergency Disconnect: Revoke ALL paired devices immediately? All clients will be disconnected.'
                    )
                  ) {
                    triggerHaptic('heavy');
                    onRevokeAllDevices?.(false);
                    onOpenChange(false);
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-optic-red/20 bg-optic-red/5 hover:bg-optic-red/15 text-xs text-optic-red font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash size={14} />
                <span>Revoke All Devices</span>
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};