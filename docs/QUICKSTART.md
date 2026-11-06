# AEROKIN Quickstart Guide

> **"Move the air. Move your PC."**  
> Turn your iPhone into an air mouse, desktop viewer, media remote, and system controller for your Windows PC with zero third-party cloud dependencies.

---

## Architecture & Ports

| Port | Protocol | Purpose | URL Pattern | Access Level |
|---|---|---|---|---|
| **`8443`** | HTTPS / WSS | Primary AeroKin Client & WebSocket API | `https://<pc-ip>:8443/` or `https://aerokin.local:8443/` | LAN & Localhost |
| **`8443`** | HTTPS | PC Operator Dashboard & Pairing Approval | `https://localhost:8443/dashboard` | Loopback Only (`127.0.0.1`) |
| **`8080`** | HTTP | One-Tap iOS Root CA Profile Provisioning | `http://<pc-ip>:8080/` | LAN |
| **`5174`** | HTTP | PWA Vite Dev Server (optional dev mode) | `http://localhost:5174/` | Local Dev |

---

## Prerequisites

1. **Windows PC**: Windows 10 (Build 19041+) or Windows 11.
2. **Node.js**: v20+ or v22+ (LTS).
3. **pnpm**: v9+ / v12+.
4. **Mobile Device**: iPhone with iOS Safari (iOS 15+) or modern Chromium browser.
5. **Network**: PC and iPhone connected to the same local Wi-Fi router for LAN mode.

---

## 3-Minute Setup

### 1. Install & Build
From the repository root:
```powershell
pnpm install
pnpm run safety:check
pnpm --filter @aerokin/design-system build
pnpm --filter aerokin-pwa build
pnpm --filter aerokin-server build
```

### 2. Start the PC Agent
```powershell
pnpm --filter aerokin-server start
```
Upon startup, the terminal outputs:
- **Active LAN IPv4** (e.g. `192.168.1.50`)
- **8-digit pairing code** (valid for 2 minutes)
- **ASCII QR Code** for quick camera scanning
- **Direct Link to PC Dashboard**: `https://localhost:8443/dashboard`

### 3. Install the AeroKin CA Certificate on iPhone (First Time Only)
To allow secure WebSockets and camera permissions without untrusted HTTPS warnings:
1. On your iPhone, open Safari and visit:
   ```
   http://<pc-ip>:8080
   ```
2. Tap **Install Profile** and allow the download.
3. Open iOS **Settings** -> **Profile Downloaded** -> Tap **Install**.
4. Go to **Settings** -> **General** -> **About** -> **Certificate Trust Settings** (bottom) -> Enable full trust for **AEROKIN Local Root CA**.

### 4. Pair Your Phone
1. Open the pairing URL displayed in your terminal (or scan the QR code):
   ```
   https://<pc-ip>:8443/#code=XXXXXXXX
   ```
2. Enter your device name (e.g. *"Allen's iPhone"*).
3. Look at your PC terminal or open the PC Dashboard (`https://localhost:8443/dashboard`) and press **"y"** to approve the device.
4. Your device is permanently authenticated via cryptographically secure ED25519/HMAC credentials stored in local storage!

---

## PC Dashboard

Manage your PC host directly at:
```
https://localhost:8443/dashboard
```
Features available on the PC Dashboard:
- **Real-time Live Telemetry**: CPU core percent, RAM, Disks, Network I/O, GPU engine usage, and hardware thermals.
- **Pairing Management**: Instant one-click approval/rejection of pending mobile devices.
- **Authorized Devices**: Rename, disconnect, or revoke any paired mobile client.
- **Feature Security Toggles**: Disable Remote Power Controls, App Launcher, Clipboard Sync, or Desktop Streaming with immediate protocol-level enforcement.
- **Audit Event Log**: Real-time streaming log of all pairing attempts, actions, and media commands.

---

## Safety Invariants (S1–S9)

AeroKin incorporates strict safety gates to protect your host system:
1. **Zero Unintentional Reboots / Power Actions**: All power transitions (`shutdown`, `restart`, `sleep`, `lock`) route strictly through `PowerActionExecutor`. By default, power actions run in dry-run mode. To explicitly allow real power actions from mobile during daily use, launch with:
   ```powershell
   $env:AEROKIN_ALLOW_POWER_ACTIONS = "1"; pnpm --filter aerokin-server start
   ```
2. **Safe Input Routing**: All keyboard and mouse injection routes through `InputBackend`. Automated tests and test runners use recording fakes and can never move your mouse or type on your active desktop.
3. **Emergency Abort**: If a 10-second power countdown is initiated from your phone by mistake, cancel it instantly on your phone or run:
   ```powershell
   shutdown /a
   ```
