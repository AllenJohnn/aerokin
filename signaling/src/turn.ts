import crypto from 'node:crypto';
import { TurnCredentialsResponse, IceServerConfig } from './types.js';

export interface TurnOptions {
  secret: string;
  turnHost: string;
  udpPort?: number;
  tcpPort?: number;
  tlsPort?: number;
  ttlSeconds?: number;
  usernamePrefix?: string;
}

/**
 * Generates time-limited ephemeral credentials for Coturn using the standard REST API HMAC-SHA1 algorithm.
 *
 * Coturn specification:
 * Username: <timestamp>:<usernamePrefix>
 * Password: Base64(HMAC-SHA1(shared_secret, Username))
 */
export function generateTurnCredentials(options: TurnOptions): TurnCredentialsResponse {
  const {
    secret,
    turnHost,
    udpPort = 3478,
    tcpPort = 3478,
    tlsPort = 5349,
    ttlSeconds = 86400, // 24 hours
    usernamePrefix = 'aerokin-client',
  } = options;

  const nowEpochSec = Math.floor(Date.now() / 1000);
  const expiryTimestamp = nowEpochSec + ttlSeconds;
  const username = `${expiryTimestamp}:${usernamePrefix}`;

  // HMAC-SHA1 calculation
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');

  const iceServers: IceServerConfig[] = [
    // 1. STUN server (NAT discovery, free, zero relay cost)
    {
      urls: [`stun:${turnHost}:${udpPort}`, `stun:${turnHost}:${tcpPort}`],
    },
    // 2. TURN UDP (fastest relay fallback if direct P2P is blocked)
    {
      urls: `turn:${turnHost}:${udpPort}?transport=udp`,
      username,
      credential,
    },
    // 3. TURN TCP (firewall-friendly fallback if UDP is filtered)
    {
      urls: `turn:${turnHost}:${tcpPort}?transport=tcp`,
      username,
      credential,
    },
    // 4. TURNS TLS (TLS encrypted relay on port 5349)
    {
      urls: `turns:${turnHost}:${tlsPort}?transport=tcp`,
      username,
      credential,
    },
  ];

  return {
    username,
    credential,
    ttlSeconds,
    expiresAt: expiryTimestamp * 1000,
    iceServers,
  };
}

/**
 * Validates whether a given username and credential pair is valid against the coturn secret.
 */
export function verifyTurnCredentials(
  secret: string,
  username: string,
  credential: string
): boolean {
  if (!username || !credential) return false;

  const parts = username.split(':');
  if (parts.length < 2) return false;

  const expiryTimestamp = parseInt(parts[0], 10);
  if (isNaN(expiryTimestamp)) return false;

  const nowEpochSec = Math.floor(Date.now() / 1000);
  if (nowEpochSec > expiryTimestamp) {
    // Expired
    return false;
  }

  const expected = crypto.createHmac('sha1', secret).update(username).digest('base64');

  try {
    const credBuf = Buffer.from(credential);
    const expBuf = Buffer.from(expected);
    return credBuf.length === expBuf.length && crypto.timingSafeEqual(credBuf, expBuf);
  } catch {
    return false;
  }
}
