import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppProfile, ProfileEntry, ProfilesConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_PROFILES_CONFIG: ProfilesConfig = {
  defaults: {
    seekForward: { key: 'Right', verified: true, note: 'Standard right arrow seek' },
    seekBackward: { key: 'Left', verified: true, note: 'Standard left arrow seek' },
    fullscreen: { key: 'f', verified: true, note: 'Standard fullscreen toggle (F)' },
  },
  profiles: {
    'chrome.exe': {
      name: 'Google Chrome',
      byTitle: {
        YouTube: {
          seekForward: { key: 'l', verified: true, note: 'YouTube native +10s (L)' },
          seekBackward: { key: 'j', verified: true, note: 'YouTube native -10s (J)' },
          fullscreen: { key: 'f', verified: true, note: 'YouTube fullscreen (F)' },
        },
        Netflix: {
          seekForward: { key: 'Right', verified: false, note: 'Netflix 10s seek (UNVERIFIED)' },
          seekBackward: { key: 'Left', verified: false, note: 'Netflix 10s seek (UNVERIFIED)' },
          fullscreen: { key: 'f', verified: false, note: 'Netflix fullscreen (UNVERIFIED)' },
        },
      },
    },
    'msedge.exe': {
      name: 'Microsoft Edge',
      byTitle: {
        YouTube: {
          seekForward: { key: 'l', verified: true, note: 'YouTube native +10s (L)' },
          seekBackward: { key: 'j', verified: true, note: 'YouTube native -10s (J)' },
          fullscreen: { key: 'f', verified: true, note: 'YouTube fullscreen (F)' },
        },
        Netflix: {
          seekForward: { key: 'Right', verified: false, note: 'Netflix 10s seek (UNVERIFIED)' },
          seekBackward: { key: 'Left', verified: false, note: 'Netflix 10s seek (UNVERIFIED)' },
          fullscreen: { key: 'f', verified: false, note: 'Netflix fullscreen (UNVERIFIED)' },
        },
      },
    },
    'firefox.exe': {
      name: 'Mozilla Firefox',
      byTitle: {
        YouTube: {
          seekForward: { key: 'l', verified: true, note: 'YouTube native +10s (L)' },
          seekBackward: { key: 'j', verified: true, note: 'YouTube native -10s (J)' },
          fullscreen: { key: 'f', verified: true, note: 'YouTube fullscreen (F)' },
        },
        Netflix: {
          seekForward: { key: 'Right', verified: false, note: 'Netflix 10s seek (UNVERIFIED)' },
          seekBackward: { key: 'Left', verified: false, note: 'Netflix 10s seek (UNVERIFIED)' },
          fullscreen: { key: 'f', verified: false, note: 'Netflix fullscreen (UNVERIFIED)' },
        },
      },
    },
    'vlc.exe': {
      name: 'VLC Media Player',
      seekForward: { key: 'Ctrl+Right', verified: true, note: 'VLC short jump 10s (Ctrl+Right; Shift+Right is 3s, Alt+Right is 1m)' },
      seekBackward: { key: 'Ctrl+Left', verified: true, note: 'VLC short jump 10s (Ctrl+Left; Shift+Left is 3s, Alt+Left is 1m)' },
      fullscreen: { key: 'f', verified: true, note: 'VLC toggle fullscreen (F)' },
    },
    'mpc-hc64.exe': {
      name: 'MPC-HC',
      seekForward: { key: 'Right', verified: true, note: 'MPC-HC jump forward (Right arrow)' },
      seekBackward: { key: 'Left', verified: true, note: 'MPC-HC jump backward (Left arrow)' },
      fullscreen: { key: 'Alt+Enter', verified: true, note: 'MPC-HC fullscreen toggle (Alt+Enter)' },
    },
    'mpc-hc.exe': {
      name: 'MPC-HC',
      seekForward: { key: 'Right', verified: true, note: 'MPC-HC jump forward (Right arrow)' },
      seekBackward: { key: 'Left', verified: true, note: 'MPC-HC jump backward (Left arrow)' },
      fullscreen: { key: 'Alt+Enter', verified: true, note: 'MPC-HC fullscreen toggle (Alt+Enter)' },
    },
    'potplayermini64.exe': {
      name: 'PotPlayer',
      seekForward: { key: 'Right', verified: false, note: 'PotPlayer 5s jump (UNVERIFIED)' },
      seekBackward: { key: 'Left', verified: false, note: 'PotPlayer 5s jump (UNVERIFIED)' },
      fullscreen: { key: 'Enter', verified: false, note: 'PotPlayer fullscreen toggle (UNVERIFIED)' },
    },
    'potplayer.exe': {
      name: 'PotPlayer',
      seekForward: { key: 'Right', verified: false, note: 'PotPlayer 5s jump (UNVERIFIED)' },
      seekBackward: { key: 'Left', verified: false, note: 'PotPlayer 5s jump (UNVERIFIED)' },
      fullscreen: { key: 'Enter', verified: false, note: 'PotPlayer fullscreen toggle (UNVERIFIED)' },
    },
    'spotify.exe': {
      name: 'Spotify Desktop',
      seekForward: { key: 'Shift+Right', verified: false, note: 'Spotify forward seek (UNVERIFIED: requires window focus)' },
      seekBackward: { key: 'Shift+Left', verified: false, note: 'Spotify backward seek (UNVERIFIED: requires window focus)' },
      fullscreen: { key: 'f', verified: false, note: 'Spotify fullscreen view (UNVERIFIED)' },
    },
  },
};

export class AppProfiles {
  private config: ProfilesConfig;

  constructor(customConfigPath?: string) {
    if (customConfigPath && fs.existsSync(customConfigPath)) {
      try {
        this.config = JSON.parse(fs.readFileSync(customConfigPath, 'utf8'));
      } catch {
        this.config = DEFAULT_PROFILES_CONFIG;
      }
    } else {
      const defaultPath = path.resolve(__dirname, '../profiles.json');
      if (fs.existsSync(defaultPath)) {
        try {
          this.config = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
        } catch {
          this.config = DEFAULT_PROFILES_CONFIG;
        }
      } else {
        this.config = DEFAULT_PROFILES_CONFIG;
      }
    }
  }

  public getDefaults() {
    return this.config.defaults;
  }

  public getProfile(procName?: string | null, title?: string | null): {
    name: string;
    seekForward: ProfileEntry;
    seekBackward: ProfileEntry;
    fullscreen: ProfileEntry;
  } {
    if (!procName) {
      return {
        name: 'Default',
        ...this.config.defaults,
      };
    }

    const cleanProc = procName.toLowerCase().trim();
    const appCfg = this.config.profiles[cleanProc];

    if (!appCfg) {
      return {
        name: 'Default',
        ...this.config.defaults,
      };
    }

    // Check title-based override
    if (appCfg.byTitle && title) {
      const cleanTitle = title.toLowerCase();
      for (const [pattern, titleCfg] of Object.entries(appCfg.byTitle)) {
        if (cleanTitle.includes(pattern.toLowerCase())) {
          return {
            name: `${appCfg.name} - ${pattern}`,
            seekForward: titleCfg.seekForward || appCfg.seekForward || this.config.defaults.seekForward,
            seekBackward: titleCfg.seekBackward || appCfg.seekBackward || this.config.defaults.seekBackward,
            fullscreen: titleCfg.fullscreen || appCfg.fullscreen || this.config.defaults.fullscreen,
          };
        }
      }
    }

    return {
      name: appCfg.name,
      seekForward: appCfg.seekForward || this.config.defaults.seekForward,
      seekBackward: appCfg.seekBackward || this.config.defaults.seekBackward,
      fullscreen: appCfg.fullscreen || this.config.defaults.fullscreen,
    };
  }
}
