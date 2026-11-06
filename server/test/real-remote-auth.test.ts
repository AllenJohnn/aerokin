import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { PeerConnection } from 'node-datachannel';
import { SignalingServer } from '../../signaling/src/server.js';
import { SignalingClient } from '../src/transport/SignalingClient.js';
import { RtcHostManager, RtcHostSession } from '../src/transport/RtcHostManager.js';
import {
  chunkDataChannelMessage,
  RtcMessageReassembler,
} from '../src/transport/RtcTransport.js';
import { DeviceStore } from '../src/device-store.js';
import {
  deriveSignalingToken,
  hashSignalingToken,
} from '../src/transport/tokens.js';

describe('Real-Socket End-to-End Remote WebRTC Authentication Suite', () => {
  const TEST_PORT = 29876;
  const BASE_WS = `ws://127.0.0.1:${TEST_PORT}`;
  const TEST_TURN_SECRET = 'remote-e2e-turn-secret-token-abcdef123456';

  let signalingServer: SignalingServer;
  let certsDir: string;
  let deviceStore: DeviceStore;
  let signalingClient: SignalingClient;
  let rtcHostManager: RtcHostManager;

  beforeAll(async () => {
    // 1. Start real signaling server on loopback
    signalingServer = new SignalingServer({
      port: TEST_PORT,
      host: '127.0.0.1',
      turnSecret: TEST_TURN_SECRET,
      turnHost: '127.0.0.1',
    });
    await signalingServer.start();

    // 2. Initialize real DeviceStore with isolated temp directory
    certsDir = path.join(os.tmpdir(), `aerokin-test-certs-${Date.now()}`);
    fs.mkdirSync(certsDir, { recursive: true });
    deviceStore = new DeviceStore(certsDir);

    // 3. Connect real SignalingClient
    signalingClient = new SignalingClient({
      signalingUrl: BASE_WS,
      pcId: deviceStore.getPcId(),
      agentSecret: deviceStore.getAgentSecret(),
      clientTokenHashes: deviceStore.getSignalingTokenHashes(),
    });

    // 4. Initialize real RtcHostManager
    rtcHostManager = new RtcHostManager({
      signalingClient,
      deviceStore,
    });

    // Wait for agent registration
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(signalingClient.isConnected()).toBe(true);
  });

  afterAll(async () => {
    rtcHostManager?.closeAll();
    signalingClient?.close();
    await signalingServer?.stop();
    try {
      if (fs.existsSync(certsDir)) {
        fs.rmSync(certsDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('proves end-to-end remote handshake: phone join with signalingToken, offer/answer, DataChannel open, in-band auth, and control ping round-trip', async () => {
    // 1. Host agent approves new device
    const { deviceId, rawCredential, record } = deviceStore.addDevice('Allen iPhone', 'iOS Safari', {
      pairedVia: 'remote',
      remote: true,
    });

    // Host syncs new device's signaling token hash to signaling server
    signalingClient.addClientToken(record.signalingTokenHash!);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 2. Phone derives signalingToken on device (never sending rawCredential to signaling)
    const phoneSignalingToken = deriveSignalingToken(rawCredential);

    // 3. Phone connects to signaling server WebSocket
    const phoneSigWs = new WebSocket(BASE_WS);
    await new Promise((resolve) => phoneSigWs.on('open', resolve));

    const phoneSigMessages: any[] = [];

    // 5. Phone initializes WebRTC PeerConnection before joining
    const phonePc = new PeerConnection(deviceId, {
      iceServers: [],
    });

    // Attach signaling message handler early so answer/candidates are never missed
    phoneSigWs.on('message', (d) => {
      try {
        const msg = JSON.parse(d.toString());
        phoneSigMessages.push(msg);
        if (msg.type === 'answer' && msg.sdp) {
          phonePc.setRemoteDescription(msg.sdp, 'answer');
        } else if (msg.type === 'candidate' && msg.candidate) {
          const c = typeof msg.candidate === 'string' ? msg.candidate : msg.candidate.candidate;
          phonePc.addRemoteCandidate(c, msg.candidate.sdpMid || '0');
        }
      } catch {}
    });

    // Route ICE candidates from Phone to Signaling
    phonePc.onLocalCandidate((candidate, sdpMid) => {
      phoneSigWs.send(
        JSON.stringify({
          type: 'candidate',
          targetPeerId: deviceStore.getPcId(),
          senderPeerId: deviceId,
          candidate: { candidate, sdpMid },
        })
      );
    });

    // Route Offer from Phone to Signaling
    phonePc.onLocalDescription((sdp, type) => {
      if (type === 'offer') {
        phoneSigWs.send(
          JSON.stringify({
            type: 'offer',
            targetPeerId: deviceStore.getPcId(),
            senderPeerId: deviceId,
            sdp,
          })
        );
      }
    });

    // 4. Phone joins PC room using signalingToken
    phoneSigWs.send(
      JSON.stringify({
        type: 'join',
        pcId: deviceStore.getPcId(),
        clientId: deviceId,
        signalingToken: phoneSignalingToken,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    const joinedMsg = phoneSigMessages.find((m) => m.type === 'joined');
    expect(joinedMsg).toBeDefined();
    expect(joinedMsg.pcId).toBe(deviceStore.getPcId());
    expect(joinedMsg.clientId).toBe(deviceId);

    // Phone creates DataChannels (triggers offer generation)
    const phoneControlDc = phonePc.createDataChannel('control');
    const phoneInputDc = phonePc.createDataChannel('input');

    // 6. Wait for DataChannels to open on both ends
    let phoneControlOpened = false;
    phoneControlDc.onOpen(() => {
      phoneControlOpened = true;
    });

    for (let i = 0; i < 50; i++) {
      if (phoneControlOpened && phoneControlDc.isOpen()) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(phoneControlOpened).toBe(true);

    // 7. In-Band Mutual Authentication:
    // Phone sends device credential over the encrypted 'control' DataChannel using protocol framing
    const clientReassembler = new RtcMessageReassembler();
    const controlReplies: any[] = [];
    phoneControlDc.onMessage((raw: string | Buffer) => {
      const packet = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw;
      const full = clientReassembler.processChunk(new Uint8Array(packet));
      if (full) {
        try {
          controlReplies.push(JSON.parse(new TextDecoder().decode(full)));
        } catch {}
      }
    });

    const sendClientMsg = (dc: any, payload: string) => {
      const chunks = chunkDataChannelMessage(payload, Math.floor(Math.random() * 10000) + 1);
      for (const c of chunks) {
        dc.sendMessageBinary(Buffer.from(c));
      }
    };

    sendClientMsg(
      phoneControlDc,
      JSON.stringify({
        type: 'auth',
        deviceId,
        credential: rawCredential,
      })
    );

    for (let i = 0; i < 30; i++) {
      if (controlReplies.some((r) => r.type === 'auth_ok')) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const authOkMsg = controlReplies.find((r) => r.type === 'auth_ok');
    expect(authOkMsg).toBeDefined();
    expect(authOkMsg.deviceId).toBe(deviceId);

    // 8. Control Ping / Pong round-trip test
    const pingTimestamp = Date.now();
    sendClientMsg(
      phoneControlDc,
      JSON.stringify({
        type: 'ping',
        t: pingTimestamp,
      })
    );

    for (let i = 0; i < 30; i++) {
      if (controlReplies.some((r) => r.type === 'pong')) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const pongMsg = controlReplies.find((r) => r.type === 'pong');
    expect(pongMsg).toBeDefined();
    expect(pongMsg.t).toBe(pingTimestamp);

    // Cleanup
    phoneControlDc.close();
    phoneInputDc.close();
    phonePc.close();
    phoneSigWs.close();
  });

  it('rejects phone join when signalingToken is wrong or unregistered with AUTH_FAILED', async () => {
    const intruderWs = new WebSocket(BASE_WS);
    await new Promise((resolve) => intruderWs.on('open', resolve));

    const intruderMessages: any[] = [];
    intruderWs.on('message', (d) => intruderMessages.push(JSON.parse(d.toString())));

    intruderWs.send(
      JSON.stringify({
        type: 'join',
        pcId: deviceStore.getPcId(),
        clientId: 'rogue-attacker-device',
        signalingToken: 'totally-invalid-signaling-token-hex-1234',
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    const authFailed = intruderMessages.find((m) => m.type === 'error' && m.code === 'AUTH_FAILED');
    expect(authFailed).toBeDefined();

    intruderWs.close();
  });

  it('rejects in-band authentication and terminates session when rawCredential is invalid', async () => {
    const { deviceId, rawCredential, record } = deviceStore.addDevice('Test Dev 2', 'Browser');
    signalingClient.addClientToken(record.signalingTokenHash!);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const phoneSignalingToken = deriveSignalingToken(rawCredential);
    const phoneSigWs = new WebSocket(BASE_WS);
    await new Promise((resolve) => phoneSigWs.on('open', resolve));

    const phoneSigMessages: any[] = [];
    const phonePc = new PeerConnection(deviceId, { iceServers: [] });

    phoneSigWs.on('message', (d) => {
      try {
        const msg = JSON.parse(d.toString());
        phoneSigMessages.push(msg);
        if (msg.type === 'answer' && msg.sdp) {
          phonePc.setRemoteDescription(msg.sdp, 'answer');
        } else if (msg.type === 'candidate' && msg.candidate) {
          const c = typeof msg.candidate === 'string' ? msg.candidate : msg.candidate.candidate;
          phonePc.addRemoteCandidate(c, msg.candidate.sdpMid || '0');
        }
      } catch {}
    });

    phonePc.onLocalCandidate((candidate, sdpMid) => {
      phoneSigWs.send(
        JSON.stringify({
          type: 'candidate',
          targetPeerId: deviceStore.getPcId(),
          senderPeerId: deviceId,
          candidate: { candidate, sdpMid },
        })
      );
    });

    phonePc.onLocalDescription((sdp, type) => {
      if (type === 'offer') {
        phoneSigWs.send(
          JSON.stringify({
            type: 'offer',
            targetPeerId: deviceStore.getPcId(),
            senderPeerId: deviceId,
            sdp,
          })
        );
      }
    });

    phoneSigWs.send(
      JSON.stringify({
        type: 'join',
        pcId: deviceStore.getPcId(),
        clientId: deviceId,
        signalingToken: phoneSignalingToken,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    const joinedMsg = phoneSigMessages.find((m) => m.type === 'joined');
    expect(joinedMsg).toBeDefined();

    const controlDc = phonePc.createDataChannel('control');

    let opened = false;
    controlDc.onOpen(() => {
      opened = true;
    });

    for (let i = 0; i < 50; i++) {
      if (opened && controlDc.isOpen()) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(opened).toBe(true);

    const clientReassembler2 = new RtcMessageReassembler();
    const replies: any[] = [];
    controlDc.onMessage((raw: string | Buffer) => {
      const packet = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw;
      const full = clientReassembler2.processChunk(new Uint8Array(packet));
      if (full) {
        try {
          replies.push(JSON.parse(new TextDecoder().decode(full)));
        } catch {}
      }
    });

    const sendClientMsg2 = (dc: any, payload: string) => {
      const chunks = chunkDataChannelMessage(payload, 42);
      for (const c of chunks) {
        dc.sendMessageBinary(Buffer.from(c));
      }
    };

    // Send forged/tampered credential
    sendClientMsg2(
      controlDc,
      JSON.stringify({
        type: 'auth',
        deviceId,
        credential: 'INCORRECT_RAW_CREDENTIAL_XYZ',
      })
    );

    for (let i = 0; i < 30; i++) {
      if (replies.some((r) => r.type === 'auth_failed')) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const authFailed = replies.find((r) => r.type === 'auth_failed');
    expect(authFailed).toBeDefined();

    controlDc.close();
    phonePc.close();
    phoneSigWs.close();
  });

  it('rejects phone join after device revocation by host PC', async () => {
    const { deviceId, rawCredential, record } = deviceStore.addDevice('Revoke Target', 'Browser');
    signalingClient.addClientToken(record.signalingTokenHash!);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Host revokes device
    deviceStore.revokeDevice(deviceId);
    signalingClient.removeClientToken(record.signalingTokenHash!);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Revoked device attempts to join signaling
    const phoneSignalingToken = deriveSignalingToken(rawCredential);
    const phoneSigWs = new WebSocket(BASE_WS);
    await new Promise((resolve) => phoneSigWs.on('open', resolve));

    const messages: any[] = [];
    phoneSigWs.on('message', (d) => messages.push(JSON.parse(d.toString())));

    phoneSigWs.send(
      JSON.stringify({
        type: 'join',
        pcId: deviceStore.getPcId(),
        clientId: deviceId,
        signalingToken: phoneSignalingToken,
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 100));
    const authFailed = messages.find((m) => m.type === 'error' && m.code === 'AUTH_FAILED');
    expect(authFailed).toBeDefined();

    phoneSigWs.close();
  });

  it('enforces IP ban after 5 consecutive failed authentication attempts', async () => {
    for (let i = 0; i < 5; i++) {
      try {
        const badWs = new WebSocket(BASE_WS);
        badWs.on('error', () => {});
        await new Promise((resolve) => {
          badWs.on('open', resolve);
          badWs.on('error', resolve);
        });
        if (badWs.readyState === WebSocket.OPEN) {
          badWs.send(
            JSON.stringify({
              type: 'join',
              pcId: deviceStore.getPcId(),
              clientId: `intruder-${i}`,
              signalingToken: `invalid-token-${i}`,
            })
          );
          await new Promise((resolve) => setTimeout(resolve, 40));
          badWs.close();
        }
      } catch {}
    }

    // Now requests from 127.0.0.1 are banned with 429 Too Many Requests
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(res.status).toBe(429);
    const json: any = await res.json();
    expect(json.error).toMatch(/too many/i);
  });
});
