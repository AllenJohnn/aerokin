import React, { useState } from 'react';
import { GlassCard, GlowButton, Pill } from '@ui';
import { MediaAction } from '../hooks/useAerokinSocket';
import { triggerHaptic } from '../utils/haptics';

export interface MediaTabProps {
  sendMedia: (action: MediaAction) => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({ sendMedia }) => {
  const [isPlaying, setIsPlaying] = useState(true);

  const handleAction = (action: MediaAction, hapticType: 'light' | 'medium' | 'heavy' = 'medium') => {
    triggerHaptic(hapticType);
    if (action === 'playpause') {
      setIsPlaying((prev) => !prev);
    }
    sendMedia(action);
  };

  return (
    <div className="flex flex-col h-full w-full justify-between gap-4 p-4 overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-mono text-aerokin-cyan">
          WINDOWS MEDIA REMOTE
        </span>
        <Pill status="online" size="sm">
          READY
        </Pill>
      </div>

      {/* Main Playback Cluster */}
      <GlassCard variant="default" padding="lg" className="flex flex-col items-center justify-center gap-6">
        {/* Large Central Play / Pause Button */}
        <div className="relative">
          <GlowButton
            variant="primary"
            size="lg"
            className="!h-24 !w-24 !rounded-full text-2xl shadow-glow-lg flex items-center justify-center"
            onClick={() => handleAction('playpause', 'heavy')}
          >
            {isPlaying ? '⏸' : '▶'}
          </GlowButton>
        </div>

        {/* Skip & Seek Controls */}
        <div className="w-full flex items-center justify-around gap-2">
          <GlowButton
            variant="secondary"
            size="md"
            onClick={() => handleAction('prev', 'medium')}
            className="flex-1"
          >
            ⏮ Prev
          </GlowButton>

          <GlowButton
            variant="secondary"
            size="md"
            onClick={() => handleAction('seekback', 'medium')}
            className="flex-1"
          >
            ⏪ -10s
          </GlowButton>

          <GlowButton
            variant="secondary"
            size="md"
            onClick={() => handleAction('seekfwd', 'medium')}
            className="flex-1"
          >
            +10s ⏩
          </GlowButton>

          <GlowButton
            variant="secondary"
            size="md"
            onClick={() => handleAction('next', 'medium')}
            className="flex-1"
          >
            Next ⏭
          </GlowButton>
        </div>
      </GlassCard>

      {/* Volume & Audio Cluster */}
      <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
        <span className="font-mono text-[10px] text-aerokin-muted uppercase tracking-wider">
          VOLUME CONTROLS
        </span>

        <div className="grid grid-cols-3 gap-3">
          <GlowButton
            variant="secondary"
            size="lg"
            onClick={() => handleAction('voldown', 'medium')}
          >
            🔉 Vol −
          </GlowButton>

          <GlowButton
            variant="secondary"
            size="lg"
            onClick={() => handleAction('volup', 'medium')}
          >
            🔊 Vol +
          </GlowButton>

          <GlowButton
            variant="secondary"
            size="lg"
            onClick={() => handleAction('mute', 'heavy')}
          >
            🔇 Mute
          </GlowButton>
        </div>
      </GlassCard>

      {/* Presentation & Display Cluster */}
      <div className="grid grid-cols-1 gap-3">
        <GlowButton
          variant="secondary"
          size="lg"
          fullWidth
          onClick={() => handleAction('fullscreen', 'heavy')}
        >
          ⛶ Toggle Fullscreen (F)
        </GlowButton>
      </div>
    </div>
  );
};
