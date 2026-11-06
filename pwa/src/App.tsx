import React, { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AerokinLogo } from '@ui';
import { useAerokinSocket } from './hooks/useAerokinSocket';
import { ManualTokenModal } from './components/ManualTokenModal';
import { ConnectionModeBadge } from './components/ConnectionModeBadge';
import { TrackpadTab } from './components/TrackpadTab';
import { DesktopDashboard } from './components/DesktopDashboard';
import { triggerHaptic } from './utils/haptics';
import { isHostedMode, buildTrustUrl } from './utils/hosting';
import {
  TrackpadConfig,
  loadTrackpadConfig,
  saveTrackpadConfig,
  DEFAULT_TRACKPAD_CONFIG,
  validateAndMigrateTrackpadConfig,
} from './engine/trackpadGestures';
import { DesktopSettings, loadDesktopSettings, saveDesktopSettings } from './types/desktop';
import {
  NavConfig,
  NavSectionId,
  loadNavConfig,
  saveNavConfig,
  DEFAULT_NAV_CONFIG,
} from './engine/navigationConfig';
import {
  HandPointing,
  PlayPause,
  Gear,
  Monitor,
  Lightning,
  Cpu,
  ClipboardText,
  Camera,
  Presentation,
  SquaresFour,
  CaretLeft,
  Desktop,
} from '@phosphor-icons/react';

// Code-split heavy views using React.lazy for faster initial mobile bundle
const DesktopViewer = lazy(() =>
  import('./components/DesktopViewer').then((m) => ({ default: m.DesktopViewer }))
);
const MediaTab = lazy(() => import('./components/MediaTab').then((m) => ({ default: m.MediaTab })));
const SettingsDrawer = lazy(() =>
  import('./components/SettingsDrawer').then((m) => ({ default: m.SettingsDrawer }))
);
const ScreenshotTab = lazy(() =>
  import('./components/ScreenshotTab').then((m) => ({ default: m.ScreenshotTab }))
);
const SystemTab = lazy(() =>
  import('./components/SystemTab').then((m) => ({ default: m.SystemTab }))
);
const ClipboardTab = lazy(() =>
  import('./components/ClipboardTab').then((m) => ({ default: m.ClipboardTab }))
);
const QuickActionsTab = lazy(() =>
  import('./components/QuickActionsTab').then((m) => ({ default: m.QuickActionsTab }))
);
const PresentTab = lazy(() =>
  import('./components/PresentTab').then((m) => ({ default: m.PresentTab }))
);
const MoreLauncher = lazy(() =>
  import('./components/MoreLauncher').then((m) => ({ default: m.MoreLauncher }))
);

const NAV_ITEM_DEFS: Record<NavSectionId, { label: string; icon: React.ComponentType<any> }> = {
  desktop: { label: 'Desktop', icon: Monitor },
  trackpad: { label: 'Trackpad', icon: HandPointing },
  media: { label: 'Media', icon: PlayPause },
  actions: { label: 'Actions', icon: Lightning },
  system: { label: 'System', icon: Cpu },
  clipboard: { label: 'Clipboard', icon: ClipboardText },
  screenshot: { label: 'Capture', icon: Camera },
  present: { label: 'Present', icon: Presentation },
  settings: { label: 'Settings', icon: Gear },
  more: { label: 'More', icon: SquaresFour },
};

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
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettings>(() =>
    loadDesktopSettings()
  );

  const handleDesktopSettingsChange = (partial: Partial<DesktopSettings>) => {
    setDesktopSettings((prev) => {
      const updated = { ...prev, ...partial };
      saveDesktopSettings(updated);
      return updated;
    });
  };

  // 4. Desktop Mode Detection (disabled in hosted mode to never call /api/pair)
  const isDashboardRoute =
    typeof window !== 'undefined' && window.location.pathname === '/dashboard';
  const [isDesktopMode, setIsDesktopMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (isHostedMode()) return false;
    if (window.location.pathname === '/dashboard') return true;
    return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
  });

  // 5. Navigation Config & Tabs (Desktop, Trackpad, Media, More, and pinned sub-views)
  const [navConfig, setNavConfig] = useState<NavConfig>(() => loadNavConfig());
  const [activeTab, setActiveTab] = useState<NavSectionId>(() => {
    const initial = loadNavConfig();
    return initial.defaultTab || 'trackpad';
  });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

  const handleNavConfigChange = (newConfig: NavConfig) => {
    setNavConfig(newConfig);
    saveNavConfig(newConfig);
  };

  const handleResetAllSettings = () => {
    handleResetTrackpadConfig();
    handleSeekMethodChange('auto');
    handleDesktopSettingsChange({
      defaultPreset: 'balanced',
      fpsCap: 30,
      inputMode: 'direct',
      showStats: false,
      autoHideToolbar: true,
    });
    handleNavConfigChange({
      version: 1,
      pinned: ['desktop', 'trackpad', 'media', 'more'],
      defaultTab: 'trackpad',
    });
  };

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
    activePc,
    switchPc,
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
    lastCloseCode,
    lastCloseReason,
    agentLogs,
    requestAgentLogs,
    runLatencyTest,
    requestScreenshot,
    lastScreenshot,
    subscribeStats,
    unsubscribeStats,
    systemStats,
    getClipboard,
    setClipboard,
    setClipboardAndPaste,
    clearClipboardHistory,
    lastClipboardText,
    lastClipboardLength,
    clipboardError,
    executeQuickAction,
    requestLauncherList,
    lastActionResult,
    launcherEntries,
    featureFlags,
  } = useAerokinSocket();

  const handleTabChange = (newTabId: NavSectionId) => {
    triggerHaptic('light');
    if (newTabId === 'settings') {
      setShowSettingsDrawer(true);
      return;
    }
    setActiveTab(newTabId);
  };

  const handleSelectMoreSection = (section: NavSectionId) => {
    triggerHaptic('light');
    if (section === 'settings') {
      setShowSettingsDrawer(true);
      return;
    }
    setActiveTab(section);
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
                <p>
                  • PC has this URL in{' '}
                  <code className="bg-raised px-1 py-0.5 rounded">AEROKIN_ALLOWED_ORIGINS</code>.
                </p>
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
          navConfig={navConfig}
          onNavConfigChange={handleNavConfigChange}
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
          onSwitchPc={switchPc}
          onPairNewPc={() => setShowAuthModal(true)}
          onResetAllSettings={handleResetAllSettings}
        />
      </div>
    );
  }

  // Full-viewport focused Desktop Remote viewer
  if (activeTab === 'desktop') {
    return (
      <Suspense
        fallback={
          <div className="h-full w-full bg-black flex items-center justify-center text-xs font-mono text-muted-foreground">
            Loading Desktop Remote...
          </div>
        }
      >
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
          onRunLatencyTest={runLatencyTest}
        />
      </Suspense>
    );
  }

  return (
    <div className="relative flex flex-col h-[100dvh] w-full bg-bg text-foreground overflow-hidden pt-safe pb-safe select-none touch-none">
      {/* Top Bar: logo mark left, small connection status center-left, settings icon right */}
      <header className="flex items-center justify-between px-gutter h-13 min-h-[52px] border-b border-border bg-bg z-30">
        <div className="flex items-center gap-3">
          {/* Subview Back Button OR Logo */}
          {!navConfig.pinned.includes(activeTab) && activeTab !== 'more' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab('more');
                }}
                className="flex items-center gap-1 text-xs text-[#FF5A1F] hover:underline font-medium min-h-[44px] min-w-[44px] -ml-2 px-2 active:opacity-70 transition-opacity"
                aria-label="Back to More menu"
              >
                <CaretLeft size={18} weight="bold" />
                <span>More</span>
              </button>
              <span className="text-sm font-semibold text-foreground truncate max-w-[160px]">
                {NAV_ITEM_DEFS[activeTab]?.label || 'Tool'}
              </span>
            </div>
          ) : (
            <div className="flex items-center flex-shrink-0">
              <div className="min-[400px]:hidden">
                <AerokinLogo size={24} />
              </div>
              <div className="hidden min-[400px]:block">
                <AerokinLogo size={24} withWordmark />
              </div>
            </div>
          )}

          {/* Small connection status: dot + latency / status */}
          <ConnectionModeBadge
            status={status}
            latency={latency}
            bitrateKbps={desktopStats?.bitrateKbps}
            fps={desktopStats?.fps}
            onOpenSettings={() => setShowSettingsDrawer(true)}
          />

          {/* Active PC Switcher Pill */}
          {activePc?.name && (
            <button
              onClick={() => {
                triggerHaptic('light');
                setShowSettingsDrawer(true);
              }}
              className="hidden min-[480px]:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/40 bg-card hover:border-border text-[11px] font-mono text-muted-foreground hover:text-foreground transition-all cursor-pointer truncate max-w-[140px]"
              title={`Active Computer: ${activePc.name}. Tap to switch or manage PCs.`}
              aria-label="Active computer"
            >
              <Desktop size={12} className="text-[#FF5A1F] flex-shrink-0" weight="fill" />
              <span className="truncate">{activePc.name}</span>
            </button>
          )}
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
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Loading Media Controls...
                  </div>
                }
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
              </Suspense>
            </motion.div>
          )}

          {activeTab === 'more' && (
            <motion.div
              key="more"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col overflow-hidden"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Loading More Tools...
                  </div>
                }
              >
                <MoreLauncher
                  onSelectSection={handleSelectMoreSection}
                  systemSummary={
                    systemStats
                      ? `${systemStats.cpu.totalPercent.toFixed(0)}% CPU • ${(systemStats.ram.usedBytes / 1e9).toFixed(1)} GB RAM`
                      : undefined
                  }
                  clipboardCount={lastClipboardLength ?? undefined}
                  activeWindow={nowPlaying?.app}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === 'screenshot' && (
            <motion.div
              key="screenshot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col overflow-hidden"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Loading Screenshot Tool...
                  </div>
                }
              >
                <ScreenshotTab
                  onRequestScreenshot={requestScreenshot}
                  lastScreenshot={lastScreenshot}
                  monitors={desktopMonitors}
                  onSendToPcClipboard={setClipboard}
                  featureEnabled={featureFlags.screenshot}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === 'system' && (
            <motion.div
              key="system"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col overflow-hidden"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Loading System Stats...
                  </div>
                }
              >
                <SystemTab
                  stats={systemStats}
                  onSubscribe={subscribeStats}
                  onUnsubscribe={unsubscribeStats}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === 'clipboard' && (
            <motion.div
              key="clipboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col overflow-hidden"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Loading Clipboard Sync...
                  </div>
                }
              >
                <ClipboardTab
                  onGetPcClipboard={getClipboard}
                  onSetPcClipboard={setClipboard}
                  onSetPcClipboardAndPaste={setClipboardAndPaste}
                  onClearHistory={clearClipboardHistory}
                  pcClipboardText={lastClipboardText}
                  pcClipboardLength={lastClipboardLength}
                  clipboardError={clipboardError}
                  featureEnabled={featureFlags.clipboard}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === 'actions' && (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col overflow-hidden"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Loading Quick Actions...
                  </div>
                }
              >
                <QuickActionsTab
                  onExecuteAction={executeQuickAction}
                  onRequestLauncherList={requestLauncherList}
                  lastActionResult={lastActionResult}
                  launcherEntries={launcherEntries}
                  onNavigateToScreenshot={() => setActiveTab('screenshot')}
                  featureEnabled={featureFlags.quickActions}
                  launcherEnabled={featureFlags.launcher}
                />
              </Suspense>
            </motion.div>
          )}

          {activeTab === 'present' && (
            <motion.div
              key="present"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full w-full flex flex-col overflow-hidden"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    Loading Presentation Remote...
                  </div>
                }
              >
                <PresentTab onSendKey={sendKey} onSendMove={sendMove} />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Dynamic Bottom Nav: Up to 4 pinned tabs */}
      <nav className="px-gutter pt-1 pb-safe flex justify-center z-20 bg-bg border-t border-border">
        <div className="relative flex items-center w-full max-w-sm h-14">
          {navConfig.pinned.map((tabId: NavSectionId) => {
            const def = NAV_ITEM_DEFS[tabId];
            if (!def) return null;
            const Icon = def.icon;
            const isTabActive =
              activeTab === tabId || (!navConfig.pinned.includes(activeTab) && tabId === 'more');

            return (
              <button
                key={tabId}
                onClick={() => handleTabChange(tabId)}
                className={`relative flex-1 flex flex-col items-center justify-center py-1.5 h-12 rounded-xl transition-colors z-10 cursor-pointer min-h-[48px] ${
                  isTabActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-selected={isTabActive}
                role="tab"
              >
                {isTabActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-surface border border-border"
                  />
                )}
                <Icon
                  size={20}
                  className={`z-10 transition-colors ${
                    isTabActive ? 'text-accent' : 'text-muted-foreground'
                  }`}
                />
                <span className="z-10 text-[11px] font-medium leading-tight mt-0.5 whitespace-nowrap">
                  {def.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Settings Vaul Sheet (Lazy Loaded) */}
      <Suspense fallback={null}>
        <SettingsDrawer
          isOpen={showSettingsDrawer}
          onOpenChange={setShowSettingsDrawer}
          navConfig={navConfig}
          onNavConfigChange={handleNavConfigChange}
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
          onSwitchPc={switchPc}
          onPairNewPc={() => setShowAuthModal(true)}
          status={status}
          host={host}
          latency={latency}
          desktopStats={desktopStats}
          lastCloseCode={lastCloseCode}
          lastCloseReason={lastCloseReason}
          agentLogs={agentLogs}
          onRequestAgentLogs={requestAgentLogs}
          onRunLatencyTest={runLatencyTest}
          onResetAllSettings={handleResetAllSettings}
        />
      </Suspense>

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
