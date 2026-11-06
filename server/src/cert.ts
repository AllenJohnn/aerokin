import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';

export interface SslCredentials {
  key: string;
  cert: string;
}

/**
 * Loads or generates an SSL certificate and private key.
 * Caches the generated credentials in server/.certs.
 * Stores the LAN IP in server/.certs/ip.txt. If the current IP differs,
 * regenerates the certificate with the new IP in Subject Alternative Names (SANs)
 * and warns that the iPhone will need to re-trust the certificate.
 */
export function getOrCreateCert(lanIp: string, certsDir: string): SslCredentials {
  const keyPath = path.join(certsDir, 'key.pem');
  const certPath = path.join(certsDir, 'cert.pem');
  const ipPath = path.join(certsDir, 'ip.txt');

  // Check previously saved IP
  let cachedIp: string | null = null;
  if (fs.existsSync(ipPath)) {
    try {
      cachedIp = fs.readFileSync(ipPath, 'utf8').trim();
    } catch {
      cachedIp = null;
    }
  }

  const ipChanged = !cachedIp || cachedIp !== lanIp;
  const certsExist = fs.existsSync(keyPath) && fs.existsSync(certPath);

  // If IP is unchanged and certificate files exist, reuse them
  if (!ipChanged && certsExist) {
    try {
      const key = fs.readFileSync(keyPath, 'utf8');
      const cert = fs.readFileSync(certPath, 'utf8');
      if (key && cert) {
        return { key, cert };
      }
    } catch {
      // Re-generate if files are corrupted or unreadable
    }
  }

  // If IP has changed, notify user about iPhone re-trusting certificate
  if (ipChanged && cachedIp) {
    console.log(
      `\n[AEROKIN] LAN IP changed from ${cachedIp} to ${lanIp}. Regenerating SSL certificate...`
    );
    console.log(
      '[AEROKIN] NOTE: Your iPhone will need to re-trust the certificate when connecting to the new IP.\n'
    );
  }

  // Ensure directory exists
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  // Generate self-signed certificate with updated IP in SANs
  const attrs = [
    { name: 'commonName', value: lanIp },
    { name: 'organizationName', value: 'AEROKIN' },
  ];

  const pems = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: lanIp },
        ],
      },
    ],
  });

  fs.writeFileSync(keyPath, pems.private, 'utf8');
  fs.writeFileSync(certPath, pems.cert, 'utf8');
  fs.writeFileSync(ipPath, lanIp, 'utf8');

  return {
    key: pems.private,
    cert: pems.cert,
  };
}
