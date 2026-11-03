import React, { useState, useEffect, useRef } from 'react';
import { NowPlayingData, MediaSessionItem, MediaAction } from '../hooks/useAerokinSocket';
import { triggerHaptic } from '../utils/haptics';
import * as Slider from '@radix-ui/react-slider';
import { useDrag } from '@use-gesture/react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  SpeakerHigh,
  SpeakerSimpleSlash,
  CornersOut,
  Disc,
  ClockCounterClockwise,
  ClockClockwise,
  CaretDown,
} from '@phosphor-icons/react';

interface MediaTabProps {
  nowPlaying: NowPlayingData;
  sessions: MediaSessionItem[];
  volume: number;
  muted: boolean;
  sendMedia: (action: MediaAction) => void;
  sendSeekBy: (seconds: number) => void;
  sendSeekTo: (position: number) => void;
  sendSession: (id: string) => void;
  sendSetVolume: (level: number) => void;
  seekMethod: 'auto' | 'keys';
  onOpenSettings: () => void;
}

function formatTime(seconds?: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  nowPlaying,
  sessions,
  volume,
  muted,
  sendMedia,
  sendSeekBy,
  sendSeekTo,
  sendSession,
  sendSetVolume,
  seekMethod,
  onOpenSettings,
}) => {
  const [showSessionsPicker, setShowSessionsPicker] = useState(false);
  const [seekToast, setSeekToast] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Scrubber drag state
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);

  const displayPosition = scrubPosition !== null ? scrubPosition : nowPlaying.position ?? 0;
  const duration = nowPlaying.duration ?? 0;
  const canSeek = !!nowPlaying.canSeek && duration > 0;
  const isPlaying = nowPlaying.status === 'playing';

  const showToast = (text: string) => {
    setSeekToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setSeekToast(null);
    }, 1200);
  };

  const handleSeekDelta = (seconds: number) => {
    triggerHaptic('medium');
    showToast(`${seconds > 0 ? '+' : ''}${seconds}s`);

    if (seekMethod === 'keys') {
      sendMedia(seconds > 0 ? 'seekfwd' : 'seekback');
    } else {
      sendSeekBy(seconds);
    }
  };

  const handlePlayPause = () => {
    triggerHaptic('medium');
    sendMedia('playpause');
  };

  const handleVolumeToggleMute = () => {
    triggerHaptic('medium');
    sendMedia('mute');
  };

  // Knurled Volume Dial using @use-gesture/react
  const dialRef = useRef<HTMLDivElement | null>(null);
  const lastVolDetentRef = useRef(volume);

  const bindDial = useDrag(
    ({ movement: [, my], active, first }) => {
      if (first) {
        lastVolDetentRef.current = volume;
      }
      // Dragging up increases volume, dragging down decreases
      const delta = -my * 0.4;
      const targetVol = Math.max(0, Math.min(100, Math.round(lastVolDetentRef.current + delta)));

      if (targetVol !== volume) {
        sendSetVolume(targetVol);
        if (Math.abs(targetVol - volume) >= 2) {
          triggerHaptic('detent');
        }
      }
    },
    {
      pointer: { capture: true },
      preventDefault: true,
    }
  );

  return (
    <div className="flex-1 flex flex-col justify-between p-4 max-w-md mx-auto w-full h-full select-none relative">
      {/* On-screen Seek Toast Badge */}
      {seekToast && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded bg-black/90 border border-hw-border-milled text-white font-mono text-sm font-bold shadow-2xl animate-in fade-in zoom-in-95 duration-100">
          {seekToast}
        </div>
      )}

      {/* 1. Now Playing Card */}
      <div className="w-full rounded-xl bg-hw-surface border border-hw-border p-4 shadow-hw-well relative overflow-hidden">
        {/* Source Sessions Dropdown */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-hw-border-subtle">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isPlaying
                  ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                  : 'bg-white/20'
              }`}
            />
            <span className="font-display font-bold uppercase text-[10px] tracking-wider text-hw-text">
              {nowPlaying.app ? nowPlaying.app.toUpperCase() : 'NO MEDIA ACTIVE'}
            </span>
          </div>

          {sessions.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowSessionsPicker((s) => !s)}
                className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-hw-primary bg-hw-surface-raised px-2 py-0.5 rounded border border-hw-border-milled hover:bg-hw-surface-hl transition-all"
              >
                <span>{sessions.length} SOURCES</span>
                <CaretDown size={12} />
              </button>

              {showSessionsPicker && (
                <div className="absolute right-0 top-7 z-40 w-48 rounded bg-hw-surface-raised border border-hw-border-milled shadow-2xl p-1 space-y-1">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        sendSession(s.id);
                        setShowSessionsPicker(false);
                        triggerHaptic('light');
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-[11px] font-mono flex items-center justify-between transition-colors ${
                        s.current ? 'bg-hw-primary text-white' : 'text-hw-text-muted hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate">{s.app || s.id}</span>
                      {s.current && <span className="text-[9px]">ACTIVE</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Media Details */}
        {nowPlaying.title ? (
          <div className="flex items-center gap-3.5 my-2">
            <div className="w-14 h-14 rounded-lg bg-hw-surface-sunken border border-hw-border flex items-center justify-center flex-shrink-0 text-hw-primary shadow-hw-bevel overflow-hidden">
              {nowPlaying.art ? (
                <img src={nowPlaying.art} alt="" className="w-full h-full object-cover" />
              ) : (
                <Disc size={28} className={isPlaying ? 'animate-spin' : ''} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-display font-bold text-sm text-hw-text truncate">
                {nowPlaying.title}
              </h4>
              <p className="font-sans text-xs text-hw-text-muted truncate mt-0.5">
                {nowPlaying.artist || 'Windows System Audio'}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center text-center">
            <Disc size={32} className="text-hw-text-dim mb-2 opacity-50" />
            <span className="font-display font-bold text-xs text-hw-text uppercase tracking-wider">
              No Media Playing
            </span>
            <span className="font-mono text-[10px] text-hw-text-dim mt-1">
              Start playback in YouTube, Netflix, Spotify, or VLC on PC
            </span>
          </div>
        )}

        {/* Draggable Scrubber Timeline */}
        <div className="mt-4 pt-3 border-t border-hw-border-subtle">
          <Slider.Root
            disabled={!canSeek}
            value={[displayPosition]}
            max={duration > 0 ? duration : 100}
            step={1}
            onValueChange={([val]) => setScrubPosition(val)}
            onValueCommit={([val]) => {
              setScrubPosition(null);
              sendSeekTo(val);
              triggerHaptic('medium');
            }}
            className="relative flex items-center select-none touch-none w-full h-5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Slider.Track className="bg-white/10 relative grow rounded-full h-1.5 overflow-hidden">
              <Slider.Range className="absolute bg-hw-primary rounded-full h-full" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-4 h-4 bg-white rounded-full shadow-md focus:outline-none"
              aria-label="Playback Position"
            />
          </Slider.Root>

          <div className="flex justify-between font-mono text-[10px] text-hw-text-dim mt-1">
            <span>{formatTime(displayPosition)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* 2. Tactile Transport Controls */}
      <div className="flex flex-col gap-3 my-3">
        {/* Skip & Seek Row */}
        <div className="grid grid-cols-4 gap-2">
          {/* -10s Seek */}
          <button
            onClick={() => handleSeekDelta(-10)}
            className="h-12 rounded-lg bg-hw-surface border border-hw-border shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex items-center justify-center text-hw-text hover:text-white transition-all"
            title="Seek -10 seconds"
          >
            <ClockCounterClockwise size={20} weight="bold" />
          </button>

          {/* Prev Track */}
          <button
            onClick={() => {
              triggerHaptic('medium');
              sendMedia('prev');
            }}
            className="h-12 rounded-lg bg-hw-surface border border-hw-border shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex items-center justify-center text-hw-text hover:text-white transition-all"
            title="Previous Track"
          >
            <SkipBack size={20} weight="bold" />
          </button>

          {/* Next Track */}
          <button
            onClick={() => {
              triggerHaptic('medium');
              sendMedia('next');
            }}
            className="h-12 rounded-lg bg-hw-surface border border-hw-border shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex items-center justify-center text-hw-text hover:text-white transition-all"
            title="Next Track"
          >
            <SkipForward size={20} weight="bold" />
          </button>

          {/* +10s Seek */}
          <button
            onClick={() => handleSeekDelta(10)}
            className="h-12 rounded-lg bg-hw-surface border border-hw-border shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex items-center justify-center text-hw-text hover:text-white transition-all"
            title="Seek +10 seconds"
          >
            <ClockClockwise size={20} weight="bold" />
          </button>
        </div>

        {/* Big Primary Play/Pause Dial Key */}
        <div className="grid grid-cols-3 gap-2">
          {/* Fullscreen Toggle */}
          <button
            onClick={() => {
              triggerHaptic('medium');
              sendMedia('fullscreen');
            }}
            className="rounded-xl bg-hw-surface border border-hw-border shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex flex-col items-center justify-center p-3 text-hw-text hover:text-white transition-all"
          >
            <CornersOut size={22} weight="bold" />
            <span className="font-display font-bold text-[10px] uppercase mt-1">FULLSCREEN</span>
          </button>

          {/* Play / Pause Toggle Button */}
          <button
            onClick={handlePlayPause}
            className="rounded-xl bg-hw-surface-raised border border-hw-border-milled shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex flex-col items-center justify-center p-3 text-white transition-all ring-1 ring-hw-primary/40 relative overflow-hidden"
          >
            <div className="w-12 h-12 rounded-full bg-hw-primary flex items-center justify-center shadow-hw-btn mb-1">
              {isPlaying ? <Pause size={24} weight="fill" /> : <Play size={24} weight="fill" className="ml-0.5" />}
            </div>
            <span className="font-display font-bold text-xs uppercase tracking-wider">
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </span>
          </button>

          {/* Mute Toggle */}
          <button
            onClick={handleVolumeToggleMute}
            className={`rounded-xl border shadow-hw-btn active:shadow-hw-btn-pressed active:translate-y-[1px] flex flex-col items-center justify-center p-3 transition-all ${
              muted
                ? 'bg-hw-active/20 border-hw-active text-hw-active'
                : 'bg-hw-surface border-hw-border text-hw-text hover:text-white'
            }`}
          >
            {muted ? <SpeakerSimpleSlash size={22} weight="bold" /> : <SpeakerHigh size={22} weight="bold" />}
            <span className="font-display font-bold text-[10px] uppercase mt-1">
              {muted ? 'MUTED' : 'MUTE'}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Knurled Volume Dial Section */}
      <div className="w-full rounded-xl bg-hw-surface border border-hw-border p-3.5 shadow-hw-well flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-display font-bold uppercase text-[10px] tracking-wider text-hw-text-muted">
            MASTER VOLUME
          </span>
          <span className="font-mono font-bold text-lg text-hw-text">
            {muted ? 'MUTED' : `${Math.round(volume)}%`}
          </span>
          <span className="font-mono text-[9px] text-hw-text-dim">
            Drag dial up/down to adjust
          </span>
        </div>

        {/* Machined Knurled Rotary Dial */}
        <div
          ref={dialRef}
          {...bindDial()}
          className="w-16 h-16 rounded-full bg-hw-surface-raised border border-hw-border-milled shadow-hw-btn active:shadow-hw-btn-pressed flex items-center justify-center cursor-ns-resize touch-none select-none relative group"
        >
          {/* Knurled Outer Texture & Encoder Ticks */}
          <div className="absolute inset-1 rounded-full border border-white/10 pointer-events-none" />

          {/* Rotating Volume Pip */}
          <div
            className="w-full h-full rounded-full flex items-start justify-center pt-1 transition-transform pointer-events-none"
            style={{ transform: `rotate(${Math.min(270, Math.max(0, (Math.round(volume) / 100) * 270)) - 135}deg)` }}
          >
            <div className="w-1.5 h-3 rounded-full bg-hw-primary shadow-[0_0_6px_var(--hw-primary)]" />
          </div>

          <div className="absolute w-8 h-8 rounded-full bg-hw-surface-sunken border border-hw-border flex items-center justify-center text-[10.5px] font-mono font-bold text-hw-text pointer-events-none shadow-hw-well">
            {Math.round(volume)}
          </div>
        </div>
      </div>

      {/* Bottom Utility Bar */}
      <div className="flex items-center justify-between pt-3 text-[11px] font-mono text-hw-text-muted">
        <span>SEEK: {seekMethod.toUpperCase()}</span>
        <button
          onClick={onOpenSettings}
          className="hover:text-hw-text underline underline-offset-4 decoration-hw-border hover:decoration-hw-primary transition-all"
        >
          CONFIGURE CONTROLS
        </button>
      </div>
    </div>
  );
};
