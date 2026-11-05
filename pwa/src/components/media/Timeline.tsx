import React from 'react';
import { Slider } from '../ui/Slider';
import { SeekInterval } from './types';
import { triggerHaptic } from '../../utils/haptics';

export interface TimelineProps {
  displayPosition: number;
  duration: number;
  canSeek: boolean;
  seekInterval: SeekInterval;
  onSeekIntervalChange: (interval: SeekInterval) => void;
  onScrubChange: (position: number) => void;
  onCommitScrub: (position: number) => void;
}

export function formatTime(seconds?: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  if (h > 0) {
    return `${h}:${pad(m)}:${pad(s)}`;
  }
  return `${m}:${pad(s)}`;
}

export const Timeline: React.FC<TimelineProps> = ({
  displayPosition,
  duration,
  canSeek,
  seekInterval,
  onSeekIntervalChange,
  onScrubChange,
  onCommitScrub,
}) => {
  const intervals: SeekInterval[] = [5, 10, 15, 30];

  return (
    <div className="w-full rounded-2xl bg-surface border border-border p-4 shadow-sm flex flex-col gap-3">
      {/* Scrubber slider */}
      <div className="pt-1">
        <Slider
          disabled={!canSeek}
          value={[displayPosition]}
          max={duration > 0 ? duration : 100}
          step={1}
          onValueChange={([val]) => onScrubChange(val)}
          onValueCommit={([val]) => {
            onCommitScrub(val);
            triggerHaptic('medium');
          }}
          aria-label="Playback scrubber timeline"
        />
      </div>

      {/* Timestamps & Seek Interval Selector */}
      <div className="flex items-center justify-between font-mono text-xs tabular-nums text-muted-foreground">
        <span>{formatTime(displayPosition)}</span>

        {/* Seek interval pills (5s, 10s, 15s, 30s) */}
        <div className="flex items-center gap-1 rounded-lg bg-raised p-0.5 border border-border">
          {intervals.map((sec) => (
            <button
              key={sec}
              onClick={() => {
                triggerHaptic('light');
                onSeekIntervalChange(sec);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                seekInterval === sec
                  ? 'bg-accent text-black'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={`Set seek interval to ${sec}s`}
              aria-label={`Seek interval ${sec} seconds`}
            >
              {sec}s
            </button>
          ))}
        </div>

        <span>{duration > 0 ? formatTime(duration) : '--:--'}</span>
      </div>
    </div>
  );
};
