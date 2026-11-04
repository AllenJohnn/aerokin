import React, { useState, useRef } from 'react';
import { NowPlayingData, MediaSessionItem, MediaAction } from '../hooks/useAerokinSocket';
import { triggerHaptic } from '../utils/haptics';
import { Slider } from './ui/Slider';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  SpeakerHigh,
  SpeakerSlash,
  CornersOut,
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
}) => {
  const [showSessionsPicker, setShowSessionsPicker] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);

  // Parse volume: fix the 0.82 bug by normalizing 0..1 to 0..100 integer percent
  const normalizedVolume = Math.round(
    volume <= 1.0 && volume > 0 ? volume * 100 : volume
  );

  const displayPosition = scrubPosition !== null ? scrubPosition : nowPlaying.position ?? 0;
  const duration = nowPlaying.duration ?? 0;
  const canSeek = !!nowPlaying.canSeek && duration > 0;
  const isPlaying = nowPlaying.status === 'playing';

  const handleSeekDelta = (seconds: number) => {
    triggerHaptic('medium');
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

  const handleVolumeChange = (value: number) => {
    sendSetVolume(value);
    triggerHaptic('light');
  };

  return (
    <div className="flex-1 flex flex-col justify-between px-gutter py-3 w-full h-full select-none max-w-lg mx-auto overflow-y-auto">
      {/* 1. Now Playing Card */}
      <div className="w-full rounded-2xl bg-surface border border-border p-5 flex flex-col">
        {/* App name and session switcher */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground truncate font-medium">
            {nowPlaying.app || 'Media player'}
          </span>

          {sessions.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowSessionsPicker((s) => !s)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg border border-border bg-raised transition-colors"
              >
                <span>{sessions.length} apps</span>
                <CaretDown size={12} />
              </button>

              {showSessionsPicker && (
                <div className="absolute right-0 top-8 z-40 w-48 rounded-xl bg-raised border border-border p-1 space-y-0.5 shadow-lg">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        sendSession(s.id);
                        setShowSessionsPicker(false);
                        triggerHaptic('light');
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-colors ${
                        s.current ? 'bg-accent text-black font-semibold' : 'text-foreground hover:bg-surface'
                      }`}
                    >
                      {s.app || s.title || s.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Media info or empty state */}
        {nowPlaying.title ? (
          <div className="flex items-center gap-4 my-2">
            <div className="w-14 h-14 rounded-xl bg-raised border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
              {nowPlaying.art ? (
                <img src={nowPlaying.art} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-border" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-foreground truncate">
                {nowPlaying.title}
              </h2>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {nowPlaying.artist || 'System audio'}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-foreground">
              Play something on your PC
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Audio and video controls will appear here
            </p>
          </div>
        )}

        {/* Thin Scrubber with times */}
        <div className="mt-4 pt-3 border-t border-border">
          <Slider
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
            aria-label="Playback timeline"
          />

          <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground mt-1">
            <span>{formatTime(displayPosition)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* 2. Transport Row */}
      <div className="my-auto py-4 flex items-center justify-center gap-2 sm:gap-4">
        {/* -10 seconds seek */}
        <button
          onClick={() => handleSeekDelta(-10)}
          className="h-12 w-12 rounded-xl border border-border bg-raised hover:bg-border text-foreground flex flex-col items-center justify-center transition-transform active:scale-[0.97] min-h-[48px] min-w-[48px]"
          aria-label="Seek back 10 seconds"
          title="Seek -10s"
        >
          <span className="font-mono text-xs font-semibold tabular-nums">-10</span>
        </button>

        {/* Previous Track */}
        <button
          onClick={() => {
            triggerHaptic('medium');
            sendMedia('prev');
          }}
          className="h-12 w-12 rounded-xl border border-border bg-raised hover:bg-border text-foreground flex items-center justify-center transition-transform active:scale-[0.97] min-h-[48px] min-w-[48px]"
          aria-label="Previous track"
          title="Previous"
        >
          <SkipBack size={20} />
        </button>

        {/* Big Large Play/Pause button (64px+) */}
        <button
          onClick={handlePlayPause}
          className="h-16 w-16 rounded-full bg-accent hover:bg-accent-hover active:bg-accent-pressed text-black flex items-center justify-center transition-transform active:scale-[0.97] shadow-sm min-h-[64px] min-w-[64px]"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={28} weight="fill" />
          ) : (
            <Play size={28} weight="fill" className="ml-1" />
          )}
        </button>

        {/* Next Track */}
        <button
          onClick={() => {
            triggerHaptic('medium');
            sendMedia('next');
          }}
          className="h-12 w-12 rounded-xl border border-border bg-raised hover:bg-border text-foreground flex items-center justify-center transition-transform active:scale-[0.97] min-h-[48px] min-w-[48px]"
          aria-label="Next track"
          title="Next"
        >
          <SkipForward size={20} />
        </button>

        {/* +10 seconds seek */}
        <button
          onClick={() => handleSeekDelta(10)}
          className="h-12 w-12 rounded-xl border border-border bg-raised hover:bg-border text-foreground flex flex-col items-center justify-center transition-transform active:scale-[0.97] min-h-[48px] min-w-[48px]"
          aria-label="Seek forward 10 seconds"
          title="Seek +10s"
        >
          <span className="font-mono text-xs font-semibold tabular-nums">+10</span>
        </button>
      </div>

      {/* 3. Volume and Quiet Fullscreen Controls */}
      <div className="w-full rounded-2xl bg-surface border border-border p-4 flex flex-col gap-3">
        {/* Volume Row: Plain horizontal slider with integer percent plus mute */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleVolumeToggleMute}
            className={`p-2 rounded-xl border transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center ${
              muted
                ? 'border-optic-red text-optic-red bg-raised'
                : 'border-border text-muted-foreground hover:text-foreground bg-raised'
            }`}
            aria-label={muted ? 'Unmute volume' : 'Mute volume'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <SpeakerSlash size={20} /> : <SpeakerHigh size={20} />}
          </button>

          <div className="flex-1 flex items-center gap-3">
            <Slider
              value={[muted ? 0 : normalizedVolume]}
              max={100}
              step={1}
              onValueChange={([val]) => handleVolumeChange(val)}
              aria-label="Volume level"
            />
            <span className="font-mono text-xs tabular-nums text-foreground w-10 text-right">
              {muted ? '0%' : `${normalizedVolume}%`}
            </span>
          </div>
        </div>

        {/* Fullscreen as a quiet button */}
        <div className="pt-2 border-t border-border flex items-center justify-end">
          <button
            onClick={() => {
              triggerHaptic('medium');
              sendMedia('fullscreen');
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-raised hover:bg-border text-xs text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97] min-h-[48px]"
            aria-label="Toggle fullscreen"
          >
            <CornersOut size={16} />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
