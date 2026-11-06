import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  ALLOWED_QUICK_ACTIONS,
  ALLOWED_MEDIA_ACTIONS,
  WS_MAX_PAYLOAD_BYTES,
  MAX_CLIPBOARD_TEXT_BYTES,
  MAX_MOVE_DELTA,
  MAX_SCROLL_DELTA,
} from '../src/protocol.js';

describe('Protocol Drift Verification (docs/protocol.md vs server/src/protocol.ts)', () => {
  const protocolDocPath = path.resolve(__dirname, '../../docs/protocol.md');
  const protocolContent = fs.readFileSync(protocolDocPath, 'utf8');

  it('verifies all ALLOWED_QUICK_ACTIONS are documented in docs/protocol.md', () => {
    for (const action of ALLOWED_QUICK_ACTIONS) {
      expect(
        protocolContent,
        `Quick action "${action}" from protocol.ts must be documented in docs/protocol.md`
      ).toContain(action);
    }
  });

  it('verifies all ALLOWED_MEDIA_ACTIONS are documented in docs/protocol.md', () => {
    for (const action of ALLOWED_MEDIA_ACTIONS) {
      expect(
        protocolContent,
        `Media action "${action}" from protocol.ts must be documented in docs/protocol.md`
      ).toContain(action);
    }
  });

  it('verifies critical limits and payload constants match documentation', () => {
    expect(protocolContent).toContain(String(WS_MAX_PAYLOAD_BYTES));
    expect(protocolContent).toContain('128 KB');
    expect(protocolContent).toContain(String(MAX_MOVE_DELTA));
    expect(protocolContent).toContain(String(MAX_SCROLL_DELTA));
    expect(protocolContent).toContain('100 KB');
  });

  it('verifies core message types are listed in protocol specification', () => {
    const requiredTypes = [
      'auth',
      'logout',
      'ping',
      'move',
      'click',
      'button',
      'scroll',
      'abs_move',
      'abs_click',
      'key',
      'text',
      'media',
      'setvolume',
      'desktop_start',
      'desktop_stop',
      'screenshot_request',
      'clipboard_get',
      'clipboard_set',
      'quick_action',
      'launcher_list',
    ];

    for (const type of requiredTypes) {
      expect(
        protocolContent,
        `Message type "${type}" must be documented in docs/protocol.md`
      ).toContain(`\`${type}\``);
    }
  });
});
