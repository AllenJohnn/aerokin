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
          seekForward: { key: 'Right', verified: true, note: 'Netflix 10s seek' },
          seekBackward: { key: 'Left', verified: true, note: 'Netflix 10s seek' },
          fullscreen: { key: 'f', verified: true, note: 'Netflix fullscreen' },
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
          seekForward: { key: 'Right', verified: true, note: 'Netflix 10s seek' },
          seekBackward: { key: 'Left', verified: true, note: 'Netflix 10s seek' },
          fullscreen: { key: 'f', verified: true, note: 'Netflix fullscreen' },
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
          seekForward: { key: 'Right', verified: true, note: 'Netflix 10s seek' },
          seekBackward: { key: 'Left', verified: true, note: 'Netflix 10s seek' },
          fullscreen: { key: 'f', verified: true, note: 'Netflix fullscreen' },
        },
      },
    },
    'vlc.exe': {
      name: 'VLC Media Player',
      seekForward: { key: 'Right', verified: true, note: 'VLC short jump 10s' },
      seekBackward: { key: 'Left', verified: true, note: 'VLC short jump 10s' },
      fullscreen: { key: 'f', verified: true, note: 'VLC toggle fullscreen' },
    },
    'spotify.exe': {
      name: 'Spotify Desktop',
      seekForward: { key: 'Shift+Right', verified: true, note: 'Spotify forward seek' },
      seekBackward: { key: 'Shift+Left', verified: true, note: 'Spotify backward seek' },
      fullscreen: { key: 'f', verified: false, note: 'Spotify fullscreen view' },
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
