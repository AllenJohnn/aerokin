import path from 'node:path';
import { fileURLToPath } from 'node:url';
import qrcode from 'qrcode-terminal';
import { getLocalIPv4 } from './network.js';
import { getOrCreateToken } from './token.js';
import { getOrCreateLocalCaAndCert } from './ca.js';
import { startTrustServer } from './trust-server.js';
import { startServer } from './server.js';
import { startMdnsAdvertisement } from './mdns.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTTPS_PORT = 8443;
const HTTP_TRUST_PORT = 8080;
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CERTS_DIR = path.join(ROOT_DIR, '.certs');

async function main() {
  const lanIp = getLocalIPv4();
  const token = getOrCreateToken(CERTS_DIR);

  // Initialize or verify AEROKIN Local CA & 365-day Leaf Cert
  const certs = getOrCreateLocalCaAndCert(CERTS_DIR, lanIp);

  // 1. Start HTTP Trust Server on port 8080
  startTrustServer({
    port: HTTP_TRUST_PORT,
    lanIp,
    httpsPort: HTTPS_PORT,
    caCertDer: certs.caCertDer,
    mobileconfig: certs.mobileconfig,
  });

  // 2. Start HTTPS & WebSocket Server on port 8443
  startServer({
    port: HTTPS_PORT,
    lanIp,
    token,
    publicDir: PUBLIC_DIR,
    certsDir: CERTS_DIR,
  });

  // 3. Start best-effort mDNS advertisement of aerokin.local
  startMdnsAdvertisement(HTTPS_PORT, lanIp);

  const trustUrl = `http://${lanIp}:${HTTP_TRUST_PORT}`;
  const pairUrl = `https://${lanIp}:${HTTPS_PORT}/?token=${token}`;
  const mdnsPairUrl = `https://aerokin.local:${HTTPS_PORT}/?token=${token}`;

  // Print startup banner and both QR codes
  console.log('\n======================================================');
  console.log('              ✦ AEROKIN SERVER ✦                      ');
  console.log('         "Move the air. Move your PC."                ');
  console.log('======================================================\n');
  console.log(`[Status]  HTTPS & WebSocket listening on port ${HTTPS_PORT}`);
  console.log(`[Trust]   HTTP CA Profile server on port ${HTTP_TRUST_PORT}`);
  console.log(`[Network] Wi-Fi IPv4: ${lanIp}`);
  console.log(`[Token]   Auth Token: ${token} (saved in .certs/token.txt)`);
  console.log(`[mDNS]    Host alias: aerokin.local\n`);

  console.log('------------------------------------------------------');
  console.log('  QR #1: ONE-TIME IPHONE TRUST SETUP (60 SECONDS)');
  console.log('  Scan to install AEROKIN Local CA (zero SSL warnings):');
  console.log(`  URL: ${trustUrl}`);
  console.log('------------------------------------------------------');
  qrcode.generate(trustUrl, { small: true });

  console.log('\n------------------------------------------------------');
  console.log('  QR #2: CONNECT IPHONE AIR MOUSE & REMOTE');
  console.log('  Scan to launch AEROKIN directly on your iPhone:');
  console.log(`  LAN URL:  ${pairUrl}`);
  console.log(`  mDNS URL: ${mdnsPairUrl}`);
  console.log('------------------------------------------------------');
  qrcode.generate(pairUrl, { small: true });

  const rawHosted = (process.env.AEROKIN_HOSTED_URL || '').trim().replace(/\/+$/, '');
  const hostedPairUrl = rawHosted
    ? `${rawHosted}/#host=${lanIp}:${HTTPS_PORT}&code=${token}`
    : undefined;

  if (hostedPairUrl && rawHosted) {
    console.log('\n------------------------------------------------------');
    console.log('  QR #3: CONNECT VIA HOSTED STATIC PWA');
    console.log(`  Hosted static app: ${rawHosted}`);
    console.log(`  Pair URL:          ${hostedPairUrl}`);
    console.log('------------------------------------------------------');
    qrcode.generate(hostedPairUrl, { small: true });
  }

  console.log('\n------------------------------------------------------');
  console.log('TIPS:');
  console.log('• On Laptop: Run "pnpm run trust" once to eliminate browser warnings on PC.');
  console.log('• On iPhone: Open QR #1, install profile, enable in Certificate Trust Settings.');
  console.log('• Debug Keys: Visit https://localhost:8443/debug/keys on PC to test keystrokes.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('[AEROKIN Error] Fatal server error:', err);
  process.exit(1);
});
