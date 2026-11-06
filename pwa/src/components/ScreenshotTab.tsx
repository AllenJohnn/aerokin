import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  ArrowsIn,
  DownloadSimple,
  Copy,
  Check,
  Warning,
  Clock,
  ShareNetwork,
  Monitor,
  Trash,
  ClipboardText,
} from '@phosphor-icons/react';
import { triggerHaptic } from '../utils/haptics';
import { ScreenshotResponseData } from '../hooks/useAerokinSocket';
import { MonitorInfo } from '../types/desktop';

export interface ScreenshotHistoryItem {
  id: string;
  timestamp: number;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  note?: string;
}

export interface ScreenshotTabProps {
  onRequestScreenshot: (options?: {
    target?: 'all' | 'active_window' | 'monitor';
    monitorId?: string;
    includeCursor?: boolean;
  }) => void;
  lastScreenshot: ScreenshotResponseData | null;
  monitors?: MonitorInfo[];
  onSendToPcClipboard?: (text: string) => void;
  featureEnabled?: boolean;
}

export const ScreenshotTab: React.FC<ScreenshotTabProps> = ({
  onRequestScreenshot,
  lastScreenshot,
  monitors = [],
  onSendToPcClipboard,
  featureEnabled = true,
}) => {
  const [target, setTarget] = useState<'all' | 'active_window' | 'monitor'>('all');
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('');
  const [includeCursor, setIncludeCursor] = useState<boolean>(true);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<ScreenshotHistoryItem | null>(null);
  const [history, setHistory] = useState<ScreenshotHistoryItem[]>([]);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [copiedState, setCopiedState] = useState<boolean>(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const touchStartDistRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);

  // Update when server responds with new screenshot
  useEffect(() => {
    if (!lastScreenshot) return;
    setIsCapturing(false);

    if (!lastScreenshot.success || !lastScreenshot.data) {
      setErrorMessage(lastScreenshot.error || 'Capture failed');
      triggerHaptic('heavy');
      return;
    }

    setErrorMessage(null);
    triggerHaptic('medium');

    const mime = lastScreenshot.mimeType || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${lastScreenshot.data}`;

    const item: ScreenshotHistoryItem = {
      id: `shot_${Date.now()}`,
      timestamp: Date.now(),
      dataUrl,
      width: lastScreenshot.width || 1920,
      height: lastScreenshot.height || 1080,
      sizeBytes: lastScreenshot.sizeBytes || 0,
      note: lastScreenshot.note,
    };

    setCapturedImage(item);
    setZoomScale(1);

    // Maintain in-memory ring buffer (max 5 items, NEVER stored in localStorage)
    setHistory((prev) => [item, ...prev.filter((h) => h.id !== item.id)].slice(0, 5));
  }, [lastScreenshot]);

  const handleCapture = () => {
    if (!featureEnabled) {
      setErrorMessage('Screenshot feature is disabled on PC dashboard.');
      return;
    }

    setIsCapturing(true);
    setErrorMessage(null);
    setSaveNote(null);
    triggerHaptic('light');

    onRequestScreenshot({
      target,
      monitorId: target === 'monitor' && selectedMonitorId ? selectedMonitorId : undefined,
      includeCursor,
    });
  };

  // Pinch-to-zoom touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      initialScaleRef.current = zoomScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / touchStartDistRef.current;
      const newScale = Math.min(4, Math.max(1, initialScaleRef.current * ratio));
      setZoomScale(newScale);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  const handleResetZoom = () => {
    setZoomScale(1);
    triggerHaptic('light');
  };

  // Save / Share Image
  const handleSaveOrShare = async () => {
    if (!capturedImage) return;
    triggerHaptic('light');

    try {
      const res = await fetch(capturedImage.dataUrl);
      const blob = await res.blob();
      const filename = `aerokin-capture-${capturedImage.timestamp}.jpg`;
      const file = new File([blob], filename, { type: blob.type });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'AEROKIN Screen Capture',
        });
        setSaveNote('Shared successfully');
      } else {
        // Fallback: download via anchor tag
        const link = document.createElement('a');
        link.href = capturedImage.dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setSaveNote('Image downloaded. (Long-press to save directly to iOS Photos)');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setSaveNote('Long-press preview to save to Photos');
      }
    }

    setTimeout(() => setSaveNote(null), 4000);
  };

  // Copy to phone clipboard
  const handleCopyToClipboard = async () => {
    if (!capturedImage) return;
    triggerHaptic('light');

    try {
      if (navigator.clipboard && 'write' in navigator.clipboard) {
        const res = await fetch(capturedImage.dataUrl);
        const blob = await res.blob();
        // PNG is standard for clipboard items
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
        setCopiedState(true);
        triggerHaptic('medium');
        setTimeout(() => setCopiedState(false), 2000);
      } else {
        setErrorMessage('Clipboard copy requires user permission in this browser.');
      }
    } catch {
      setErrorMessage('Browser blocked copying image. Use Save / Share instead.');
      setTimeout(() => setErrorMessage(null), 3000);
    }
  };

  const handleSelectHistoryItem = (item: ScreenshotHistoryItem) => {
    setCapturedImage(item);
    setZoomScale(1);
    triggerHaptic('light');
  };

  return (
    <div className="flex-1 flex flex-col bg-background text-foreground px-4 py-3 overflow-y-auto max-w-lg mx-auto w-full pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Camera size={20} className="text-[#FF5A1F]" />
            Screenshot
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            One-shot native screen capture with pinch-zoom & sharing.
          </p>
        </div>
      </div>

      {!featureEnabled && (
        <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2">
          <Warning size={16} className="shrink-0" />
          <span>Screenshot feature is currently disabled by the PC operator.</span>
        </div>
      )}

      {/* Target Selector & Options */}
      <div className="bg-card border border-border/40 rounded-2xl p-3 mb-3 space-y-3">
        <div className="flex rounded-xl bg-background/60 p-1 border border-border/30">
          <button
            onClick={() => setTarget('all')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              target === 'all'
                ? 'bg-[#FF5A1F] text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Entire Screen
          </button>
          <button
            onClick={() => setTarget('active_window')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              target === 'active_window'
                ? 'bg-[#FF5A1F] text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Active Window
          </button>
          {monitors.length > 1 && (
            <button
              onClick={() => setTarget('monitor')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                target === 'monitor'
                  ? 'bg-[#FF5A1F] text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monitor
            </button>
          )}
        </div>

        {target === 'monitor' && monitors.length > 1 && (
          <div className="flex items-center gap-2">
            <Monitor size={16} className="text-muted-foreground" />
            <select
              value={selectedMonitorId}
              onChange={(e) => setSelectedMonitorId(e.target.value)}
              className="flex-1 bg-background border border-border/40 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-[#FF5A1F]"
            >
              {monitors.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || `Display ${m.id}`} ({m.bounds?.width || 1920}x{m.bounds?.height || 1080})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border/20 text-xs">
          <span className="text-muted-foreground">Include mouse cursor</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={includeCursor}
              onChange={(e) => setIncludeCursor(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#FF5A1F]"></div>
          </label>
        </div>

        {/* Capture Action Button */}
        <button
          onClick={handleCapture}
          disabled={isCapturing || !featureEnabled}
          className="w-full py-3 px-4 rounded-xl bg-[#FF5A1F] text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
        >
          {isCapturing ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
              />
              <span>Capturing PC Screen...</span>
            </>
          ) : (
            <>
              <Camera size={18} weight="bold" />
              <span>Capture Screen</span>
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive-foreground text-xs flex items-center gap-2"
        >
          <Warning size={16} className="shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </motion.div>
      )}

      {/* Save Notification Note */}
      {saveNote && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2"
        >
          <Check size={16} className="shrink-0" />
          <span>{saveNote}</span>
        </motion.div>
      )}

      {/* Captured Image Preview Area */}
      {capturedImage ? (
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden flex flex-col mb-4">
          <div className="px-3 py-2 bg-muted/30 border-b border-border/30 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {capturedImage.width}x{capturedImage.height} •{' '}
              {Math.round(capturedImage.sizeBytes / 1024)} KB
            </span>
            <div className="flex items-center gap-2">
              {zoomScale > 1 && (
                <button
                  onClick={handleResetZoom}
                  className="flex items-center gap-1 text-[#FF5A1F] hover:underline"
                >
                  <ArrowsIn size={14} />
                  <span>Reset zoom ({Math.round(zoomScale * 100)}%)</span>
                </button>
              )}
            </div>
          </div>

          {/* Pinch-to-zoom viewport */}
          <div
            ref={imageContainerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden touch-none"
          >
            <img
              src={capturedImage.dataUrl}
              alt="PC Screenshot"
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'center center',
                transition: touchStartDistRef.current ? 'none' : 'transform 0.15s ease-out',
              }}
              className="max-w-full max-h-full object-contain pointer-events-auto select-none"
            />
          </div>

          {capturedImage.note && (
            <div className="px-3 py-1.5 bg-amber-500/10 border-t border-amber-500/20 text-amber-400 text-[11px]">
              {capturedImage.note}
            </div>
          )}

          {/* Actions Toolbar */}
          <div className="p-3 bg-muted/20 border-t border-border/30 grid grid-cols-2 gap-2">
            <button
              onClick={handleSaveOrShare}
              className="py-2.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <DownloadSimple size={16} />
              <span>Save / Share</span>
            </button>
            <button
              onClick={handleCopyToClipboard}
              className="py-2.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {copiedState ? (
                <>
                  <Check size={16} className="text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copy to Phone</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border/30 rounded-2xl p-8 flex flex-col items-center justify-center text-center mb-4">
          <Camera size={36} className="text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">
            No capture yet. Tap &quot;Capture Screen&quot; to take a high-resolution snapshot.
          </p>
        </div>
      )}

      {/* In-Memory Recent History (Last 5) */}
      {history.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock size={14} />
              Recent Captures (In-Memory)
            </span>
            <span className="text-[11px] text-muted-foreground/60">Cleared on exit</span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {history.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleSelectHistoryItem(item)}
                className={`relative aspect-video rounded-lg overflow-hidden border transition-all ${
                  capturedImage?.id === item.id
                    ? 'border-[#FF5A1F] ring-1 ring-[#FF5A1F]'
                    : 'border-border/40 opacity-70 hover:opacity-100'
                }`}
              >
                <img
                  src={item.dataUrl}
                  alt={`Capture ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
