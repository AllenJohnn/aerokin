export const SIGNALING_PROTOCOL_PURPOSE = 'aerokin-signaling-v1';

/**
 * Derives the signaling token on the client using WebCrypto HMAC-SHA256.
 * The raw device credential is never transmitted to the signaling server.
 */
export async function deriveSignalingToken(credential: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = enc.encode(credential);
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto ? window.crypto : (globalThis as any).crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('WebCrypto subtle is required for signaling token derivation');
  }
  const key = await cryptoObj.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await cryptoObj.subtle.sign(
    'HMAC',
    key,
    enc.encode(SIGNALING_PROTOCOL_PURPOSE)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
