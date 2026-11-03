import React, { useState, useEffect } from 'react';
import { TabBar, Pill, AerokinLogo } from '@ui';
import { useAerokinSocket } from './hooks/useAerokinSocket';
import { MotionPermissionScreen } from './components/MotionPermissionScreen';
import { ManualTokenModal } from './components/ManualTokenModal';
import { AirMouseTab } from './components/AirMouseTab';
import { TrackpadTab } from './components/TrackpadTab';
import { MediaTab } from './components/MediaTab';
import { triggerHaptic } from './utils/haptics';

export const App: React.FC = () => {
  // Motion permission granted state (persisted per session)
  const [hasMotionPermission, setHasMotionPermission] = useState(() => {
    // If not on iOS Safari, default to true
    if (typeof window === 'undefined') return false;
    return !(
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    );
  });

  const [activeTab, setActiveTab] = useState<'air-mouse' | 'trackpad' | 'media'>('air-mouse');

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

  const tabs = [
    { id: 'air-mouse', label: 'Air Mouse' },
    { id: 'trackpad', label: 'Trackpad' },
    { id: 'media', label: 'Media' },
  ];

  const handleTabChange = (newTabId: string) => {
    triggerHaptic('light');
    setActiveTab(newTabId as 'air-mouse' | 'trackpad' | 'media');
  };

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
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-48 aerokin-radial-glow opacity-60" />

      {/* Top Header Bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-aerokin-border bg-[#07070B]/70 backdrop-blur-xl z-20">
        <AerokinLogo size="sm" withWordmark />

        <div className="flex items-center gap-2">
          {status === 'connected' ? (
            <Pill status="online" size="sm">
              {latency !== null ? `CONNECTED · ${latency}ms` : 'CONNECTED'}
            </Pill>
          ) : status === 'unauthorized' ? (
            <button
              onClick={() => triggerHaptic('medium')}
              className="cursor-pointer"
            >
              <Pill status="error" size="sm">
                AUTH REQUIRED
              </Pill>
            </button>
          ) : (
            <Pill status="warning" size="sm">
              RECONNECTING
            </Pill>
          )}
        </div>
      </header>

      {/* Main Tab Content */}
      <main className="flex-1 w-full overflow-hidden relative z-10">
        {activeTab === 'air-mouse' && (
          <AirMouseTab sendMove={sendMove} sendClick={sendClick} />
        )}

        {activeTab === 'trackpad' && (
          <TrackpadTab
            sendMove={sendMove}
            sendClick={sendClick}
            sendScroll={sendScroll}
          />
        )}

        {activeTab === 'media' && <MediaTab sendMedia={sendMedia} />}
      </main>

      {/* Bottom Floating Navigation TabBar */}
      <nav className="p-3 flex justify-center z-20">
        <TabBar
          tabs={tabs}
          activeId={activeTab}
          onChange={handleTabChange}
          size="md"
          fullWidth
        />
      </nav>

      {/* Manual Token Entry Modal if missing or rejected */}
      {status === 'unauthorized' && (
        <ManualTokenModal
          initialToken={token}
          onSaveToken={setToken}
          isRejected={true}
        />
      )}
    </div>
  );
};

export default App;
