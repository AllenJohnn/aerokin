import { describe, it, expect, vi } from 'vitest';
import {
  ClipboardService,
  MockClipboardManager,
} from '../src/clipboard/ClipboardService.js';
import { MAX_CLIPBOARD_TEXT_BYTES } from '../src/protocol.js';
import { serverLogger } from '../src/logger.js';

describe('ClipboardService & Content Redaction', () => {
  it('reads and writes text through IClipboardManager interface', async () => {
    const mock = new MockClipboardManager();
    const service = new ClipboardService(mock);

    const writeRes = await service.setPcClipboard('Hello PC from Phone');
    expect(writeRes.success).toBe(true);
    expect(writeRes.item?.length).toBe(19);

    const readRes = await service.getPcClipboard();
    expect(readRes.text).toBe('Hello PC from Phone');
    expect(readRes.length).toBe(19);
  });

  it('enforces 100 KB text size limit', async () => {
    const mock = new MockClipboardManager();
    const service = new ClipboardService(mock);

    const oversized = 'x'.repeat(MAX_CLIPBOARD_TEXT_BYTES + 1);
    const res = await service.setPcClipboard(oversized);
    expect(res.success).toBe(false);
  });

  it('manages 20-item in-memory history with FIFO eviction', async () => {
    const mock = new MockClipboardManager();
    const service = new ClipboardService(mock);

    for (let i = 1; i <= 25; i++) {
      await service.setPcClipboard(`Item number ${i}`);
    }

    const history = service.getHistory();
    expect(history).toHaveLength(20);
    // History stores only metadata (id, length, timestamp) - NO content property
    expect((history[0] as any).text).toBeUndefined();
    expect(history[0].length).toBe('Item number 25'.length);

    service.clearHistory();
    expect(service.getHistory()).toHaveLength(0);
    expect(service.getSharedCount()).toBe(0);
  });

  it('strictly NEVER logs clipboard content to server logs (Logger Redaction Test)', async () => {
    const mock = new MockClipboardManager();
    const service = new ClipboardService(mock);

    const secretText = 'TOP_SECRET_SUPER_SENSITIVE_PASSWORD_123456';
    const logSpy = vi.spyOn(serverLogger, 'info');

    await service.setPcClipboard(secretText);
    await service.getPcClipboard();

    for (const call of logSpy.mock.calls) {
      const fullLogLine = call.join(' ');
      expect(fullLogLine).not.toContain(secretText);
      expect(fullLogLine).toContain('chars');
    }

    logSpy.mockRestore();
  });
});
