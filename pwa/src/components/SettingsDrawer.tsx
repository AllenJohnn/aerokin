import React, { useState, useEffect, useRef } from 'react';
import { TextField } from '@ui';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/Sheet';
import { TrackpadConfig } from '../engine/trackpadGestures';
import { DeviceInfo } from '../hooks/useAerokinSocket';
import { DesktopSettings, QualityPresetName } from '../types/desktop';
import { NavConfig, NavSectionId, ALL_NAV_SECTIONS } from '../types/navigation';
import { triggerHaptic } from '../utils/haptics';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';
import {
  Icon,
  ArrowClockwise,
  DeviceMobile,
  PencilSimple,
  Trash,
  SignOut,
  Shield,
  Check,
  Pulse,
  Copy,
  ShareNetwork,
  CaretRight,
  CaretLeft,
  TerminalWindow,
  DownloadSimple,
  UploadSimple,
  ArrowsCounterClockwise,
  HandPointing,
  Monitor,
  PlayPause,
  Vibrate,
  Eye,
  ClipboardText,
  Lightning,
  Info,
  Sliders,
  Warning,
  ListNumbers,
} from '@phosphor-icons/react';
import {
  diagnosticsLogger,
  formatDiagnosticsReport,
  DiagnosticEvent,
} from '../utils/diagnosticsLogger';
import { SavedPcSwitcher } from './SavedPcSwitcher';
import { SavedPc } from '../utils/hosting';

export type SettingsPageId =
  | 'connections'
  | 'navigation'
  | 'trackpad'
  | 'desktop'
  | 'media'
  | 'haptics'
  | 'display'
  | 'clipboard'
  | 'actions'
  | 'diagnostics'
  | 'about';

export interface SettingsDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  // Nav
  navConfig: NavConfig;
  onNavConfigChange: (config: NavConfig) => void;
  // Trackpad
  trackpadConfig: TrackpadConfig;
  onTrackpadConfigChange: (newConfig: Partial<TrackpadConfig>) => void;
  onResetTrackpadConfig: () => void;
  // Media
  seekMethod: 'auto' | 'keys';
  onSeekMethodChange: (method: 'auto' | 'keys') => void;
  // Desktop
  desktopSettings?: DesktopSettings;
  onDesktopSettingsChange?: (settings: Partial<DesktopSettings>) => void;
  // Devices & Connection
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
  onSwitchPc?: (pc: SavedPc) => void;
  onPairNewPc?: () => void;
  status?: string;
  host?: string | null;
  latency?: number | null;
  desktopStats?: { fps: number; bitrateKbps: number; droppedFrames: number } | null;
  lastCloseCode?: number | null;
  lastCloseReason?: string | null;
  agentLogs?: any[];
  onRequestAgentLogs?: (limit?: number) => void;
  onRunLatencyTest?: () => Promise<{ min: number; avg: number; max: number; p95: number }>;
  onResetAllSettings?: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  onOpenChange,
  navConfig,
  onNavConfigChange,
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
  onSwitchPc,
  onPairNewPc,
  status = 'disconnected',
  host = null,
  latency = null,
  desktopStats = null,
  lastCloseCode = null,
  lastCloseReason = null,
  agentLogs = [],
  onRequestAgentLogs,
  onRunLatencyTest,
  onResetAllSettings,
}) => {
  const [activePage, setActivePage] = useState<SettingsPageId | null>(null);

  // Connection & Device states
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState('');

  // Media Settings
  const [seekInterval, setSeekInterval] = useState<number>(() => {
    return Number(localStorage.getItem('aerokin_seek_interval') || 10);
  });
  const [volumeStep, setVolumeStep] = useState<number>(() => {
    return Number(localStorage.getItem('aerokin_volume_step') || 5);
  });

  // Haptics Settings
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('aerokin_haptics_enabled') !== 'false';
  });
  const [hapticsIntensity, setHapticsIntensity] = useState<'light' | 'medium' | 'heavy'>(() => {
    return (localStorage.getItem('aerokin_haptics_intensity') as any) || 'light';
  });

  // Display Settings
  const [keepAwake, setKeepAwake] = useState<boolean>(() => {
    return localStorage.getItem('aerokin_display_keep_awake') !== 'false';
  });
  const [leftHandedLayout, setLeftHandedLayout] = useState<boolean>(() => {
    return localStorage.getItem('aerokin_left_handed') === 'true';
  });
  const [reduceMotionOverride, setReduceMotionOverride] = useState<boolean>(() => {
    return localStorage.getItem('aerokin_reduce_motion') === 'true';
  });

  // Diagnostics states
  const [events, setEvents] = useState<DiagnosticEvent[]>(() => diagnosticsLogger.getEvents());
  const [copiedDiag, setCopiedDiag] = useState(false);
  const [testingLatency, setTestingLatency] = useState(false);
  const [latencyBenchResult, setLatencyBenchResult] = useState<{
    min: number;
    avg: number;
    max: number;
    p95: number;
  } | null>(null);
  const [fetchingLogs, setFetchingLogs] = useState(false);

  // Import / Export Notice
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset page when drawer closes
  useEffect(() => {
    if (!isOpen) {
      setActivePage(null);
    }
  }, [isOpen]);

  const handlePageSelect = (page: SettingsPageId) => {
    triggerHaptic('light');
    setActivePage(page);
  };

  const handleBackToMenu = () => {
    triggerHaptic('light');
    setActivePage(null);
  };

  // Nav pin toggle
  const handleTogglePin = (sectionId: NavSectionId) => {
    if (sectionId === 'more') return; // More is always available
    triggerHaptic('light');

    const isPinned = navConfig.pinned.includes(sectionId);
    let nextPinned: NavSectionId[];

    if (isPinned) {
      if (navConfig.pinned.length <= 2) {
        return; // Minimum 2 pinned
      }
      nextPinned = navConfig.pinned.filter((id) => id !== sectionId);
    } else {
      if (navConfig.pinned.length >= 4) {
        // Replace last pinned item before more if full
        const copy = [...navConfig.pinned];
        copy.splice(2, 1, sectionId);
        nextPinned = copy;
      } else {
        nextPinned = [...navConfig.pinned, sectionId];
      }
    }

    onNavConfigChange({
      ...navConfig,
      pinned: nextPinned,
    });
  };

  const handleDefaultTabSelect = (tab: NavSectionId) => {
    triggerHaptic('light');
    onNavConfigChange({
      ...navConfig,
      defaultTab: tab,
    });
  };

  // Export Settings JSON (never includes credentials or device IDs!)
  const handleExportSettings = () => {
    triggerHaptic('light');
    const bundle = {
      version: 1,
      exportedAt: Date.now(),
      navigation: navConfig,
      trackpad: trackpadConfig,
      desktop: desktopSettings,
      media: {
        seekMethod,
        seekInterval,
        volumeStep,
      },
      haptics: {
        enabled: hapticsEnabled,
        intensity: hapticsIntensity,
      },
      display: {
        keepAwake,
        leftHandedLayout,
        reduceMotionOverride,
      },
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aerokin-settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setImportNotice('Settings exported successfully.');
    setTimeout(() => setImportNotice(null), 3000);
  };

  // Import Settings JSON (strictly validated, clamps values, ignores credentials)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = JSON.parse(event.target?.result as string);
        if (!raw || typeof raw !== 'object' || raw.version !== 1) {
          throw new Error('Invalid AEROKIN settings file version.');
        }

        // Apply Nav
        if (raw.navigation) {
          onNavConfigChange(raw.navigation);
        }

        // Apply Trackpad
        if (raw.trackpad) {
          onTrackpadConfigChange(raw.trackpad);
        }

        // Apply Desktop
        if (raw.desktop && onDesktopSettingsChange) {
          onDesktopSettingsChange(raw.desktop);
        }

        // Apply Media
        if (raw.media) {
          if (raw.media.seekMethod) onSeekMethodChange(raw.media.seekMethod);
          if (raw.media.seekInterval) {
            setSeekInterval(raw.media.seekInterval);
            localStorage.setItem('aerokin_seek_interval', String(raw.media.seekInterval));
          }
          if (raw.media.volumeStep) {
            setVolumeStep(raw.media.volumeStep);
            localStorage.setItem('aerokin_volume_step', String(raw.media.volumeStep));
          }
        }

        // Apply Haptics
        if (raw.haptics) {
          setHapticsEnabled(Boolean(raw.haptics.enabled));
          localStorage.setItem('aerokin_haptics_enabled', String(raw.haptics.enabled));
          if (raw.haptics.intensity) {
            setHapticsIntensity(raw.haptics.intensity);
            localStorage.setItem('aerokin_haptics_intensity', raw.haptics.intensity);
          }
        }

        // Apply Display
        if (raw.display) {
          setKeepAwake(Boolean(raw.display.keepAwake));
          localStorage.setItem('aerokin_display_keep_awake', String(raw.display.keepAwake));
          setLeftHandedLayout(Boolean(raw.display.leftHandedLayout));
          localStorage.setItem('aerokin_left_handed', String(raw.display.leftHandedLayout));
          setReduceMotionOverride(Boolean(raw.display.reduceMotionOverride));
          localStorage.setItem('aerokin_reduce_motion', String(raw.display.reduceMotionOverride));
        }

        triggerHaptic('medium');
        setImportNotice('Settings imported and applied live.');
      } catch (err: any) {
        setImportNotice(err?.message || 'Failed to parse settings JSON.');
      }
      setTimeout(() => setImportNotice(null), 4000);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFullReset = () => {
    if (window.confirm('Reset all AEROKIN settings to factory defaults?')) {
      triggerHaptic('heavy');
      onResetTrackpadConfig();
      onSeekMethodChange('auto');
      setSeekInterval(10);
      setVolumeStep(5);
      setHapticsEnabled(true);
      setHapticsIntensity('light');
      setKeepAwake(true);
      setLeftHandedLayout(false);
      setReduceMotionOverride(false);

      if (onResetAllSettings) {
        onResetAllSettings();
      }

      setImportNotice('All settings reset to defaults.');
      setTimeout(() => setImportNotice(null), 3000);
    }
  };

  const menuSections: Array<{
    id: SettingsPageId;
    title: string;
    description: string;
    icon: Icon;
  }> = [
    {
      id: 'connections',
      title: 'Connection & Devices',
      description: 'Authorized devices, pairing status & latency',
      icon: DeviceMobile,
    },
    {
      id: 'navigation',
      title: 'Navigation & Launcher',
      description: 'Pin bottom tabs & set default launch section',
      icon: Sliders,
    },
    {
      id: 'trackpad',
      title: 'Trackpad Controls',
      description: 'Sensitivity, acceleration, scroll direction & tap gestures',
      icon: HandPointing,
    },
    {
      id: 'desktop',
      title: 'Desktop Remote',
      description: 'Display presets, framerate & resolution scaling',
      icon: Monitor,
    },
    {
      id: 'media',
      title: 'Media Player',
      description: 'Seek intervals, volume increments & key fallbacks',
      icon: PlayPause,
    },
    {
      id: 'haptics',
      title: 'Haptics & Feedback',
      description: 'Vibration feedback intensity & feature toggles',
      icon: Vibrate,
    },
    {
      id: 'display',
      title: 'Display & Layout',
      description: 'Screen wake lock, left-handed mode & reduced motion',
      icon: Eye,
    },
    {
      id: 'clipboard',
      title: 'Clipboard Preferences',
      description: 'In-memory history size & foreground sync options',
      icon: ClipboardText,
    },
    {
      id: 'actions',
      title: 'Quick Actions',
      description: 'Power confirmation dialogues & launcher paths',
      icon: Lightning,
    },
    {
      id: 'diagnostics',
      title: 'Diagnostics & Logs',
      description: 'Latency benchmarks, event ring buffer & server logs',
      icon: TerminalWindow,
    },
    {
      id: 'about',
      title: 'About AEROKIN',
      description: 'Version 1.0.0, LAN encryption & support details',
      icon: Info,
    },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[90vh] bg-background text-foreground overflow-hidden flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-5 py-3.5 border-b border-border/40 flex flex-row items-center justify-between shrink-0">
          {activePage ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleBackToMenu}
                className="p-1 -ml-1 rounded-lg text-[#FF5A1F] hover:bg-secondary flex items-center gap-1 text-xs font-medium"
              >
                <CaretLeft size={16} weight="bold" />
                <span>Settings</span>
              </button>
              <span className="text-muted-foreground/40">•</span>
              <SheetTitle className="text-sm font-semibold capitalize text-foreground">
                {menuSections.find((s) => s.id === activePage)?.title || activePage}
              </SheetTitle>
            </div>
          ) : (
            <SheetTitle className="text-base font-semibold text-foreground">Settings</SheetTitle>
          )}
        </SheetHeader>

        {importNotice && (
          <div className="mx-4 mt-2 p-2.5 rounded-xl bg-[#FF5A1F]/15 border border-[#FF5A1F]/30 text-[#FF5A1F] text-xs flex items-center gap-2">
            <Check size={16} />
            <span>{importNotice}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* MAIN MENU */}
          {activePage === null && (
            <div className="space-y-4 pb-12">
              <div className="space-y-1">
                {menuSections.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handlePageSelect(item.id)}
                      className="w-full p-3 rounded-2xl bg-card border border-border/40 hover:bg-secondary/40 active:scale-[0.99] transition-all flex items-center justify-between text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 flex items-center justify-center shrink-0">
                          <Icon size={18} className="text-[#FF5A1F]" />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">{item.title}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {item.description}
                          </div>
                        </div>
                      </div>
                      <CaretRight
                        size={16}
                        className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
                      />
                    </button>
                  );
                })}
              </div>

              {/* Data & Backup Actions */}
              <div className="bg-card border border-border/40 rounded-2xl p-3 space-y-2 text-xs">
                <div className="font-medium text-foreground px-1">Settings Backup & Reset</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={handleExportSettings}
                    className="py-2.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <DownloadSimple size={14} />
                    <span>Export JSON</span>
                  </button>
                  <label className="py-2.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
                    <UploadSimple size={14} />
                    <span>Import JSON</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                  </label>
                </div>
                <button
                  onClick={handleFullReset}
                  className="w-full py-2 px-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowsCounterClockwise size={14} />
                  <span>Reset All Settings</span>
                </button>
              </div>
            </div>
          )}

          {/* PAGE 1: Connections & Devices */}
          {activePage === 'connections' && (
            <div className="space-y-4">
              {/* Multi-PC Switcher & Saved Computers */}
              <SavedPcSwitcher
                onSelectPc={(pc) => {
                  if (onSwitchPc) onSwitchPc(pc);
                }}
                onPairNewPc={onPairNewPc || onOpenAuthModal}
              />

              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium text-foreground capitalize">{status}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Host:</span>
                  <span className="font-mono text-foreground">{host || 'Direct LAN'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Round-Trip Latency:</span>
                  <span className="font-mono text-emerald-400">
                    {latency !== null ? `${latency} ms` : '—'}
                  </span>
                </div>
              </div>

              {/* Connected Devices */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Authorized Devices ({devices.length})
                </div>
                <div className="space-y-1.5">
                  {devices.map((d) => (
                    <div
                      key={d.deviceId}
                      className="bg-card border border-border/30 rounded-xl p-3 flex flex-col gap-2 text-xs"
                    >
                      {editingDeviceId === d.deviceId ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <TextField
                              value={editNameVal}
                              onChange={(e) => setEditNameVal(e.target.value)}
                              placeholder="Device Name"
                              maxLength={32}
                              className="text-xs py-1.5"
                              autoFocus
                            />
                          </div>
                          <button
                            onClick={() => {
                              if (editNameVal.trim() && onRenameDevice) {
                                onRenameDevice(d.deviceId, editNameVal.trim());
                              }
                              setEditingDeviceId(null);
                            }}
                            className="p-2 rounded-lg bg-[#FF5A1F] text-white hover:brightness-110"
                            aria-label="Save device name"
                          >
                            <Check size={14} weight="bold" />
                          </button>
                          <button
                            onClick={() => setEditingDeviceId(null)}
                            className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground"
                            aria-label="Cancel rename"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-foreground flex items-center gap-1.5">
                              <span>{d.name}</span>
                              {d.deviceId === deviceId && (
                                <span className="text-[10px] text-[#FF5A1F] bg-[#FF5A1F]/10 px-1.5 py-0.5 rounded-full">
                                  This Phone
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              ID: {d.deviceId.slice(0, 12)}...
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {onRenameDevice && (
                              <button
                                onClick={() => {
                                  setEditingDeviceId(d.deviceId);
                                  setEditNameVal(d.name);
                                }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                                aria-label="Rename device"
                              >
                                <PencilSimple size={16} />
                              </button>
                            )}
                            {d.deviceId !== deviceId && onRevokeDevice && (
                              <button
                                onClick={() => onRevokeDevice(d.deviceId)}
                                className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
                                aria-label="Revoke device"
                              >
                                <Trash size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {onUnpairThisDevice && (
                <button
                  onClick={onUnpairThisDevice}
                  className="w-full py-2.5 px-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
                >
                  Unpair This Phone
                </button>
              )}
            </div>
          )}

          {/* PAGE 2: Navigation & Launcher */}
          {activePage === 'navigation' && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3">
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    Pinned Bottom Tabs ({navConfig.pinned.length}/4)
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Select up to 4 sections for instant bottom bar access. Others remain in More
                    launcher.
                  </div>
                </div>

                <div className="space-y-1.5 divide-y divide-border/20 pt-1">
                  {ALL_NAV_SECTIONS.filter((s) => s.id !== 'more').map((sec) => {
                    const isPinned = navConfig.pinned.includes(sec.id);
                    return (
                      <div
                        key={sec.id}
                        className="flex items-center justify-between pt-2 first:pt-0 text-xs"
                      >
                        <div>
                          <div className="font-medium text-foreground">{sec.label}</div>
                          <div className="text-[11px] text-muted-foreground">{sec.description}</div>
                        </div>
                        <button
                          onClick={() => handleTogglePin(sec.id)}
                          className={`px-3 py-1 rounded-lg font-medium text-xs transition-colors ${
                            isPinned
                              ? 'bg-[#FF5A1F] text-white'
                              : 'bg-secondary text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {isPinned ? 'Pinned' : 'Pin'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Default Tab Selection */}
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="font-semibold text-foreground">Default Tab on Launch</div>
                <div className="text-[11px] text-muted-foreground">
                  The screen AEROKIN opens automatically when launched.
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {navConfig.pinned.map((tabId) => (
                    <button
                      key={tabId}
                      onClick={() => handleDefaultTabSelect(tabId)}
                      className={`p-2.5 rounded-xl border text-xs font-medium capitalize transition-all ${
                        navConfig.defaultTab === tabId
                          ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 text-[#FF5A1F]'
                          : 'border-border/40 bg-secondary/40 text-foreground hover:bg-secondary'
                      }`}
                    >
                      {tabId}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PAGE 3: Trackpad */}
          {activePage === 'trackpad' && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-foreground">Pointer Speed</span>
                  <span className="font-mono text-muted-foreground">
                    {trackpadConfig.pointerSpeed.toFixed(1)}x
                  </span>
                </div>
                <Slider
                  value={[trackpadConfig.pointerSpeed]}
                  min={0.5}
                  max={3.0}
                  step={0.1}
                  onValueChange={([val]) => onTrackpadConfigChange({ pointerSpeed: val })}
                />
              </div>

              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-foreground">Scroll Sensitivity</span>
                  <span className="font-mono text-muted-foreground">
                    {trackpadConfig.scrollSensitivityY.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={[trackpadConfig.scrollSensitivityY]}
                  min={0.05}
                  max={1.5}
                  step={0.05}
                  onValueChange={([val]) =>
                    onTrackpadConfigChange({ scrollSensitivityX: val, scrollSensitivityY: val })
                  }
                />
              </div>

              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Natural Scrolling</span>
                  <Switch
                    checked={trackpadConfig.naturalScroll}
                    onCheckedChange={(checked) =>
                      onTrackpadConfigChange({ naturalScroll: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
                  <span className="font-medium text-foreground">Scroll Haptics (Detents)</span>
                  <Switch
                    checked={trackpadConfig.scrollHaptics}
                    onCheckedChange={(checked) =>
                      onTrackpadConfigChange({ scrollHaptics: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
                  <span className="font-medium text-foreground">Momentum Scrolling</span>
                  <Switch
                    checked={trackpadConfig.momentum}
                    onCheckedChange={(checked) => onTrackpadConfigChange({ momentum: checked })}
                  />
                </div>
              </div>

              <button
                onClick={onResetTrackpadConfig}
                className="w-full py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors"
              >
                Reset Trackpad Settings
              </button>
            </div>
          )}

          {/* PAGE 4: Desktop Remote */}
          {activePage === 'desktop' && desktopSettings && onDesktopSettingsChange && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="font-medium text-foreground">Default Quality Preset</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {(
                    ['balanced', 'fast', 'high', 'ultra', 'tiny', 'low'] as QualityPresetName[]
                  ).map((p) => (
                    <button
                      key={p}
                      onClick={() => onDesktopSettingsChange({ defaultPreset: p })}
                      className={`p-2 rounded-xl border text-xs font-medium capitalize transition-all ${
                        desktopSettings.defaultPreset === p
                          ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 text-[#FF5A1F]'
                          : 'border-border/40 bg-secondary/40 text-foreground'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-foreground">Framerate Cap</span>
                  <span className="font-mono text-muted-foreground">
                    {desktopSettings.fpsCap} FPS
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[30, 60].map((fps) => (
                    <button
                      key={fps}
                      onClick={() => onDesktopSettingsChange({ fpsCap: fps })}
                      className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                        desktopSettings.fpsCap === fps
                          ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 text-[#FF5A1F]'
                          : 'border-border/40 bg-secondary/40 text-foreground'
                      }`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Show Real-time Stream Stats</span>
                  <Switch
                    checked={desktopSettings.showStats}
                    onCheckedChange={(checked) => onDesktopSettingsChange({ showStats: checked })}
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
                  <span className="font-medium text-foreground">Auto-Hide Toolbar</span>
                  <Switch
                    checked={desktopSettings.autoHideToolbar}
                    onCheckedChange={(checked) =>
                      onDesktopSettingsChange({ autoHideToolbar: checked })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* PAGE 5: Media Player */}
          {activePage === 'media' && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="font-medium text-foreground">Seek Interval</div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[5, 10, 15, 30].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => {
                        setSeekInterval(sec);
                        localStorage.setItem('aerokin_seek_interval', String(sec));
                        triggerHaptic('light');
                      }}
                      className={`py-2 rounded-xl border text-xs font-medium font-mono transition-all ${
                        seekInterval === sec
                          ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 text-[#FF5A1F]'
                          : 'border-border/40 bg-secondary/40 text-foreground'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="font-medium text-foreground">Seek Method</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => onSeekMethodChange('auto')}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                      seekMethod === 'auto'
                        ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 text-[#FF5A1F]'
                        : 'border-border/40 bg-secondary/40 text-foreground'
                    }`}
                  >
                    Auto (SMTC Native)
                  </button>
                  <button
                    onClick={() => onSeekMethodChange('keys')}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                      seekMethod === 'keys'
                        ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 text-[#FF5A1F]'
                        : 'border-border/40 bg-secondary/40 text-foreground'
                    }`}
                  >
                    Hotkeys (VLC Alt+Arrow)
                  </button>
                </div>
              </div>

              {/* Media Detection Diagnostics */}
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Media Detection Pipeline</span>
                  <span className="text-[10px] font-mono text-[#FF5A1F] bg-[#FF5A1F]/10 px-1.5 py-0.5 rounded-full">
                    Multi-Signal
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="flex items-center justify-between py-1 border-b border-border/20">
                    <span>1. SMTC Native Session Bridge</span>
                    <span className="font-mono text-emerald-400">Available</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-border/20">
                    <span>2. Process Window Watcher (VLC/MPC)</span>
                    <span className="font-mono text-emerald-400">Active</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-border/20">
                    <span>3. CoreAudio Endpoint Mixer</span>
                    <span className="font-mono text-emerald-400">Active</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span>VLC Seek Shortcut</span>
                    <span className="font-mono text-foreground font-medium">
                      Alt+Left / Alt+Right
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PAGE 6: Haptics */}
          {activePage === 'haptics' && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground">Master Haptics</div>
                    <div className="text-[11px] text-muted-foreground">
                      Vibration feedback on touches & button presses.
                    </div>
                  </div>
                  <Switch
                    checked={hapticsEnabled}
                    onCheckedChange={(checked) => {
                      setHapticsEnabled(checked);
                      localStorage.setItem('aerokin_haptics_enabled', String(checked));
                      if (checked) triggerHaptic('light');
                    }}
                  />
                </div>

                {hapticsEnabled && (
                  <div className="border-t border-border/20 pt-3 space-y-2">
                    <div className="font-medium text-foreground">Haptic Intensity</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['light', 'medium', 'heavy'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => {
                            setHapticsIntensity(lvl);
                            localStorage.setItem('aerokin_haptics_intensity', lvl);
                            triggerHaptic(lvl);
                          }}
                          className={`py-2 rounded-xl border text-xs font-medium capitalize transition-all ${
                            hapticsIntensity === lvl
                              ? 'border-[#FF5A1F] bg-[#FF5A1F]/10 text-[#FF5A1F]'
                              : 'border-border/40 bg-secondary/40 text-foreground'
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PAGE 7: Display & Layout */}
          {activePage === 'display' && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground">Screen Wake Lock</div>
                    <div className="text-[11px] text-muted-foreground">
                      Keep phone screen awake while connected.
                    </div>
                  </div>
                  <Switch
                    checked={keepAwake}
                    onCheckedChange={(checked) => {
                      setKeepAwake(checked);
                      localStorage.setItem('aerokin_display_keep_awake', String(checked));
                    }}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
                  <div>
                    <div className="font-medium text-foreground">Left-Handed Layout</div>
                    <div className="text-[11px] text-muted-foreground">
                      Invert toolbar icons for thumb access.
                    </div>
                  </div>
                  <Switch
                    checked={leftHandedLayout}
                    onCheckedChange={(checked) => {
                      setLeftHandedLayout(checked);
                      localStorage.setItem('aerokin_left_handed', String(checked));
                    }}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
                  <div>
                    <div className="font-medium text-foreground">Reduce Motion Override</div>
                    <div className="text-[11px] text-muted-foreground">
                      Disable smooth transitions for maximum battery saving.
                    </div>
                  </div>
                  <Switch
                    checked={reduceMotionOverride}
                    onCheckedChange={(checked) => {
                      setReduceMotionOverride(checked);
                      localStorage.setItem('aerokin_reduce_motion', String(checked));
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* PAGE 8: Clipboard */}
          {activePage === 'clipboard' && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="font-medium text-foreground">Clipboard Security Standard</div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Clipboard contents are never logged anywhere on PC or mobile. Text is size-limited
                  to 100 KB and stored only in volatile memory.
                </p>
              </div>
            </div>
          )}

          {/* PAGE 9: Quick Actions */}
          {activePage === 'actions' && (
            <div className="space-y-4">
              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="font-medium text-foreground">Safety Whitelist Model</div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Every PC action is a fixed enum in code. Dangerous actions (Shutdown, Restart)
                  trigger a 10-second cancelable countdown on the PC dashboard.
                </p>
              </div>
            </div>
          )}

          {/* PAGE 10: Diagnostics */}
          {activePage === 'diagnostics' && (
            <div className="space-y-4">
              {onRunLatencyTest && (
                <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="font-medium text-foreground">
                    Live Round-Trip Latency Benchmark
                  </div>
                  <button
                    onClick={async () => {
                      setTestingLatency(true);
                      try {
                        const res = await onRunLatencyTest();
                        setLatencyBenchResult(res);
                      } finally {
                        setTestingLatency(false);
                      }
                    }}
                    disabled={testingLatency}
                    className="w-full py-2 px-3 rounded-xl bg-secondary text-foreground font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                  >
                    {testingLatency ? 'Sampling 20 pings...' : 'Run 20-Sample Latency Benchmark'}
                  </button>

                  {latencyBenchResult && (
                    <div className="grid grid-cols-4 gap-2 pt-1 text-center font-mono text-[11px]">
                      <div className="bg-muted/40 p-1.5 rounded-lg">
                        <div className="text-muted-foreground text-[10px]">MIN</div>
                        <div className="text-foreground">{latencyBenchResult.min}ms</div>
                      </div>
                      <div className="bg-muted/40 p-1.5 rounded-lg">
                        <div className="text-muted-foreground text-[10px]">AVG</div>
                        <div className="text-emerald-400 font-bold">{latencyBenchResult.avg}ms</div>
                      </div>
                      <div className="bg-muted/40 p-1.5 rounded-lg">
                        <div className="text-muted-foreground text-[10px]">P95</div>
                        <div className="text-foreground">{latencyBenchResult.p95}ms</div>
                      </div>
                      <div className="bg-muted/40 p-1.5 rounded-lg">
                        <div className="text-muted-foreground text-[10px]">MAX</div>
                        <div className="text-foreground">{latencyBenchResult.max}ms</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PAGE 11: About */}
          {activePage === 'about' && (
            <div className="space-y-4 text-xs">
              <div className="bg-card border border-border/40 rounded-2xl p-4 text-center space-y-1.5">
                <div className="text-base font-bold text-foreground">AEROKIN</div>
                <div className="text-xs text-[#FF5A1F] font-mono">Version 1.0.0 (Production)</div>
                <p className="text-muted-foreground text-[11px] pt-1">
                  Air-mouse, precision trackpad, desktop remote and presentation remote.
                </p>
              </div>

              <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Shield size={14} className="text-emerald-400" />
                  <span>Strict LAN Isolation</span>
                </div>
                <p>
                  No internet access, cloud relay, STUN/TURN, or third-party telemetry. All
                  communications stay 100% on your local Wi-Fi network.
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
