# Hosting AeroKin on Vercel & Static Hosts

AeroKin can be hosted as a static Progressive Web App (PWA) on Vercel, Netlify, Cloudflare Pages, or any static host while maintaining a strict **same-LAN-only** security model.

---

## 1. Architecture: Same-LAN Only

Even when the client PWA is loaded from a hosted cloud URL (e.g. `https://aerokin.vercel.app`):
- **Zero Cloud Relay / Tunneling**: No audio, video, cursor deltas, or input events ever pass through cloud servers, STUN/TURN, or proxies.
- **Direct PWA-to-Agent Connection**: The browser on your phone connects directly to your Windows PC agent over local Wi-Fi via WebSocket Secure (`wss://<PC-LAN-IP>:8443`).
- **Static Assets Only**: The hosted platform strictly serves static client assets (`index.html`, JavaScript, CSS, icons, web manifest).

---

## 2. Vercel Deployment Step-by-Step

### Repository Structure
AeroKin is a pnpm monorepo. The PWA in `pwa/` imports shared tokens and components from `@aerokin/design-system` in `design-system/`.

### Vercel Project Settings
In the Vercel Project Settings:
1. **Root Directory**: Leave blank (repo root `./`). Do **NOT** set it to `pwa`, because the build needs access to `design-system/`.
2. **Framework Preset**: `Vite`
3. **Build Command**: `pnpm --filter aerokin-pwa run build:hosted`
4. **Output Directory**: `pwa/dist`
5. **Install Command**: `pnpm install`

### `vercel.json` Configuration
The root `vercel.json` file configures:
- **SPA Rewrites**: Redirects navigation requests to `/index.html` while preserving `/assets/*`, `manifest.json`, and static icons.
- **Cache Headers**: 1-year immutable caching for hashed `/assets/*`, and `no-cache, must-revalidate` for `index.html` and `manifest.json`.
- **Security Headers**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- **Permissions-Policy**: Explicitly enables `accelerometer=*`, `gyroscope=*`, and `magnetometer=*` so the Air Pointer gyroscopic engine functions when loaded from the hosted origin.
- **Content Security Policy (CSP)**: Intentionally omitted from static headers. Because iOS Safari and WebKit enforce erratic restrictions on RFC 1918 private LAN IP connections when `connect-src` is defined, omitting CSP avoids connection blocks on mobile.

---

## 3. PC Agent Configuration

### 3.1 Cross-Site WebSocket Hijacking (CSWSH) Protection
To prevent malicious third-party websites from connecting to your local PC agent, AeroKin enforces an Origin allow-list on all incoming WebSocket connections.

Create or update `.env` in `server/`:
```bash
# Comma-separated list of allowed HTTPS origins
AEROKIN_ALLOWED_ORIGINS=https://aerokin.vercel.app
```
When set:
- Requests with an allow-listed `Origin` header are accepted.
- Requests with a disallowed `Origin` header are rejected with **HTTP 403 Forbidden** before WebSocket upgrade.
- Local LAN IPs, `aerokin.local`, and loopback origins are always allowed automatically.
- Requests without an `Origin` header (e.g. CLI tools or curl) are allowed when accompanied by a valid auth token.

### 3.2 Hosted Pairing Banner & QR Code
To display a 3rd QR code in your PC terminal pointing directly to your hosted PWA:
```bash
AEROKIN_HOSTED_URL=https://aerokin.vercel.app
```
When configured, the agent terminal outputs:
```text
------------------------------------------------------
  QR #3: CONNECT VIA HOSTED STATIC PWA
  Hosted static app: https://aerokin.vercel.app
  Pair URL:          https://aerokin.vercel.app/#host=192.168.1.50:8443&code=4EA378
------------------------------------------------------
```

---

## 4. URL Fragment Pairing Security

Pairing parameters are passed via the URL **hash fragment**, not query parameters:
```text
https://<hosted-origin>/#host=<ip-or-name:port>&code=<token>
```

### Security Benefits:
1. **Never Sent to Static Host**: URL hash fragments are never sent to Vercel (or any CDN) in HTTP request headers.
2. **Ephemeral in Browser History**: The PWA parses the credentials once on load, stores them in `localStorage`, and immediately strips the hash from the address bar via `history.replaceState`.
3. **No Credential Logging**: Tokens are never logged to console or remote monitoring.

---

## 5. CA Certificate Trust Setup

Browsers require a trusted TLS certificate when connecting from an HTTPS website to a local secure WebSocket (`wss://`).

### iPhone / iPad (iOS)
1. Ensure your iPhone is connected to the same Wi-Fi as your PC.
2. Scan **QR #1** from the PC terminal or visit `http://<PC-LAN-IP>:8080` in Safari.
3. Tap **Download Configuration Profile**.
4. Go to **Settings > Profile Downloaded > Install**.
5. Go to **Settings > General > About > Certificate Trust Settings**.
6. Under **Enable Full Trust for Root Certificates**, enable the switch for **AEROKIN Local CA**.

### Android
1. Download the CA certificate (`.crt`) from `http://<PC-LAN-IP>:8080/ca.crt` or `https://<PC-LAN-IP>:8443/cert`.
2. Go to **Settings > Security & Privacy > More Security Settings > Encryption & Credentials > Install a Certificate > CA Certificate**.
3. Select the downloaded certificate and confirm installation.

---

## 6. Browser-Specific Caveats

### iOS Local Network Access Prompt
- When a web app running in Safari attempts to communicate with a device on the local network, iOS displays a permission prompt: *"AeroKin would like to find and connect to devices on your local network"*.
- In AeroKin, connections in hosted mode are triggered by a **direct user gesture** (tapping the "Connect to PC" button), ensuring the system prompt is displayed reliably.
- If you accidentally tapped "Don't Allow", re-enable it under **iOS Settings > Safari > Local Network** (or Settings > AeroKin if installed to Home Screen).

### Chrome & Edge Private Network Access (PNA)
- Modern Chromium browsers require private network requests from public HTTPS origins to use secure transports (`wss://`) with valid, trusted certificates.
- If developing locally without installing the CA certificate, you can temporarily allow the origin in `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
