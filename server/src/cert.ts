import fs from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';

export interface SslCredentials {
  key: string;
  cert: string;
}

/**
 * Loads or generates an SSL certificate and private key.
 * Caches the generated credentials in server/.certs to avoid regenerating on every boot.
 * Includes localhost, 127.0.0.1, and the laptop's LAN IP in the Subject Alternative Names (SANs).
 */
export function getOrCreateCert(lanIp: string, certsDir: string): SslCredentials {
  const keyPath = path.join(certsDir, 'key.pem');
  const certPath = path.join(certsDir, 'cert.pem');

  // If already cached, read from disk
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
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

  // Ensure directory exists
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  // Generate self-signed certificate with IP SANs
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

  return {
    key: pems.private,
    cert: pems.cert,
  };
}
