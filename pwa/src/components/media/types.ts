import { NowPlayingData, MediaSessionItem, MediaAction } from '../../hooks/useAerokinSocket';

export type { NowPlayingData, MediaSessionItem, MediaAction };

export type SeekInterval = 5 | 10 | 15 | 30;

export interface MediaSessionCapabilities {
  canPlay?: boolean;
  canPause?: boolean;
  canTogglePlayPause?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  canStop?: boolean;
  canSeek?: boolean;
  canSetPosition?: boolean;
  canShuffle?: boolean;
  canRepeat?: boolean;
  canRate?: boolean;
}
