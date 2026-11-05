import { describe, it, expect, vi } from 'vitest';
import {
  parseMediaWindowTitle,
  getFallbackCapabilities,
  synthesizeProcessSessions,
  mapSeekSecondsToVlcHotkey,
  RunningProcessMediaInfo,
} from '../src/media/ProcessMediaDetector.js';
import { MediaCommandRouter } from '../src/media/MediaCommandRouter.js';
import { AppProfiles } from '../src/media/AppProfiles.js';
import { Win32Input } from '../src/native/win32.js';

describe('Media Fallback Detection & Session Synthesis', () => {
  describe('Window Title Parsing', () => {
    it('correctly identifies idle VLC window without track', () => {
      const res = parseMediaWindowTitle('vlc.exe', 'VLC media player');
      expect(res.appName).toBe('VLC');
      expect(res.trackTitle).toBe('VLC Media Player');
      expect(res.isPlaying).toBe(false);
    });

    it('correctly parses active VLC playing track', () => {
      const res = parseMediaWindowTitle('vlc.exe', 'Hotel California - VLC media player');
      expect(res.appName).toBe('VLC');
      expect(res.trackTitle).toBe('Hotel California');
      expect(res.isPlaying).toBe(true);
    });

    it('strips leading unicode play symbol in VLC title', () => {
      const res = parseMediaWindowTitle('vlc.exe', '► The Dark Side of the Moon - VLC media player');
      expect(res.appName).toBe('VLC');
      expect(res.trackTitle).toBe('The Dark Side of the Moon');
      expect(res.isPlaying).toBe(true);
    });

    it('correctly handles multi-hyphen title in VLC', () => {
      const res = parseMediaWindowTitle('vlc.exe', 'Pink Floyd - Comfortably Numb - Live - VLC media player');
      expect(res.appName).toBe('VLC');
      expect(res.trackTitle).toBe('Pink Floyd - Comfortably Numb - Live');
      expect(res.isPlaying).toBe(true);
    });

    it('parses idle and playing MPC-HC window titles', () => {
      const idle = parseMediaWindowTitle('mpc-hc64.exe', 'MPC-HC');
      expect(idle.appName).toBe('MPC-HC');
      expect(idle.isPlaying).toBe(false);

      const playing = parseMediaWindowTitle('mpc-hc64.exe', 'Blade Runner 2049 (2017).mkv - MPC-HC');
      expect(playing.appName).toBe('MPC-HC');
      expect(playing.trackTitle).toBe('Blade Runner 2049 (2017).mkv');
      expect(playing.isPlaying).toBe(true);
    });

    it('parses idle and playing PotPlayer window titles', () => {
      const idle = parseMediaWindowTitle('potplayermini64.exe', 'PotPlayer');
      expect(idle.appName).toBe('PotPlayer');
      expect(idle.isPlaying).toBe(false);

      const playing = parseMediaWindowTitle('potplayermini64.exe', 'Concert.mp4 - PotPlayer');
      expect(playing.appName).toBe('PotPlayer');
      expect(playing.trackTitle).toBe('Concert.mp4');
      expect(playing.isPlaying).toBe(true);
    });

    it('handles generic process window title', () => {
      const res = parseMediaWindowTitle('customplayer.exe', 'Podcast Episode 42 - AudioPlayer');
      expect(res.trackTitle).toBe('Podcast Episode 42');
      expect(res.isPlaying).toBe(true);
    });
  });

  describe('Fallback Capability Mapping', () => {
    it('provides correct capability flags for fallback players (seeking supported, exact setPosition not supported)', () => {
      const caps = getFallbackCapabilities('vlc.exe');
      expect(caps.canPlay).toBe(true);
      expect(caps.canPause).toBe(true);
      expect(caps.canTogglePlayPause).toBe(true);
      expect(caps.canNext).toBe(true);
      expect(caps.canPrev).toBe(true);
      expect(caps.canStop).toBe(true);
      expect(caps.canSeek).toBe(true);
      expect(caps.canSetPosition).toBe(false);
      expect(caps.canShuffle).toBe(false);
      expect(caps.canRepeat).toBe(false);
    });
  });

  describe('Session Synthesis from Process List', () => {
    it('synthesizes session item with unique proc_ id and title', () => {
      const procs: RunningProcessMediaInfo[] = [
        { pid: 9876, processName: 'vlc.exe', windowTitle: 'Stairway to Heaven.flac - VLC media player' },
      ];

      const sessions = synthesizeProcessSessions(procs);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('proc_vlc_9876');
      expect(sessions[0].app).toBe('VLC');
      expect(sessions[0].title).toBe('Stairway to Heaven.flac');
      expect(sessions[0].capabilities?.canSeek).toBe(true);
      expect(sessions[0].capabilities?.canSetPosition).toBe(false);
      expect(sessions[0].current).toBe(true);
    });

    it('avoids synthesizing duplicate sessions when app is already present in SMTC', () => {
      const existing = [
        {
          id: 'vlc_smtc_session',
          app: 'VLC',
          title: 'Existing Track',
          current: true,
        },
      ];

      const procs: RunningProcessMediaInfo[] = [
        { pid: 4321, processName: 'vlc.exe', windowTitle: 'Duplicate Window - VLC media player' },
        { pid: 5678, processName: 'mpc-hc64.exe', windowTitle: 'Movie.mp4 - MPC-HC' },
      ];

      const synthesized = synthesizeProcessSessions(procs, existing);
      expect(synthesized).toHaveLength(1);
      expect(synthesized[0].app).toBe('MPC-HC');
      expect(synthesized[0].id).toBe('proc_mpc-hc_5678');
    });
  });

  describe('VLC Seek Hotkeys & Action Dispatch', () => {
    it('maps seek delta seconds to verified VLC hotkeys', () => {
      // 3s very short jump
      expect(mapSeekSecondsToVlcHotkey(3)).toEqual({
        key: 'Shift+Right',
        verified: true,
        label: 'VLC very short jump 3s (Shift+Arrow)',
      });
      expect(mapSeekSecondsToVlcHotkey(-3)).toEqual({
        key: 'Shift+Left',
        verified: true,
        label: 'VLC very short jump 3s (Shift+Arrow)',
      });

      // 10s short jump
      expect(mapSeekSecondsToVlcHotkey(10)).toEqual({
        key: 'Ctrl+Right',
        verified: true,
        label: 'VLC short jump 10s (Ctrl+Arrow)',
      });
      expect(mapSeekSecondsToVlcHotkey(-10)).toEqual({
        key: 'Ctrl+Left',
        verified: true,
        label: 'VLC short jump 10s (Ctrl+Arrow)',
      });

      // 60s medium jump
      expect(mapSeekSecondsToVlcHotkey(60)).toEqual({
        key: 'Alt+Right',
        verified: true,
        label: 'VLC medium jump 1m (Alt+Arrow)',
      });
      expect(mapSeekSecondsToVlcHotkey(-60)).toEqual({
        key: 'Alt+Left',
        verified: true,
        label: 'VLC medium jump 1m (Alt+Arrow)',
      });
    });

    it('dispatches appropriate VLC keystroke when targeted session is VLC fallback', async () => {
      const keyComboSpy = vi.spyOn(Win32Input, 'keyCombo').mockResolvedValue(true);

      const fakeSmtc = {
        ready: false,
        sendCommand: vi.fn(),
        getStatus: vi.fn(),
      } as any;

      const vlcSession = {
        id: 'proc_vlc_8888',
        app: 'VLC',
        title: 'Track Test',
        current: true,
        capabilities: getFallbackCapabilities('vlc.exe'),
      };

      const router = new MediaCommandRouter({
        smtcAdapter: fakeSmtc,
        appProfiles: new AppProfiles(),
        getCurrentStatus: () => ({
          sessions: [vlcSession],
          nowPlaying: { status: 'playing', id: vlcSession.id, app: 'VLC' },
          volume: 50,
          muted: false,
        }),
        getForegroundApp: () => ({ processName: 'explorer.exe', title: 'File Explorer' }),
      });

      // Seek forward 10 seconds (Ctrl+Right)
      const res10 = await router.route('seekby', 10, vlcSession.id);
      expect(res10.handled).toBe(true);
      expect(res10.tier).toBe(3);
      expect(keyComboSpy).toHaveBeenCalledWith('Ctrl+Right');

      // Seek backward 3 seconds (Shift+Left)
      const res3 = await router.route('seekby', -3, vlcSession.id);
      expect(res3.handled).toBe(true);
      expect(keyComboSpy).toHaveBeenCalledWith('Shift+Left');

      // Seek forward 60 seconds (Alt+Right)
      const res60 = await router.route('seekby', 60, vlcSession.id);
      expect(res60.handled).toBe(true);
      expect(keyComboSpy).toHaveBeenCalledWith('Alt+Right');

      keyComboSpy.mockRestore();
    });
  });
});
