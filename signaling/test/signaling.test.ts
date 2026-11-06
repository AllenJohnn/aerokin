import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import http from 'node:http';
import {
  generateTurnCredentials,
  verifyTurnCredentials,
} from '../src/turn.js';
import { SignalingServer } from '../src/server.js';
import {
  deriveSignalingToken,
  hashSignalingToken,
  hashAgentSecret,
} from '../src/tokens.js';

describe('AEROKIN WebRTC Signaling & Coturn REST Credential Suite', () => {
  const TEST_SECRET = 'super-secret-turn-token-for-tests-123456';
  const TEST_HOST = 'turn.test.aerokin.com';

  describe('Coturn Ephemeral HMAC-SHA1 Token Generation', () => {
    it('generates well-formed username with timestamp expiry', () => {
      const creds = generateTurnCredentials({
        secret: TEST_SECRET,
        turnHost: TEST_HOST,
        ttlSeconds: 3600,
        usernamePrefix: 'test-user',
      });

      expect(creds.username).toMatch(/^\d+:test-user$/);
      expect(typeof creds.credential).toBe('string');
      expect(creds.credential.length).toBeGreaterThan(10);
      expect(creds.ttlSeconds).toBe(3600);
      expect(creds.expiresAt).toBeGreaterThan(Date.now());
    });

    it('generates standard STUN, TURN UDP, TURN TCP, and TURNS TLS iceServers', () => {
      const creds = generateTurnCredentials({
        secret: TEST_SECRET,
        turnHost: TEST_HOST,
      });

      expect(creds.iceServers.length).toBe(4);

      // STUN
      expect(creds.iceServers[0].urls).toEqual([
        `stun:${TEST_HOST}:3478`,
        `stun:${TEST_HOST}:3478`,
      ]);

      // TURN UDP
      expect(creds.iceServers[1].urls).toBe(`turn:${TEST_HOST}:3478?transport=udp`);
      expect(creds.iceServers[1].username).toBe(creds.username);
      expect(creds.iceServers[1].credential).toBe(creds.credential);

      // TURN TCP
      expect(creds.iceServers[2].urls).toBe(`turn:${TEST_HOST}:3478?transport=tcp`);

      // TURNS TLS
      expect(creds.iceServers[3].urls).toBe(`turns:${TEST_HOST}:5349?transport=tcp`);
    });

    it('verifies valid generated credentials using verifyTurnCredentials', () => {
      const creds = generateTurnCredentials({
        secret: TEST_SECRET,
        turnHost: TEST_HOST,
      });

      expect(verifyTurnCredentials(TEST_SECRET, creds.username, creds.credential)).toBe(true);
    });

    it('rejects tampered or wrong-secret credentials', () => {
      const creds = generateTurnCredentials({
        secret: TEST_SECRET,
        turnHost: TEST_HOST,
      });

      // Wrong secret
      expect(verifyTurnCredentials('wrong-secret-key', creds.username, creds.credential)).toBe(false);

      // Tampered username
      expect(verifyTurnCredentials(TEST_SECRET, '123456:hacked', creds.credential)).toBe(false);

      // Tampered credential
      expect(verifyTurnCredentials(TEST_SECRET, creds.username, 'corrupted-base64-creds==')).toBe(false);
    });

    it('rejects expired credentials', () => {
      // Negative TTL generates already-expired timestamp
      const creds = generateTurnCredentials({
        secret: TEST_SECRET,
        turnHost: TEST_HOST,
        ttlSeconds: -100,
      });

      expect(verifyTurnCredentials(TEST_SECRET, creds.username, creds.credential)).toBe(false);
    });
  });

  describe('SignalingServer HTTP & WebSocket Protocol with Hardened Auth', () => {
    let server: SignalingServer;
    const TEST_PORT = 19876;
    const BASE_HTTP = `http://127.0.0.1:${TEST_PORT}`;
    const BASE_WS = `ws://127.0.0.1:${TEST_PORT}`;

    beforeAll(async () => {
      server = new SignalingServer({
        port: TEST_PORT,
        host: '127.0.0.1',
        turnSecret: TEST_SECRET,
        turnHost: TEST_HOST,
      });
      await server.start();
    });

    afterAll(async () => {
      await server.stop();
    });

    it('serves GET /health with active status and room count', async () => {
      const res = await fetch(`${BASE_HTTP}/health`);
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.status).toBe('ok');
      expect(json.service).toBe('aerokin-signaling');
      expect(json.activeRooms).toBe(0);
    });

    it('handles full WebRTC handshake: PC register -> Phone join with signalingToken -> SDP offer/answer -> ICE candidate', async () => {
      const pcWs = new WebSocket(BASE_WS);
      const phoneWs = new WebSocket(BASE_WS);

      await Promise.all([
        new Promise((resolve) => pcWs.on('open', resolve)),
        new Promise((resolve) => phoneWs.on('open', resolve)),
      ]);

      const pcMessages: any[] = [];
      const phoneMessages: any[] = [];

      pcWs.on('message', (d) => pcMessages.push(JSON.parse(d.toString())));
      phoneWs.on('message', (d) => phoneMessages.push(JSON.parse(d.toString())));

      const rawPhoneCredential = 'phone-device-credential-32-byte-hex-str';
      const phoneSignalingToken = deriveSignalingToken(rawPhoneCredential);
      const phoneTokenHash = hashSignalingToken(phoneSignalingToken);

      // 1. PC registers presence with pcId, agentSecret, and paired clientTokenHashes
      pcWs.send(
        JSON.stringify({
          type: 'register',
          pcId: 'pc-workstation-01',
          agentSecret: 'my-desktop-secret-token-xyz',
          clientTokenHashes: [phoneTokenHash],
        })
      );

      // Wait for registration confirmation
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(pcMessages.some((m) => m.type === 'registered' && m.pcId === 'pc-workstation-01')).toBe(true);
      expect(server.getRoomCount()).toBe(1);

      // 2. Phone connects and joins PC room with signalingToken
      phoneWs.send(
        JSON.stringify({
          type: 'join',
          pcId: 'pc-workstation-01',
          clientId: 'phone-iphone15',
          signalingToken: phoneSignalingToken,
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(phoneMessages.some((m) => m.type === 'joined' && m.clientId === 'phone-iphone15')).toBe(true);
      expect(pcMessages.some((m) => m.type === 'peer_joined' && m.peerId === 'phone-iphone15')).toBe(true);

      // 3. Phone sends SDP offer targeted to PC
      phoneWs.send(
        JSON.stringify({
          type: 'offer',
          targetPeerId: 'pc-workstation-01',
          senderPeerId: 'phone-iphone15',
          sdp: 'v=0\r\no=aerokin-offer-test-sdp',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      const receivedOffer = pcMessages.find((m) => m.type === 'offer');
      expect(receivedOffer).toBeDefined();
      expect(receivedOffer.sdp).toBe('v=0\r\no=aerokin-offer-test-sdp');
      expect(receivedOffer.senderPeerId).toBe('phone-iphone15');

      // 4. PC sends SDP answer targeted to Phone
      pcWs.send(
        JSON.stringify({
          type: 'answer',
          targetPeerId: 'phone-iphone15',
          senderPeerId: 'pc-workstation-01',
          sdp: 'v=0\r\no=aerokin-answer-test-sdp',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      const receivedAnswer = phoneMessages.find((m) => m.type === 'answer');
      expect(receivedAnswer).toBeDefined();
      expect(receivedAnswer.sdp).toBe('v=0\r\no=aerokin-answer-test-sdp');
      expect(receivedAnswer.senderPeerId).toBe('pc-workstation-01');

      // 5. Trickle ICE candidate from Phone to PC
      phoneWs.send(
        JSON.stringify({
          type: 'candidate',
          targetPeerId: 'pc-workstation-01',
          senderPeerId: 'phone-iphone15',
          candidate: { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 50000 typ host', sdpMid: '0' },
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      const receivedCandidate = pcMessages.find((m) => m.type === 'candidate');
      expect(receivedCandidate).toBeDefined();
      expect(receivedCandidate.candidate.sdpMid).toBe('0');

      // 6. Disconnect PC -> Phone receives peer_left
      pcWs.close();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(phoneMessages.some((m) => m.type === 'peer_left' && m.peerId === 'pc-workstation-01')).toBe(true);

      phoneWs.close();
    });

    it('allows dynamic add_client_token and remove_client_token by host PC', async () => {
      const pcWs = new WebSocket(BASE_WS);
      const phone2Ws = new WebSocket(BASE_WS);

      await Promise.all([
        new Promise((resolve) => pcWs.on('open', resolve)),
        new Promise((resolve) => phone2Ws.on('open', resolve)),
      ]);

      const agentSecret = 'agent-secret-dyn-tokens-test';
      pcWs.send(
        JSON.stringify({
          type: 'register',
          pcId: 'pc-dyn-tokens',
          agentSecret,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      const phone2Token = deriveSignalingToken('cred-phone-2');
      const phone2Hash = hashSignalingToken(phone2Token);

      // Add phone 2 token
      pcWs.send(
        JSON.stringify({
          type: 'add_client_token',
          pcId: 'pc-dyn-tokens',
          agentSecret,
          tokenHash: phone2Hash,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      const phone2Messages: any[] = [];
      phone2Ws.on('message', (d) => phone2Messages.push(JSON.parse(d.toString())));

      phone2Ws.send(
        JSON.stringify({
          type: 'join',
          pcId: 'pc-dyn-tokens',
          clientId: 'phone-2',
          signalingToken: phone2Token,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(phone2Messages.some((m) => m.type === 'joined')).toBe(true);

      // Now host PC removes client token -> Phone 2 is disconnected with TOKEN_REVOKED
      pcWs.send(
        JSON.stringify({
          type: 'remove_client_token',
          pcId: 'pc-dyn-tokens',
          agentSecret,
          tokenHash: phone2Hash,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(phone2Messages.some((m) => m.type === 'error' && m.code === 'TOKEN_REVOKED')).toBe(true);

      pcWs.close();
      phone2Ws.close();
    });

    it('rejects phone join when signalingToken is not in registered hashes with AUTH_FAILED', async () => {
      const pcWs = new WebSocket(BASE_WS);
      const badPhoneWs = new WebSocket(BASE_WS);

      await Promise.all([
        new Promise((resolve) => pcWs.on('open', resolve)),
        new Promise((resolve) => badPhoneWs.on('open', resolve)),
      ]);

      const phoneMessages: any[] = [];
      badPhoneWs.on('message', (d) => phoneMessages.push(JSON.parse(d.toString())));

      // Register PC
      pcWs.send(
        JSON.stringify({
          type: 'register',
          pcId: 'pc-secure-room-2',
          agentSecret: 'correct-secret-456',
          clientTokenHashes: ['registered-hash-abc'],
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Attempt join with wrong/unregistered token
      badPhoneWs.send(
        JSON.stringify({
          type: 'join',
          pcId: 'pc-secure-room-2',
          clientId: 'intruder',
          signalingToken: 'WRONG-UNREGISTERED-TOKEN',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(phoneMessages.some((m) => m.type === 'error' && m.code === 'AUTH_FAILED')).toBe(true);

      pcWs.close();
      badPhoneWs.close();
    });

    it('rejects phone join when host PC is offline with PC_OFFLINE', async () => {
      const phoneWs = new WebSocket(BASE_WS);
      await new Promise((resolve) => phoneWs.on('open', resolve));

      const phoneMessages: any[] = [];
      phoneWs.on('message', (d) => phoneMessages.push(JSON.parse(d.toString())));

      phoneWs.send(
        JSON.stringify({
          type: 'join',
          pcId: 'non-existent-pc-id',
          clientId: 'phone-lonely',
          signalingToken: 'some-token',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(phoneMessages.some((m) => m.type === 'error' && m.code === 'PC_OFFLINE')).toBe(true);

      phoneWs.close();
    });
  });
});
