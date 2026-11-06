import crypto from 'node:crypto';

export const SIGNALING_PROTOCOL_PURPOSE = 'aerokin-signaling-v1';

/**
 * Derives the signaling token on the client device using HMAC-SHA256 with purpose string.
 * The raw device credential is never transmitted to the signaling server.
 */
export function deriveSignalingToken(credential: string): string {
  return crypto
    .createHmac('sha256', credential)
    .update(SIGNALING_PROTOCOL_PURPOSE)
    .digest('hex');
}

/**
 * Computes the SHA-256 hash of a signaling token.
 * This is the value stored and checked by the signaling server.
 */
export function hashSignalingToken(signalingToken: string): string {
  return crypto.createHash('sha256').update(signalingToken).digest('hex');
}

/**
 * Computes the SHA-256 hash of the host agentSecret.
 */
export function hashAgentSecret(agentSecret: string): string {
  return crypto.createHash('sha256').update(agentSecret).digest('hex');
}

/**
 * Performs a timing-safe comparison between two hex strings.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length || a.length === 0) return false;
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
