import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AerokinLogo } from '@ui';
import { useAerokinSocket } from './hooks/useAerokinSocket';
import { ManualTokenModal } from './components/ManualTokenModal';
import { TrackpadTab } from './components/TrackpadTab';
import { MediaTab } from './components/MediaTab';
import { DesktopViewer } from './components/DesktopViewer';
import { DesktopDashboard } from './components/DesktopDashboard';
import { SettingsDrawer } from './components/SettingsDrawer';
import { triggerHaptic } from './utils/haptics';
import { isHostedMode, buildTrustUrl } from './utils/hosting';
import {
  TrackpadConfig,
  loadTrackpadConfig,
  saveTrackpadConfig,
  DEFAULT_TRACKPAD_CONFIG,
  validateAndMigrateTrackpadConfig,
} from './engine/trackpadGestures';
import {
  DesktopSettings,
  loadDesktopSettings,
  saveDesktopSettings,
} from './types/desktop';
import {
  HandPointing,
  PlayPause,
  Gear,
  Monitor,
} from '@phosphor-icons/react';

const STORAGE_SEEK_METHOD_KEY = 'aerokin_seek_method';

export const App: React.FC = () => {
  // Always true dark mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // One-time cleanup of stale air-mouse localStorage keys
  useEffect(() => {
    try {
      localStorage.removeItem('aerokin_config');
      localStorage.removeItem('aerokin_calibration');
    } catch {
      // Ignore in restricted environments
    }
  }, []);

  // 1. Trackpad Engine Config
  const [trackpadConfig, setTrackpadConfig] = useState<TrackpadConfig>(() => loadTrackpadConfig());

  const handleTrackpadConfigChange = (newConfig: Partial<TrackpadConfig>) => {
    setTrackpadConfig((prev) => {
      const updated = validateAndMigrateTrackpadConfig({ ...prev, ...newConfig });
      saveTrackpadConfig(updated);
      return updated;
    });
  };

  const handleResetTrackpadConfig = () => {
    setTrackpadConfig(DEFAULT_TRACKPAD_CONFIG);
    saveTrackpadConfig(DEFAULT_TRACKPAD_CONFIG);
  };

  // 2. Media Seek Method ('auto' vs 'keys')
  const [seekMethod, setSeekMethod] = useState<'auto' | 'keys'>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem(STORAGE_SEEK_METHOD_KEY) as 'auto' | 'keys') || 'auto';
  });

  const handleSeekMethodChange = (method: 'auto' | 'keys') => {
    setSeekMethod(method);
    localStorage.setItem(STORAGE_SEEK_METHOD_KEY, method);
  };

  // 3. Desktop Remote Settings
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(() => loadDesktopSettings());

  const handleDesktopSettingsChange = (partial: Partial<DesktopSettings>) => {
    setDesktopSettings((prev) => {
      const updated = { ...prev, ...partial };
      saveDesktopSettings(updated);
      return updated;
    });
  };

  // 4. Desktop Mode Detection (disabled in hosted mode to never call /api/pair)
  const isDashboardRoute = typeof window !== 'undefined' && window.location.pathname === '/dashboard';
  const [isDesktopMode, setIsDesktopMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (isHostedMode()) return false;
    if (window.location.pathname === '/dashboard') return true;
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
  });

  // 5. Navigation Tabs (Desktop, Trackpad, Media)
  const [activeTab, setActiveTab] = useState<'desktop' | 'trackpad' | 'media'>('trackpad');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  // 6. WebSocket Connection Engine
  const {
    status,
    latency,
    token,
    host,
    isHosted,
    connectionError,
    deviceId,
    credential,
    deviceName,
    devices,
    pairingCode,
    pairingAwaitingApproval,
    setToken,
    setHost,
    setPairingCode,
    connectManually,
    pairDevice,
    renameDevice,
    revokeDevice,
    revokeAllDevices,
    logout,
    unpairThisDevice,
    sendMove,
    sendClick,
    sendButton,
    sendScroll,
    sendAbsMove,
    sendAbsClick,
    sendAbsButton,
    sendKey,
    sendText,
    startDesktopStream,
    stopDesktopStream,
    desktopMonitors,
    desktopStatus,
    desktopStats,
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
    { id: 'desktop', label: 'Desktop', icon: Monitor },
    { id: 'trackpad', label: 'Trackpad', icon: HandPointing },
    { id: 'media', label: 'Media', icon: PlayPause },
  ] as const;

  const handleTabChange = (newTabId: 'desktop' | 'trackpad' | 'media') => {
    triggerHaptic('light');
    setActiveTab(newTabId);
  };

  // Render Desktop Dashboard if on /dashboard route or on PC desktop screen (agent-served only)
  if ((isDesktopMode || isDashboardRoute) && !isHosted) {
    return (
      <DesktopDashboard
        onSwitchToPhoneView={() => {
          if (isDashboardRoute) {
            window.location.href = '/';
          } else {
            setIsDesktopMode(false);
          }
        }}
      />
    );
  }

  // Render Hosted Mode Connection Screen when disconnected in hosted mode
  if (isHosted && status !== 'connected') {
    return (
      <div className="relative flex flex-col h-[100dvh] w-full bg-bg text-foreground overflow-y-auto pt-safe pb-safe select-none p-6 justify-between max-w-md mx-auto">
        {/* Top Header */}
        <header className="flex items-center justify-between h-13 min-h-[52px]">
          <div className="flex items-center">
            <AerokinLogo size={28} withWordmark />
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              setShowSettingsDrawer(true);
            }}
            className="w-10 h-10 min-w-[48px] min-h-[48px] rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
            title="Settings"
            aria-label="Settings"
          >
            <Gear size={20} />
          </button>
        </header>

        {/* Center Card */}
        <div className="flex flex-col items-center text-center my-auto py-6">
          <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-accent mb-4 shadow-sm">
            <Monitor size={32} />
          </div>

          <h1 className="text-xl font-bold tracking-tight mb-2">Connect to your PC</h1>
          <p className="text-xs text-muted-foreground max-w-xs mb-6">
            Control your Windows PC over local Wi-Fi from this hosted controller.
          </p>

          {/* Config Summary Card */}
          <div className="w-full bg-surface border border-border rounded-2xl p-4 text-left mb-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                PC Target Agent
              </span>
              <button
                onClick={() => setShowAuthModal(true)}
                className="text-xs text-accent hover:underline font-medium"
              >
                {host ? 'Edit' : 'Configure'}
              </button>
            </div>

            <div className="font-mono text-sm font-medium text-foreground truncate">
              {host || 'Host address not configured'}
            </div>

            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
              <span>Code:</span>
              <span className="font-mono text-foreground font-semibold tracking-wider">
                {token ? `${token.slice(0, 3)}•••` : 'Not set'}
              </span>
            </div>
          </div>

          {/* Connection Error or Status */}
          {connectionError && (
            <div className="w-full mb-4 p-3.5 rounded-2xl bg-optic-red/10 border border-optic-red/20 text-optic-red text-left text-xs">
              <p className="font-semibold mb-1">Connection Failed</p>
              <p className="leading-relaxed mb-2.5">{connectionError}</p>

              <div className="pt-2 border-t border-optic-red/20 text-[11px] text-foreground/80 space-y-1">
                <p className="font-medium text-optic-red">Verify before connecting:</p>
                <p>• Phone & PC are on the same local Wi-Fi.</p>
                <p>• CA Certificate is trusted on this device.</p>
                <p>• iOS Local Network permission is allowed.</p>
                <p>• PC has this URL in <code className="bg-raised px-1 py-0.5 rounded">AEROKIN_ALLOWED_ORIGINS</code>.</p>
              </div>

              {host && (
                <div className="mt-3">
                  <a
                    href={buildTrustUrl(host)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Download CA Certificate &rarr;
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Primary Action Button (User Gesture) */}
          <button
            onClick={() => {
              triggerHaptic('light');
              if (!host || !token) {
                setShowAuthModal(true);
              } else {
                connectManually();
              }
            }}
            disabled={status === 'reconnecting'}
            className="w-full h-12 min-h-[48px] rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-pressed text-black text-sm font-semibold transition-transform active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
          >
            {status === 'reconnecting' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-black animate-ping" />
                <span>Connecting to PC...</span>
              </>
            ) : !host || !token ? (
              <span>Configure PC Address</span>
            ) : (
              <span>Connect to PC</span>
            )}
          </button>
        </div>

        {/* Footer info */}
        <footer className="text-center text-[11px] text-muted-foreground/60 py-2">
          AeroKin Hosted Mode • Local LAN Only • No Cloud Relay
        </footer>

        {/* Manual Token / Host Modal */}
        {showAuthModal && (
          <ManualTokenModal
            initialToken={token}
            initialCode={pairingCode}
            initialHost={host}
            initialDeviceName={deviceName}
            isHosted={true}
            errorMessage={connectionError}
            isAwaitingApproval={pairingAwaitingApproval}
            onPair={pairDevice}
            onSave={(newToken, newHost) => {
              setToken(newToken);
              if (newHost) setHost(newHost);
              setShowAuthModal(false);
              connectManually();
            }}
            onClose={() => setShowAuthModal(false)}
          />
        )}

        {/* Settings Drawer */}
        <SettingsDrawer
          isOpen={showSettingsDrawer}
          onOpenChange={setShowSettingsDrawer}
          trackpadConfig={trackpadConfig}
          onTrackpadConfigChange={handleTrackpadConfigChange}
          onResetTrackpadConfig={handleResetTrackpadConfig}
          seekMethod={seekMethod}
          onSeekMethodChange={handleSeekMethodChange}
          token={pairingCode || token}
          deviceId={deviceId}
          deviceName={deviceName}
          devices={devices}
          onRenameDevice={renameDevice}
          onRevokeDevice={revokeDevice}
          onRevokeAllDevices={revokeAllDevices}
          onLogout={logout}
          onUnpairThisDevice={unpairThisDevice}
          onOpenAuthModal={() => setShowAuthModal(true)}
        />
      </div>
    );
  }

  // Full-viewport focused Desktop Remote viewer
  if (activeTab === 'desktop') {
    return (
      <DesktopViewer
        host={host}
        deviceId={deviceId}
        credential={credential}
        isHosted={isHosted}
        active={activeTab === 'desktop'}
        monitors={desktopMonitors}
        desktopStatus={desktopStatus}
        desktopSettings={desktopSettings}
        onUpdateDesktopSettings={handleDesktopSettingsChange}
        onClose={() => setActiveTab('trackpad')}
        sendAbsMove={sendAbsMove}
        sendAbsClick={sendAbsClick}
        sendAbsButton={sendAbsButton}
        sendMove={sendMove}
        sendClick={sendClick}
        sendButton={sendButton}
        sendScroll={sendScroll}
        sendKey={sendKey}
        sendText={sendText}
        startDesktopStream={startDesktopStream}
        stopDesktopStream={stopDesktopStream}
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
          {!isHosted &&
            typeof window !== 'undefined' &&
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
                trackpadConfig={trackpadConfig}
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

      {/* Tab bar: 2 equal tabs (Trackpad, Media), icon above short label, spring-sliding indicator */}
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
        trackpadConfig={trackpadConfig}
        onTrackpadConfigChange={handleTrackpadConfigChange}
        onResetTrackpadConfig={handleResetTrackpadConfig}
        seekMethod={seekMethod}
        onSeekMethodChange={handleSeekMethodChange}
        desktopSettings={desktopSettings}
        onDesktopSettingsChange={handleDesktopSettingsChange}
        token={pairingCode || token}
        deviceId={deviceId}
        deviceName={deviceName}
        devices={devices}
        onRenameDevice={renameDevice}
        onRevokeDevice={revokeDevice}
        onRevokeAllDevices={revokeAllDevices}
        onLogout={logout}
        onUnpairThisDevice={unpairThisDevice}
        onOpenAuthModal={() => setShowAuthModal(true)}
      />

      {/* Manual Token Entry Modal */}
      {(status === 'unauthorized' || showAuthModal) && (
        <ManualTokenModal
          initialToken={token}
          initialCode={pairingCode}
          initialHost={host}
          initialDeviceName={deviceName}
          isHosted={isHosted}
          errorMessage={connectionError}
          isAwaitingApproval={pairingAwaitingApproval}
          onPair={pairDevice}
          onSave={(newToken, newHost) => {
            setToken(newToken);
            if (newHost) setHost(newHost);
            setShowAuthModal(false);
            if (isHosted) connectManually();
          }}
          onSaveToken={(newToken) => {
            setToken(newToken);
            setShowAuthModal(false);
          }}
          isRejected={status === 'unauthorized'}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
};

export default App;
