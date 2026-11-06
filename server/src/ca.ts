import fs from 'node:fs';
import path from 'node:path';
import forge from 'node-forge';

const { pki, md, asn1 } = forge;

export interface CertPaths {
  caCertPem: string;
  caKeyPem: string;
  caCertDer: string;
  serverCertPem: string;
  serverKeyPem: string;
  ipTxt: string;
}

export interface GeneratedCerts {
  caCertPem: string;
  caCertDer: Buffer;
  serverCertPem: string;
  serverKeyPem: string;
  mobileconfig: string;
}

/**
 * Returns file paths for certificate cache in server/.certs
 */
export function getCertPaths(certsDir: string): CertPaths {
  return {
    caCertPem: path.join(certsDir, 'ca-cert.pem'),
    caKeyPem: path.join(certsDir, 'ca-key.pem'),
    caCertDer: path.join(certsDir, 'ca-cert.crt'),
    serverCertPem: path.join(certsDir, 'server-cert.pem'),
    serverKeyPem: path.join(certsDir, 'server-key.pem'),
    ipTxt: path.join(certsDir, 'ip.txt'),
  };
}

/**
 * Generates an Apple .mobileconfig payload to install the Root CA on iOS
 */
export function generateMobileConfig(caCertDerBase64: string): string {
  const profileUuid = '8A4E1B39-8C27-463D-94D2-7C5CFF22D3EE';
  const certUuid = '5DF123A4-BCDE-4921-992F-AEROKINROOT01';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadDisplayName</key>
    <string>AEROKIN Local CA</string>
    <key>PayloadDescription</key>
    <string>Installs the AEROKIN Local Root CA for secure, zero-warning local Wi-Fi control.</string>
    <key>PayloadIdentifier</key>
    <string>app.aerokin.rootca</string>
    <key>PayloadOrganization</key>
    <string>AEROKIN</string>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUuid}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>app.aerokin.rootca.credential</string>
            <key>PayloadUUID</key>
            <string>${certUuid}</string>
            <key>PayloadDisplayName</key>
            <string>AEROKIN Local CA</string>
            <key>PayloadCertificateFileName</key>
            <string>aerokin-ca.crt</string>
            <key>PayloadContent</key>
            <data>
${caCertDerBase64}
            </data>
        </dict>
    </array>
</dict>
</plist>`;
}

/**
 * Loads or creates the AEROKIN 10-year Local CA, and signs a 365-day leaf cert for the LAN IP.
 */
export function getOrCreateLocalCaAndCert(certsDir: string, lanIp: string): GeneratedCerts {
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const paths = getCertPaths(certsDir);

  let caCert: forge.pki.Certificate;
  let caKey: forge.pki.PrivateKey;
  let caCertPem: string;
  let caCertDer: Buffer;

  // 1. Check or generate AEROKIN Local CA (10 years)
  if (fs.existsSync(paths.caCertPem) && fs.existsSync(paths.caKeyPem)) {
    caCertPem = fs.readFileSync(paths.caCertPem, 'utf8');
    const caKeyPem = fs.readFileSync(paths.caKeyPem, 'utf8');
    caCert = pki.certificateFromPem(caCertPem);
    caKey = pki.privateKeyFromPem(caKeyPem);

    if (fs.existsSync(paths.caCertDer)) {
      caCertDer = fs.readFileSync(paths.caCertDer);
    } else {
      const derBytes = asn1.toDer(pki.certificateToAsn1(caCert)).getBytes();
      caCertDer = Buffer.from(derBytes, 'binary');
      fs.writeFileSync(paths.caCertDer, caCertDer);
    }
  } else {
    console.log('[Security] Generating new 10-year AEROKIN Local CA in server/.certs...');
    const caKeys = pki.rsa.generateKeyPair({ bits: 2048 });
    caKey = caKeys.privateKey;

    caCert = pki.createCertificate();
    caCert.publicKey = caKeys.publicKey;
    caCert.serialNumber = '01' + Date.now().toString(16);
    caCert.validity.notBefore = new Date(Date.now() - 60000);
    caCert.validity.notAfter = new Date();
    caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);

    const caAttrs = [
      { name: 'commonName', value: 'AEROKIN Local CA' },
      { name: 'organizationName', value: 'AEROKIN' },
      { name: 'organizationalUnitName', value: 'AEROKIN Local Trust' },
    ];
    caCert.setSubject(caAttrs);
    caCert.setIssuer(caAttrs);

    caCert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      {
        name: 'keyUsage',
        keyCertSign: true,
        cRLSign: true,
        digitalSignature: true,
        critical: true,
      },
      { name: 'subjectKeyIdentifier' },
    ]);

    caCert.sign(caKey, md.sha256.create());

    caCertPem = pki.certificateToPem(caCert);
    const caKeyPem = pki.privateKeyToPem(caKey);

    const derBytes = asn1.toDer(pki.certificateToAsn1(caCert)).getBytes();
    caCertDer = Buffer.from(derBytes, 'binary');

    fs.writeFileSync(paths.caCertPem, caCertPem, { mode: 0o600 });
    fs.writeFileSync(paths.caKeyPem, caKeyPem, { mode: 0o600 });
    fs.writeFileSync(paths.caCertDer, caCertDer, { mode: 0o644 });

    console.log('[Security] AEROKIN Local CA created. Cached in server/.certs');
  }

  // 2. Check leaf certificate validity (< 30 days remaining or IP changed)
  let needNewLeaf = true;
  let lastIp = '';

  if (fs.existsSync(paths.ipTxt)) {
    lastIp = fs.readFileSync(paths.ipTxt, 'utf8').trim();
  }

  if (fs.existsSync(paths.serverCertPem) && fs.existsSync(paths.serverKeyPem) && lastIp === lanIp) {
    try {
      const existingCertPem = fs.readFileSync(paths.serverCertPem, 'utf8');
      const existingCert = pki.certificateFromPem(existingCertPem);
      const remainingMs = existingCert.validity.notAfter.getTime() - Date.now();
      const remainingDays = remainingMs / (1000 * 60 * 60 * 24);

      if (remainingDays > 30) {
        needNewLeaf = false;
      } else {
        console.log(
          `[Security] Leaf certificate expiring in ${Math.round(remainingDays)} days. Regenerating...`
        );
      }
    } catch {
      needNewLeaf = true;
    }
  }

  let serverCertPem: string;
  let serverKeyPem: string;

  if (!needNewLeaf) {
    serverCertPem = fs.readFileSync(paths.serverCertPem, 'utf8');
    serverKeyPem = fs.readFileSync(paths.serverKeyPem, 'utf8');
  } else {
    console.log(
      `[Security] Generating new leaf certificate signed by AEROKIN Local CA for IP: ${lanIp}...`
    );

    const leafKeys = pki.rsa.generateKeyPair({ bits: 2048 });
    serverKeyPem = pki.privateKeyToPem(leafKeys.privateKey);

    const leafCert = pki.createCertificate();
    leafCert.publicKey = leafKeys.publicKey;
    leafCert.serialNumber = Date.now().toString(16);
    leafCert.validity.notBefore = new Date(Date.now() - 60000);
    leafCert.validity.notAfter = new Date();
    leafCert.validity.notAfter.setFullYear(leafCert.validity.notBefore.getFullYear() + 1); // 365 days

    leafCert.setSubject([
      { name: 'commonName', value: 'AEROKIN Local Server' },
      { name: 'organizationName', value: 'AEROKIN' },
    ]);
    leafCert.setIssuer(caCert.subject.attributes);

    leafCert.setExtensions([
      { name: 'basicConstraints', cA: false, critical: true },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        critical: true,
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 7, ip: lanIp },
          { type: 7, ip: '127.0.0.1' },
          { type: 2, value: 'localhost' },
          { type: 2, value: 'aerokin.local' },
        ],
      },
      { name: 'subjectKeyIdentifier' },
    ]);

    leafCert.sign(caKey, md.sha256.create());

    serverCertPem = pki.certificateToPem(leafCert);

    fs.writeFileSync(paths.serverCertPem, serverCertPem, { mode: 0o600 });
    fs.writeFileSync(paths.serverKeyPem, serverKeyPem, { mode: 0o600 });
    fs.writeFileSync(paths.ipTxt, lanIp, 'utf8');

    console.log('[Security] Leaf certificate generated and signed by AEROKIN Local CA.');
  }

  const caCertDerBase64 = caCertDer.toString('base64');
  const mobileconfig = generateMobileConfig(caCertDerBase64);

  return {
    caCertPem,
    caCertDer,
    serverCertPem,
    serverKeyPem,
    mobileconfig,
  };
}
