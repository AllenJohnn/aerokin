import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getOrCreateLocalCaAndCert, getCertPaths } from './ca.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CERTS_DIR = path.join(ROOT_DIR, '.certs');

async function main() {
  console.log('\n======================================================');
  console.log('       ✦ AEROKIN WINDOWS ROOT TRUST SETUP ✦           ');
  console.log('======================================================\n');

  // Ensure CA exists
  getOrCreateLocalCaAndCert(CERTS_DIR, '127.0.0.1');
  const certPaths = getCertPaths(CERTS_DIR);

  if (!fs.existsSync(certPaths.caCertDer)) {
    console.error('[Error] CA certificate not found at:', certPaths.caCertDer);
    process.exit(1);
  }

  if (process.platform === 'win32') {
    console.log(`[Trust] Adding "${certPaths.caCertDer}" to Windows CurrentUser "Root" store...`);
    try {
      // certutil -user -f -addstore Root <certPath>
      const output = execSync(`certutil -user -f -addstore Root "${certPaths.caCertDer}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      console.log(output);
      console.log('======================================================');
      console.log('✔ SUCCESS: AEROKIN Local CA is now trusted on Windows!');
      console.log('https://localhost:8443 and https://127.0.0.1:8443');
      console.log('will now open cleanly in Chrome and Edge with NO warnings.');
      console.log('======================================================\n');
    } catch (err: any) {
      console.error('[Error] Failed to add certificate via certutil:', err.message);
      process.exit(1);
    }
  } else {
    console.log(
      '[Info] Non-Windows OS detected. Please import server/.certs/ca-cert.pem into your OS trust store.'
    );
  }
}

main().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
