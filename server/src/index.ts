import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import qrcode from 'qrcode-terminal';
import { getLocalIPv4 } from './network.js';
import { startServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8443;
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CERTS_DIR = path.join(ROOT_DIR, '.certs');

/**
 * Generates a random 6-character authentication token.
 */
function generateToken(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function main() {
  const lanIp = getLocalIPv4();
  const token = generateToken();
  const url = `https://${lanIp}:${PORT}/?token=${token}`;

  startServer({
    port: PORT,
    lanIp,
    token,
    publicDir: PUBLIC_DIR,
    certsDir: CERTS_DIR,
  });

  // Print console banner and QR code
  console.log('\n======================================================');
  console.log('              ✦ AEROKIN SERVER ✦                      ');
  console.log('         "Move the air. Move your PC."                ');
  console.log('======================================================\n');
  console.log(`[Status]  HTTPS & WebSocket listening on port ${PORT}`);
  console.log(`[Network] Wi-Fi IPv4: ${lanIp}`);
  console.log(`[Token]   Auth Token: ${token}`);
  console.log(`[Connect] URL:        ${url}\n`);
  console.log('Scan this QR code with your iPhone:');

  qrcode.generate(url, { small: true });

  console.log('\n------------------------------------------------------');
  console.log(`Pairing URL: ${url}`);
  console.log('Keep this terminal open while using AEROKIN.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('[AEROKIN Error] Fatal server error:', err);
  process.exit(1);
});
