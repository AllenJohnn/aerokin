# AEROKIN Server (`aerokin-server`)

> **"Move the air. Move your PC."**  
> High-performance Node.js + TypeScript input automation daemon for Windows. Pairs with the AEROKIN iPhone PWA to translate gyroscope and gesture telemetry into native cursor movement, clicks, drag operations, and universal media control.

---

## ✦ Key Architecture & Features

### 1. Trusted HTTPS & Zero Browser Warnings
- **10-Year AEROKIN Local Root CA**: Automatically generated once and stored in `server/.certs/` (gitignored).
- **Auto-Regenerated 365-Day Leaf Certificate**: Signed by the local CA with Subject Alternative Names (SANs) for the LAN IP, `127.0.0.1`, `localhost`, and `aerokin.local`. Automatically regenerated when the Wi-Fi IP changes or with <30 days validity remaining.
- **Port 8080 Trust Portal**: Lightweight, secure HTTP server dedicated solely to certificate installation:
  - Serves an Apple Configuration Profile (`/aerokin-ca.mobileconfig`, MIME `application/x-apple-aspen-config`).
  - Serves DER-encoded certificate (`/aerokin-ca.crt`).
  - Styled one-click instructions for iOS.
  - No tokens, no APIs, and no input endpoints are exposed on port 8080.
- **Windows One-Click Trust**: `pnpm run trust` imports the CA directly into the Windows CurrentUser Trusted Root store via `certutil`.
- **mDNS Multicast DNS**: Advertises `aerokin.local` via Bonjour service for local discovery.

### 2. High-Performance Native Win32 Input (`koffi`)
- Direct C ABI FFI via `koffi` (zero C++ compiler or Python build dependencies).
- **Sub-Pixel Cursor Movement**: `GetCursorPos` + `SetCursorPos` with move pulse to reveal browser video controls, bypassing Windows mouse acceleration curve for 1:1 remote fidelity.
- **Remainder Carry**: Server accumulates float deltas (`dx`, `dy`) across 8ms ticks with integer truncation and fractional carryover so low-speed gyroscopic tracking never loses sub-pixel motion.
- **Drag & Drop Support**: Mouse button state transitions (`{ type: "button", button: "left" | "right" | "middle", state: "down" | "up" }`) alongside immediate clicks.
- **Hardware Keyboard Scancodes**: `SendInput` using scan codes and `KEYEVENTF_EXTENDEDKEY` for arrow keys, media keys, and full-screen shortcuts.
- **Non-Windows Fallback**: Graceful automatic fallback to `@nut-tree-fork/nut-js` if running on macOS or Linux.

### 3. Universal 3-Tier Media Engine
- **Tier 1: Hardware Media Keys**: Direct Win32 VK scancodes for `playpause`, `next`, `prev`, `stop`, `volup`, `voldown`, and `mute` (<1ms execution).
- **Tier 2: Windows System Media Transport Controls (SMTC)**:
  - Persistent PowerShell 5.1 JSON-lines daemon (`scripts/media-sidecar.ps1`) interfacing with `GlobalSystemMediaTransportControlsSessionManager`.
  - Sub-15ms latency for bi-directional live playback telemetry (App, Title, Artist, Playing/Paused state, Timeline Position & Duration).
  - Direct seeking (`seekby` seconds, `seekto` timestamp) and direct Windows master volume control (`IAudioEndpointVolume`).
- **Tier 3: Context-Aware Keystroke Profiles (`server/src/profiles.json`)**:
  - Automatically identifies the active foreground application (YouTube, Netflix, Prime Video, VLC, mpv, MPC-HC, PotPlayer, Spotify, Windows Media Player) and sends tailored hotkeys (`j`/`l`/`f`, `Space`, Arrows).

---

## ✦ One-Time Trust Setup (60 Seconds)

To enable secure WebSockets, camera access, and DeviceMotion APIs on iOS without "Untrusted Certificate" warnings, install the AEROKIN Local CA on your iPhone once. Because the CA is valid for 10 years and signs all future leaf certificates, you will **never** have to repeat this step even when your Wi-Fi IP changes.

### iPhone Setup:
1. Connect your iPhone to the **same Wi-Fi network** as your Windows PC.
2. In terminal, start the server (`pnpm run dev`).
3. Scan **QR Code 1** (or navigate to `http://<your-pc-ip>:8080` in Safari).
4. Tap **"Install iOS Profile"** and choose **"Allow"** when prompted.
5. Open iPhone **Settings**:
   - Tap **Profile Downloaded** (near the top).
   - Tap **Install** in the top right, enter your passcode, and confirm.
6. Enable Full Trust:
   - Go to **Settings** → **General** → **About**.
   - Scroll to the very bottom and tap **Certificate Trust Settings**.
   - Under *Enable full trust for root certificates*, toggle **AEROKIN Local CA** to **ON**.
7. Now scan **QR Code 2** (`https://<your-pc-ip>:8443/?token=<token>`). Safari will open with a valid green lock and full motion sensor permissions!

### Windows PC Setup (Zero Warnings on Localhost):
To trust the CA on your Windows machine:
```bash
pnpm run trust
```
A Windows Security Warning dialog will appear asking to confirm installing the AEROKIN Local CA into your personal Root store. Click **Yes**. `https://localhost:8443` will now load cleanly in Chrome and Edge.

---

## ✦ Security & Local CA Risk Disclosure

> [!IMPORTANT]
> The AEROKIN Local CA private key (`server/.certs/ca-key.pem`) is created exclusively on your local PC with restricted file permissions (`0600`) and is **never** transmitted over the network or exposed on any port. Port 8080 strictly serves the public certificate and iOS mobileconfig profile.  
> The CA is intended solely for home/local LAN use. The `server/.certs/` directory is gitignored and must never be committed to source control.

---

## ✦ Getting Started

### 1. Install Dependencies
```bash
cd server
pnpm install
```

### 2. Run in Development Mode
```bash
pnpm run dev
```

Options:
- Force a fresh token: `AEROKIN_NEW_TOKEN=1 pnpm run dev` or `pnpm run dev -- --new-token`
- Force certificate regeneration: delete `server/.certs/server-cert.pem`

### 3. Production Start / Build
```bash
pnpm run build
pnpm start
```

---

## ✦ Testing & Diagnostics

### Key Monitor Debugger (`/debug/keys`)
Open `https://localhost:8443/debug/keys` in Chrome or Edge on the Windows PC (restricted to loopback only). Keep the browser window focused to view live keystrokes, scan codes, and arrow events dispatched by the PWA.

### Automated Test Scripts
- **Unit Tests**:
  ```bash
  pnpm run test
  ```
  Validates sub-pixel remainder accumulation, integer truncation, ±200 cap, and message protocol schemas using Vitest.

- **Native Win32 Input Test**:
  ```bash
  pnpm run test:input
  ```
  Moves the mouse cursor in a 100px square using `GetCursorPos` / `SetCursorPos` and prints the active foreground window.

- **Universal Media Engine Test**:
  ```bash
  pnpm run test:media
  ```
  Spawns the SMTC sidecar, inspects all media sessions, prints active playback metadata and volume, and tests play/pause and seek commands.

---

## ✦ WebSocket Protocol Reference

### Client → Server Messages:
- `{ type: "move", dx: number, dy: number }`: Relative cursor motion (float supported, capped ±200, coalesced ~8ms).
- `{ type: "click", button: "left" | "right" | "middle" }`: Immediate click.
- `{ type: "button", button: "left" | "right" | "middle", state: "down" | "up" }`: Mouse press/release for drag operations.
- `{ type: "scroll", dy: number, dx?: number }`: Vertical and horizontal scrolling with remainder carry.
- `{ type: "media", action: string }`: Media actions (`playpause`, `next`, `prev`, `stop`, `volup`, `voldown`, `mute`, `fullscreen`, `seekfwd`, `seekback`).
- `{ type: "seekby", seconds: number }`: Relative seek forward/back.
- `{ type: "seekto", position: number }`: Absolute position seek in seconds.
- `{ type: "session", id: string }`: Select active SMTC media session.
- `{ type: "setvolume", level: number }`: Set master Windows volume (0 - 100).
- `{ type: "getvolume" }`: Request current volume and mute state.
- `{ type: "ping", t: number }`: Round-trip latency probe.

### Server → Client Broadcasts:
- `{ type: "hello", ok: true }`: Sent upon authorized connection.
- `{ type: "pong", t: number }`: Latency response.
- `{ type: "nowplaying", app, title, artist, status, position, duration, canSeek, volume, muted }`: Live media state.
- `{ type: "sessions", list: Array<{ id, app, title, current }> }`: Available media playback targets.
