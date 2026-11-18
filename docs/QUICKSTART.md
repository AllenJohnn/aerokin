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

## One-Click Setup & Automatic Startup (Recommended)

You do **not** need to open a terminal or run manual commands to start AeroKin.

### 1. Install Once (`install-aerokin.cmd`)
Double-click `install-aerokin.cmd` in the repository root (or run from a terminal without admin rights):
```cmd
install-aerokin.cmd
```
This performs a clean user-level setup:
- **Desktop Shortcut ("AeroKin")**: Starts AeroKin hidden with a single click.
- **Start Menu Shortcut ("AeroKin")**: Searchable from Windows Start menu.
- **Startup Folder Shortcut**: Starts AeroKin automatically in the background whenever you sign in to Windows (can be skipped with `-NoAutostart`).
- **Icon**: Configures the high-resolution AeroKin brand icon (`favicon.ico`) on all shortcuts.

### 2. How the Hidden Launcher Works
All shortcuts point to `start-aerokin-hidden.vbs`, which bootstraps `scripts/aerokin-launcher.ps1` using `wscript.exe` with `WindowStyle 0` (100% hidden, zero black console flashes):
- **Dynamic Localization**: Resolves repo root from its own location—no hardcoded drive paths.
- **Single Instance**: Enforces a single instance using a named Win32 mutex and port checks. Clicking the desktop shortcut when AeroKin is already running simply opens your PC Dashboard.
- **Auto-Restart & Crash Supervision**: Supervises the background server process. If a crash occurs, it automatically restarts with exponential backoff (up to 5 restarts/minute before stopping safely). Clean exits or user Quit from the tray do not restart.
- **First-Run Onboarding**: On initial launch, compiles missing builds if needed and automatically opens the PC Dashboard once so you see your pairing QR and phone URL. Subsequent autostarts run completely silently.
- **Size-Capped Log Rotation**: Logs are written to `%LOCALAPPDATA%\AeroKin\logs\aerokin.log` with automatic 5MB rotation and multi-generation backups (`.1`, `.2`, `.3`).

### 3. System Tray Controls
When AeroKin is running, a branded notification icon appears in your Windows system tray:
- **Open Dashboard**: Opens `https://localhost:8443/dashboard` in your default browser.
- **Show Pairing Code**: Displays a balloon notification with the active 8-digit OTP.
- **Pause Remote Input**: One-click kill switch that disables remote mouse/keyboard input.
- **Open Logs Folder**: Opens `%LOCALAPPDATA%\AeroKin\logs` in Windows File Explorer.
- **Restart AeroKin**: Gracefully restarts the server and tray sidecar.
- **Quit**: Gracefully shuts down AeroKin and exits the tray.

### 4. Why Login Autostart (Not a Windows Service)?
AeroKin runs in the interactive user session at login rather than as a background Windows Service:
- **Session 0 Isolation**: Since Windows Vista, Windows Services are strictly isolated into non-interactive **Session 0**. Session 0 has no access to graphical displays (the DXGI Desktop Duplication API and GDI screen capture immediately fail), cannot inject mouse/keyboard input into active user desktop sessions, and has no access to user-session SMTC audio/media controllers.
- Running at login in Session 1+ provides full access to hardware encoders, screen capture, and input automation with **zero administrator rights required**.

### 5. Sleep, Lid-Close & Keep-Awake Behavior
- **Active Keep-Awake**: While AeroKin is running, it uses Win32 `SetThreadExecutionState` (`ES_SYSTEM_REQUIRED | ES_CONTINUOUS`) to prevent Windows from idling to sleep during active use without modifying your Windows power plans.
- **Lid-Close & Manual Sleep**: If you manually close a laptop lid or put Windows to sleep, hardware network adapters suspend. AeroKin gracefully resumes when the laptop is opened; your mobile PWA displays **"PC Offline or Asleep"** with single-tap auto-reconnect.

### 6. Updating AeroKin (`update-aerokin.cmd`)
To update AeroKin without losing local changes:
```cmd
update-aerokin.cmd
```
This safely stops running AeroKin processes, runs `git pull` (refusing to discard uncommitted changes), updates dependencies with `pnpm install --frozen-lockfile`, recompiles packages, and restarts the server hidden in the background.

---

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

### 4. Pair Your Phone (Frictionless Personal Setup)

AeroKin is designed for seamless personal use—**pair once, and work on every network**:

1. **Remote Pairing (Everywhere)**:
   - In the PC Dashboard, view the Remote WebRTC pairing link or QR code:
     `https://<AEROKIN_HOSTED_URL>/#agent=<id>&signal=<host>&code=<8-digit>`
   - Scan or open this link on your iPhone.
   - AeroKin automatically strips the fragment from your browser history, joins the signaling room, and completes mutual authentication over the WebRTC RTC control channel.
   - **PC Approval is OFF by default** in personal mode—no need to switch to your laptop or click approve!
2. **Local LAN Pairing**:
   - Alternatively, open the local QR code or URL: `https://<pc-ip>:8443/#code=XXXXXXXX`.
   - Enter your device name. The device is instantly authenticated.

---

## Pair Once, Work on Every Network

- **Stable Origin**: The mobile PWA is served from ONE stable origin (e.g. `https://aerokin.vercel.app`), storing paired PCs in local storage keyed by `agentId` (not by temporary IP addresses).
- **Smart Connection Ladder**: AeroKin finds your PC by its `agentId`:
  1. Probes the last-known LAN address first with a fast `<= 1.5s` timeout.
  2. If the LAN probe does not respond within 1.5s, it falls back seamlessly to remote WebRTC signaling over P2P/TURN.
- **Dynamic LAN Updating**: Whenever the PC is reached on a new network, AeroKin automatically updates the stored LAN address.
- **Never Re-Prompts for Pairing**: If a valid credential exists, AeroKin **never re-prompts for pairing**. If your PC is temporarily shut down or asleep, the app displays **"PC Offline or Asleep"** with a single-tap retry button.
- **Wake-on-LAN Limitation**: Wake-on-LAN (WoL) relies on Layer 2 broadcast "magic packets" (`FF:FF:FF:FF:FF:FF` + 16x MAC) sent over raw UDP sockets. Standard web browsers (including iOS Safari PWAs) do not expose raw UDP sockets to web pages, and Internet transit routers drop directed subnet broadcast packets by default (RFC 2644) to prevent amplification attacks. Therefore, WoL cannot work from a web PWA over the public internet; keep your PC awake or set Windows sleep timers accordingly.

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
