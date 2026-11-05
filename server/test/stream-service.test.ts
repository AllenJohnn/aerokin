import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamService } from '../src/desktop/StreamService.js';
import { CaptureAdapter } from '../src/desktop/CaptureAdapter.js';
import { DeviceStore } from '../src/device-store.js';
import { MonitorInfo } from '../src/desktop/types.js';

class MockCaptureAdapter implements CaptureAdapter {
  public frameCb: ((packet: Buffer, width: number, height: number, seq: number) => void) | null = null;
  public errorCb: ((err: Error, secure?: boolean) => void) | null = null;
  public exitCb: (() => void) | null = null;
  public isRunning = false;

  public onFrame(cb: (packet: Buffer, width: number, height: number, seq: number) => void) {
    this.frameCb = cb;
  }
  public onError(cb: (err: Error, isSecureScreen?: boolean) => void) {
    this.errorCb = cb;
  }
  public onExit(cb: () => void) {
    this.exitCb = cb;
  }

  public async start(): Promise<boolean> {
    this.isRunning = true;
    return true;
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
  }
}

describe('AEROKIN StreamService & Adaptive Backpressure', () => {
  let mockAdapter: MockCaptureAdapter;
  let mockDeviceStore: any;
  let service: StreamService;

  beforeEach(() => {
    mockAdapter = new MockCaptureAdapter();
    mockDeviceStore = {
      verifyCredential: vi.fn().mockReturnValue(true),
      listDevices: vi.fn().mockReturnValue([]),
    };
    service = new StreamService({
      deviceStore: mockDeviceStore as DeviceStore,
      captureAdapter: mockAdapter,
    });
  });

  it('manages session lifecycle transitions (stopped -> starting -> active -> stopped)', async () => {
    const states: string[] = [];
    service.setOnStatusChange((state) => {
      states.push(state);
    });

    expect(service.getState()).toBe('stopped');

    const startRes = await service.startSession({ preset: 'balanced' });
    expect(startRes.ok).toBe(true);
    expect(service.getState()).toBe('active');
    expect(states).toEqual(['starting', 'active']);

    await service.stopSession('Test stop');
    expect(service.getState()).toBe('stopped');
    expect(states).toEqual(['starting', 'active', 'stopped']);
  });

  it('drops frames adaptively when WebSocket buffer exceeds 256KB', async () => {
    await service.startSession({ preset: 'balanced' });

    let sentBuffers: Buffer[] = [];
    const mockWs: any = {
      readyState: 1, // WebSocket.OPEN
      bufferedAmount: 0,
      send: vi.fn((buf: Buffer) => {
        sentBuffers.push(buf);
      }),
      on: vi.fn(),
      close: vi.fn(),
    };

    service.handleStreamSocket(mockWs, 'dev_123', '192.168.1.100');

    // Deliver frame 1 with normal buffer
    const frame1 = Buffer.alloc(2048);
    mockAdapter.frameCb!(frame1, 1920, 1080, 1);
    expect(sentBuffers.length).toBe(1);
    expect(service.getStats().droppedFrames).toBe(0);

    // Simulate network congestion: bufferedAmount = 300 KB (> 256KB threshold)
    mockWs.bufferedAmount = 300 * 1024;

    // Deliver frame 2 and frame 3 during congestion
    const frame2 = Buffer.alloc(2048);
    const frame3 = Buffer.alloc(2048);
    mockAdapter.frameCb!(frame2, 1920, 1080, 2);
    mockAdapter.frameCb!(frame3, 1920, 1080, 3);

    // Frames should have been dropped without throwing
    expect(sentBuffers.length).toBe(1); // Still 1, not 3
    expect(service.getStats().droppedFrames).toBe(2);

    // Network recovers: bufferedAmount drops to 10 KB
    mockWs.bufferedAmount = 10 * 1024;
    const frame4 = Buffer.alloc(2048);
    mockAdapter.frameCb!(frame4, 1920, 1080, 4);

    expect(sentBuffers.length).toBe(2);
    expect(service.getStats().droppedFrames).toBe(2);

    await service.stopSession();
  });

  it('detects secure desktop screen and transitions to secure_screen state', async () => {
    let latestState = '';
    service.setOnStatusChange((state) => {
      latestState = state;
    });

    await service.startSession({ preset: 'balanced' });
    expect(service.getState()).toBe('active');

    // Simulate UAC or secure lock screen error
    mockAdapter.errorCb!(new Error('Desktop duplication access denied'), true);
    expect(service.getState()).toBe('secure_screen');
    expect(latestState).toBe('secure_screen');

    await service.stopSession();
  });
});
