import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaCommandRouter } from '../src/media/MediaCommandRouter.js';
import { AppProfiles } from '../src/media/AppProfiles.js';
import { SmtcAdapter } from '../src/media/SmtcAdapter.js';
import { DEFAULT_CAPABILITIES, MediaSessionItem, NowPlayingData } from '../src/media/types.js';

describe('MediaCommandRouter & Capability Model (Media 2.0)', () => {
  let mockSmtc: SmtcAdapter;
  let profiles: AppProfiles;
  let currentStatus: {
    sessions: MediaSessionItem[];
    nowPlaying: NowPlayingData;
    volume: number;
    muted: boolean;
  };
  let foregroundApp: { processName: string; title: string } | null;
  let router: MediaCommandRouter;

  beforeEach(() => {
    foregroundApp = null;
    currentStatus = {
      sessions: [
        {
          id: 'spotify.exe',
          app: 'Spotify',
          title: 'Track Title',
          current: true,
          capabilities: {
            ...DEFAULT_CAPABILITIES,
            canNext: true,
            canPrev: true,
            canSeek: true,
            canSetPosition: true,
          },
        },
        {
          id: 'live_stream',
          app: 'Web Radio',
          title: 'Live News',
          current: false,
          capabilities: {
            ...DEFAULT_CAPABILITIES,
            canNext: false,
            canPrev: false,
            canSeek: false,
            canSetPosition: false,
          },
        },
      ],
      nowPlaying: {
        id: 'spotify.exe',
        app: 'Spotify',
        title: 'Track Title',
        status: 'playing',
        canSeek: true,
        canNext: true,
        canPrev: true,
        capabilities: {
          ...DEFAULT_CAPABILITIES,
          canNext: true,
          canPrev: true,
          canSeek: true,
          canSetPosition: true,
        },
      },
      volume: 50,
      muted: false,
    };

    mockSmtc = {
      ready: true,
      sendCommand: vi.fn().mockImplementation(async (cmd) => {
        return { ok: true, handled: true, cmd: cmd.cmd, targetSessionId: cmd.targetSessionId };
      }),
      setMasterVolume: vi.fn().mockImplementation(async (level) => {
        return { volume: level };
      }),
      toggleMute: vi.fn().mockImplementation(async () => {
        return { muted: !currentStatus.muted };
      }),
      selectSession: vi.fn().mockResolvedValue(true),
    } as unknown as SmtcAdapter;

    profiles = new AppProfiles();

    router = new MediaCommandRouter({
      smtcAdapter: mockSmtc,
      appProfiles: profiles,
      getCurrentStatus: () => currentStatus,
      getForegroundApp: () => foregroundApp,
    });
  });

  describe('Capability Filtering', () => {
    it('refuses "next" command when target session explicitly lacks next capability', async () => {
      // live_stream has canNext: false
      const result = await router.route('next', undefined, 'live_stream');

      expect(result.handled).toBe(false);
      expect(result.error).toContain('refused');
      expect(result.error).toContain('canNext');
      expect(mockSmtc.sendCommand).not.toHaveBeenCalled();
    });

    it('refuses "prev" command when target session explicitly lacks prev capability', async () => {
      const result = await router.route('prev', undefined, 'live_stream');

      expect(result.handled).toBe(false);
      expect(result.error).toContain('refused');
      expect(result.error).toContain('canPrev');
    });

    it('allows "next" and "prev" when session capability permits', async () => {
      const result = await router.route('next', undefined, 'spotify.exe');

      expect(result.handled).toBe(true);
      expect(result.tier).toBe(2);
      expect(mockSmtc.sendCommand).toHaveBeenCalledWith({ cmd: 'next', targetSessionId: 'spotify.exe' });
    });
  });

  describe('Session Scoping', () => {
    it('passes targetSessionId parameter to SMTC sidecar', async () => {
      await router.route('playpause', undefined, 'spotify.exe');

      expect(mockSmtc.sendCommand).toHaveBeenCalledWith({
        cmd: 'playpause',
        targetSessionId: 'spotify.exe',
      });
    });

    it('selects session when action is "session"', async () => {
      const res = await router.route('session', 'spotify.exe');

      expect(res.handled).toBe(true);
      expect(res.tier).toBe(2);
      expect(mockSmtc.selectSession).toHaveBeenCalledWith('spotify.exe');
    });
  });

  describe('Routing Precedence for Seeking', () => {
    it('uses SMTC (Tier 2) when session supports seeking', async () => {
      const res = await router.route('seekby', 15, 'spotify.exe');

      expect(res.tier).toBe(2);
      expect(res.handled).toBe(true);
      expect(mockSmtc.sendCommand).toHaveBeenCalledWith({
        cmd: 'seekby',
        seconds: 15,
        targetSessionId: 'spotify.exe',
      });
    });

    it('falls back to App Profile (Tier 3) when SMTC seek returns unhandled', async () => {
      (mockSmtc.sendCommand as any).mockResolvedValueOnce({ ok: true, handled: false });
      foregroundApp = { processName: 'chrome.exe', title: 'AeroKin Demo - YouTube' };

      const res = await router.route('seekfwd', 10);

      expect(res.tier).toBe(3);
      expect(res.handled).toBe(true);
      expect(res.detail).toContain('YouTube');
      expect(res.detail).toContain('"l"');
    });

    it('falls back to App Profile (Tier 3) for fullscreen', async () => {
      foregroundApp = { processName: 'vlc.exe', title: 'movie.mkv' };

      const res = await router.route('fullscreen');

      expect(res.tier).toBe(3);
      expect(res.handled).toBe(true);
      expect(res.detail).toContain('VLC');
      expect(res.detail).toContain('"f"');
    });
  });

  describe('Volume Bounds & Clamping', () => {
    it('clamps volume levels between 0 and 100', async () => {
      await router.route('setvolume', 150);
      expect(mockSmtc.setMasterVolume).toHaveBeenCalledWith(100);

      await router.route('setvolume', -25);
      expect(mockSmtc.setMasterVolume).toHaveBeenCalledWith(0);

      await router.route('setvolume', 42.6);
      expect(mockSmtc.setMasterVolume).toHaveBeenCalledWith(43);
    });

    it('toggles master volume mute via SMTC', async () => {
      const res = await router.route('mute');
      expect(res.tier).toBe(2);
      expect(mockSmtc.toggleMute).toHaveBeenCalled();
    });
  });

  describe('AppProfiles Matching', () => {
    it('matches YouTube in Chrome, Edge, and Firefox to L and J keys', () => {
      const chromeYt = profiles.getProfile('chrome.exe', 'Rick Astley - YouTube');
      expect(chromeYt.seekForward.key).toBe('l');
      expect(chromeYt.seekBackward.key).toBe('j');
      expect(chromeYt.fullscreen.key).toBe('f');

      const edgeYt = profiles.getProfile('msedge.exe', 'Tutorial - YouTube - Microsoft Edge');
      expect(edgeYt.seekForward.key).toBe('l');

      const firefoxYt = profiles.getProfile('firefox.exe', 'Music Video - YouTube');
      expect(firefoxYt.seekForward.key).toBe('l');
    });

    it('matches Spotify desktop profile to Shift+Right and Shift+Left', () => {
      const spotify = profiles.getProfile('spotify.exe', 'Spotify Free');
      expect(spotify.seekForward.key).toBe('Shift+Right');
      expect(spotify.seekBackward.key).toBe('Shift+Left');
    });

    it('matches VLC media player profile to Alt+Right and Alt+Left arrows', () => {
      const vlc = profiles.getProfile('vlc.exe', 'Video.mp4 - VLC media player');
      expect(vlc.seekForward.key).toBe('Alt+Right');
      expect(vlc.seekBackward.key).toBe('Alt+Left');
      expect(vlc.fullscreen.key).toBe('f');
    });

    it('falls back to default keys for unknown apps', () => {
      const unknown = profiles.getProfile('notepad.exe', 'Untitled');
      expect(unknown.name).toBe('Default');
      expect(unknown.seekForward.key).toBe('Right');
      expect(unknown.seekBackward.key).toBe('Left');
      expect(unknown.fullscreen.key).toBe('f');
    });
  });
});