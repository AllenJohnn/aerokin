# Vercel Deployment Guide: Hosted AEROKIN PWA

This guide details how to deploy the **AEROKIN Progressive Web App (PWA)** to **Vercel** as a high-performance, globally distributed static application.

---

## 1. Architecture: The Minimal Deployment Path

AeroKin consists of three key components:
1. **The PWA Client (Frontend)**: Runs in your phone's browser (Safari/Chrome) or as an installed Home Screen PWA. **This runs on Vercel.**
2. **The Signaling Server & STUN/TURN Relay**: Coordinates WebRTC handshakes and relays media packets when firewalls prevent direct peer-to-peer UDP connections. **This runs on a small always-on VPS or Oracle Cloud Free-Tier VM.**
3. **The Windows PC Agent**: Runs locally on your laptop/desktop, captures video/audio, and executes keyboard/mouse inputs.

```
┌──────────────────────────────────────────────────────────────────┐
│                          MINIMAL PATH                            │
│                                                                  │
│  📱 Phone (Safari / Home Screen PWA)                             │
│     ▲                                                            │
│     │ Served globally via HTTPS                                  │
│     ▼                                                            │
│  ▲ Vercel Static Hosting (https://aerokin.vercel.app)            │
│  │                                                               │
│  ├── [On Same Wi-Fi] ──► Direct LAN TLS Probe (<= 1.5s)          │
│  │                       wss://192.168.1.55:8443                 │
│  │                                                               │
│  └── [Away / Cellular] ─► WebRTC Signaling & Media Relay         │
│                           ▲                                      │
│                           ▼                                      │
│                  ┌──────────────────────┐                        │
│                  │  VPS ($3.50/mo)      │                        │
│                  │  - Caddy (WSS)       │                        │
│                  │  - Signaling Node.js │                        │
│                  │  - Coturn STUN/TURN  │                        │
│                  └──────────┬───────────┘                        │
│                             │                                    │
│                             ▼                                    │
│                  💻 Windows Laptop / PC                          │
│                     (AeroKin Host Agent)                         │
└──────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Why Signaling and Coturn CANNOT Run on Vercel**:
> Vercel is a serverless frontend platform designed for HTTP request/response lifecycles.
> - **Signaling** requires long-lived, stateful WebSockets (`ws://`/`wss://`) that persist throughout your entire remote session.
> - **Coturn STUN/TURN** requires arbitrary UDP and TCP port binding across port `3478`, `5349`, and the dynamic media port range `49152:65535` to relay peer-to-peer WebRTC packets.
> Serverless edge runtimes cannot bind UDP sockets or maintain multi-hour stateful connections. Therefore, signaling and Coturn require a small always-on Linux VM ($3.50–$5/mo on Hetzner, DigitalOcean, OVH, or Oracle Cloud Free Tier). Follow [docs/DEPLOY-VPS.md](file:///D:/Personal%20Project/aerokin/docs/DEPLOY-VPS.md) for VPS deployment.

---

## 2. Step-by-Step Vercel Setup

### Step A: Import Repository
1. Log in to [Vercel](https://vercel.com) using your GitHub account.
2. Click **Add New...** ➔ **Project**.
3. Locate the `aerokin` repository and click **Import**.

### Step B: Configure Project Settings
Vercel supports two configuration approaches. Choose either:

#### Option 1: Monorepo Root (Recommended - Zero Configuration)
Leave **Root Directory** as `./` (repository root). AeroKin includes a root [vercel.json](file:///D:/Personal%20Project/aerokin/vercel.json) that automatically configures:
- **Build Command**: `pnpm --filter aerokin-pwa run build:hosted`
- **Output Directory**: `pwa/dist`
- **Install Command**: `pnpm install`

#### Option 2: PWA Subdirectory Root
If you prefer setting **Root Directory** to `pwa`:
- In the Vercel dashboard, edit **Root Directory** and select `pwa`.
- Vercel will automatically detect [pwa/vercel.json](file:///D:/Personal%20Project/aerokin/pwa/vercel.json) with:
  - **Build Command**: `pnpm run build:hosted`
  - **Output Directory**: `dist`
  - **Install Command**: `pnpm install`

### Step C: Environment Variables
In the **Environment Variables** section of the Vercel project configuration, add:

| Key | Value | Description |
|---|---|---|
| `VITE_HOSTED_MODE` | `true` | Ensures PWA runs in hosted mode, keying pairings by `agentId` |
| `NODE_VERSION` | `20.x` | Ensures Node 20 LTS is used during the build |

*(Note: Signaling servers and PC addresses are discovered dynamically at runtime via the pairing link/QR code `#agent=<id>&signal=<host>&code=<code>`. You do not need to hardcode a specific PC IP or signaling host into the static build).*

### Step D: Deploy & Verify
1. Click **Deploy**. Vercel will run `pnpm install` and `vite build --mode hosted`.
2. Once complete, Vercel will assign a production URL:
   `https://<your-project-name>.vercel.app`
3. Open the URL on your desktop or phone to confirm:
   - You should see the AeroKin OLED interface.
   - If not paired yet, it displays the prompt to connect or scan a pairing QR from your PC dashboard.

---

## 3. Connecting Vercel to Your VPS Signaling & PC Agent

### Step A: Update VPS `ALLOWED_ORIGINS`
Your signaling server protects WebSocket endpoints by validating the browser `Origin` header.

1. SSH into your VPS:
   ```bash
   ssh root@<your-vps-ip>
   cd /opt/aerokin/signaling
   ```
2. Open `deploy/.env`:
   ```bash
   nano deploy/.env
   ```
3. Add your Vercel domain to `ALLOWED_ORIGINS`:
   ```env
   ALLOWED_ORIGINS=https://<your-project-name>.vercel.app,https://yourdomain.com
   ```
4. Restart signaling:
   ```bash
   docker compose restart signaling
   ```

### Step B: Configure Windows PC Agent
On your Windows laptop or PC:
1. Open PowerShell and set the environment variables:
   ```powershell
   [System.Environment]::SetEnvironmentVariable("AEROKIN_HOSTED_URL", "https://<your-project-name>.vercel.app", "User")
   [System.Environment]::SetEnvironmentVariable("AEROKIN_SIGNALING_URL", "wss://signal.yourdomain.com", "User")
   ```
2. Start the AeroKin server:
   ```powershell
   pnpm start
   ```
3. Open the desktop dashboard at `https://localhost:8443`.
   - The dashboard now displays the remote pairing link and QR code:
     `https://<your-project-name>.vercel.app/#agent=<agentId>&signal=signal.yourdomain.com&code=<8-digit>`

---

## 4. Understanding LAN vs. Remote Behavior (Mixed-Content & Certificates)

When using the Vercel-hosted PWA on your iPhone or Android device, the connection behavior is optimized for seamless switching between your home Wi-Fi and mobile networks:

### A. How LAN Acceleration Works from a Hosted Origin
- When your phone is on the **same Wi-Fi network** as your PC:
  1. The Vercel PWA attempts a rapid LAN probe (`<= 1.5s`) directly to `wss://<PC-LAN-IP>:8443`.
  2. Because the Vercel page is served over `https://`, modern mobile browsers (Safari, Chrome) enforce **mixed-content security**: WebSocket connections from an HTTPS page must also be secure (`wss://`).
  3. AeroKin serves LAN WebSockets over TLS using the local CA certificate created during initial PC setup (`.certs/ca.crt`).
  4. **Certificate Trust on iPhone**: To enable sub-1.5s LAN streaming without SSL warnings:
     - Visit `https://<PC-LAN-IP>:8443` once in Mobile Safari, tap **Show Details** ➔ **visit this website**.
     - Or download the root CA (`.certs/ca.crt`) from the PC dashboard, install the profile in **Settings ➔ General ➔ VPN & Device Management**, and enable Full Trust in **Settings ➔ General ➔ About ➔ Certificate Trust Settings**.

### B. Transparent Cellular / Remote Fallback
- What if you are away from home, on mobile LTE/5G data, or have not installed the LAN certificate?
  1. The LAN probe to `https://<PC-LAN-IP>:8443` fails or times out within `1.5s`.
  2. The PWA **instantly and transparently falls back to WebRTC signaling** via your VPS (`wss://signal.yourdomain.com`).
  3. The signaling connection uses a standard Let's Encrypt / ZeroSSL TLS certificate provisioned by Caddy on your VPS.
  4. **No certificate trust or manual warnings are required**: Safari and Chrome trust the VPS TLS certificate out of the box. WebRTC media streams directly to your phone via encrypted DTLS-SRTP.

---

## 5. Ongoing Updates & Redeployment

Whenever you push commits to `main`:
1. Vercel automatically detects the git push.
2. It triggers a new build with `pnpm --filter aerokin-pwa run build:hosted`.
3. The new static build is deployed atomically to edge servers worldwide in ~30 seconds.
4. Your phone's Service Worker and browser cache automatically refresh the client application.
