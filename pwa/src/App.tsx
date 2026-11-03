import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AerokinLogo } from '@ui';
import { useAerokinSocket } from './hooks/useAerokinSocket';
import { MotionPermissionScreen } from './components/MotionPermissionScreen';
import { ManualTokenModal } from './components/ManualTokenModal';
import { DynamicIslandPill } from './components/DynamicIslandPill';
import { AuroraBackground } from './components/AuroraBackground';
import { AirMouseTab } from './components/AirMouseTab';
import { TrackpadTab } from './components/TrackpadTab';
import { MediaTab } from './components/MediaTab';
import { DesktopDashboard } from './components/DesktopDashboard';
import { triggerHaptic } from './utils/haptics';
import { Compass, MousePointer, Clapperboard, Monitor } from 'lucide-react';

export const App: React.FC = () => {
  // Detect if user is on a desktop computer with a fine pointer
  const [isDesktopMode, setIsDesktopMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
  });

  // Motion permission granted state (persisted per session)
  const [hasMotionPermission, setHasMotionPermission] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !(
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    );
  });

  const [activeTab, setActiveTab] = useState<'air-mouse' | 'trackpad' | 'media'>('air-mouse');
  const [isPadEngaged, setIsPadEngaged] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([12, 14, 11, 15, 12]);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const {
    status,
    latency,
    token,
    setToken,
    sendMove,
    sendClick,
    sendScroll,
    sendMedia,
  } = useAerokinSocket();

  // Accumulate latency sparkline
  useEffect(() => {
    if (latency !== null) {
      setLatencyHistory((prev) => [...prev.slice(-15), latency]);
    }
  }, [latency]);

  const tabs = [
    { id: 'air-mouse', label: 'Air Mouse', icon: Compass },
    { id: 'trackpad', label: 'Trackpad', icon: MousePointer },
    { id: 'media', label: 'Media', icon: Clapperboard },
  ] as const;

  const handleTabChange = (newTabId: 'air-mouse' | 'trackpad' | 'media') => {
    triggerHaptic('light');
    setActiveTab(newTabId);
  };

  // If on desktop and not manually switched to phone simulator, render Desktop Dashboard
  if (isDesktopMode) {
    return (
      <DesktopDashboard
        onSwitchToPhoneView={() => setIsDesktopMode(false)}
      />
    );
  }

  // If iOS motion permission hasn't been granted yet, show start screen
  if (!hasMotionPermission) {
    return (
      <MotionPermissionScreen
        onPermissionGranted={() => setHasMotionPermission(true)}
      />
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-aerokin-bg text-aerokin-text overflow-hidden pt-safe pb-safe select-none touch-none">
      {/* Procedural Aurora Mesh & film-grain background with gyro parallax */}
      <AuroraBackground isEngaged={isPadEngaged} />

      {/* Top Header Bar with Dynamic Island Connection Pill */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-aerokin-border bg-[#07070B]/75 backdrop-blur-2xl z-30">
        <AerokinLogo size={32} withWordmark />

        <div className="flex items-center gap-2">
          <DynamicIslandPill
            status={status === 'disconnected' ? 'reconnecting' : status}
            latency={latency}
            latencyHistory={latencyHistory}
            token={token}
            onOpenAuthModal={() => setShowAuthModal(true)}
          />

          {/* Desktop simulator return button (if opened on desktop in phone preview mode) */}
          {typeof window !== 'undefined' &&
            window.matchMedia('(min-width: 768px)').matches && (
              <button
                onClick={() => setIsDesktopMode(true)}
                className="p-1.5 rounded-full border border-white/10 bg-white/[0.04] text-aerokin-muted hover:text-white transition-colors"
                title="Return to Desktop Pairing Station"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            )}
        </div>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 w-full overflow-hidden relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'air-mouse' && (
            <motion.div
              key="air-mouse"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full"
            >
              <AirMouseTab
                sendMove={sendMove}
                sendClick={sendClick}
                onEngagedChange={setIsPadEngaged}
              />
            </motion.div>
          )}

          {activeTab === 'trackpad' && (
            <motion.div
              key="trackpad"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full"
            >
              <TrackpadTab
                sendMove={sendMove}
                sendClick={sendClick}
                sendScroll={sendScroll}
              />
            </motion.div>
          )}

          {activeTab === 'media' && (
            <motion.div
              key="media"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="h-full w-full"
            >
              <MediaTab sendMedia={sendMedia} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Floating Navigation TabBar with Spring Indicator */}
      <nav className="p-3 flex justify-center z-20">
        <div className="relative flex items-center p-1 rounded-2xl bg-[#0C0C14]/90 border border-white/10 backdrop-blur-2xl shadow-glass w-full max-w-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-mono text-xs font-semibold transition-colors z-10 cursor-pointer ${
                  isActive ? 'text-white' : 'text-aerokin-muted hover:text-white'
                }`}
              >
                {/* Motion Spring Sliding Background Indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#7C5CFF]/30 to-[#22D3EE]/30 border border-aerokin-cyan/40 shadow-glow-sm"
                  />
                )}
                <Icon className={`w-3.5 h-3.5 z-10 ${isActive ? 'text-aerokin-cyan' : ''}`} />
                <span className="z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Manual Token Entry Modal if missing or rejected or manually requested */}
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
