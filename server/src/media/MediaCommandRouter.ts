import { Win32Input } from '../native/win32.js';
import { SmtcAdapter } from './SmtcAdapter.js';
import { AppProfiles } from './AppProfiles.js';
import {
  MediaCommandResult,
  NowPlayingData,
  MediaSessionItem,
} from './types.js';

export interface CommandRouterContext {
  smtcAdapter: SmtcAdapter;
  appProfiles: AppProfiles;
  getCurrentStatus: () => {
    sessions: MediaSessionItem[];
    nowPlaying: NowPlayingData;
    volume: number;
    muted: boolean;
  };
  getForegroundApp?: () => { processName: string; title: string } | null;
}

export class MediaCommandRouter {
  private smtc: SmtcAdapter;
  private profiles: AppProfiles;
  private getStatus: () => {
    sessions: MediaSessionItem[];
    nowPlaying: NowPlayingData;
    volume: number;
    muted: boolean;
  };
  private getForegroundApp: () => { processName: string; title: string } | null;

  constructor(context: CommandRouterContext) {
    this.smtc = context.smtcAdapter;
    this.profiles = context.appProfiles;
    this.getStatus = context.getCurrentStatus;
    this.getForegroundApp = context.getForegroundApp || (() => Win32Input.getForegroundApp());
  }

  /**
   * Routes a media command through the 3-tier hierarchy with capability verification and session scoping.
   */
  public async route(
    action: string,
    param?: any,
    targetSessionId?: string
  ): Promise<MediaCommandResult> {
    const start = performance.now();
    const current = this.getStatus();

    // Determine target session (explicit parameter, or matching current active session)
    const targetSession = targetSessionId
      ? current.sessions.find((s) => s.id === targetSessionId)
      : current.sessions.find((s) => s.current) || (current.nowPlaying.id ? current.nowPlaying : undefined);

    const caps = targetSession?.capabilities;

    // 1. CAPABILITY REFUSAL CHECK
    if (caps) {
      if (action === 'next' && caps.canNext === false) {
        return {
          tier: 2,
          action,
          handled: false,
          latencyMs: Math.round(performance.now() - start),
          error: 'Action "next" refused: not supported by session capabilities (canNext=false)',
        };
      }
      if (action === 'prev' && caps.canPrev === false) {
        return {
          tier: 2,
          action,
          handled: false,
          latencyMs: Math.round(performance.now() - start),
          error: 'Action "prev" refused: not supported by session capabilities (canPrev=false)',
        };
      }
      if (action === 'play' && caps.canPlay === false) {
        return {
          tier: 2,
          action,
          handled: false,
          latencyMs: Math.round(performance.now() - start),
          error: 'Action "play" refused: not supported by session capabilities (canPlay=false)',
        };
      }
      if (action === 'pause' && caps.canPause === false) {
        return {
          tier: 2,
          action,
          handled: false,
          latencyMs: Math.round(performance.now() - start),
          error: 'Action "pause" refused: not supported by session capabilities (canPause=false)',
        };
      }
      if (action === 'stop' && caps.canStop === false) {
        return {
          tier: 2,
          action,
          handled: false,
          latencyMs: Math.round(performance.now() - start),
          error: 'Action "stop" refused: not supported by session capabilities (canStop=false)',
        };
      }
    }

    // 2. SEEKING (seekby, seekto, seekfwd, seekback)
    if (action === 'seekby' || action === 'seekfwd' || action === 'seekback' || action === 'seekto') {
      const seconds = action === 'seekto' ? 0 : (param ?? (action === 'seekfwd' ? 10 : -10));

      // Tier 2: Try SMTC seek if session supports it
      const canSeekSmtc = caps ? caps.canSeek || caps.canSetPosition : current.nowPlaying.canSeek;
      if (this.smtc.ready && canSeekSmtc) {
        const cmdPayload =
          action === 'seekto'
            ? { cmd: 'seekto', position: param, targetSessionId }
            : { cmd: 'seekby', seconds, targetSessionId };

        const res = await this.smtc.sendCommand(cmdPayload);
        if (res && res.handled) {
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: 'SMTC TryChangePlaybackPositionAsync',
          };
        }
      }

      // Tier 3: Keystroke fallback matching foreground application profile
      const fg = this.getForegroundApp();
      const profile = this.profiles.getProfile(fg?.processName, fg?.title);
      const isForward = seconds >= 0;
      const targetEntry = isForward ? profile.seekForward : profile.seekBackward;

      const keyToSend = targetEntry.key;
      if (keyToSend.includes('+')) {
        await Win32Input.keyCombo(keyToSend);
      } else {
        await Win32Input.key(keyToSend, 'tap');
      }

      return {
        tier: 3,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: `Keystroke "${keyToSend}" (Profile: ${profile.name}, verified: ${targetEntry.verified})`,
      };
    }

    // 3. FULLSCREEN (Tier 3 Profile Shortcut)
    if (action === 'fullscreen') {
      const fg = this.getForegroundApp();
      const profile = this.profiles.getProfile(fg?.processName, fg?.title);
      const keyToSend = profile.fullscreen.key;

      if (keyToSend.includes('+')) {
        await Win32Input.keyCombo(keyToSend);
      } else {
        await Win32Input.key(keyToSend, 'tap');
      }

      return {
        tier: 3,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: `Keystroke "${keyToSend}" (Profile: ${profile.name})`,
      };
    }

    // 4. PLAYBACK TRANSPORT (playpause, play, pause, next, prev, stop)
    if (['playpause', 'play', 'pause', 'next', 'prev', 'stop'].includes(action)) {
      // Tier 2: Try SMTC first (scoped to targetSessionId if provided)
      if (this.smtc.ready) {
        const res = await this.smtc.sendCommand({ cmd: action, targetSessionId });
        if (res && res.handled) {
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: `SMTC ${action}${targetSessionId ? ` (session: ${targetSessionId})` : ''}`,
          };
        }
      }

      // Tier 1: Hardware Media Keys fallback
      const keyName = action === 'play' || action === 'pause' ? 'playpause' : action;
      await Win32Input.key(keyName, 'tap');
      return {
        tier: 1,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: `Hardware VK_${keyName.toUpperCase()}`,
      };
    }

    // 5. MASTER VOLUME (setvolume, mute, volup, voldown, getvolume)
    if (action === 'setvolume') {
      const level = Math.max(0, Math.min(100, Math.round(param)));
      if (this.smtc.ready) {
        const res = await this.smtc.setMasterVolume(level);
        if (res) {
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: `Master volume set to ${res.volume}%`,
          };
        }
      }
      return {
        tier: 1,
        action,
        handled: false,
        latencyMs: Math.round(performance.now() - start),
        error: 'Master volume control unavailable without active audio sidecar',
      };
    }

    if (action === 'mute') {
      if (this.smtc.ready) {
        const res = await this.smtc.toggleMute();
        if (res) {
          return {
            tier: 2,
            action,
            handled: true,
            latencyMs: Math.round(performance.now() - start),
            detail: `Master volume mute toggled: ${res.muted}`,
          };
        }
      }

      await Win32Input.key('mute', 'tap');
      return {
        tier: 1,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: 'Hardware VK_VOLUME_MUTE',
      };
    }

    if (action === 'volup' || action === 'voldown') {
      await Win32Input.key(action, 'tap');
      return {
        tier: 1,
        action,
        handled: true,
        latencyMs: Math.round(performance.now() - start),
        detail: `Hardware VK_${action.toUpperCase()}`,
      };
    }

    // 6. SESSION SWITCHING
    if (action === 'session') {
      if (this.smtc.ready && typeof param === 'string') {
        const ok = await this.smtc.selectSession(param);
        return {
          tier: 2,
          action,
          handled: ok,
          latencyMs: Math.round(performance.now() - start),
          detail: `Selected session: ${param}`,
        };
      }
    }

    return {
      tier: 1,
      action,
      handled: false,
      latencyMs: Math.round(performance.now() - start),
      detail: `Unhandled media action: "${action}"`,
    };
  }
}
