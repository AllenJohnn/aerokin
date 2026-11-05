# AeroKin Desktop Streaming Architecture & Research

## 1. Executive Summary & Chosen Architecture

For the AeroKin live Windows desktop streaming to iPhone Safari PWA over a local Wi-Fi LAN:

- **Primary / Default Pipeline**: **Pipeline (1) - FFmpeg DXGI/GDI Capture -> JPEG over Dedicated WebSocket -> `createImageBitmap` / Canvas Rendering**.
- **Stream Endpoint**: Dedicated authenticated WebSocket path (`wss://<PC-LAN-IP>:8443/desktop/stream`) separate from the high-frequency control/input WebSocket (`wss://<PC-LAN-IP>:8443`).
- **Input Channel**: Absolute coordinate input (`abs_move`, `abs_click`, `abs_button`) and keyboard events sent over the existing control WebSocket, rate-limited and validated.

---

## 2. Pipeline Comparison Matrix

| Evaluation Dimension | Pipeline (1): JPEG / Binary WebSocket (Chosen) | Pipeline (2): H.264 / WebCodecs over WebSocket | Pipeline (3): WebRTC Video (node-datachannel / RTP) |
| :--- | :--- | :--- | :--- |
| **Windows Install Burden** | **Very Low** (Single `ffmpeg.exe` via winget or zip) | **Very Low** (Single `ffmpeg.exe` with libx264/NVENC) | **High** (C++ native addons, Node ABI prebuilts, `node-gyp`) |
| **Native C++ Addons** | None (koffi already in project for Win32 input) | None | Yes (`node-datachannel` or libdatachannel binaries) |
| **iPhone Safari Support** | **100% Universal** (iOS 15+ `createImageBitmap` + Canvas) | **Partial/Fragmented** (iOS 16.4+ behind flags / iOS 17+) | **Variable** (WebRTC works, but PWA autoplay & DTLS quirks) |
| **LAN-Only Compliance** | **Strict 100%** (Direct TLS WebSocket over local LAN IP) | **Strict 100%** (Direct TLS WebSocket over local LAN IP) | **Problematic** (No STUN/TURN allowed; fails on isolated Wi-Fi) |
| **Packet Loss Resilience**| **Immediate** (Every frame is an independent intra JPEG) | **Requires I-Frame** (P-frame corruption until next IDR) | **RTP NACK/PLI** (Requires RTCP feedback loop) |
| **Frame Latency** | ~35 - 65 ms (LAN Wi-Fi 5/6) [UNVERIFIED: Host environment restricted] | ~30 - 50 ms [UNVERIFIED] | ~25 - 45 ms [UNVERIFIED] |
| **LAN Bandwidth** | 3 - 8 Mbps (Preset dependent) [UNVERIFIED] | 1 - 3 Mbps [UNVERIFIED] | 1 - 2.5 Mbps [UNVERIFIED] |
| **Server CPU Load** | Low - Moderate (5-12% on modern multi-core) [UNVERIFIED] | Low (with NVENC/QSV/AMF) / Moderate (x264 ultrafast) | Moderate - High |
| **Audio Support** | Deferred / None (as specified) | Deferred / None | Included in RTP if piped |

---

## 3. Deep-Dive on Candidate Pipelines

### 3.1 Pipeline (1): JPEG over Dedicated Binary WebSocket (Default)
- **Capture Mechanism**: FFmpeg spawns with `-f lavfi -i ddagrab` (DirectX Desktop Duplication API) with automatic fallback to `-f gdigrab -i desktop` if Desktop Duplication is unavailable.
- **Encoding**: Hardware MJPEG or software JPEG with adjustable quality `-q:v 2` (High) down to `-q:v 8` (Performance).
- **Transport**: Binary frames streamed over `wss://<LAN-IP>:8443/desktop/stream`. Each frame carries a 16-byte binary header:
  - Magic (`0x41, 0x45, 0x52, 0x4F` = 'AERO')
  - `uint32` frame sequence number
  - `uint32` server capture timestamp (ms)
  - `uint16` image width
  - `uint16` image height
  Followed immediately by raw JPEG payload bytes (`0xFF, 0xD8 ... 0xFF, 0xD9`).
- **Client Rendering**:
  - iPhone Safari receives `ArrayBuffer`, parses the 16-byte metadata header, extracts the JPEG slice, and decodes via `createImageBitmap(blob)`.
  - The decoded `ImageBitmap` is rendered to a `<canvas>` via `ctx.drawImage()`, respecting aspect ratio letterboxing and touch coordinates.
- **Adaptive Backpressure**:
  - The server inspects `ws.bufferedAmount`. If `bufferedAmount > 256 KB` (indicating the phone's Wi-Fi link has dropped speed), the server immediately drops un-transmitted frames to keep stream latency strictly real-time and prevent buffer bloat.

### 3.2 Pipeline (2): H.264 via WebCodecs
- **Pros**: Lower bandwidth (~1.5 Mbps vs ~5 Mbps for JPEG).
- **Cons & Risks**:
  - `VideoDecoder` API in iOS Safari requires parsing Annex B NAL units into `EncodedVideoChunk` and assembling custom `description` avcC atoms for H.264 baseline/high profiles.
  - On iOS Safari in PWA standalone mode, WebCodecs occasionally stalls decoder queues when canvas dimensions change.
  - If a frame is dropped due to Wi-Fi jitter, all subsequent P-frames tear until the next I-frame (forcing low GOP `keyint=15`, which negates most bandwidth advantage).

### 3.3 Pipeline (3): WebRTC Video
- **Pros**: Native browser video tag decoding, built-in jitter buffer.
- **Cons & Risks**:
  - Extreme dependency burden: `node-datachannel` requires prebuilt C++ binaries for Node.js on Windows. Prebuilt binaries frequently break across Node versions (e.g. Node 20 vs 22 vs 24).
  - Standing rule constraint: AeroKin strictly forbids external STUN/TURN servers. Without STUN/TURN, WebRTC ICE candidates must rely exclusively on local host candidates (`host`), which iOS Safari frequently blocks or obscures with mDNS `.local` hostnames due to privacy protections.

---

## 4. Obtaining & Verifying FFmpeg on Windows

FFmpeg is NOT bundled or committed to git (per standing rules). It is detected dynamically by the server.

### Automatic Discovery Order:
1. System PATH (`ffmpeg.exe`)
2. User WinGet Links directory: `%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe`
3. Pinned project tools folder: `<repo-root>\tools\ffmpeg\bin\ffmpeg.exe` (ignored by git)

### Installation Methods:
1. **Via WinGet (Recommended)**:
   ```powershell
   winget install --id Gyan.FFmpeg.Essentials --accept-source-agreements --accept-package-agreements --scope user
   ```
2. **Manual Download**:
   Download `ffmpeg-release-essentials.zip` from https://www.gyan.dev/ffmpeg/builds/ and extract `ffmpeg.exe` into `aerokin\tools\ffmpeg\bin\`.

---

## 5. Benchmark Script (`server/scripts/desktop-bench.ts`)

A dedicated benchmark script is provided in `server/scripts/desktop-bench.ts` to measure real-world performance metrics:
- Capture FPS
- Encode latency (ms)
- Average frame size (KB)
- Memory and CPU usage

### Execution Command:
```powershell
pnpm --filter aerokin-server exec tsx scripts/desktop-bench.ts
```

### Host Environment Measurement Note:
> [!IMPORTANT]
> In automated/background agent sessions without an active interactive Windows desktop station (`WinSta0\Default`), Windows security blocks direct screen capture with `error 5: Access is denied` or `Desktop duplication access denied`.
> Therefore, benchmark numbers for live capture are marked **UNVERIFIED in the agent container** and must be measured on an interactive laptop session.
