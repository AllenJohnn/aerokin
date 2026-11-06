import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { deriveSignalingToken, hashSignalingToken } from './transport/tokens.js';

export interface PcIdentity {
  pcId: string;
  name: string;
  createdAt: number;
  agentSecret?: string;
}

export interface DeviceRecord {
  deviceId: string;
  name: string;
  platform: string;
  credentialHash: string; // SHA-256 hex digest of the 32-byte raw credential
  signalingTokenHash?: string; // SHA-256 hex digest of signalingToken = HMAC-SHA256(rawCredential, "aerokin-signaling-v1")
  createdAt: number;
  lastSeen: number;
  revoked: boolean;
  pairedVia?: 'lan' | 'remote';
  remote?: boolean;
}

export type DevicePublicInfo = Omit<DeviceRecord, 'credentialHash' | 'signalingTokenHash'>;

export class DeviceStore {
  private filePath: string;
  private identityFilePath: string;
  private devices: Map<string, DeviceRecord> = new Map();
  private pcIdentity: PcIdentity;

  constructor(certsDir: string) {
    if (!fs.existsSync(certsDir)) {
      fs.mkdirSync(certsDir, { recursive: true });
    }
    this.filePath = path.join(certsDir, 'devices.json');
    this.identityFilePath = path.join(certsDir, 'pc-identity.json');
    this.pcIdentity = this.loadOrCreatePcIdentity();
    this.load();
  }

  private loadOrCreatePcIdentity(): PcIdentity {
    if (fs.existsSync(this.identityFilePath)) {
      try {
        const raw = fs.readFileSync(this.identityFilePath, 'utf8').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.pcId === 'string' && parsed.pcId.startsWith('pc_')) {
            const agentSecret =
              typeof parsed.agentSecret === 'string' && parsed.agentSecret.length === 64
                ? parsed.agentSecret
                : crypto.randomBytes(32).toString('hex');

            const loaded: PcIdentity = {
              pcId: parsed.pcId,
              name: String(parsed.name || os.hostname()).slice(0, 64),
              createdAt: Number(parsed.createdAt) || Date.now(),
              agentSecret,
            };

            // If agentSecret was freshly generated, save back to disk
            if (!parsed.agentSecret) {
              try {
                fs.writeFileSync(this.identityFilePath, JSON.stringify(loaded, null, 2), {
                  encoding: 'utf8',
                  mode: 0o600,
                });
              } catch {}
            }

            return loaded;
          }
        }
      } catch {
        // fallback to generate new
      }
    }

    const newIdentity: PcIdentity = {
      pcId: `pc_${crypto.randomBytes(6).toString('hex')}`,
      name: (os.hostname() || 'AeroKin-PC').slice(0, 64),
      createdAt: Date.now(),
      agentSecret: crypto.randomBytes(32).toString('hex'),
    };

    try {
      fs.writeFileSync(this.identityFilePath, JSON.stringify(newIdentity, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {}

    return newIdentity;
  }

  public getPcId(): string {
    return this.pcIdentity.pcId;
  }

  public getAgentSecret(): string {
    return this.pcIdentity.agentSecret || '';
  }

  public getPcIdentity(): Omit<PcIdentity, 'agentSecret'> {
    return {
      pcId: this.pcIdentity.pcId,
      name: this.pcIdentity.name,
      createdAt: this.pcIdentity.createdAt,
    };
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      this.devices.clear();
      return;
    }
    try {
      const content = fs.readFileSync(this.filePath, 'utf8').trim();
      if (!content) {
        this.devices.clear();
        return;
      }
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        this.devices.clear();
        for (const item of parsed) {
          if (item && typeof item === 'object' && typeof item.deviceId === 'string') {
            this.devices.set(item.deviceId, {
              deviceId: item.deviceId,
              name: String(item.name || 'Unnamed Device').slice(0, 64),
              platform: String(item.platform || 'Unknown').slice(0, 32),
              credentialHash: String(item.credentialHash || ''),
              signalingTokenHash: item.signalingTokenHash ? String(item.signalingTokenHash) : undefined,
              createdAt: Number(item.createdAt) || Date.now(),
              lastSeen: Number(item.lastSeen) || Date.now(),
              revoked: Boolean(item.revoked),
              pairedVia: item.pairedVia === 'remote' ? 'remote' : 'lan',
              remote: Boolean(item.remote ?? (item.pairedVia === 'remote')),
            });
          }
        }
      }
    } catch {
      // Graceful fallback if file is malformed
      this.devices.clear();
    }
  }

  private save(): void {
    const list = Array.from(this.devices.values());
    const tempPath = `${this.filePath}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      throw err;
    }
  }

  /**
   * Generates a new 32-byte cryptographic credential for a newly approved device.
   * Stores ONLY the SHA-256 hash on disk; returns the raw credential ONCE for the client.
   */
  public addDevice(
    name: string,
    platform: string,
    options?: { pairedVia?: 'lan' | 'remote'; remote?: boolean }
  ): { deviceId: string; rawCredential: string; record: DeviceRecord } {
    const deviceId = `dev_${crypto.randomBytes(8).toString('hex')}`;
    const rawCredential = crypto.randomBytes(32).toString('base64url');
    const credentialHash = crypto.createHash('sha256').update(rawCredential).digest('hex');
    const signalingToken = deriveSignalingToken(rawCredential);
    const signalingTokenHash = hashSignalingToken(signalingToken);

    const pairedVia = options?.pairedVia === 'remote' ? 'remote' : 'lan';
    const remote = Boolean(options?.remote ?? (pairedVia === 'remote'));

    const record: DeviceRecord = {
      deviceId,
      name: name.trim().slice(0, 64) || 'Unknown Device',
      platform: platform.trim().slice(0, 32) || 'Browser',
      credentialHash,
      signalingTokenHash,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      revoked: false,
      pairedVia,
      remote,
    };

    this.devices.set(deviceId, record);
    this.save();

    return { deviceId, rawCredential, record };
  }

  /**
   * Timing-safe verification of the presented credential against the stored SHA-256 hash.
   */
  public verifyCredential(deviceId: string, presentedCredential: string): boolean {
    if (!deviceId || !presentedCredential || typeof presentedCredential !== 'string') {
      return false;
    }
    const record = this.devices.get(deviceId);
    if (!record || record.revoked) {
      return false;
    }

    const presentedHash = crypto.createHash('sha256').update(presentedCredential).digest();
    const storedHash = Buffer.from(record.credentialHash, 'hex');

    if (storedHash.length !== presentedHash.length) {
      return false;
    }

    const match = crypto.timingSafeEqual(storedHash, presentedHash);
    if (match) {
      this.updateLastSeen(deviceId);
    }
    return match;
  }

  public listDevices(): DevicePublicInfo[] {
    return Array.from(this.devices.values()).map(
      ({ credentialHash: _, signalingTokenHash: __, ...publicInfo }) => ({ ...publicInfo })
    );
  }

  public getSignalingTokenHashes(): string[] {
    const hashes: string[] = [];
    for (const record of this.devices.values()) {
      if (!record.revoked && record.signalingTokenHash) {
        hashes.push(record.signalingTokenHash);
      }
    }
    return hashes;
  }

  public getSignalingTokenHashForDevice(deviceId: string): string | null {
    const record = this.devices.get(deviceId);
    if (!record || record.revoked || !record.signalingTokenHash) {
      return null;
    }
    return record.signalingTokenHash;
  }

  public getDevice(deviceId: string): DevicePublicInfo | null {
    const record = this.devices.get(deviceId);
    if (!record) return null;
    const { credentialHash: _, ...publicInfo } = record;
    return publicInfo;
  }

  public renameDevice(deviceId: string, newName: string): boolean {
    const record = this.devices.get(deviceId);
    if (!record) return false;
    record.name = newName.trim().slice(0, 64) || record.name;
    this.save();
    return true;
  }

  public revokeDevice(deviceId: string): boolean {
    const record = this.devices.get(deviceId);
    if (!record) return false;
    record.revoked = true;
    this.save();
    return true;
  }

  /**
   * Revokes all devices, optionally exempting one (e.g. current device).
   * Returns an array of deviceIds that were newly revoked.
   */
  public revokeAllDevices(exceptDeviceId?: string): string[] {
    const revokedIds: string[] = [];
    for (const [id, record] of this.devices.entries()) {
      if (id !== exceptDeviceId && !record.revoked) {
        record.revoked = true;
        revokedIds.push(id);
      }
    }
    if (revokedIds.length > 0) {
      this.save();
    }
    return revokedIds;
  }

  public updateLastSeen(deviceId: string): void {
    const record = this.devices.get(deviceId);
    if (record) {
      record.lastSeen = Date.now();
      // Debounce saving last seen to disk every 30s
      if (!this.lastSeenSaveTimer) {
        this.lastSeenSaveTimer = setTimeout(() => {
          this.lastSeenSaveTimer = null;
          try { this.save(); } catch {}
        }, 30000);
      }
    }
  }

  private lastSeenSaveTimer: NodeJS.Timeout | null = null;
}
