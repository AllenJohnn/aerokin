# AEROKIN Server (`aerokin-server`)

> **"Move the air. Move your PC."**  
> High-performance Node.js + TypeScript input automation daemon for Windows. Pairs with the AEROKIN iPhone PWA to translate gyroscope and gesture telemetry into native cursor movement, clicks, and media keys.

---

## ✦ Features

- **Single Port (8443)**: Runs HTTPS and WebSocket on port `8443` simultaneously.
- **Auto SSL**: Automatically generates a self-signed certificate on first run with Subject Alternative Names (SANs) containing the host's Wi-Fi LAN IP, cached in `.certs/`.
- **Wi-Fi Auto-Detection**: Automatically identifies the physical Wi-Fi adapter IPv4 while ignoring virtual/VPN adapters.
- **Terminal QR Code**: Prints an instant connection QR code and URL on launch with a random 6-character session token.
- **Token Auth**: Rejects any unauthorized WebSocket connection without the valid token (WebSocket close code `4001`).
- **Low-Latency Native Input**: Powered by `@nut-tree-fork/nut-js` configured for zero auto-delay.
- **Supported Message Types**:
  - `{ type: "move", dx: number, dy: number }` (capped to ±200px per packet)
  - `{ type: "click", button: "left" | "right" }`
  - `{ type: "scroll", dy: number }`
  - `{ type: "media", action: "playpause" | "next" | "prev" | "volup" | "voldown" | "mute" | "fullscreen" | "seekfwd" | "seekback" }`
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
