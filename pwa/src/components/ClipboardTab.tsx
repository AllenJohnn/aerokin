import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TextArea } from '@ui';
import {
  ClipboardText,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Warning,
  Trash,
  Clock,
  ShieldCheck,
  PaperPlaneTilt,
  UploadSimple,
  FileArrowUp,
  CheckCircle,
} from '@phosphor-icons/react';
import { triggerHaptic } from '../utils/haptics';
import { getStoredDeviceCredentials } from '../utils/hosting';

export interface ClipboardItem {
  id: string;
  timestamp: number;
  direction: 'phone_to_pc' | 'pc_to_phone';
  length: number;
  preview: string;
}

export interface ClipboardTabProps {
  onGetPcClipboard: () => void;
  onSetPcClipboard: (text: string) => void;
  onSetPcClipboardAndPaste: (text: string) => void;
  onClearHistory: () => void;
  pcClipboardText: string | null;
  pcClipboardLength: number | null;
  clipboardError: string | null;
  featureEnabled?: boolean;
}

const MAX_CLIPBOARD_BYTES = 102400; // 100 KB
const STORAGE_PHONE_HISTORY_ENABLED_KEY = 'aerokin_clipboard_phone_history_enabled';
const STORAGE_AUTO_SYNC_ENABLED_KEY = 'aerokin_clipboard_auto_sync_enabled';

export const ClipboardTab: React.FC<ClipboardTabProps> = ({
  onGetPcClipboard,
  onSetPcClipboard,
  onSetPcClipboardAndPaste,
  onClearHistory,
  pcClipboardText,
  pcClipboardLength,
  clipboardError,
  featureEnabled = true,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [phoneHistoryEnabled, setPhoneHistoryEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_PHONE_HISTORY_ENABLED_KEY) === 'true';
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_AUTO_SYNC_ENABLED_KEY) === 'true';
  });

  // In-memory phone history (never contains contents in localStorage, max 20)
  const [inMemoryHistory, setInMemoryHistory] = useState<ClipboardItem[]>([]);
  const [copiedToPhone, setCopiedToPhone] = useState<boolean>(false);
  const [sentNotice, setSentNotice] = useState<string | null>(null);
  const [iosNotice, setIosNotice] = useState<string | null>(null);

  // File Transfer State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus(null);
      triggerHaptic('light');
    }
  };

  const handleSendFile = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setUploadStatus(null);
    try {
      const creds = getStoredDeviceCredentials();
      const res = await fetch('/api/transfer/upload', {
        method: 'POST',
        headers: {
          'x-aerokin-filename': encodeURIComponent(selectedFile.name),
          'x-aerokin-device-id': creds.deviceId || '',
          'x-aerokin-credential': creds.credential || '',
          'content-type': selectedFile.type || 'application/octet-stream',
        },
        body: selectedFile,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        triggerHaptic('success');
        setUploadStatus({ ok: true, message: `Sent ${data.filename} to Downloads/AeroKin on PC!` });
        setSelectedFile(null);
      } else {
        triggerHaptic('alert');
        setUploadStatus({ ok: false, message: data.error || 'Failed to upload file.' });
      }
    } catch (err: any) {
      triggerHaptic('alert');
      setUploadStatus({ ok: false, message: err?.message || 'Network error during upload.' });
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const prevPcTextRef = useRef<string | null>(null);

  // Handle incoming PC clipboard text
  useEffect(() => {
    if (pcClipboardText === null || pcClipboardText === undefined) return;
    if (pcClipboardText === prevPcTextRef.current) return;
    prevPcTextRef.current = pcClipboardText;

    if (phoneHistoryEnabled) {
      const item: ClipboardItem = {
        id: `clip_${Date.now()}`,
        timestamp: Date.now(),
        direction: 'pc_to_phone',
        length: pcClipboardLength || pcClipboardText.length,
        preview: pcClipboardText.slice(0, 80),
      };
      setInMemoryHistory((prev) => [item, ...prev].slice(0, 20));
    }
  }, [pcClipboardText, pcClipboardLength, phoneHistoryEnabled]);

  const handlePhoneHistoryToggle = (enabled: boolean) => {
    setPhoneHistoryEnabled(enabled);
    localStorage.setItem(STORAGE_PHONE_HISTORY_ENABLED_KEY, String(enabled));
    if (!enabled) {
      setInMemoryHistory([]);
    }
    triggerHaptic('light');
  };

  const handleAutoSyncToggle = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    localStorage.setItem(STORAGE_AUTO_SYNC_ENABLED_KEY, String(enabled));
    triggerHaptic('light');
  };

  // 1. Send text to PC Clipboard
  const handleSendToPc = (andPaste = false) => {
    if (!inputText) return;
    triggerHaptic('light');

    if (inputText.length > MAX_CLIPBOARD_BYTES) {
      setSentNotice('Text exceeds 100 KB limit.');
      return;
    }

    if (andPaste) {
      onSetPcClipboardAndPaste(inputText);
      setSentNotice('Sent & pasted on PC.');
    } else {
      onSetPcClipboard(inputText);
      setSentNotice('Copied to PC clipboard.');
    }

    if (phoneHistoryEnabled) {
      const item: ClipboardItem = {
        id: `clip_${Date.now()}`,
        timestamp: Date.now(),
        direction: 'phone_to_pc',
        length: inputText.length,
        preview: inputText.slice(0, 80),
      };
      setInMemoryHistory((prev) => [item, ...prev].slice(0, 20));
    }

    setTimeout(() => setSentNotice(null), 3000);
  };

  // 2. Read from Phone Clipboard (iOS permission handling)
  const handlePasteFromPhone = async () => {
    triggerHaptic('light');
    try {
      if (navigator.clipboard && 'readText' in navigator.clipboard) {
        // User gesture triggers iOS native clipboard prompt
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputText(text);
          setIosNotice('Pasted from phone clipboard.');
        } else {
          setIosNotice('Phone clipboard is empty.');
        }
      } else {
        setIosNotice('Tap the text box below and select "Paste" to insert text.');
      }
    } catch {
      // Common iOS Safari prompt denial or restriction
      setIosNotice(
        'iOS clipboard prompt declined or restricted. You can paste directly into the box below.'
      );
    }

    setTimeout(() => setIosNotice(null), 4000);
  };

  // 3. Copy received PC text to Phone Clipboard
  const handleCopyToPhone = async () => {
    if (!pcClipboardText) return;
    triggerHaptic('light');

    try {
      if (navigator.clipboard && 'writeText' in navigator.clipboard) {
        await navigator.clipboard.writeText(pcClipboardText);
        setCopiedToPhone(true);
        triggerHaptic('medium');
        setTimeout(() => setCopiedToPhone(false), 2000);
      } else {
        setIosNotice('Select and copy from the text box below.');
      }
    } catch {
      setIosNotice('Browser blocked clipboard write. Select the text manually.');
    }
  };

  const handleClear = () => {
    onClearHistory();
    setInMemoryHistory([]);
    setInputText('');
    triggerHaptic('light');
  };

  return (
    <div className="flex-1 flex flex-col bg-background text-foreground px-4 py-3 overflow-y-auto max-w-lg mx-auto w-full pb-20 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ClipboardText size={20} className="text-[#FF5A1F]" />
            Clipboard Sync
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Safely exchange text between Phone and PC clipboard (max 100 KB).
          </p>
        </div>
      </div>

      {!featureEnabled && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
          <Warning size={16} className="shrink-0" />
          <span>Clipboard sync is currently disabled by the PC operator on the dashboard.</span>
        </div>
      )}

      {/* Privacy Notice Banner */}
      <div className="p-2.5 rounded-xl bg-secondary/40 border border-border/30 text-[11px] text-muted-foreground flex items-start gap-2">
        <ShieldCheck size={16} className="text-[#FF5A1F] shrink-0 mt-0.5" />
        <div>
          <strong className="text-foreground">Privacy Guaranteed:</strong> Clipboard contents are
          strictly in-memory and NEVER logged anywhere on the server or client (only character
          lengths are recorded).
        </div>
      </div>

      {/* SECTION 1: Phone -> PC */}
      <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground flex items-center gap-1.5">
            <ArrowRight size={14} className="text-[#FF5A1F]" />
            Send to PC Clipboard
          </span>
          <button
            onClick={handlePasteFromPhone}
            className="text-[11px] text-[#FF5A1F] hover:underline font-medium"
          >
            Paste from Phone
          </button>
        </div>

        <TextArea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste or type text to send to your PC clipboard..."
          rows={3}
          maxLength={MAX_CLIPBOARD_BYTES}
          className="font-mono text-xs"
        />

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{inputText.length} / 100,000 characters</span>
          {inputText && (
            <button
              onClick={() => setInputText('')}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear input
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => handleSendToPc(false)}
            disabled={!inputText || !featureEnabled}
            className="py-2 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-medium flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
          >
            <PaperPlaneTilt size={14} />
            <span>Send to PC</span>
          </button>
          <button
            onClick={() => handleSendToPc(true)}
            disabled={!inputText || !featureEnabled}
            className="py-2 px-3 rounded-xl bg-[#FF5A1F] text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-40"
          >
            <PaperPlaneTilt size={14} weight="bold" />
            <span>Send & Paste</span>
          </button>
        </div>
      </div>

      {/* Notices */}
      {sentNotice && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2"
        >
          <Check size={16} />
          <span>{sentNotice}</span>
        </motion.div>
      )}

      {iosNotice && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-xl bg-secondary/60 border border-border/40 text-foreground text-xs flex items-center gap-2"
        >
          <Warning size={16} className="text-[#FF5A1F] shrink-0" />
          <span>{iosNotice}</span>
        </motion.div>
      )}

      {clipboardError && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-2.5 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive-foreground text-xs flex items-center gap-2"
        >
          <Warning size={16} className="text-red-400 shrink-0" />
          <span>{clipboardError}</span>
        </motion.div>
      )}

      {/* SECTION 2: PC -> Phone */}
      <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground flex items-center gap-1.5">
            <ArrowLeft size={14} className="text-[#FF5A1F]" />
            Get PC Clipboard
          </span>
          <button
            onClick={onGetPcClipboard}
            disabled={!featureEnabled}
            className="py-1 px-2.5 rounded-lg bg-[#FF5A1F]/10 border border-[#FF5A1F]/30 text-[#FF5A1F] text-xs font-medium hover:bg-[#FF5A1F]/20 transition-colors disabled:opacity-40"
          >
            Fetch PC Text
          </button>
        </div>

        {pcClipboardText !== null ? (
          <div className="space-y-2">
            <div className="relative">
              <TextArea
                readOnly
                value={pcClipboardText}
                rows={3}
                className="font-mono text-xs cursor-default"
              />
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground text-[11px]">
                {pcClipboardLength || pcClipboardText.length} characters received
              </span>
              <button
                onClick={handleCopyToPhone}
                className="py-1.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                {copiedToPhone ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied to Phone!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy to Phone</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-background/50 border border-border/20 text-center text-xs text-muted-foreground">
            Tap &quot;Fetch PC Text&quot; to inspect current PC clipboard text.
          </div>
        )}
      </div>

      {/* SECTION 2.5: AeroKin File Drop & Transfer */}
      <div className="bg-card border border-border/40 rounded-2xl p-4 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileArrowUp size={16} className="text-[#FF5A1F]" />
            <span className="font-semibold uppercase tracking-wider text-muted-foreground text-[11px]">
              Send File to PC (AeroKin Drop)
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">Downloads/AeroKin</span>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          aria-label="Select file to send"
        />

        {selectedFile ? (
          <div className="p-3 rounded-xl border border-border/60 bg-surface space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {selectedFile.name}
              </span>
              <span className="font-mono text-muted-foreground text-[11px]">
                {formatFileSize(selectedFile.size)}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                onClick={handleSendFile}
                disabled={isUploading}
                className="flex-1 py-1.5 px-3 rounded-lg bg-[#FF5A1F] text-white font-medium hover:brightness-110 active:scale-[0.98] transition-transform text-xs flex items-center justify-center gap-1.5"
              >
                {isUploading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Sending to PC...</span>
                  </>
                ) : (
                  <>
                    <UploadSimple size={14} weight="bold" />
                    <span>Send to PC</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 rounded-xl border border-dashed border-border/60 hover:border-[#FF5A1F]/50 hover:bg-[#FF5A1F]/5 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            <UploadSimple size={22} className="text-[#FF5A1F]" />
            <span className="font-medium text-xs">Choose File or Photo to Send to PC</span>
            <span className="text-[10px] text-muted-foreground/60">
              Saves directly to your PC Downloads folder
            </span>
          </button>
        )}

        {uploadStatus && (
          <div
            className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
              uploadStatus.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
            }`}
          >
            {uploadStatus.ok ? (
              <CheckCircle size={15} weight="fill" className="flex-shrink-0" />
            ) : (
              <Warning size={15} weight="fill" className="flex-shrink-0" />
            )}
            <span>{uploadStatus.message}</span>
          </div>
        )}
      </div>

      {/* SECTION 3: Preferences & Toggles */}
      <div className="bg-card border border-border/40 rounded-2xl p-3.5 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-foreground">Phone-side In-Memory History</div>
            <div className="text-muted-foreground text-[11px]">
              Keep last 20 items in memory while app is open.
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={phoneHistoryEnabled}
              onChange={(e) => handlePhoneHistoryToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF5A1F]"></div>
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-border/20 pt-2.5">
          <div>
            <div className="font-medium text-foreground">Foreground Auto-Sync</div>
            <div className="text-muted-foreground text-[11px]">
              Sync text only when app is active. No background poller.
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => handleAutoSyncToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF5A1F]"></div>
          </label>
        </div>
      </div>

      {/* History List */}
      {phoneHistoryEnabled && inMemoryHistory.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock size={14} />
              Recent Shared Items ({inMemoryHistory.length})
            </span>
            <button
              onClick={handleClear}
              className="text-[11px] text-destructive hover:underline flex items-center gap-1"
            >
              <Trash size={12} />
              Clear All
            </button>
          </div>

          <div className="space-y-1.5">
            {inMemoryHistory.map((item) => (
              <div
                key={item.id}
                className="bg-card border border-border/30 rounded-xl p-2.5 flex items-center justify-between text-xs"
              >
                <div className="truncate max-w-[220px]">
                  <span className="font-mono text-muted-foreground/80">{item.preview}...</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-muted-foreground">
                  <span>{item.direction === 'phone_to_pc' ? 'Phone → PC' : 'PC → Phone'}</span>
                  <span>({item.length} chars)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
