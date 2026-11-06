import React from 'react';
import { Slider } from '../ui/Slider';
import { triggerHaptic } from '../../utils/haptics';
import { SpeakerHigh, SpeakerSlash, CornersOut } from '@phosphor-icons/react';

export interface MediaSettingsProps {
  volume: number;
  muted: boolean;
  seekMethod: 'auto' | 'keys';
  onVolumeChange: (level: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onOpenSettingsDrawer?: () => void;
}

export const MediaSettings: React.FC<MediaSettingsProps> = ({
  volume,
  muted,
  seekMethod,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
  onOpenSettingsDrawer,
}) => {
  // Normalize 0..1 floating volume to 0..100 integer percent
  const normalizedVolume = Math.round(volume <= 1.0 && volume > 0 ? volume * 100 : volume);

  return (
    <div className="w-full rounded-2xl bg-surface border border-border p-4 shadow-sm flex flex-col gap-3">
      {/* Master Volume Row */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            triggerHaptic('medium');
            onToggleMute();
          }}
          className={`p-2 rounded-xl border transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer ${
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
            onValueChange={([val]) => onVolumeChange(val)}
            aria-label="Master volume level"
          />
          <span className="font-mono text-xs tabular-nums text-foreground w-10 text-right">
            {muted ? '0%' : `${normalizedVolume}%`}
          </span>
        </div>
      </div>

      {/* Footer controls: Seek method badge & Quiet fullscreen */}
      <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
        <button
          onClick={onOpenSettingsDrawer}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Configure media seek method in settings"
        >
          <span className="text-[11px] text-muted-foreground/70 uppercase tracking-wider">
            Method:
          </span>
          <span className="font-mono font-medium text-foreground uppercase">
            {seekMethod === 'auto' ? 'Auto (SMTC)' : 'App Keys'}
          </span>
        </button>

        <button
          onClick={() => {
            triggerHaptic('medium');
            onToggleFullscreen();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-raised hover:bg-border text-xs text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97] min-h-[40px] cursor-pointer"
          aria-label="Toggle fullscreen"
          title="Toggle Fullscreen (F)"
        >
          <CornersOut size={16} />
          <span>Fullscreen</span>
        </button>
      </div>
    </div>
  );
};
