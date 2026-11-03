# AEROKIN Server (`aerokin-server`)

> **"Move the air. Move your PC."**  
> High-performance Node.js + TypeScript input automation daemon for Windows. Pairs with the AEROKIN iPhone PWA to translate gyroscope and gesture telemetry into native cursor movement, clicks, and media keys.

---

## ✦ Features

- **Single Port (8443)**: Runs HTTPS and WebSocket on port `8443` simultaneously.
- **Auto SSL & IP Persistence**: Automatically generates a self-signed certificate on first run with Subject Alternative Names (SANs) containing the host's Wi-Fi LAN IP, cached in `server/.certs/`. The active IP is saved in `server/.certs/ip.txt`. If the Wi-Fi IP changes, the certificate is automatically regenerated and a note is printed.
- **Wi-Fi Auto-Detection**: Automatically identifies the physical Wi-Fi adapter IPv4 while ignoring virtual/VPN adapters.
- **Persistent Auth Token**: Generates and persists a 6-character token in `server/.certs/token.txt`, reusing it across restarts so you don't have to re-pair every time. Use `AEROKIN_NEW_TOKEN=1` (or `--new-token`) to force a new token.
- **Terminal QR Code**: Prints an instant connection QR code and URL on launch.
- **Token Auth**: Rejects any unauthorized WebSocket connection without the valid token (WebSocket close code `4001`).
- **Coalesced Movement**: Per connection, accumulates `dx`/`dy` deltas and flushes every ~8ms with a single OS call (`mouse.getPosition` + `setPosition`), with only one OS call in flight at a time. Preserves the ±200px cap per incoming packet.
- **Immediate Controls**: Clicks, scrolling, and media keys execute immediately without batching.
- **Supported Message Types**:
  - `{ type: "move", dx: number, dy: number }` (capped to ±200px per packet, coalesced ~8ms)
  - `{ type: "click", button: "left" | "right" }` (immediate)
  - `{ type: "scroll", dy: number }` (immediate)
  - `{ type: "media", action: "playpause" | "next" | "prev" | "volup" | "voldown" | "mute" | "fullscreen" | "seekfwd" | "seekback" }` (immediate)
  - `{ type: "ping", t: number }` -> responds with `{ type: "pong", t: number }` for latency measurement.

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

To force generating a new auth token:
```bash
AEROKIN_NEW_TOKEN=1 pnpm run dev
# or
pnpm run dev -- --new-token
```

### 3. Production Start / Build
```bash
pnpm run build
pnpm start
```

---

## ✦ IMPORTANT: Windows Firewall Configuration

When running the server for the first time, Windows Defender Firewall may display a security prompt:

> **"Windows Defender Firewall has blocked some features of this app"**

1. Ensure **"Private networks, such as my home or work network"** is **CHECKED**.
2. Click **Allow access**.
3. Ensure both your Windows PC and your iPhone are connected to the **same Wi-Fi network**.

---

## ✦ Connecting from iPhone

1. Open your iPhone camera and scan the QR code printed in the terminal.
2. Open the URL (`https://<your-ip>:8443/?token=<token>`).
3. Because the connection uses a self-signed TLS certificate generated specifically for your local IP, Safari will display a standard local certificate warning.
4. Tap **Show Details** -> **visit this website** to trust your local computer's certificate.
