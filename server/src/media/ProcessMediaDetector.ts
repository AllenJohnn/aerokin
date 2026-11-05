/**
 * AEROKIN Process Media Detector
 *
 * Detects running media players (VLC, MPC-HC, PotPlayer, etc.) without active SMTC sessions.
 * Parses window titles, synthesizes fallback sessions, and maps player-specific hotkeys.
 */

import { MediaSessionCapabilities, MediaSessionItem } from './types.js';

export interface RunningProcessMediaInfo {
  pid: number;
  processName: string;
  windowTitle: string;
}

export interface ParsedMediaTitle {
  trackTitle: string;
  appName: string;
  isPlaying: boolean;
}

/**
 * Parses window titles of known media players to extract track title and playing state.
 */
export function parseMediaWindowTitle(processName: string, windowTitle: string): ParsedMediaTitle {
  const cleanProc = (processName || '').toLowerCase().trim();
  const cleanTitle = (windowTitle || '').trim();

  // 1. VLC Media Player
  if (cleanProc.includes('vlc')) {
    if (!cleanTitle || cleanTitle.toLowerCase() === 'vlc media player') {
      return {
        trackTitle: 'VLC Media Player',
        appName: 'VLC',
        isPlaying: false,
      };
    }

    // Match e.g. "Track Name - VLC media player" or "Artist - Track - VLC media player"
    // Also strip leading play icons if present: "► Song" or "▶ Song"
    const vlcMatch = cleanTitle.match(/^(?:[►▶]\s*)?(.*?)\s*-\s*VLC media player$/i);
    if (vlcMatch && vlcMatch[1]) {
      return {
        trackTitle: vlcMatch[1].trim(),
        appName: 'VLC',
        isPlaying: true,
      };
    }

    return {
      trackTitle: cleanTitle,
      appName: 'VLC',
      isPlaying: true,
    };
  }

  // 2. Media Player Classic (MPC-HC)
  if (cleanProc.includes('mpc-hc') || cleanProc.includes('mpc')) {
    if (!cleanTitle || cleanTitle.toLowerCase() === 'mpc-hc') {
      return {
        trackTitle: 'MPC-HC',
        appName: 'MPC-HC',
        isPlaying: false,
      };
    }
    const mpcMatch = cleanTitle.match(/^(.*?)\s*-\s*MPC-HC(?:.*)?$/i);
    if (mpcMatch && mpcMatch[1]) {
      return {
        trackTitle: mpcMatch[1].trim(),
        appName: 'MPC-HC',
        isPlaying: true,
      };
    }
    return {
      trackTitle: cleanTitle,
      appName: 'MPC-HC',
      isPlaying: true,
    };
  }

  // 3. PotPlayer
  if (cleanProc.includes('potplayer')) {
    if (!cleanTitle || cleanTitle.toLowerCase() === 'potplayer') {
      return {
        trackTitle: 'PotPlayer',
        appName: 'PotPlayer',
        isPlaying: false,
      };
    }
    const potMatch = cleanTitle.match(/^(.*?)\s*-\s*PotPlayer$/i);
    if (potMatch && potMatch[1]) {
      return {
        trackTitle: potMatch[1].trim(),
        appName: 'PotPlayer',
        isPlaying: true,
      };
    }
    return {
      trackTitle: cleanTitle,
      appName: 'PotPlayer',
      isPlaying: true,
    };
  }

  // 4. Generic fallback (Spotify, browser tabs, etc.)
  if (cleanTitle.includes(' - ')) {
    const parts = cleanTitle.split(' - ');
    return {
      trackTitle: parts[0].trim(),
      appName: cleanProc.replace(/\.exe$/i, ''),
      isPlaying: true,
    };
  }

  return {
    trackTitle: cleanTitle || cleanProc.replace(/\.exe$/i, ''),
    appName: cleanProc.replace(/\.exe$/i, ''),
    isPlaying: Boolean(cleanTitle),
  };
}

/**
 * Returns capability flags for a fallback process session.
 */
export function getFallbackCapabilities(processName: string): MediaSessionCapabilities {
  return {
    canPlay: true,
    canPause: true,
    canTogglePlayPause: true,
    canNext: true,
    canPrev: true,
    canStop: true,
    canSeek: true,
    canSetPosition: false,
    canShuffle: false,
    canRepeat: false,
    canRate: false,
  };
}

/**
 * Synthesizes MediaSessionItem list from running process media infos.
 */
export function synthesizeProcessSessions(
  processes: RunningProcessMediaInfo[],
  existingSessions: MediaSessionItem[] = []
): MediaSessionItem[] {
  const existingApps = new Set(
    existingSessions.map((s) => s.app.toLowerCase())
  );

  const synthesized: MediaSessionItem[] = [];

  for (const proc of processes) {
    const parsed = parseMediaWindowTitle(proc.processName, proc.windowTitle);

    // If this app is already represented in SMTC, skip duplicate synthesis
    if (existingApps.has(parsed.appName.toLowerCase()) || existingApps.has(proc.processName.toLowerCase())) {
      continue;
    }

    const sessionItem: MediaSessionItem = {
      id: `proc_${parsed.appName.toLowerCase()}_${proc.pid}`,
      app: parsed.appName,
      title: parsed.trackTitle,
      current: synthesized.length === 0 && existingSessions.length === 0,
      capabilities: getFallbackCapabilities(proc.processName),
    };

    synthesized.push(sessionItem);
  }

  return synthesized;
}

/**
 * Maps seek delta in seconds to VLC hotkey.
 * Shift+Left/Right: very short jump (3s)
 * Ctrl+Left/Right: short jump (10s)
 * Alt+Left/Right: medium jump (1m)
 */
export function mapSeekSecondsToVlcHotkey(seconds: number): { key: string; verified: boolean; label: string } {
  const abs = Math.abs(seconds);
  const isFwd = seconds >= 0;

  if (abs <= 3) {
    return {
      key: isFwd ? 'Shift+Right' : 'Shift+Left',
      verified: true,
      label: 'VLC very short jump 3s (Shift+Arrow)',
    };
  }

  if (abs <= 15) {
    return {
      key: isFwd ? 'Ctrl+Right' : 'Ctrl+Left',
      verified: true,
      label: 'VLC short jump 10s (Ctrl+Arrow)',
    };
  }

  return {
    key: isFwd ? 'Alt+Right' : 'Alt+Left',
    verified: true,
    label: 'VLC medium jump 1m (Alt+Arrow)',
  };
}
