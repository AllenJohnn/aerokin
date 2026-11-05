import { describe, it, expect, beforeEach } from 'vitest';
import { PairingManager } from '../src/pairing-manager.js';

describe('Pairing Approval Race (Terminal vs Dashboard)', () => {
  let manager: PairingManager;

  beforeEach(() => {
    manager = new PairingManager();
  });

  it('allows dashboard to approve before terminal responds', async () => {
    const code = manager.getActiveCode()!.code;
    let eventReceived: any = null;

    manager.on('approval_requested', (req) => {
      eventReceived = req;
    });

    // Start pairing submission in background
    const submitPromise = manager.submitPairing(
      code,
      'Test iPhone',
      'iPhone Safari',
      '192.168.1.50'
    );

    // Yield to let approval event fire
    await new Promise((r) => setTimeout(r, 10));

    expect(eventReceived).not.toBeNull();
    expect(eventReceived.name).toBe('Test iPhone');
    expect(eventReceived.clientIp).toBe('192.168.1.50');

    // Dashboard responds with approval
    const accepted = manager.respondApproval(eventReceived.requestId, true, 'dashboard');
    expect(accepted).toBe(true);

    const result = await submitPromise;
    expect(result.ok).toBe(true);

    // Subsequent response (e.g. late terminal reply) is rejected
    const lateResponse = manager.respondApproval(eventReceived.requestId, false, 'terminal');
    expect(lateResponse).toBe(false);
  });

  it('allows terminal to answer first, rejecting late dashboard response', async () => {
    const code = manager.getActiveCode()!.code;
    let eventReceived: any = null;
    let resolvedEvent: any = null;

    manager.on('approval_requested', (req) => {
      eventReceived = req;
    });

    manager.on('approval_resolved', (ev) => {
      resolvedEvent = ev;
    });

    const submitPromise = manager.submitPairing(
      code,
      'Allen iPad',
      'iPad Safari',
      '192.168.1.60'
    );

    await new Promise((r) => setTimeout(r, 10));

    // Terminal responds first with deny
    const terminalAccepted = manager.respondApproval(eventReceived.requestId, false, 'terminal');
    expect(terminalAccepted).toBe(true);

    const result = await submitPromise;
    expect(result.ok).toBe(false);

    expect(resolvedEvent).not.toBeNull();
    expect(resolvedEvent.by).toBe('terminal');
    expect(resolvedEvent.approved).toBe(false);

    // Late dashboard click is rejected
    const dashboardAccepted = manager.respondApproval(eventReceived.requestId, true, 'dashboard');
    expect(dashboardAccepted).toBe(false);
  });
});
