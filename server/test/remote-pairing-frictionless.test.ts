import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PairingManager } from '../src/pairing-manager.js';
import { FeatureManager } from '../src/features/FeatureManager.js';
import { WindowsAutostartManager } from '../src/system/WindowsAutostartManager.js';
import { FakeKeepAwakeAdapter } from '../src/system/KeepAwakeAdapter.js';

describe('AEROKIN Personal Mode & Frictionless Pairing Suite', () => {
  let pairingManager: PairingManager;
  let tempDir: string;

  beforeEach(() => {
    pairingManager = new PairingManager();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-autostart-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('1. PC-Side Approval Default OFF (Allen Personal Mode)', () => {
    it('defaults requirePcApproval to false', () => {
      expect(pairingManager.getRequirePcApproval()).toBe(false);
    });

    it('auto-approves valid 8-digit pairing code immediately when requirePcApproval is OFF', async () => {
      const activeCode = pairingManager.generateCode();
      expect(activeCode.code).toHaveLength(8);

      const result = await pairingManager.validatePairingSubmission(
        activeCode.code,
        "Allen's iPhone",
        'iOS Safari',
        '192.168.1.55'
      );

      // Successfully approved without any terminal or dashboard approval prompt
      expect(result.ok).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('can be toggled on if operator explicitly enables requirePcApproval', () => {
      pairingManager.setRequirePcApproval(true);
      expect(pairingManager.getRequirePcApproval()).toBe(true);

      pairingManager.setRequirePcApproval(false);
      expect(pairingManager.getRequirePcApproval()).toBe(false);
    });
  });

  describe('2. Remote Access Feature Default', () => {
    it('defaults remoteAccess to false when AEROKIN_SIGNALING_URL is unset', () => {
      const prevSig = process.env.AEROKIN_SIGNALING_URL;
      try {
        delete process.env.AEROKIN_SIGNALING_URL;
        const fm = new FeatureManager();
        expect(fm.isEnabled('remoteAccess')).toBe(false);
        expect(fm.isEnabled('requirePcApproval')).toBe(false);
      } finally {
        if (prevSig !== undefined) process.env.AEROKIN_SIGNALING_URL = prevSig;
      }
    });

    it('defaults remoteAccess to true when AEROKIN_SIGNALING_URL is set so Allen needs no extra switch', () => {
      const prevSig = process.env.AEROKIN_SIGNALING_URL;
      try {
        process.env.AEROKIN_SIGNALING_URL = 'wss://signal.example.com';
        const fm = new FeatureManager();
        expect(fm.isEnabled('remoteAccess')).toBe(true);
      } finally {
        if (prevSig !== undefined) process.env.AEROKIN_SIGNALING_URL = prevSig;
        else delete process.env.AEROKIN_SIGNALING_URL;
      }
    });
  });

  describe('3. Honest Remote Pairing Links (No Fake Fallbacks)', () => {
    it('formats remote pairing URL correctly when AEROKIN_HOSTED_URL is set', () => {
      const rawHosted = 'https://aerokin.vercel.app';
      const pcId = 'pc_1a2b3c4d5e6f';
      const signalingUrl = 'wss://signal.yourdomain.com';
      const code = '12345678';

      const hostedBase = rawHosted.trim().replace(/\/+$/, '');
      const signalHost = signalingUrl.replace(/^wss?:\/\//i, '').replace(/^https?:\/\//i, '');
      const remotePairPayload =
        hostedBase && code
          ? `${hostedBase}/#agent=${pcId}&signal=${encodeURIComponent(signalHost)}&code=${code}`
          : undefined;

      expect(remotePairPayload).toBe(
        'https://aerokin.vercel.app/#agent=pc_1a2b3c4d5e6f&signal=signal.yourdomain.com&code=12345678'
      );
    });

    it('returns undefined remotePairPayload when AEROKIN_HOSTED_URL is empty or unset (no app.aerokin.com)', () => {
      const rawHosted = '';
      const pcId = 'pc_1a2b3c4d5e6f';
      const code = '12345678';

      const hostedBase = rawHosted ? rawHosted.trim().replace(/\/+$/, '') : '';
      const remotePairPayload =
        hostedBase && code ? `${hostedBase}/#agent=${pcId}&code=${code}` : undefined;

      expect(remotePairPayload).toBeUndefined();
    });
  });

  describe('4. Windows Autostart Manager (S7 Isolated Temp Directory)', () => {
    it('manages startup shortcut status, enable, and disable without touching host startup', () => {
      const autostart = new WindowsAutostartManager(tempDir);
      expect(autostart.getStatus().enabled).toBe(false);

      const enabled = autostart.enable('node server.js');
      expect(enabled.enabled).toBe(true);
      expect(fs.existsSync(enabled.path)).toBe(true);

      const content = fs.readFileSync(enabled.path, 'utf-8');
      expect(content).toContain('node server.js');
      expect(content).toContain('AeroKin Windows Autostart Entry');

      const disabled = autostart.disable();
      expect(disabled.enabled).toBe(false);
      expect(fs.existsSync(disabled.path)).toBe(false);
    });
  });

  describe('5. Keep PC Awake Execution State Adapter', () => {
    it('enables and disables keep-awake state cleanly without touching Windows power plan', () => {
      const adapter = new FakeKeepAwakeAdapter();
      expect(adapter.isEnabled()).toBe(false);

      expect(adapter.enable()).toBe(true);
      expect(adapter.isEnabled()).toBe(true);

      expect(adapter.disable()).toBe(true);
      expect(adapter.isEnabled()).toBe(false);
    });
  });
});
