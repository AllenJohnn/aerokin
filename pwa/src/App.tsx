import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AerokinLogo } from '@ui';
import { useAerokinSocket } from './hooks/useAerokinSocket';
import { MotionPermissionScreen } from './components/MotionPermissionScreen';
import { ManualTokenModal } from './components/ManualTokenModal';
import { DynamicIslandPill } from './components/DynamicIslandPill';
import { AirMouseTab } from './components/AirMouseTab';
import { TrackpadTab } from './components/TrackpadTab';
import { MediaTab } from './components/MediaTab';
import { DesktopDashboard } from './components/DesktopDashboard';
import { SettingsDrawer } from './components/SettingsDrawer';
import { CalibrationModal } from './components/CalibrationModal';
import { triggerHaptic } from './utils/haptics';
import { ThemePreset } from './theme/tokens';
import {
  AirPointerConfig,
  CalibrationData,
  DEFAULT_CONFIG,
  DEFAULT_CALIBRATION,
} from './engine/airPointer';
import {
  Compass,
  Cursor,
  FilmStrip,
  Gear,
  Monitor,
} from '@phosphor-icons/react';

const STORAGE_THEME_KEY = 'aerokin_theme';
const STORAGE_CONFIG_KEY = 'aerokin_config';
const STORAGE_CALIBRATION_KEY = 'aerokin_calibration';
const STORAGE_SEEK_METHOD_KEY = 'aerokin_seek_method';

export const App: React.FC = () => {
  // 1. Theme State (DECEPTICON by default)
  const [theme, setTheme] = useState<ThemePreset>(() => {
    if (typeof window === 'undefined') return 'decepticon';
    return (localStorage.getItem(STORAGE_THEME_KEY) as ThemePreset) || 'decepticon';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  }, [theme]);

  // 2. Air Pointer Engine Config
  const [config, setConfig] = useState<AirPointerConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;
    try {
      const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const handleConfigChange = (newConfig: Partial<AirPointerConfig>) => {
    setConfig((prev) => {
      const updated = { ...prev, ...newConfig };
      localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // 3. Gyroscopic Calibration Data
  const [calibration, setCalibration] = useState<CalibrationData>(() => {
    if (typeof window === 'undefined') return DEFAULT_CALIBRATION;
    try {
      const saved = localStorage.getItem(STORAGE_CALIBRATION_KEY);
      return saved ? { ...DEFAULT_CALIBRATION, ...JSON.parse(saved) } : DEFAULT_CALIBRATION;
    } catch {
      return DEFAULT_CALIBRATION;
    }
  });

  const handleSaveCalibration = (newCal: CalibrationData) => {
    setCalibration(newCal);
    localStorage.setItem(STORAGE_CALIBRATION_KEY, JSON.stringify(newCal));
  };

  const handleResetCalibration = () => {
    setCalibration(DEFAULT_CALIBRATION);
    localStorage.removeItem(STORAGE_CALIBRATION_KEY);
  };

  // 4. Media Seek Method ('auto' vs 'keys')
  const [seekMethod, setSeekMethod] = useState<'auto' | 'keys'>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem(STORAGE_SEEK_METHOD_KEY) as 'auto' | 'keys') || 'auto';
  });

  const handleSeekMethodChange = (method: 'auto' | 'keys') => {
    setSeekMethod(method);
    localStorage.setItem(STORAGE_SEEK_METHOD_KEY, method);
  };

  // 5. Desktop Mode Detection
  const [isDesktopMode, setIsDesktopMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
  });

  // 6. Motion Permission Granted State
  const [hasMotionPermission, setHasMotionPermission] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !(
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    );
  });

  // 7. Navigation Tabs
  const [activeTab, setActiveTab] = useState<'air-mouse' | 'trackpad' | 'media'>('air-mouse');
  const [latencyHistory, setLatencyHistory] = useState<number[]>([12, 14, 11, 15, 12]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);

  // 8. WebSocket Connection Engine
  const {
    status,
    latency,
    token,
    setToken,
    sendMove,
    sendClick,
    sendButton,
    sendScroll,
    sendMedia,
    sendSeekBy,
    sendSeekTo,
    sendSession,
    sendSetVolume,
    isBackpressured,
    nowPlaying,
    sessions,
    volume,
    muted,
  } = useAerokinSocket();

  useEffect(() => {
    if (latency !== null) {
      setLatencyHistory((prev) => [...prev.slice(-15), latency]);
    }
  }, [latency]);

  const tabs = [
    { id: 'air-mouse', label: 'Air Pointer', icon: Compass },
    { id: 'trackpad', label: 'Trackpad', icon: Cursor },
    { id: 'media', label: 'Media', icon: FilmStrip },
  ] as const;

  const handleTabChange = (newTabId: 'air-mouse' | 'trackpad' | 'media') => {
    triggerHaptic('light');
    setActiveTab(newTabId);
  };

  // Render Desktop Dashboard if on PC desktop screen
  if (isDesktopMode) {
    return (
      <DesktopDashboard
        onSwitchToPhoneView={() => setIsDesktopMode(false)}
        theme={theme}
      />
    );
  }

  // Render Motion Permission Screen if iOS permission not yet given
  if (!hasMotionPermission) {
    return (
      <MotionPermissionScreen
        onPermissionGranted={() => setHasMotionPermission(true)}
        theme={theme}
      />
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-hw-bg text-hw-text overflow-hidden pt-safe pb-safe select-none touch-none">
      {/* Top Header Bar with Machined Dynamic Island Connection Pill & Settings Key */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-hw-border bg-hw-surface z-30 shadow-sm">
        <AerokinLogo size={32} withWordmark theme={theme} />

        <div className="flex items-center gap-2">
          <DynamicIslandPill
            status={status === 'disconnected' ? 'reconnecting' : status}
            latency={latency}
            latencyHistory={latencyHistory}
            token={token}
            onOpenAuthModal={() => setShowAuthModal(true)}
          />

          <button
            onClick={() => {
              triggerHaptic('light');
              setShowSettingsDrawer(true);
            }}
            className="p-1.5 rounded-lg border border-hw-border bg-hw-surface-sunken hover:border-hw-primary text-hw-text-muted hover:text-hw-text active:scale-95 transition-all"
            title="Remote Settings"
            aria-label="Settings"
          >
            <Gear size={16} weight="bold" />
          </button>

          {/* Desktop simulator return button */}
          {typeof window !== 'undefined' &&
            window.matchMedia('(min-width: 768px)').matches && (
              <button
                onClick={() => setIsDesktopMode(true)}
                className="p-1.5 rounded-lg border border-hw-border bg-hw-surface-sunken text-hw-text-muted hover:text-hw-text transition-colors"
                title="Return to Desktop Pairing Station"
              >
                <Monitor size={16} weight="bold" />
              </button>
            )}
        </div>
      </header>

      {/* Main Tab Content Display */}
      <main className="flex-1 w-full overflow-hidden relative z-10 flex flex-col">
        <AnimatePresence mode="wait">
          {activeTab === 'air-mouse' && (
            <motion.div
              key="air-mouse"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col"
            >
              <AirMouseTab
                sendMove={sendMove}
                sendClick={sendClick}
                sendScroll={sendScroll}
                isBackpressured={isBackpressured}
                config={config}
                calibration={calibration}
                onOpenSettings={() => setShowSettingsDrawer(true)}
              />
            </motion.div>
          )}

          {activeTab === 'trackpad' && (
            <motion.div
              key="trackpad"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col"
            >
              <TrackpadTab
                sendMove={sendMove}
                sendClick={sendClick}
                sendButton={sendButton}
                sendScroll={sendScroll}
                isConnected={status === 'connected'}
                onOpenSettings={() => setShowSettingsDrawer(true)}
              />
            </motion.div>
          )}

          {activeTab === 'media' && (
            <motion.div
              key="media"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col"
            >
              <MediaTab
                nowPlaying={nowPlaying}
                sessions={sessions}
                volume={volume}
                muted={muted}
                sendMedia={sendMedia}
                sendSeekBy={sendSeekBy}
                sendSeekTo={sendSeekTo}
                sendSession={sendSession}
                sendSetVolume={sendSetVolume}
                seekMethod={seekMethod}
                onOpenSettings={() => setShowSettingsDrawer(true)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Machined Hardware TabBar */}
      <nav className="p-3 flex justify-center z-20">
        <div className="relative flex items-center p-1 rounded-xl bg-hw-surface border border-hw-border-milled shadow-hw-well w-full max-w-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-display text-xs font-bold uppercase tracking-wider transition-all z-10 cursor-pointer ${
                  isActive ? 'text-white' : 'text-hw-text-muted hover:text-hw-text'
                }`}
              >
                {/* Active Milled Button Face */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="absolute inset-0 rounded-lg bg-hw-surface-raised border border-hw-primary/60 shadow-hw-btn"
                  />
                )}
                <Icon size={16} weight="bold" className={`z-10 ${isActive ? 'text-hw-primary' : ''}`} />
                <span className="z-10 text-[11px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Settings Vaul Drawer */}
      <SettingsDrawer
        isOpen={showSettingsDrawer}
        onOpenChange={setShowSettingsDrawer}
        theme={theme}
        onThemeChange={setTheme}
        config={config}
        onConfigChange={handleConfigChange}
        calibration={calibration}
        onResetCalibration={handleResetCalibration}
        onOpenCalibrationWizard={() => setShowCalibrationModal(true)}
        seekMethod={seekMethod}
        onSeekMethodChange={handleSeekMethodChange}
      />

      {/* Gyroscopic Calibration Modal */}
      <CalibrationModal
        isOpen={showCalibrationModal}
        onClose={() => setShowCalibrationModal(false)}
        onSaveCalibration={handleSaveCalibration}
      />

      {/* Manual Token Entry Modal */}
      {(status === 'unauthorized' || showAuthModal) && (
        <ManualTokenModal
          initialToken={token}
          onSaveToken={(newToken) => {
            setToken(newToken);
            setShowAuthModal(false);
          }}
          isRejected={status === 'unauthorized'}
          theme={theme}
        />
      )}
    </div>
  );
};

export default App;
