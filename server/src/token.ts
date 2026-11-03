import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Loads or generates an authentication token in server/.certs/token.txt.
 * - Reuses existing token if present.
 * - Forces a new token when AEROKIN_NEW_TOKEN=1 is set or --new-token is passed.
 */
export function getOrCreateToken(certsDir: string): string {
  const tokenPath = path.join(certsDir, 'token.txt');
  const forceNew =
    process.env.AEROKIN_NEW_TOKEN === '1' || process.argv.includes('--new-token');

  if (!forceNew && fs.existsSync(tokenPath)) {
    try {
      const existing = fs.readFileSync(tokenPath, 'utf8').trim();
      if (existing.length === 6) {
        return existing;
      }
    } catch {
      // Fall through to generate if file cannot be read
    }
  }

  // Ensure .certs directory exists
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const newToken = crypto.randomBytes(3).toString('hex').toUpperCase();
  fs.writeFileSync(tokenPath, newToken, 'utf8');
  return newToken;
}
