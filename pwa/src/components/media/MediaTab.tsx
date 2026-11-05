import React from 'react';
import { NowPlayingData, MediaSessionItem, MediaAction } from './types';
import { useMediaSessions } from './useMediaSessions';
import { NowPlaying } from './NowPlaying';
import { PlayerSelector } from './PlayerSelector';
import { Timeline } from './Timeline';
import { PlaybackControls } from './PlaybackControls';
import { MediaSettings } from './MediaSettings';
import { triggerHaptic } from '../../utils/haptics';

export interface MediaTabProps {
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
  const {
    seekInterval,
    setSeekInterval,
    canSeek,
    canNext,
    canPrev,
    duration,
    displayPosition,
    setScrubPosition,
    handleCommitScrub,
  } = useMediaSessions({
    nowPlaying,
    sessions,
    onSeekTo: sendSeekTo,
  });

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

  const handleNext = () => {
    triggerHaptic('medium');
    sendMedia('next');
  };

  const handlePrev = () => {
    triggerHaptic('medium');
    sendMedia('prev');
  };

  const handleToggleMute = () => {
    triggerHaptic('medium');
    sendMedia('mute');
  };

  const handleVolumeChange = (value: number) => {
    sendSetVolume(value);
    triggerHaptic('light');
  };

  const handleToggleFullscreen = () => {
    triggerHaptic('medium');
    sendMedia('fullscreen');
  };

  return (
    <div className="flex-1 flex flex-col justify-between px-gutter py-3 w-full h-full select-none max-w-lg mx-auto overflow-y-auto">
      {/* 1. Top Section: Session Selector & Now Playing */}
      <div className="flex flex-col w-full">
        <PlayerSelector sessions={sessions} onSelectSession={sendSession} />
        <NowPlaying nowPlaying={nowPlaying} />
      </div>

      {/* 2. Middle Section: Timeline Scrubber & Transport Controls */}
      <div className="flex flex-col w-full my-auto py-2 gap-3">
        <Timeline
          displayPosition={displayPosition}
          duration={duration}
          canSeek={canSeek}
          seekInterval={seekInterval}
          onSeekIntervalChange={setSeekInterval}
          onScrubChange={setScrubPosition}
          onCommitScrub={handleCommitScrub}
        />

        <PlaybackControls
          isPlaying={isPlaying}
          canNext={canNext}
          canPrev={canPrev}
          seekInterval={seekInterval}
          onPlayPause={handlePlayPause}
          onNext={handleNext}
          onPrev={handlePrev}
          onSeekDelta={handleSeekDelta}
        />
      </div>

      {/* 3. Bottom Section: Master Volume & Quiet Fullscreen */}
      <div className="w-full">
        <MediaSettings
          volume={volume}
          muted={muted}
          seekMethod={seekMethod}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onToggleFullscreen={handleToggleFullscreen}
          onOpenSettingsDrawer={onOpenSettings}
        />
      </div>
    </div>
  );
};
