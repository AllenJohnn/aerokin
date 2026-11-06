import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { SignalingClient } from '../src/transport/SignalingClient.js';

describe('SignalingClient Suite', () => {
  let wss: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.on('listening', () => resolve()));
    port = (wss.address() as any).port;
  });

  afterEach(async () => {
    for (const client of wss.clients) {
      try { client.close(); } catch {}
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  it('connects, registers PC identity, and handles offer/answer signaling roundtrip', async () => {
    let receivedRegisterMsg: any = null;
    let receivedAnswerMsg: any = null;

    wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString('utf8'));
        if (msg.type === 'register') {
          receivedRegisterMsg = msg;
          ws.send(JSON.stringify({
            type: 'registered',
            pcId: msg.pcId,
            iceServers: [{ urls: 'stun:stun.aerokin.local:3478' }],
          }));

          // Simulate incoming phone client offer
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'offer',
              sourcePeerId: 'dev_iphone_123',
              sdp: 'mock-phone-offer-sdp',
            }));
          }, 20);
        } else if (msg.type === 'answer') {
          receivedAnswerMsg = msg;
        }
      });
    });

    let clientRegistered = false;
    let receivedOfferSdp: string | null = null;
    let receivedPeerId: string | null = null;

    const client = new SignalingClient({
      signalingUrl: `ws://127.0.0.1:${port}`,
      pcId: 'pc_test12345678',
      onRegistered: (iceServers) => {
        clientRegistered = true;
        expect(iceServers.length).toBe(1);
      },
      onOffer: (peerId, sdp) => {
        receivedPeerId = peerId;
        receivedOfferSdp = sdp;
        // Reply with mock answer
        client.sendAnswer(peerId, 'mock-pc-answer-sdp');
      },
    });

    // Wait for handshake
    await new Promise((r) => setTimeout(r, 100));

    expect(clientRegistered).toBe(true);
    expect(receivedRegisterMsg).not.toBeNull();
    expect(receivedRegisterMsg.pcId).toBe('pc_test12345678');
    expect(receivedPeerId).toBe('dev_iphone_123');
    expect(receivedOfferSdp).toBe('mock-phone-offer-sdp');
    expect(receivedAnswerMsg).not.toBeNull();
    expect(receivedAnswerMsg.targetPeerId).toBe('dev_iphone_123');
    expect(receivedAnswerMsg.sdp).toBe('mock-pc-answer-sdp');

    client.close();
  });
});
