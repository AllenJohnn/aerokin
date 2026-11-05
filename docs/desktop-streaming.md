# AeroKin Desktop Streaming Architecture & Research

## 1. Implementation Status & Plain Truth

> [!IMPORTANT]
> **Only Pipeline (1) (FFmpeg Desktop Duplication / GDI Grab -> JPEG over Dedicated Binary WebSocket -> Canvas) is implemented in AeroKin.**  
> Pipeline (2) (H.264 via WebCodecs) and Pipeline (3) (WebRTC Video) are **untested conceptual alternatives** that were considered during architecture review but never built, benchmarked, or verified in this repository. Any figures regarding their CPU, latency, or bandwidth are unmeasured theoretical estimates.

- **Active Pipeline**: Pipeline (1) — JPEG frames over dedicated authenticated binary WebSocket (`/desktop/stream`).
- **Primary Windows Capture Backend**: `ddagrab` (DXGI Desktop Duplication API) with hardware frame download filter chain: `ddagrab=framerate=N:draw_mouse=1:output_idx=<idx>` -> `hwdownload,format=bgra` -> `scale=<w>:<h>`.
- **Automatic Fallback Backend**: `gdigrab` with explicit monitor offsets (`-offset_x`, `-offset_y`, `-video_size`, `-i desktop`). Automatically engaged if `output_idx` cannot be mapped, if `ddagrab` produces a stderr error, or if no frame arrives within 3 seconds.
- **Encoding**: Software MJPEG encoder (`-c:v mjpeg`) using standard FFmpeg software compression (no proprietary hardware encoders or NVENC assumed).
- **Transport**: Binary WebSocket (`wss://<PC-LAN-IP>:8443/desktop/stream`), gated by cryptographic device credential verification.
- **Input Channel**: Absolute coordinate input (`abs_move`, `abs_click`, `abs_button`) and keyboard events routed over the existing authenticated control WebSocket (`wss://<PC-LAN-IP>:8443`).

---

## 2. Pipeline Comparison Matrix

| Evaluation Dimension | Pipeline (1): JPEG / Binary WebSocket (**Implemented**) | Pipeline (2): H.264 / WebCodecs (**Untested Alternative**) | Pipeline (3): WebRTC Video (**Untested Alternative**) |
| :--- | :--- | :--- | :--- |
| **Implementation Status** | **SHIPPED & ACTIVE** | **NOT IMPLEMENTED** (Theoretical alternative) | **NOT IMPLEMENTED** (Theoretical alternative) |
| **Windows Dependencies** | Single `ffmpeg.exe` (WinGet or unzipped) | Single `ffmpeg.exe` with H.264 encoder | High (Native C++ addons, Node ABI bindings, `node-gyp`) |
| **Native C++ Addons** | None (`koffi` already present for Win32 input) | None | Yes (`node-datachannel` or libdatachannel binaries) |
| **iPhone Safari Support** | Universal (`createImageBitmap` + `<canvas>`, iOS 15+) | UNVERIFIED (iOS WebCodecs support varies by iOS minor version) | UNVERIFIED (Autoplay & local ICE constraints in standalone PWA) |
| **Same-LAN Compliance** | 100% compliant (Direct TLS WebSocket on LAN IP) | 100% compliant (Direct TLS WebSocket on LAN IP) | UNVERIFIED (STUN/TURN forbidden; local ICE candidate gathering behavior untested) |
| **Packet Loss Recovery** | Immediate (Every frame is independent JPEG) | UNVERIFIED (Requires I-frame keyframe request on packet loss) | UNVERIFIED (Requires RTCP PLI/NACK feedback loop) |
| **Frame Latency** | UNVERIFIED on host (subshell environment restricted) | UNVERIFIED (Unmeasured estimate: 30 - 60 ms) | UNVERIFIED (Unmeasured estimate: 25 - 50 ms) |
| **LAN Bandwidth** | UNVERIFIED on host (Unmeasured estimate: 3 - 8 Mbps) | UNVERIFIED (Unmeasured estimate: 1 - 3 Mbps) | UNVERIFIED (Unmeasured estimate: 1 - 2.5 Mbps) |
| **Server CPU Load** | UNVERIFIED on host (Software MJPEG load depends on core count) | UNVERIFIED | UNVERIFIED |

---

## 3. Deep-Dive on Candidate Pipelines

### 3.1 Pipeline (1): JPEG over Dedicated Binary WebSocket (Shipped Implementation)
- **Capture Mechanism**:
  - Primary: DXGI Desktop Duplication API (`ddagrab`). Uses filter graph `ddagrab=framerate=<fps>:draw_mouse=1:output_idx=<idx>` followed by `hwdownload,format=bgra` to transfer D3D11 hardware surfaces into system memory, then scales to target dimensions.
  - Fallback: Win32 GDI Grab (`gdigrab`) with exact pixel coordinate offsets (`-offset_x <x> -offset_y <y> -video_size <w>x<h> -i desktop`).
  - Automatic Switchover: If `ddagrab` encounters a stderr error (e.g. access denied), if monitor ID mapping cannot be determined, or if no frame is produced within 3 seconds, the agent automatically retries with `gdigrab` and logs the active backend to console and client `desktop_status`.
- **Encoding**: Software MJPEG (`-c:v mjpeg -q:v <quality>`). AeroKin does **not** rely on hardware MJPEG encoders; standard CPU encoding is used for universal compatibility.
- **Packet Structure**:
  Each binary WebSocket message carries a 16-byte header:
  - `[0..3]`: ASCII `'AERO'`
  - `[4..7]`: `uint32` frame sequence counter (little-endian)
  - `[8..11]`: `uint32` server capture timestamp in ms (little-endian)
  - `[12..13]`: `uint16` frame width in pixels (little-endian)
  - `[14..15]`: `uint16` frame height in pixels (little-endian)
  - Followed immediately by raw JPEG image bytes (`0xFF, 0xD8 ... 0xFF, 0xD9`).
- **Client Canvas Decoding**:
  - The PWA receives the `ArrayBuffer`, slices the payload, decodes via `createImageBitmap(blob)`, and renders onto a letterboxed `<canvas>`.
  - Memory management: Each new frame closes the previous `ImageBitmap` via `bitmap.close()` to prevent memory leaks in WebKit.
- **Adaptive Backpressure**:
  - The server inspects `ws.bufferedAmount`. If `bufferedAmount > 256 KB` (e.g. Wi-Fi throttling or temporary packet congestion), the server immediately drops new captured frames until the buffer drains, preventing latency buildup.

### 3.2 Pipeline (2): H.264 via WebCodecs (Untested Concept)
- **Status**: Not implemented.
- **Concept**: Stream H.264 Annex B NAL units over WebSocket; decode in browser using `VideoDecoder`.
- **Unverified Assumptions**:
  - WebCodecs support and decoder initialization in iOS Safari PWA standalone mode are unverified.
  - Frame drop recovery and keyframe insertion behavior over local WebSockets are unmeasured.

### 3.3 Pipeline (3): WebRTC Video (Untested Concept)
- **Status**: Not implemented.
- **Concept**: Stream video tracks over a peer-to-peer WebRTC connection using a native Node library like `node-datachannel`.
- **Unverified Assumptions & Known Risks**:
  - AeroKin forbids external STUN/TURN servers. Operating WebRTC strictly on host candidates over isolated Wi-Fi or complex home subnets without STUN is unverified and often problematic on iOS Safari due to mDNS `.local` candidate masking.
  - Node.js native addon prebuilt binaries on Windows frequently cause ABI incompatibility across Node LTS versions.

---

## 4. Obtaining & Verifying FFmpeg on Windows

FFmpeg is NOT committed to git repository storage. It is detected dynamically by `findFfmpegPath()`.

### Automatic Discovery Locations:
1. System PATH (`ffmpeg.exe`)
2. WinGet Links directory: `%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe`
3. WinGet Packages directory: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg.*`
4. Local project tools directory: `<repo-root>\tools\ffmpeg\bin\ffmpeg.exe` (gitignored)

### Installation:
```powershell
winget install --id Gyan.FFmpeg.Essentials --accept-source-agreements --accept-package-agreements --scope user
```

---

## 5. Verification & Diagnostics Scripts

Two diagnostic tools are provided to test capture and streaming performance:

### 1. Capture Diagnostics Check (`server/scripts/capture-check.ts`):
Runs both `ddagrab` and `gdigrab` backends for 5 seconds each on the primary display, printing captured frames, FPS, average frame size, and raw FFmpeg stderr:
```powershell
pnpm --filter aerokin-server run capture:check
```

### 2. Multi-Preset Benchmark (`server/scripts/desktop-bench.ts`):
Iterates through all quality presets (`ultra`, `high`, `balanced`, `fast`, `low`) and records capture throughput:
```powershell
pnpm --filter aerokin-server run bench:desktop
```

> [!NOTE]
> **Subshell / Automated Service Isolation**:  
> In automated CI/subshell processes without an attached interactive Windows desktop station (`WinSta0\Default`), Windows security denies desktop duplication with `error 5: Access is denied` or `Desktop duplication access denied`.  
> Real capture throughput and frame rate must be verified directly from an interactive Windows user session.
