import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PairingManager } from '../src/pairing-manager.js';

describe('PairingManager', () => {
  let manager: PairingManager;

  beforeEach(() => {
    vi.useRealTimers();
    manager = new PairingManager();
  });

  it('generates an 8-digit numeric pairing code valid for 2 minutes', () => {
    const active = manager.getActiveCode();
    expect(active).not.toBeNull();
    expect(active!.code).toMatch(/^\d{8}$/);
    expect(active!.validForSeconds).toBeGreaterThan(115);
    expect(active!.validForSeconds).toBeLessThanOrEqual(120);
  });

  it('expires code after 2 minutes (120,000ms)', () => {
    vi.useFakeTimers();
    const m = new PairingManager();
    expect(m.getActiveCode()).not.toBeNull();

    // Advance 121 seconds
    vi.advanceTimersByTime(121_000);
    expect(m.getActiveCode()).toBeNull();
  });

  it('is single-use: invalidates code immediately after submission', async () => {
    const active = manager.getActiveCode()!;
    // Set custom approval to approve
    manager.setApprover(async () => true);

    const res1 = await manager.submitPairing(active.code, 'iPhone', 'iOS', '192.168.1.100');
    expect(res1.ok).toBe(true);

    // Second submission with same code must fail because code was consumed
    const res2 = await manager.submitPairing(active.code, 'iPhone', 'iOS', '192.168.1.100');
    expect(res2.ok).toBe(false);
  });

  it('rejects pairing when PC operator denies approval', async () => {
    const active = manager.getActiveCode()!;
    // Operator clicks/types "n" (deny)
    manager.setApprover(async () => false);

    const res = await manager.submitPairing(active.code, 'Unknown Phone', 'Android', '192.168.1.200');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('rejected');
  });

  it('locks out IP and globally after 5 wrong attempts per minute', async () => {
    const active = manager.getActiveCode()!;
    manager.setApprover(async () => true);

    const testIp = '192.168.1.150';

    // Submit 4 wrong codes
    for (let i = 0; i < 4; i++) {
      const res = await manager.submitPairing('00000000', 'Phone', 'iOS', testIp);
      expect(res.ok).toBe(false);
      expect(res.lockedOut).toBeFalsy();
    }

    // 5th wrong code triggers lockout and invalidates the active code
    const res5 = await manager.submitPairing('00000000', 'Phone', 'iOS', testIp);
    expect(res5.ok).toBe(false);
    expect(res5.lockedOut).toBe(true);
    expect(res5.remainingSeconds).toBeGreaterThan(0);

    // Further attempts while locked out are immediately rejected without prompting
    const promptSpy = vi.fn().mockResolvedValue(true);
    manager.setApprover(promptSpy);

    const res6 = await manager.submitPairing(active.code, 'Phone', 'iOS', testIp);
    expect(res6.ok).toBe(false);
    expect(res6.lockedOut).toBe(true);
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('invalidates active code after 5 total failed attempts', async () => {
    manager.getActiveCode();

    // 5 failed attempts from any IP
    for (let i = 0; i < 5; i++) {
      await manager.submitPairing('11111111', 'Phone', 'iOS', `192.168.1.${10 + i}`);
    }

    // Active code must be invalidated
    expect(manager.getActiveCode()).toBeNull();
  });
});