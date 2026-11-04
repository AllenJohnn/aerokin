import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AerokinLogo } from '@ui';
import { useAerokinSocket } from './hooks/useAerokinSocket';
import { MotionPermissionScreen } from './components/MotionPermissionScreen';
import { ManualTokenModal } from './components/ManualTokenModal';
import { AirMouseTab } from './components/AirMouseTab';
import { TrackpadTab } from './components/TrackpadTab';
import { MediaTab } from './components/MediaTab';
import { DesktopDashboard } from './components/DesktopDashboard';
import { SettingsDrawer } from './components/SettingsDrawer';
import { CalibrationModal } from './components/CalibrationModal';
import { triggerHaptic } from './utils/haptics';
import {
  AirPointerConfig,
  CalibrationData,
  DEFAULT_CONFIG,
  DEFAULT_CALIBRATION,
} from './engine/airPointer';
import {
  NavigationArrow,
  HandPointing,
  PlayPause,
  Gear,
  Monitor,
} from '@phosphor-icons/react';

const STORAGE_CONFIG_KEY = 'aerokin_config';
const STORAGE_CALIBRATION_KEY = 'aerokin_calibration';
const STORAGE_SEEK_METHOD_KEY = 'aerokin_seek_method';

export const App: React.FC = () => {
  // Always true dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

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
  const [activeTab, setActiveTab] = useState<'pointer' | 'trackpad' | 'media'>('pointer');
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

  const tabs = [
    { id: 'pointer', label: 'Pointer', icon: NavigationArrow },
    { id: 'trackpad', label: 'Trackpad', icon: HandPointing },
    { id: 'media', label: 'Media', icon: PlayPause },
  ] as const;

  const handleTabChange = (newTabId: 'pointer' | 'trackpad' | 'media') => {
    triggerHaptic('light');
    setActiveTab(newTabId);
  };

  // Render Desktop Dashboard if on PC desktop screen
  if (isDesktopMode) {
    return (
      <DesktopDashboard
        onSwitchToPhoneView={() => setIsDesktopMode(false)}
      />
    );
  }

  // Render Motion Permission Screen if iOS permission not yet given
  if (!hasMotionPermission) {
    return (
      <MotionPermissionScreen
        onPermissionGranted={() => setHasMotionPermission(true)}
      />
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-bg text-foreground overflow-hidden pt-safe pb-safe select-none touch-none">
      {/* Top Bar: logo mark left, small connection status center-left, settings icon right */}
      <header className="flex items-center justify-between px-gutter h-13 min-h-[52px] border-b border-border bg-bg z-30">
        <div className="flex items-center gap-3">
          {/* Logo mark (no wordmark under 400px) */}
          <div className="flex items-center flex-shrink-0">
            <div className="min-[400px]:hidden">
              <AerokinLogo size={24} />
            </div>
            <div className="hidden min-[400px]:block">
              <AerokinLogo size={24} withWordmark />
            </div>
          </div>

          {/* Small connection status: dot + latency / status */}
          <button
            onClick={() => {
              if (status === 'unauthorized') {
                setShowAuthModal(true);
              }
            }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-1.5 px-2 rounded-lg"
            title={status}
            aria-label={`Connection status: ${status}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                status === 'connected'
                  ? 'bg-success'
                  : status === 'reconnecting'
                  ? 'bg-amber-400'
                  : status === 'unauthorized'
                  ? 'bg-optic-red'
                  : 'bg-muted-foreground/40'
              }`}
            />
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {status === 'connected'
                ? latency !== null
                  ? `${latency} ms`
                  : 'Connected'
                : status === 'reconnecting'
                ? 'Reconnecting'
                : status === 'unauthorized'
                ? 'Auth required'
                : 'Disconnected'}
            </span>
          </button>
        </div>

        {/* Right side: Settings icon + optional simulator toggle */}
        <div className="flex items-center gap-1">
          {typeof window !== 'undefined' &&
            window.matchMedia('(min-width: 768px)').matches && (
              <button
                onClick={() => setIsDesktopMode(true)}
                className="w-10 h-10 min-w-[48px] min-h-[48px] rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
                title="Desktop pairing station"
                aria-label="Desktop station"
              >
                <Monitor size={18} />
              </button>
            )}

          <button
            onClick={() => {
              triggerHaptic('light');
              setShowSettingsDrawer(true);
            }}
            className="w-10 h-10 min-w-[48px] min-h-[48px] rounded-xl text-muted-foreground hover:text-foreground active:scale-[0.97] flex items-center justify-center transition-transform"
            title="Settings"
            aria-label="Settings"
          >
            <Gear size={20} />
          </button>
        </div>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 w-full overflow-hidden relative z-10 flex flex-col">
        <AnimatePresence mode="wait">
          {activeTab === 'pointer' && (
            <motion.div
              key="pointer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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

      {/* Tab bar: 3 equal tabs, icon above short label, spring-sliding indicator */}
      <nav className="px-gutter pt-1 pb-safe flex justify-center z-20 bg-bg border-t border-border">
        <div className="relative flex items-center w-full max-w-sm h-14">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex-1 flex flex-col items-center justify-center py-1.5 h-12 rounded-xl transition-colors z-10 cursor-pointer min-h-[48px] ${
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-selected={isActive}
                role="tab"
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-surface border border-border"
                  />
                )}
                <Icon
                  size={20}
                  className={`z-10 transition-colors ${
                    isActive ? 'text-accent' : 'text-muted-foreground'
                  }`}
                />
                <span className="z-10 text-[11px] font-medium leading-tight mt-0.5 whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Settings Vaul Sheet */}
      <SettingsDrawer
        isOpen={showSettingsDrawer}
        onOpenChange={setShowSettingsDrawer}
        config={config}
        onConfigChange={handleConfigChange}
        calibration={calibration}
        onResetCalibration={handleResetCalibration}
        onOpenCalibrationWizard={() => setShowCalibrationModal(true)}
        seekMethod={seekMethod}
        onSeekMethodChange={handleSeekMethodChange}
        token={token}
        onOpenAuthModal={() => setShowAuthModal(true)}
      />

      {/* Calibration Modal */}
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
        />
      )}
    </div>
  );
};

export default App;
