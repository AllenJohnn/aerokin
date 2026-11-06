import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuickActionService } from '../src/actions/QuickActionService.js';
import { validateClientMessage, ALLOWED_QUICK_ACTIONS } from '../src/protocol.js';

describe('QuickActionService & Whitelist Safety', () => {
  let actionService: QuickActionService;

  beforeEach(() => {
    vi.useFakeTimers();
    actionService = new QuickActionService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Protocol Validation & Enum Whitelist', () => {
    it('validates every whitelisted action enum in ALLOWED_QUICK_ACTIONS', () => {
      for (const action of ALLOWED_QUICK_ACTIONS) {
        if (action === 'send_link') {
          const msg = validateClientMessage({
            type: 'quick_action',
            action,
            payload: 'https://example.com',
          });
          expect(msg).toEqual({
            type: 'quick_action',
            action: 'send_link',
            payload: 'https://example.com/',
          });
        } else if (action === 'type_text') {
          const msg = validateClientMessage({
            type: 'quick_action',
            action,
            payload: 'Testing text',
          });
          expect(msg).toEqual({
            type: 'quick_action',
            action: 'type_text',
            payload: 'Testing text',
          });
        } else if (action === 'launch_app') {
          const msg = validateClientMessage({
            type: 'quick_action',
            action,
            payload: 'notepad',
          });
          expect(msg).toEqual({
            type: 'quick_action',
            action: 'launch_app',
            payload: 'notepad',
          });
        } else {
          const msg = validateClientMessage({
            type: 'quick_action',
            action,
          });
          expect(msg).toEqual({
            type: 'quick_action',
            action,
            payload: undefined,
          });
        }
      }
    });

    it('strictly rejects non-whitelisted actions', () => {
      const msg = validateClientMessage({
        type: 'quick_action',
        action: 'arbitrary_cmd_injection',
      });
      expect(msg).toBeNull();
    });

    it('strictly rejects dangerous URL schemes for send_link', () => {
      const malicious = [
        'javascript:alert(1)',
        'file:///C:/Windows/System32/cmd.exe',
        'data:text/html,<script>alert(1)</script>',
        'cmd://run',
        'powershell:whoami',
      ];

      for (const url of malicious) {
        const msg = validateClientMessage({
          type: 'quick_action',
          action: 'send_link',
          payload: url,
        });
        expect(msg, `Should reject ${url}`).toBeNull();
      }
    });

    it('rejects oversized send_link URLs (>2048 chars)', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2100);
      const msg = validateClientMessage({
        type: 'quick_action',
        action: 'send_link',
        payload: longUrl,
      });
      expect(msg).toBeNull();
    });

    it('rejects oversized type_text (>1000 chars)', () => {
      const longText = 'a'.repeat(1001);
      const msg = validateClientMessage({
        type: 'quick_action',
        action: 'type_text',
        payload: longText,
      });
      expect(msg).toBeNull();
    });
  });

  describe('Shutdown Countdown & Cancel State Machine', () => {
    it('initiates 10-second countdown for shutdown and notifies listeners', async () => {
      const listener = vi.fn();
      actionService.onCountdownChange(listener);

      const res = await actionService.executeAction('shutdown');
      expect(res.success).toBe(true);
      expect(res.countdownActive).toBe(true);
      expect(res.secondsRemaining).toBe(10);
      expect(actionService.getCountdownState().active).toBe(true);
      expect(actionService.getCountdownState().action).toBe('shutdown');

      // Tick 3 seconds
      vi.advanceTimersByTime(3000);
      expect(actionService.getCountdownState().secondsRemaining).toBe(7);

      // Cancel shutdown
      const cancelRes = await actionService.executeAction('cancel_shutdown');
      expect(cancelRes.success).toBe(true);
      expect(actionService.getCountdownState().active).toBe(false);
      expect(actionService.getCountdownState().secondsRemaining).toBe(0);
    });

    it('rejects starting a second countdown while one is already active', async () => {
      await actionService.executeAction('shutdown');
      const secondRes = await actionService.executeAction('restart');
      expect(secondRes.success).toBe(false);
      expect(secondRes.error).toContain('already counting down');

      await actionService.executeAction('cancel_shutdown');
    });

    it('cancels countdown cleanly when timer expires', async () => {
      await actionService.executeAction('restart');
      expect(actionService.getCountdownState().active).toBe(true);

      // Advance full 10 seconds
      vi.advanceTimersByTime(11000);
      expect(actionService.getCountdownState().active).toBe(false);
    });
  });

  describe('App Launcher Allow-List Enforcement', () => {
    it('reads entries from launcher allow-list', () => {
      const entries = actionService.getLauncherEntries();
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some((e) => e.id === 'notepad')).toBe(true);
    });

    it('rejects unknown application id not present in allow-list', async () => {
      const res = await actionService.executeAction('launch_app', 'malicious_app_id');
      expect(res.success).toBe(false);
      expect(res.error).toContain('not in PC allow-list');
    });
  });
});
