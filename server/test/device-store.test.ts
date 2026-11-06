import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DeviceStore } from '../src/device-store.js';

describe('DeviceStore', () => {
  let tempDir: string;
  let store: DeviceStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aerokin-devicestore-test-'));
    store = new DeviceStore(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores ONLY SHA-256 hashes on disk, NEVER the raw credential', () => {
    const { deviceId, rawCredential } = store.addDevice("Allen's iPhone", 'iOS');

    expect(deviceId).toBeTruthy();
    expect(rawCredential).toBeTruthy();
    expect(typeof rawCredential).toBe('string');
    expect(rawCredential.length).toBeGreaterThanOrEqual(40); // 32 bytes base64url ~43 chars

    // Read the raw file from disk
    const diskPath = path.join(tempDir, 'devices.json');
    expect(fs.existsSync(diskPath)).toBe(true);

    const fileContent = fs.readFileSync(diskPath, 'utf8');
    // Raw credential must NOT appear in the JSON file on disk
    expect(fileContent).not.toContain(rawCredential);

    // Compute expected hash
    const expectedHash = crypto.createHash('sha256').update(rawCredential).digest('hex');
    expect(fileContent).toContain(expectedHash);
  });

  it('verifies valid raw credential and rejects incorrect or tampered credential', () => {
    const { deviceId, rawCredential } = store.addDevice("Allen's iPad", 'iOS');

    // Valid credential matches
    expect(store.verifyCredential(deviceId, rawCredential)).toBe(true);

    // Wrong credential fails
    expect(store.verifyCredential(deviceId, 'wrong-credential-value')).toBe(false);

    // Wrong deviceId fails
    expect(store.verifyCredential('non-existent-device-id', rawCredential)).toBe(false);

    // Empty or non-string fails
    expect(store.verifyCredential(deviceId, '')).toBe(false);
  });

  it('lists devices without exposing credentialHash', () => {
    const { deviceId } = store.addDevice('Living Room Controller', 'Web');
    const list = store.listDevices();

    expect(list.length).toBe(1);
    expect(list[0].deviceId).toBe(deviceId);
    expect(list[0].name).toBe('Living Room Controller');
    expect(list[0].platform).toBe('Web');
    expect(list[0].revoked).toBe(false);
    expect((list[0] as any).credentialHash).toBeUndefined();
  });

  it('renames device and persists to disk', () => {
    const { deviceId } = store.addDevice('Old Name', 'iOS');
    const ok = store.renameDevice(deviceId, 'New Name');
    expect(ok).toBe(true);

    // Verify in-memory
    const dev = store.getDevice(deviceId);
    expect(dev?.name).toBe('New Name');

    // Verify after reload from disk
    const reloadedStore = new DeviceStore(tempDir);
    expect(reloadedStore.getDevice(deviceId)?.name).toBe('New Name');
  });

  it('revokes device so verifyCredential returns false', () => {
    const { deviceId, rawCredential } = store.addDevice('Test Phone', 'iOS');
    expect(store.verifyCredential(deviceId, rawCredential)).toBe(true);

    const revokedOk = store.revokeDevice(deviceId);
    expect(revokedOk).toBe(true);

    // Now verification must fail
    expect(store.verifyCredential(deviceId, rawCredential)).toBe(false);

    // Reloaded store must also reject
    const reloadedStore = new DeviceStore(tempDir);
    expect(reloadedStore.verifyCredential(deviceId, rawCredential)).toBe(false);
  });

  it('revokeAllDevices revokes all devices or all except current device', () => {
    const dev1 = store.addDevice('Device 1', 'iOS');
    const dev2 = store.addDevice('Device 2', 'Android');
    const dev3 = store.addDevice('Device 3', 'Web');

    // Revoke all except dev2
    const revoked = store.revokeAllDevices(dev2.deviceId);
    expect(revoked).toContain(dev1.deviceId);
    expect(revoked).toContain(dev3.deviceId);
    expect(revoked).not.toContain(dev2.deviceId);

    expect(store.verifyCredential(dev1.deviceId, dev1.rawCredential)).toBe(false);
    expect(store.verifyCredential(dev2.deviceId, dev2.rawCredential)).toBe(true);
    expect(store.verifyCredential(dev3.deviceId, dev3.rawCredential)).toBe(false);

    // Now revoke all completely
    store.revokeAllDevices();
    expect(store.verifyCredential(dev2.deviceId, dev2.rawCredential)).toBe(false);
  });

  it('handles corrupt JSON gracefully by initializing empty state', () => {
    const diskPath = path.join(tempDir, 'devices.json');
    fs.writeFileSync(diskPath, '{{invalid-json-content', 'utf8');

    const corruptStore = new DeviceStore(tempDir);
    expect(corruptStore.listDevices()).toEqual([]);
  });

  it('generates and persists persistent PC identity', () => {
    const pcId = store.getPcId();
    expect(pcId).toMatch(/^pc_[a-f0-9]{12}$/);

    const identity = store.getPcIdentity();
    expect(identity.pcId).toBe(pcId);
    expect(typeof identity.name).toBe('string');
    expect(identity.name.length).toBeGreaterThan(0);

    // Verify persisted to disk and reloaded
    const reloaded = new DeviceStore(tempDir);
    expect(reloaded.getPcId()).toBe(pcId);
    expect(reloaded.getPcIdentity().createdAt).toBe(identity.createdAt);
  });

  it('records pairedVia and remote flags correctly', () => {
    const lanDev = store.addDevice('LAN Phone', 'iOS', { pairedVia: 'lan' });
    expect(lanDev.record.pairedVia).toBe('lan');
    expect(lanDev.record.remote).toBe(false);

    const remoteDev = store.addDevice('Remote Phone', 'iOS', { pairedVia: 'remote' });
    expect(remoteDev.record.pairedVia).toBe('remote');
    expect(remoteDev.record.remote).toBe(true);

    const reloaded = new DeviceStore(tempDir);
    expect(reloaded.getDevice(lanDev.deviceId)?.pairedVia).toBe('lan');
    expect(reloaded.getDevice(lanDev.deviceId)?.remote).toBe(false);
    expect(reloaded.getDevice(remoteDev.deviceId)?.pairedVia).toBe('remote');
    expect(reloaded.getDevice(remoteDev.deviceId)?.remote).toBe(true);
  });
});