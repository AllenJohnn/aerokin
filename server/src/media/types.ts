/**
 * AeroKin Media 2.0 Types & Capability Model
 */

export interface MediaSessionCapabilities {
  canPlay: boolean;
  canPause: boolean;
  canTogglePlayPause: boolean;
  canNext: boolean;
  canPrev: boolean;
  canStop: boolean;
  canSeek: boolean;
  canSetPosition: boolean;
  canShuffle: boolean;
  canRepeat: boolean;
  canRate: boolean;
}

export const DEFAULT_CAPABILITIES: MediaSessionCapabilities = {
  canPlay: true,
  canPause: true,
  canTogglePlayPause: true,
  canNext: true,
  canPrev: true,
  canStop: false,
  canSeek: false,
  canSetPosition: false,
  canShuffle: false,
  canRepeat: false,
  canRate: false,
};

export interface NowPlayingData {
  id?: string;
  app?: string;
  title?: string;
  artist?: string;
  status: 'playing' | 'paused' | 'stopped' | 'none';
  position?: number;
  duration?: number;
  art?: string;
  capabilities?: MediaSessionCapabilities;
  // Legacy compatibility flags
  canSeek?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
}

export interface MediaSessionItem {
  id: string;
  app: string;
  title: string;
  current: boolean;
  capabilities?: MediaSessionCapabilities;
}

export interface MediaCommandResult {
  tier: 1 | 2 | 3;
  action: string;
  handled: boolean;
  latencyMs: number;
  detail?: string;
  error?: string;
}

export interface ProfileEntry {
  key: string;
  verified: boolean;
  note: string;
  verifiedOn?: string;
}

export interface AppProfile {
  name: string;
  seekForward?: ProfileEntry;
  seekBackward?: ProfileEntry;
  fullscreen?: ProfileEntry;
  byTitle?: Record<
    string,
    {
      seekForward?: ProfileEntry;
      seekBackward?: ProfileEntry;
      fullscreen?: ProfileEntry;
    }
  >;
}

export interface ProfilesConfig {
  defaults: {
    seekForward: ProfileEntry;
    seekBackward: ProfileEntry;
    fullscreen: ProfileEntry;
  };
  profiles: Record<string, AppProfile>;
}

export type MediaAction =
  | 'playpause'
  | 'play'
  | 'pause'
  | 'next'
  | 'prev'
  | 'stop'
  | 'volup'
  | 'voldown'
  | 'mute'
  | 'fullscreen'
  | 'seekfwd'
  | 'seekback'
  | 'seekby'
  | 'seekto'
  | 'session'
  | 'setvolume'
  | 'getvolume';
