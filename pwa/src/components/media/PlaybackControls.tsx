import React from 'react';
import { SeekInterval } from './types';
import { triggerHaptic } from '../../utils/haptics';
import { Play, Pause, SkipForward, SkipBack } from '@phosphor-icons/react';

export interface PlaybackControlsProps {
  isPlaying: boolean;
  canNext: boolean;
  canPrev: boolean;
  seekInterval: SeekInterval;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeekDelta: (seconds: number) => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  canNext,
  canPrev,
  seekInterval,
  onPlayPause,
  onNext,
  onPrev,
  onSeekDelta,
}) => {
  return (
    <div className="w-full flex items-center justify-center gap-2 sm:gap-4 py-3 select-none">
      {/* Seek Backward (-X seconds) */}
      <button
        onClick={() => {
          triggerHaptic('medium');
          onSeekDelta(-seekInterval);
        }}
        className="h-12 w-12 rounded-2xl border border-border bg-surface hover:bg-raised text-foreground flex flex-col items-center justify-center transition-transform active:scale-[0.96] min-h-[48px] min-w-[48px] shadow-sm cursor-pointer"
        aria-label={`Seek backward ${seekInterval} seconds`}
        title={`-${seekInterval}s`}
      >
        <span className="font-mono text-xs font-semibold tabular-nums">-{seekInterval}</span>
      </button>

      {/* Previous Track */}
      <button
        disabled={!canPrev}
        onClick={() => {
          triggerHaptic('medium');
          onPrev();
        }}
        className={`h-12 w-12 rounded-2xl border border-border bg-surface text-foreground flex items-center justify-center transition-transform min-h-[48px] min-w-[48px] shadow-sm ${
          canPrev
            ? 'hover:bg-raised active:scale-[0.96] cursor-pointer'
            : 'opacity-30 cursor-not-allowed'
        }`}
        aria-label="Previous track"
        title={canPrev ? 'Previous Track' : 'Previous not supported by this session'}
      >
        <SkipBack size={20} weight="fill" />
      </button>

      {/* Primary Play/Pause Button (64px+) */}
      <button
        onClick={() => {
          triggerHaptic('medium');
          onPlayPause();
        }}
        className="h-16 w-16 rounded-full bg-accent hover:bg-accent-hover active:bg-accent-pressed text-black flex items-center justify-center transition-transform active:scale-[0.95] shadow-lg min-h-[64px] min-w-[64px] cursor-pointer"
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
        disabled={!canNext}
        onClick={() => {
          triggerHaptic('medium');
          onNext();
        }}
        className={`h-12 w-12 rounded-2xl border border-border bg-surface text-foreground flex items-center justify-center transition-transform min-h-[48px] min-w-[48px] shadow-sm ${
          canNext
            ? 'hover:bg-raised active:scale-[0.96] cursor-pointer'
            : 'opacity-30 cursor-not-allowed'
        }`}
        aria-label="Next track"
        title={canNext ? 'Next Track' : 'Next not supported by this session'}
      >
        <SkipForward size={20} weight="fill" />
      </button>

      {/* Seek Forward (+X seconds) */}
      <button
        onClick={() => {
          triggerHaptic('medium');
          onSeekDelta(seekInterval);
        }}
        className="h-12 w-12 rounded-2xl border border-border bg-surface hover:bg-raised text-foreground flex flex-col items-center justify-center transition-transform active:scale-[0.96] min-h-[48px] min-w-[48px] shadow-sm cursor-pointer"
        aria-label={`Seek forward ${seekInterval} seconds`}
        title={`+${seekInterval}s`}
      >
        <span className="font-mono text-xs font-semibold tabular-nums">+{seekInterval}</span>
      </button>
    </div>
  );
};
