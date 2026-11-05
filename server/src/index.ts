import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import qrcode from 'qrcode-terminal';
import { getLocalIPv4 } from './network.js';
import { getOrCreateToken } from './token.js';
import { getOrCreateLocalCaAndCert } from './ca.js';
import { startTrustServer } from './trust-server.js';
import { startServer } from './server.js';
import { startMdnsAdvertisement } from './mdns.js';
import { DeviceStore } from './device-store.js';
import { PairingManager } from './pairing-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTTPS_PORT = 8443;
const HTTP_TRUST_PORT = 8080;
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CERTS_DIR = path.join(ROOT_DIR, '.certs');

async function main() {
  const lanIp = getLocalIPv4();
  const legacyToken = process.env.AEROKIN_LEGACY_TOKEN === '1' ? getOrCreateToken(CERTS_DIR) : undefined;

  // Initialize or verify AEROKIN Local CA & 365-day Leaf Cert
  const certs = getOrCreateLocalCaAndCert(CERTS_DIR, lanIp);

  // Initialize DeviceStore and PairingManager
  const deviceStore = new DeviceStore(CERTS_DIR);
  const pairingManager = new PairingManager();

  // 1. Start HTTP Trust Server on port 8080
  startTrustServer({
    port: HTTP_TRUST_PORT,
    lanIp,
    httpsPort: HTTPS_PORT,
    caCertDer: certs.caCertDer,
    mobileconfig: certs.mobileconfig,
  });

  // 2. Start HTTPS & WebSocket Server on port 8443
  const server = startServer({
    port: HTTPS_PORT,
    lanIp,
    legacyToken,
    publicDir: PUBLIC_DIR,
    certsDir: CERTS_DIR,
    deviceStore,
    pairingManager,
  });

  // 3. Start best-effort mDNS advertisement of aerokin.local
  startMdnsAdvertisement(HTTPS_PORT, lanIp);

  const trustUrl = `http://${lanIp}:${HTTP_TRUST_PORT}`;
  const activeCode = pairingManager.getActiveCode();
  const code = activeCode ? activeCode.code : '';
  const pairUrl = `https://${lanIp}:${HTTPS_PORT}/#code=${code}`;
  const mdnsPairUrl = `https://aerokin.local:${HTTPS_PORT}/#code=${code}`;

  // Print startup banner and QR codes
  console.log('\n======================================================');
  console.log('              ✦ AEROKIN SERVER ✦                      ');
  console.log('         "Move the air. Move your PC."                ');
  console.log('======================================================\n');
  console.log(`[Status]  HTTPS & WebSocket listening on port ${HTTPS_PORT}`);
  console.log(`[Trust]   HTTP CA Profile server on port ${HTTP_TRUST_PORT}`);
  console.log(`[Network] Wi-Fi IPv4: ${lanIp}`);
  console.log(`[Pairing] 8-digit Pairing Code: ${code} (valid for 2 minutes)`);
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
    ? `${rawHosted}/#host=${lanIp}:${HTTPS_PORT}&code=${code}`
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
  console.log('TERMINAL COMMANDS:');
  console.log('• type "devices"    - list all paired devices');
  console.log('• type "pair"       - generate a new 8-digit pairing code & QR');
  console.log('• type "revoke <id>" - revoke and disconnect a device');
  console.log('• type "revoke-all" - revoke all paired devices');
  console.log('• type "help"       - show available commands');
  console.log('======================================================\n');

  // Terminal interactive CLI
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'aerokin> ',
    });

    let pendingApproval: ((approved: boolean) => void) | null = null;
    let approvalTimeoutTimer: NodeJS.Timeout | null = null;

    pairingManager.setApprover(async (name, platform, clientIp) => {
      return new Promise<boolean>((resolve) => {
        if (pendingApproval) {
          resolve(false);
          return;
        }

        console.log('\n======================================================');
        console.log(`[PAIRING REQUEST] Approve device "${name}"?`);
        console.log(`Platform: ${platform} | Client IP: ${clientIp}`);
        process.stdout.write(`Approve connection? (y/N) [30s timeout]: `);

        pendingApproval = resolve;
        approvalTimeoutTimer = setTimeout(() => {
          if (pendingApproval) {
            const cb = pendingApproval;
            pendingApproval = null;
            console.log('\n[Pairing] Request timed out (30s). Request denied.');
            rl.prompt();
            cb(false);
          }
        }, 30_000);
      });
    });

    rl.prompt();

    rl.on('line', (line) => {
      const input = line.trim();

      if (pendingApproval) {
        if (approvalTimeoutTimer) {
          clearTimeout(approvalTimeoutTimer);
          approvalTimeoutTimer = null;
        }
        const cb = pendingApproval;
        pendingApproval = null;
        const approved = input.toLowerCase() === 'y' || input.toLowerCase() === 'yes';
        if (approved) {
          console.log('[Pairing] Approved. Issuing device credential.');
        } else {
          console.log('[Pairing] Denied pairing request.');
        }
        cb(approved);
        rl.prompt();
        return;
      }

      if (!input) {
        rl.prompt();
        return;
      }

      const [cmd, ...args] = input.split(/\s+/);
      switch (cmd.toLowerCase()) {
        case 'devices': {
          const devs = server.deviceStore.listDevices();
          if (devs.length === 0) {
            console.log('No paired devices registered.');
          } else {
            console.log('\n--- Paired Devices ---');
            for (const d of devs) {
              const status = d.revoked ? '[REVOKED]' : '[ACTIVE]';
              const lastSeen = d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : 'Never';
              console.log(
                `• ${d.deviceId.slice(0, 8)}... | ${d.name} (${d.platform}) | ${status} | Last seen: ${lastSeen}`
              );
            }
            console.log('----------------------\n');
          }
          break;
        }

        case 'pair': {
          const newCode = server.pairingManager.generateCode();
          const newPairUrl = `https://${lanIp}:${HTTPS_PORT}/#code=${newCode.code}`;
          console.log(`\nNew 8-digit Pairing Code: ${newCode.code} (valid for 2 minutes)`);
          console.log(`Pair URL: ${newPairUrl}`);
          qrcode.generate(newPairUrl, { small: true });
          break;
        }

        case 'revoke': {
          const idPrefix = args[0];
          if (!idPrefix) {
            console.log('Usage: revoke <deviceId>');
            break;
          }
          const allDevs = server.deviceStore.listDevices();
          const target = allDevs.find(
            (d) => d.deviceId === idPrefix || d.deviceId.startsWith(idPrefix)
          );
          if (!target) {
            console.log(`Device not found matching: ${idPrefix}`);
          } else {
            server.revokeDevice(target.deviceId);
            console.log(`[Device] Revoked device: ${target.name} (${target.deviceId})`);
          }
          break;
        }

        case 'revoke-all': {
          server.revokeAll();
          console.log('[Device] All paired devices have been revoked and disconnected.');
          break;
        }

        case 'help': {
          console.log('\nCommands:');
          console.log('  devices        - List all paired devices');
          console.log('  pair           - Generate a new 8-digit pairing code & QR');
          console.log('  revoke <id>    - Revoke and disconnect a device by ID (or prefix)');
          console.log('  revoke-all     - Revoke all devices immediately');
          console.log('  help           - Show this help message\n');
          break;
        }

        case 'exit':
        case 'quit': {
          console.log('Shutting down server...');
          process.exit(0);
        }

        default: {
          console.log(`Unknown command: "${cmd}". Type "help" for a list of commands.`);
          break;
        }
      }

      rl.prompt();
    });
  }
}

main().catch((err) => {
  console.error('[AEROKIN Error] Fatal server error:', err);
  process.exit(1);
});
