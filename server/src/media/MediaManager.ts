import { SmtcAdapter } from './SmtcAdapter.js';
import { AppProfiles } from './AppProfiles.js';
import { MediaCommandRouter } from './MediaCommandRouter.js';
import {
  NowPlayingData,
  MediaSessionItem,
  MediaCommandResult,
} from './types.js';

export interface MediaManagerOptions {
  profilesPath?: string;
  sidecarScriptPath?: string;
  autoStart?: boolean;
}

export class MediaManager {
  private smtcAdapter: SmtcAdapter;
  private appProfiles: AppProfiles;
  private router: MediaCommandRouter;
  private pollInterval: NodeJS.Timeout | null = null;
  private onStateChangeCallback?: (
    nowPlaying: NowPlayingData,
    sessions: MediaSessionItem[],
    volume: number,
    muted: boolean
  ) => void;

  private currentStatus: {
    sessions: MediaSessionItem[];
    nowPlaying: NowPlayingData;
    volume: number;
    muted: boolean;
  } = {
    sessions: [],
    nowPlaying: { status: 'none' },
    volume: 50,
    muted: false,
  };

  constructor(options: MediaManagerOptions = {}) {
    this.smtcAdapter = new SmtcAdapter({
      scriptPath: options.sidecarScriptPath,
      autoStart: options.autoStart,
    });
    this.appProfiles = new AppProfiles(options.profilesPath);

    this.router = new MediaCommandRouter({
      smtcAdapter: this.smtcAdapter,
      appProfiles: this.appProfiles,
      getCurrentStatus: () => this.currentStatus,
    });

    if (process.platform === 'win32') {
      this.startPolling();
    }
  }

  public setOnStateChange(
    cb: (
      nowPlaying: NowPlayingData,
      sessions: MediaSessionItem[],
      volume: number,
      muted: boolean
    ) => void
  ): void {
    this.onStateChangeCallback = cb;
  }

  public getCurrentStatus() {
    return this.currentStatus;
  }

  public getRouter(): MediaCommandRouter {
    return this.router;
  }

  public getSmtcAdapter(): SmtcAdapter {
    return this.smtcAdapter;
  }

  public getAppProfiles(): AppProfiles {
    return this.appProfiles;
  }

  private startPolling(intervalMs = 1000): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      await this.refreshStatus();
    }, intervalMs);
  }

  public async refreshStatus(): Promise<void> {
    const data = await this.smtcAdapter.getStatus();
    if (data) {
      this.currentStatus = {
        sessions: data.sessions,
        nowPlaying: data.nowPlaying,
        volume: data.volume,
        muted: data.muted,
      };

      this.onStateChangeCallback?.(
        this.currentStatus.nowPlaying,
        this.currentStatus.sessions,
        this.currentStatus.volume,
        this.currentStatus.muted
      );
    }
  }

  public async handleMediaCommand(
    action: string,
    param?: any,
    targetSessionId?: string
  ): Promise<MediaCommandResult> {
    const res = await this.router.route(action, param, targetSessionId);

    // If session or volume state might have changed, trigger a refresh
    if (['playpause', 'play', 'pause', 'next', 'prev', 'stop', 'session', 'setvolume', 'mute'].includes(action)) {
      this.refreshStatus().catch(() => {});
    }

    return res;
  }

  public dispose(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.smtcAdapter.dispose();
  }
}
