import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROFILES_CONFIG } from '../src/media/AppProfiles.js';
import { ProfileEntry, ProfilesConfig } from '../src/media/types.js';
import { mapSeekSecondsToVlcHotkey } from '../src/media/ProcessMediaDetector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProfileAuditViolation {
  path: string;
  entry: ProfileEntry;
  reason: string;
}

export function auditProfilesConfig(config: ProfilesConfig): ProfileAuditViolation[] {
  const violations: ProfileAuditViolation[] = [];

  function checkEntry(entryPath: string, entry?: ProfileEntry) {
    if (!entry) return;
    if (entry.verified === true) {
      if (!entry.verifiedOn || !/^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedOn)) {
        violations.push({
          path: entryPath,
          entry,
          reason: 'Entry is marked verified: true without a valid ISO verifiedOn date (YYYY-MM-DD)',
        });
      }
      if (!entry.note || entry.note.trim().length === 0) {
        violations.push({
          path: entryPath,
          entry,
          reason: 'Entry is marked verified: true without an explanatory note',
        });
      }
    }
  }

  // Check defaults
  checkEntry('defaults.seekForward', config.defaults?.seekForward);
  checkEntry('defaults.seekBackward', config.defaults?.seekBackward);
  checkEntry('defaults.fullscreen', config.defaults?.fullscreen);

  // Check profiles
  for (const [procName, profile] of Object.entries(config.profiles || {})) {
    checkEntry(`profiles.${procName}.seekForward`, profile.seekForward);
    checkEntry(`profiles.${procName}.seekBackward`, profile.seekBackward);
    checkEntry(`profiles.${procName}.fullscreen`, profile.fullscreen);

    if (profile.byTitle) {
      for (const [titlePattern, subProfile] of Object.entries(profile.byTitle)) {
        checkEntry(`profiles.${procName}.byTitle.${titlePattern}.seekForward`, subProfile.seekForward);
        checkEntry(`profiles.${procName}.byTitle.${titlePattern}.seekBackward`, subProfile.seekBackward);
        checkEntry(`profiles.${procName}.byTitle.${titlePattern}.fullscreen`, subProfile.fullscreen);
      }
    }
  }

  return violations;
}

describe('Profile Audit & VLC Key Verification', () => {
  const profilesJsonPath = path.resolve(__dirname, '../src/profiles.json');
  const profilesJson: ProfilesConfig = JSON.parse(fs.readFileSync(profilesJsonPath, 'utf8'));

  describe('Verification Audit Rule', () => {
    it('fails audit if any entry has verified: true without verifiedOn date + note', () => {
      const badConfig: ProfilesConfig = {
        defaults: {
          seekForward: { key: 'Right', verified: true, note: '' },
          seekBackward: { key: 'Left', verified: false, note: 'unverified' },
          fullscreen: { key: 'f', verified: true, note: 'Valid note but no verifiedOn' },
        },
        profiles: {},
      };

      const violations = auditProfilesConfig(badConfig);
      expect(violations.length).toBeGreaterThanOrEqual(2);
      expect(violations.some((v) => v.path === 'defaults.seekForward')).toBe(true);
      expect(violations.some((v) => v.path === 'defaults.fullscreen')).toBe(true);
    });

    it('passes audit when verified: true has both valid verifiedOn date and note', () => {
      const validConfig: ProfilesConfig = {
        defaults: {
          seekForward: {
            key: 'Right',
            verified: true,
            verifiedOn: '2026-11-06',
            note: 'Verified on Windows 11 by Allen',
          },
          seekBackward: { key: 'Left', verified: false, note: 'Unverified' },
          fullscreen: { key: 'f', verified: false, note: 'Unverified' },
        },
        profiles: {},
      };

      const violations = auditProfilesConfig(validConfig);
      expect(violations).toHaveLength(0);
    });

    it('ensures DEFAULT_PROFILES_CONFIG passes the audit', () => {
      const violations = auditProfilesConfig(DEFAULT_PROFILES_CONFIG);
      expect(violations).toEqual([]);
    });

    it('ensures profiles.json passes the audit', () => {
      const violations = auditProfilesConfig(profilesJson);
      expect(violations).toEqual([]);
    });

    it('confirms every entry in DEFAULT_PROFILES_CONFIG and profiles.json is verified: false until Allen tests', () => {
      const checkAllFalse = (config: ProfilesConfig, label: string) => {
        const trueEntries: string[] = [];
        const inspect = (p: string, e?: ProfileEntry) => {
          if (e?.verified) trueEntries.push(`${p} (${e.key})`);
        };

        inspect('defaults.seekForward', config.defaults.seekForward);
        inspect('defaults.seekBackward', config.defaults.seekBackward);
        inspect('defaults.fullscreen', config.defaults.fullscreen);

        for (const [proc, prof] of Object.entries(config.profiles)) {
          inspect(`${proc}.seekForward`, prof.seekForward);
          inspect(`${proc}.seekBackward`, prof.seekBackward);
          inspect(`${proc}.fullscreen`, prof.fullscreen);
          if (prof.byTitle) {
            for (const [title, sub] of Object.entries(prof.byTitle)) {
              inspect(`${proc}.${title}.seekForward`, sub.seekForward);
              inspect(`${proc}.${title}.seekBackward`, sub.seekBackward);
              inspect(`${proc}.${title}.fullscreen`, sub.fullscreen);
            }
          }
        }

        expect(trueEntries, `${label} has unconfirmed verified: true entries`).toEqual([]);
      };

      checkAllFalse(DEFAULT_PROFILES_CONFIG, 'DEFAULT_PROFILES_CONFIG');
      checkAllFalse(profilesJson, 'profiles.json');
    });
  });

  describe('VLC Hotkeys & Documentation', () => {
    it('uses Alt+Right/Alt+Left for 10s short jumps in DEFAULT_PROFILES_CONFIG', () => {
      const vlc = DEFAULT_PROFILES_CONFIG.profiles['vlc.exe'];
      expect(vlc).toBeDefined();
      expect(vlc.seekForward?.key).toBe('Alt+Right');
      expect(vlc.seekBackward?.key).toBe('Alt+Left');
      expect(vlc.seekForward?.verified).toBe(false);
      expect(vlc.seekBackward?.verified).toBe(false);
      expect(vlc.seekForward?.note).toContain('Shift+Arrow=3s');
      expect(vlc.seekForward?.note).toContain('Alt+Arrow=10s');
      expect(vlc.seekForward?.note).toContain('Ctrl+Arrow=1m');
    });

    it('uses Alt+Right/Alt+Left for 10s short jumps in profiles.json', () => {
      const vlc = profilesJson.profiles['vlc.exe'];
      expect(vlc).toBeDefined();
      expect(vlc.seekForward?.key).toBe('Alt+Right');
      expect(vlc.seekBackward?.key).toBe('Alt+Left');
      expect(vlc.seekForward?.verified).toBe(false);
      expect(vlc.seekBackward?.verified).toBe(false);
      expect(vlc.seekForward?.note).toContain('Alt+Arrow=10s');
      expect(vlc.seekForward?.note).toContain('Ctrl+Arrow=1m');
    });

    it('mapSeekSecondsToVlcHotkey maps 10s to Alt and 60s to Ctrl with unverified status', () => {
      const tenSecFwd = mapSeekSecondsToVlcHotkey(10);
      expect(tenSecFwd.key).toBe('Alt+Right');
      expect(tenSecFwd.verified).toBe(false);

      const tenSecBack = mapSeekSecondsToVlcHotkey(-10);
      expect(tenSecBack.key).toBe('Alt+Left');
      expect(tenSecBack.verified).toBe(false);

      const sixtySecFwd = mapSeekSecondsToVlcHotkey(60);
      expect(sixtySecFwd.key).toBe('Ctrl+Right');
      expect(sixtySecFwd.verified).toBe(false);

      const sixtySecBack = mapSeekSecondsToVlcHotkey(-60);
      expect(sixtySecBack.key).toBe('Ctrl+Left');
      expect(sixtySecBack.verified).toBe(false);

      const threeSec = mapSeekSecondsToVlcHotkey(3);
      expect(threeSec.key).toBe('Shift+Right');
      expect(threeSec.verified).toBe(false);

      const fiveMin = mapSeekSecondsToVlcHotkey(300);
      expect(fiveMin.key).toBe('Ctrl+Alt+Right');
      expect(fiveMin.verified).toBe(false);
    });
  });
});
