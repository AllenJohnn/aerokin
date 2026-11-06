import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Lightning,
  Lock,
  Moon,
  Desktop,
  Browsers,
  ListDashes,
  SpeakerSimpleSlash,
  Sun,
  SunDim,
  Camera,
  Link,
  Keyboard,
  Power,
  ArrowClockwise,
  SignOut,
  Warning,
  Check,
  X,
  Stop,
  AppWindow,
} from '@phosphor-icons/react';
import { triggerHaptic } from '../utils/haptics';
import { ActionResultData, LauncherEntry } from '../hooks/useAerokinSocket';

export interface QuickActionsTabProps {
  onExecuteAction: (action: string, payload?: string) => void;
  onRequestLauncherList: () => void;
  lastActionResult: ActionResultData | null;
  launcherEntries: LauncherEntry[];
  onNavigateToScreenshot?: () => void;
  featureEnabled?: boolean;
  launcherEnabled?: boolean;
}

export const QuickActionsTab: React.FC<QuickActionsTabProps> = ({
  onExecuteAction,
  onRequestLauncherList,
  lastActionResult,
  launcherEntries = [],
  onNavigateToScreenshot,
  featureEnabled = true,
  launcherEnabled = true,
}) => {
  // Modal / Confirm state for dangerous actions
  const [confirmAction, setConfirmAction] = useState<'shutdown' | 'restart' | 'sign_out' | null>(null);
  const [activeCountdown, setActiveCountdown] = useState<{
    active: boolean;
    action: string | null;
    secondsRemaining: number;
  }>({ active: false, action: null, secondsRemaining: 0 });

  // Inputs for "Send Link" and "Type Text"
  const [linkInput, setLinkInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [textNotice, setTextNotice] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Load launcher entries on mount
  useEffect(() => {
    onRequestLauncherList();
  }, [onRequestLauncherList]);

  // Update active countdown or feedback from server
  useEffect(() => {
    if (!lastActionResult) return;

    if (lastActionResult.countdownActive) {
      setActiveCountdown({
        active: true,
        action: lastActionResult.action,
        secondsRemaining: lastActionResult.secondsRemaining || 10,
      });
      triggerHaptic('heavy');
    } else if (lastActionResult.action === 'cancel_shutdown') {
      setActiveCountdown({ active: false, action: null, secondsRemaining: 0 });
      setActionNotice('Power action cancelled.');
      triggerHaptic('light');
    } else if (lastActionResult.success) {
      setActionNotice(lastActionResult.message || `Action ${lastActionResult.action} succeeded.`);
      triggerHaptic('light');
    } else if (lastActionResult.error) {
      setActionNotice(lastActionResult.error);
      triggerHaptic('heavy');
    }

    const timer = setTimeout(() => setActionNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [lastActionResult]);

  // Countdown decrement ticker
  useEffect(() => {
    if (!activeCountdown.active || activeCountdown.secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setActiveCountdown((prev) => {
        if (prev.secondsRemaining <= 1) {
          return { active: false, action: null, secondsRemaining: 0 };
        }
        return { ...prev, secondsRemaining: prev.secondsRemaining - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeCountdown.active, activeCountdown.secondsRemaining]);

  const handleRunSafeAction = (action: string) => {
    if (!featureEnabled) return;
    triggerHaptic('light');
    onExecuteAction(action);
  };

  const handleOpenDangerousConfirm = (action: 'shutdown' | 'restart' | 'sign_out') => {
    triggerHaptic('medium');
    setConfirmAction(action);
  };

  const handleConfirmDangerousAction = () => {
    if (!confirmAction) return;
    triggerHaptic('heavy');
    onExecuteAction(confirmAction);
    setConfirmAction(null);
  };

  const handleCancelCountdown = () => {
    triggerHaptic('light');
    onExecuteAction('cancel_shutdown');
    setActiveCountdown({ active: false, action: null, secondsRemaining: 0 });
  };

  const handleSendLink = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = linkInput.trim();
    if (!trimmed) return;

    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        setLinkNotice('Only http:// and https:// URLs are allowed.');
        return;
      }
      onExecuteAction('send_link', trimmed);
      setLinkNotice(`Sent ${url.hostname} to PC browser.`);
      setLinkInput('');
      triggerHaptic('light');
    } catch {
      setLinkNotice('Please enter a valid URL (e.g. https://google.com)');
    }

    setTimeout(() => setLinkNotice(null), 3000);
  };

  const handleTypeText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput) return;
    onExecuteAction('type_text', textInput);
    setTextNotice(`Typed ${textInput.length} characters on PC.`);
    setTextInput('');
    triggerHaptic('light');
    setTimeout(() => setTextNotice(null), 3000);
  };

  const handleLaunchApp = (appId: string) => {
    triggerHaptic('light');
    onExecuteAction('launch_app', appId);
  };

  return (
    <div className="flex-1 flex flex-col bg-background text-foreground px-4 py-3 overflow-y-auto max-w-lg mx-auto w-full pb-20 space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Lightning size={20} className="text-[#FF5A1F]" />
          Quick Actions
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Fixed whitelist of safe PC control commands, app launcher & power controls.
        </p>
      </div>

      {!featureEnabled && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
          <Warning size={16} className="shrink-0" />
          <span>Quick Actions feature is currently disabled by the PC operator.</span>
        </div>
      )}

      {/* Active 10-Second Shutdown Countdown Banner */}
      {activeCountdown.active && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-2xl bg-destructive/20 border-2 border-destructive flex flex-col gap-2.5 shadow-xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
              <Warning size={20} weight="fill" className="animate-pulse" />
              <span>
                {activeCountdown.action?.toUpperCase()} IN {activeCountdown.secondsRemaining}s
              </span>
            </div>
            <span className="text-xs text-destructive-foreground font-mono">Visible on PC</span>
          </div>
          <p className="text-xs text-destructive-foreground">
            A remote power event was scheduled. You can cancel it immediately below or on the PC dashboard.
          </p>
          <button
            onClick={handleCancelCountdown}
            className="w-full py-2.5 px-4 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-medium text-xs flex items-center justify-center gap-2 shadow transition-colors"
          >
            <Stop size={16} weight="bold" />
            <span>CANCEL {activeCountdown.action?.toUpperCase()} NOW</span>
          </button>
        </motion.div>
      )}

      {/* General Notification / Feedback Toast */}
      {actionNotice && !activeCountdown.active && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-xl bg-secondary/80 border border-border/40 text-foreground text-xs flex items-center gap-2"
        >
          <Check size={16} className="text-[#FF5A1F] shrink-0" />
          <span>{actionNotice}</span>
        </motion.div>
      )}

      {/* Safe Actions Grid */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          System Shortcuts
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleRunSafeAction('lock_pc')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Lock size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Lock PC</span>
          </button>

          <button
            onClick={() => handleRunSafeAction('sleep')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Moon size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Sleep Mode</span>
          </button>

          <button
            onClick={() => handleRunSafeAction('monitor_off')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Desktop size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Display Off</span>
          </button>

          <button
            onClick={() => handleRunSafeAction('show_desktop')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Browsers size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Show Desktop</span>
          </button>

          <button
            onClick={() => handleRunSafeAction('task_view')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <ListDashes size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Task View</span>
          </button>

          <button
            onClick={() => handleRunSafeAction('task_manager')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <AppWindow size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Task Manager</span>
          </button>

          <button
            onClick={() => handleRunSafeAction('volume_mute')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <SpeakerSimpleSlash size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Mute Sound</span>
          </button>

          <button
            onClick={() => handleRunSafeAction('brightness_up')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Sun size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Brightness +</span>
          </button>

          <button
            onClick={() => {
              if (onNavigateToScreenshot) {
                onNavigateToScreenshot();
              } else {
                handleRunSafeAction('screenshot');
              }
            }}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-card border border-border/40 flex flex-col items-center justify-center gap-2 text-center hover:bg-secondary/40 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Camera size={22} className="text-[#FF5A1F]" />
            <span className="text-xs font-medium text-foreground">Screenshot</span>
          </button>
        </div>
      </div>

      {/* Send Link to PC */}
      <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2">
        <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Link size={14} className="text-[#FF5A1F]" />
          <span>Send Link to PC Browser</span>
        </div>
        <form onSubmit={handleSendLink} className="flex gap-2">
          <input
            type="url"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 bg-background border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground font-mono focus:outline-none focus:border-[#FF5A1F]"
          />
          <button
            type="submit"
            disabled={!linkInput || !featureEnabled}
            className="py-2 px-3.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
          >
            Open
          </button>
        </form>
        {linkNotice && <p className="text-[11px] text-[#FF5A1F]">{linkNotice}</p>}
      </div>

      {/* Type Text on PC */}
      <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-2">
        <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Keyboard size={14} className="text-[#FF5A1F]" />
          <span>Type Text on PC</span>
        </div>
        <form onSubmit={handleTypeText} className="flex gap-2">
          <input
            type="text"
            value={textInput}
            maxLength={1000}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type text to send as keystrokes..."
            className="flex-1 bg-background border border-border/40 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-[#FF5A1F]"
          />
          <button
            type="submit"
            disabled={!textInput || !featureEnabled}
            className="py-2 px-3.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
          >
            Type
          </button>
        </form>
        {textNotice && <p className="text-[11px] text-[#FF5A1F]">{textNotice}</p>}
      </div>

      {/* Allow-Listed App Launcher */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Allow-Listed PC Apps
          </h3>
          <span className="text-[11px] text-muted-foreground/60">Configured in launcher.json</span>
        </div>

        {launcherEnabled && launcherEntries.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {launcherEntries.map((app) => (
              <button
                key={app.id}
                onClick={() => handleLaunchApp(app.id)}
                disabled={!featureEnabled || !launcherEnabled}
                className="p-3 rounded-2xl bg-card border border-border/40 flex items-center gap-2.5 text-left hover:bg-secondary/30 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                <div className="w-8 h-8 rounded-xl bg-[#FF5A1F]/10 border border-[#FF5A1F]/20 flex items-center justify-center shrink-0">
                  <AppWindow size={18} className="text-[#FF5A1F]" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-medium text-foreground truncate">{app.name}</div>
                  {app.description && (
                    <div className="text-[10px] text-muted-foreground truncate">{app.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-card border border-border/30 text-center text-xs text-muted-foreground">
            {!launcherEnabled
              ? 'App Launcher is disabled on the PC dashboard.'
              : 'No allow-listed applications configured. Create a launcher.json file on your PC.'}
          </div>
        )}
      </div>

      {/* Dangerous Actions (Confirmation Required) */}
      <div className="space-y-2 pt-2 border-t border-border/30">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
          Power Controls (10s Countdown)
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleOpenDangerousConfirm('shutdown')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-destructive/10 border border-destructive/20 flex flex-col items-center justify-center gap-1.5 text-center hover:bg-destructive/20 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <Power size={20} className="text-red-400" />
            <span className="text-xs font-medium text-red-400">Shutdown</span>
          </button>

          <button
            onClick={() => handleOpenDangerousConfirm('restart')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col items-center justify-center gap-1.5 text-center hover:bg-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <ArrowClockwise size={20} className="text-amber-400" />
            <span className="text-xs font-medium text-amber-400">Restart</span>
          </button>

          <button
            onClick={() => handleOpenDangerousConfirm('sign_out')}
            disabled={!featureEnabled}
            className="p-3 rounded-2xl bg-secondary border border-border/40 flex flex-col items-center justify-center gap-1.5 text-center hover:bg-secondary/70 active:scale-[0.98] transition-all disabled:opacity-40"
          >
            <SignOut size={20} className="text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Confirmation Dialog / Sheet */}
      <AnimatePresence>
        {confirmAction && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-card border border-border/50 rounded-2xl max-w-sm w-full p-4 space-y-3.5 shadow-2xl"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                  <Warning size={20} weight="fill" />
                  <span>Confirm {confirmAction.replace('_', ' ').toUpperCase()}</span>
                </div>
                <button
                  onClick={() => setConfirmAction(null)}
                  className="p-1 rounded-lg hover:bg-secondary text-muted-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to {confirmAction.replace('_', ' ')} your PC? This will start a
                10-second cancelable countdown visible on the PC screen and dashboard.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="py-2.5 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDangerousAction}
                  className="py-2.5 px-3 rounded-xl bg-destructive hover:bg-destructive/90 text-white text-xs font-medium shadow transition-colors"
                >
                  Start 10s Countdown
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
