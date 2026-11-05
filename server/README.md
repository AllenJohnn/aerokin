# AEROKIN Server (`aerokin-server`)

> High-performance Node.js + TypeScript input automation and screen streaming daemon for Windows. Pairs with the AEROKIN iPhone Safari PWA over local Wi-Fi to provide multi-touch trackpad control, Windows media playback management, and low-latency desktop screen streaming.

---

## ✦ Key Architecture & Features

### 1. Trusted HTTPS & Cryptographic Device Pairing
- **10-Year AEROKIN Local Root CA**: Automatically generated once and stored in `server/.certs/` (gitignored).
- **Auto-Regenerated 365-Day Leaf Certificate**: Signed by the local CA with Subject Alternative Names (SANs) for the LAN IP, `127.0.0.1`, `localhost`, and `aerokin.local`. Automatically regenerated when the Wi-Fi IP changes.
- **Port 8080 Trust Portal**: Lightweight HTTP server dedicated solely to certificate installation:
  - Serves Apple Configuration Profile (`/aerokin-ca.mobileconfig`, MIME `application/x-apple-aspen-config`).
  - Serves DER-encoded certificate (`/aerokin-ca.crt`).
  - No tokens, no credentials, and no input endpoints are exposed on port 8080.
- **8-Digit Ephemeral Pairing & Persistent Credentials**:
  - Secure out-of-band device pairing using 8-digit single-use codes (120-second expiration).
  - PC operator grants explicit terminal approval before device registration.
  - Paired devices receive a 32-byte cryptographic credential; server verifies SHA-256 hashes via timing-safe comparison (`crypto.timingSafeEqual`) stored in `server/.certs/devices.json`.
  - Stolen or stale devices can be revoked immediately from the PC terminal (`revoke <id>` or `revoke-all`).
- **mDNS Multicast DNS**: Advertises `aerokin.local` via Bonjour service for local discovery.

### 2. Live Desktop Remote Streaming (`server/src/desktop`)
- **Pipeline**: Real-time Windows screen capture streamed as JPEG frames over a dedicated authenticated binary WebSocket path (`/desktop/stream`).
- **Hardware D3D11 Capture (`ddagrab`)**: Captures GPU display frames via DXGI Desktop Duplication API and downloads to system memory via `hwdownload,format=bgra` before scaling and software MJPEG encoding.
- **Automatic GDI Fallback (`gdigrab`)**: Automatically falls back to GDI capture with exact multi-monitor coordinate offsets if `ddagrab` encounters errors (e.g. non-interactive sessions), if display indexing cannot be determined, or if no frame is delivered within 3 seconds.
- **Per-Monitor V2 DPI Awareness**: Uses `SetProcessDpiAwarenessContext(-4)` and Win32 display APIs (`EnumDisplayMonitors`, `GetMonitorInfoW`, `GetDpiForMonitor`) to enumerate monitors, work areas, and DPI scale factors.
- **Adaptive Backpressure**: Drops un-transmitted frames when socket buffer exceeds 256KB to maintain strictly real-time responsiveness and eliminate buffer bloat over Wi-Fi.
- **Security & Indicators**: Automatically detects locked screens and secure UAC desktops, transitioning to a `secure_screen` state without crashing. Console title reflects `AeroKin: REMOTE VIEWING ACTIVE` with an active viewer banner.
- **Emergency Termination**: Terminal commands `desktop` (inspect active session) and `stop-desktop` (instantly sever active stream socket).

### 3. Native Win32 Input Injection (`koffi`)
- **Direct Win32 C ABI FFI**: Direct calls to `user32.dll` via `koffi` (no compiler or Python build tools required).
- **Absolute Positioning**: `SendInput` with `MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK` for touch-to-screen coordinate mapping across multi-monitor arrays.
- **Relative Trackpad Positioning**: `GetCursorPos` + `SetCursorPos` with sub-pixel remainder accumulation for 1:1 trackpad feel.
- **Drag & Drop Operations**: Full button press/release transitions (`abs_button`, `button`).
- **Keyboard Injection**: Rate-limited key injection (`SendInput`) supporting sticky modifiers (`Ctrl`, `Alt`, `Shift`, `Win`), navigation keys, common shortcuts (`Ctrl+C`, `Ctrl+V`, `Alt+Tab`, `Win+D`, `Alt+F4`), and Unicode character input without executing command shells.

### 4. Universal 3-Tier Media Engine
- **Tier 1: Hardware Media Keys**: Direct Win32 VK scancodes for `playpause`, `next`, `prev`, `stop`, `volup`, `voldown`, and `mute`.
- **Tier 2: System Media Transport Controls (SMTC)**:
  - Persistent PowerShell 5.1 JSON-lines daemon (`scripts/media-sidecar.ps1`) interfacing with `GlobalSystemMediaTransportControlsSessionManager`.
  - Bi-directional live playback metadata (App, Title, Artist, Play/Pause state, Position, Duration).
  - Seeking (`seekby` seconds, `seekto` timestamp) and direct Windows master volume control (`IAudioEndpointVolume`).
- **Tier 3: Context-Aware Profiles (`server/src/profiles.json`)**:
  - Automatically tailors hotkeys to the active foreground application (YouTube, Netflix, Spotify, VLC, mpv).

---

## ✦ One-Time Trust & Pairing Setup (60 Seconds)

Install the AEROKIN Local CA on your iPhone once to eliminate SSL warnings. Because the CA is valid for 10 years and signs all future leaf certificates, this step is performed only once.

### iPhone Setup:
1. Connect your iPhone to the **same Wi-Fi network** as your Windows PC.
2. In terminal, start the server (`pnpm run dev` or `pnpm start`).
3. Scan **QR Code 1** (or visit `http://<pc-lan-ip>:8080` in Safari).
4. Tap **"Install iOS Profile"** and choose **"Allow"** when prompted.
5. Open iPhone **Settings**:
   - Tap **Profile Downloaded** (near the top).
   - Tap **Install** in the top right, enter your passcode, and confirm.
6. Enable Full Trust:
   - Go to **Settings** → **General** → **About** → **Certificate Trust Settings**.
   - Under *Enable full trust for root certificates*, toggle **AEROKIN Local CA** to **ON**.
7. Scan **QR Code 2** (`https://<pc-lan-ip>:8443/#code=<8-digit-code>`).
8. Enter your device name and tap **Pair**. On your PC terminal, press `y` to approve the connection. Your iPhone is now permanently paired!

### Windows PC Localhost Trust:
To trust the CA on your local Windows PC:
```powershell
pnpm run trust
```

---

## ✦ Terminal Commands

While the server is running, the interactive terminal accepts the following operator commands:
- `pair` — Generate a new 8-digit pairing code and QR code.
- `devices` — List all registered devices with IDs, platforms, and revocation status.
- `revoke <id>` — Revoke and immediately disconnect a device.
- `revoke-all` — Revoke and disconnect all devices.
- `desktop` — Display active desktop remote streaming session info and metrics.
- `stop-desktop` — Immediately terminate the active desktop streaming session.
- `help` — Show available commands.

---

## ✦ Diagnostics & Testing

- **Capture Backend Check**:
  ```powershell
  pnpm run capture:check
  ```
  Runs `ddagrab` and `gdigrab` for 5 seconds each on the primary monitor, reporting frames captured, measured FPS, average frame size, and raw FFmpeg stderr.

- **Desktop Streaming Benchmark**:
  ```powershell
  pnpm run bench:desktop
  ```
  Benchmarks capture throughput and frame sizes across all quality presets.

- **H.264 WebCodecs Spike Server**:
  ```powershell
  pnpm run spike:h264
  ```
  Runs the isolated H.264 streaming experiment on port 8444 for testing in Chrome and iPhone Safari.

- **Unit Test Suite**:
  ```powershell
  pnpm test
  ```
  Runs Vitest covering device store, pairing state machine, protocol bounds, coordinate transformations, capture argument builders, and media routing.

- **Native Win32 Input Test**:
  ```powershell
  pnpm run test:input
  ```

- **Universal Media Engine Test**:
  ```powershell
  pnpm run test:media
  ```

---

## ✦ Protocol Reference

### Client → Server (Control WebSocket `wss://<IP>:8443`):
- `{ type: "auth", deviceId: string, credential: string }`: Initial authentication.
- `{ type: "pair_request", code: string, name: string, platform: string }`: Submit 8-digit pairing code.
- `{ type: "move", dx: number, dy: number }`: Relative trackpad cursor movement.
- `{ type: "click", button: "left" | "right" | "middle" }`: Immediate mouse click.
- `{ type: "button", button: "left" | "right" | "middle", state: "down" | "up" }`: Mouse press/drag.
- `{ type: "scroll", dy: number, dx?: number }`: Vertical and horizontal scrolling.
- `{ type: "abs_move", x: number, y: number, monitorId?: string }`: Normalized absolute cursor position `[0, 1]`.
- `{ type: "abs_click", button: string, count?: number, x?: number, y?: number, monitorId?: string }`: Absolute click.
- `{ type: "abs_button", button: string, state: "down" | "up", x?: number, y?: number, monitorId?: string }`: Absolute drag.
- `{ type: "key", key: string, action?: "down" | "up" | "tap", modifiers?: string[] }`: Keyboard key press.
- `{ type: "text", text: string }`: Unicode text string insertion.
- `{ type: "desktop_start", monitorId?: string, preset?: string, customScale?: number, customFps?: number }`: Start desktop stream.
- `{ type: "desktop_stop" }`: Terminate active desktop stream.
- `{ type: "desktop_monitors" }`: Query display monitor list.
- `{ type: "media", action: string }`: Media transport actions (`playpause`, `next`, `prev`, `volup`, `voldown`, `mute`).
- `{ type: "seekby", seconds: number }`: Relative media seek.
- `{ type: "seekto", position: number }`: Absolute media seek.
- `{ type: "setvolume", level: number }`: Master volume (0 - 100).
- `{ type: "ping", t: number }`: Latency measurement probe.

### Client ← Server Stream WebSocket (`wss://<IP>:8443/desktop/stream`):
- Binary packets consisting of a 16-byte metadata header (`'AERO'` magic + sequence + timestamp + width + height) followed by raw JPEG bytes.
