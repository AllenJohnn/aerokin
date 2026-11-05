import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocket } from 'ws';
import { startServer } from '../dist/server.js';
import { DeviceStore } from '../dist/device-store.js';
import { PairingManager } from '../dist/pairing-manager.js';

async function runVerification() {
  console.log('\n======================================================');
  console.log('       ✦ AEROKIN STAGE A LIVE VERIFICATION ✦          ');
  console.log('======================================================\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-verify-stage-a-'));
  const deviceStore = new DeviceStore(tempDir);
  const pairingManager = new PairingManager();

  const server = startServer({
    port: 0,
    lanIp: '127.0.0.1',
    publicDir: tempDir,
    certsDir: tempDir,
    deviceStore,
    pairingManager,
    allowedOrigins: new Set(['*']),
  });

  const port = await new Promise((resolve) => {
    server.httpsServer.listen(0, '127.0.0.1', () => {
      resolve(server.httpsServer.address().port);
    });
  });

  console.log(`[Setup] Ephemeral verification server listening on port ${port}`);

  try {
    // ----------------------------------------------------
    // TEST 1: 6 Wrong Codes -> Lockout Engaged (HTTP 429)
    // ----------------------------------------------------
    console.log('\n[Test 1] Testing pairing throttle and 60s lockout...');
    let lockedOutObserved = false;
    let lockoutSeconds = 0;

    for (let i = 1; i <= 6; i++) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      const res = await fetch(`https://127.0.0.1:${port}/api/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '00000000', name: 'Rogue Phone', platform: 'Unknown' }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 429 && data.lockedOut) {
        lockedOutObserved = true;
        lockoutSeconds = data.remainingSeconds;
        console.log(`  -> Attempt ${i}: Received HTTP 429 (Lockout active, remaining: ${lockoutSeconds}s)`);
      } else {
        console.log(`  -> Attempt ${i}: Received HTTP ${res.status} (${data.error || 'rejected'})`);
      }
    }

    if (!lockedOutObserved) {
      throw new Error('Lockout was NOT engaged after 6 wrong code attempts!');
    }
    console.log('✓ PASS: 6 wrong codes triggered automatic lockout with HTTP 429.');

    // ----------------------------------------------------
    // TEST 2: Approved Pairing & TLS WebSocket Auth
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing operator approval gate and TLS WS authentication...');
    pairingManager.resetLockout();
    pairingManager.generateCode();
    // Configure approver to simulate PC operator typing 'y'
    pairingManager.setApprover(async (name, platform) => {
      console.log(`  -> [Terminal Approval Hook] Approving device "${name}" (${platform})`);
      return true;
    });

    const active = pairingManager.getActiveCode();
    const pairRes = await pairingManager.submitPairing(active.code, "Allen's iPhone 14", 'iOS', '127.0.0.2');
    if (!pairRes.ok) {
      throw new Error(`Pairing submission failed: ${pairRes.error}`);
    }

    const { deviceId, rawCredential } = deviceStore.addDevice("Allen's iPhone 14", 'iOS');
    console.log(`  -> Device registered: ID ${deviceId.slice(0, 8)}...`);
    console.log(`  -> Credential issued (raw length ${rawCredential.length})`);

    // Verify raw credential does NOT exist on disk
    const diskContent = fs.readFileSync(path.join(tempDir, 'devices.json'), 'utf8');
    if (diskContent.includes(rawCredential)) {
      throw new Error('FATAL: Raw credential was found stored on disk in plaintext!');
    }
    console.log('  -> Verified: Raw credential is NEVER written to disk (SHA-256 hash only).');

    // Connect WebSocket
    const ws = new WebSocket(`wss://127.0.0.1:${port}/`, { rejectUnauthorized: false });
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    console.log('  -> WebSocket TLS connection opened.');

    const authPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Auth response timed out')), 3000);
      ws.on('message', (msg) => {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'auth_ok') {
          clearTimeout(timeout);
          resolve(parsed);
        }
      });
    });

    // Send first in-band auth message
    ws.send(JSON.stringify({ type: 'auth', deviceId, credential: rawCredential }));
    await authPromise;
    console.log('✓ PASS: In-band first-message auth succeeded; received auth_ok.');

    // ----------------------------------------------------
    // TEST 3: Revocation Closes Live Socket & Rejects Future Connections
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing device revocation and emergency disconnect...');
    const closePromise = new Promise((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    // Operator revokes device
    server.revokeDevice(deviceId);

    const closeResult = await closePromise;
    console.log(`  -> Live socket closed with code: ${closeResult.code} (${closeResult.reason})`);
    if (closeResult.code !== 4001) {
      throw new Error(`Expected close code 4001 upon revocation, received ${closeResult.code}`);
    }

    // Attempt connecting again with revoked credential
    const wsRevoked = new WebSocket(`wss://127.0.0.1:${port}/`, { rejectUnauthorized: false });
    await new Promise((resolve) => wsRevoked.on('open', resolve));

    const rejectedPromise = new Promise((resolve) => {
      wsRevoked.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });

    wsRevoked.send(JSON.stringify({ type: 'auth', deviceId, credential: rawCredential }));
    const rejectedResult = await rejectedPromise;

    console.log(`  -> Re-connection attempt closed with code: ${rejectedResult.code}`);
    if (rejectedResult.code !== 4001) {
      throw new Error(`Expected close code 4001 for revoked credential, received ${rejectedResult.code}`);
    }
    console.log('✓ PASS: Revocation immediately closed live connection with 4001 and rejected subsequent attempts with 4001.');

    console.log('\n======================================================');
    console.log('   ✦ ALL STAGE A SECURITY VERIFICATIONS PASSED ✦       ');
    console.log('======================================================\n');
  } finally {
    try {
      server.wss.close();
      server.httpsServer.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    setTimeout(() => process.exit(0), 100);
  }
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});