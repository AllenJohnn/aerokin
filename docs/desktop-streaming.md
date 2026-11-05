# AeroKin Desktop Streaming Architecture & Research

## 1. Implementation Status & Plain Truth

> [!IMPORTANT]
> **Only the JPEG-over-WebSocket pipeline (1) is implemented and active in AeroKin.**  
> Pipeline (2) (H.264 via WebCodecs) is available only as an **isolated experimental spike** (`server/scripts/h264-spike` and `pwa/public/h264-test.html`) for empirical measurement; it is **NOT** part of the production PWA app.  
> Pipeline (3) (WebRTC Video) was **never implemented** and remains an untested conceptual alternative. Any claims regarding WebRTC latency, host candidate behavior on isolated Wi-Fi, or CPU overhead remain UNVERIFIED.

- **Active Production Pipeline**: JPEG frames over dedicated authenticated binary WebSocket (`/desktop/stream`).
- **Primary Windows Capture Backend**: `ddagrab` (DXGI Desktop Duplication API) with hardware frame download filter chain: `ddagrab=framerate=N:draw_mouse=1:output_idx=<idx>` -> `hwdownload,format=bgra` -> `scale=<w>:<h>`.
- **Automatic Fallback Backend with Session Memory**: `gdigrab` with explicit monitor offsets (`-offset_x`, `-offset_y`, `-video_size`, `-i desktop`). Automatically engaged if `output_idx` cannot be mapped, if `ddagrab` produces a stderr error, or if no frame arrives within 3 seconds. The working backend is remembered for the session so subsequent stream starts connect instantly without retrying `ddagrab`.
- **Encoding**: Software MJPEG encoder (`-c:v mjpeg`) using standard FFmpeg software compression (no proprietary hardware encoders or NVENC assumed for production).
- **Transport**: Binary WebSocket (`wss://<PC-LAN-IP>:8443/desktop/stream`), gated by cryptographic device credential verification.
- **Input Channel**: Absolute coordinate input (`abs_move`, `abs_click`, `abs_button`) and keyboard events routed over the existing authenticated control WebSocket (`wss://<PC-LAN-IP>:8443`).

---

## 2. Measured Baseline Metrics (Allen's Host Laptop)

**Test System**: Intel Core / NVIDIA Laptop, Windows 11, Primary Display 1920x1080 @ 125% DPI scale, capture via `gdigrab` (`ddagrab` failed due to dual-GPU DXGI desktop duplication error):

| Quality Preset | Configuration | Measured Frame Size | Measured Bitrate | Measured FPS | Active Capture Backend |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fast** (Default) | 50% scale (960x540), q7, 30 fps | ~60 KB / frame | **14 Mbps** | 30.0 fps | `gdigrab` (remembered) |
| **Balanced** | 75% scale (1440x810), q5, 30 fps | ~147 KB / frame | **34 Mbps** | 30.0 fps | `gdigrab` (remembered) |
| **High** | 100% scale (1920x1080), q3, 30 fps | ~268 KB / frame | **63 Mbps** | 30.0 fps | `gdigrab` (remembered) |
| **Tiny** (Low Wi-Fi) | 40% scale (768x432), q8, 15 fps | ~35 KB / frame (est) | **~4.2 Mbps** (est) | 15.0 fps | `gdigrab` (remembered) |

### Bandwidth Optimization Results (Task 2):
1. **Frame Deduplication (Idle vs Moving Window)**:
   - **Static Screen (Idle)**: Identical consecutive frames are detected in memory via SIMD byte comparison in ~0.006 ms. Duplicate transmissions are skipped; a keepalive frame is transmitted every 1000 ms to maintain socket health.
   - **Measured Idle Bandwidth**: Drops by **>95%** (from 14–63 Mbps down to **~0.48–2.1 Mbps** on static desktop screens).
   - **Moving Window**: As soon as any screen content or cursor changes, frames transmit immediately at full preset rate.
2. **Adaptive Quality Backpressure**:
   - Monitored via `ws.bufferedAmount` and dropped frames.
   - If congestion persists for > 1000 ms, the server automatically steps down one preset tier (`ultra` -> `high` -> `balanced` -> `fast` -> `tiny`).
   - If network stays clean for > 10,000 ms, the server steps back up towards the user's chosen preset cap (never exceeding the user's configured ceiling).

---

## 3. Pipeline Comparison Matrix

| Evaluation Dimension | Pipeline (1): JPEG / Binary WebSocket (**Implemented**) | Pipeline (2): H.264 / WebCodecs (**Experimental Spike Only**) | Pipeline (3): WebRTC Video (**Untested Alternative**) |
| :--- | :--- | :--- | :--- |
| **Implementation Status** | **SHIPPED & ACTIVE** | **ISOLATED SPIKE ONLY** (Not in production app) | **NOT IMPLEMENTED** (Theoretical alternative) |
| **Windows Dependencies** | Single `ffmpeg.exe` (WinGet or unzipped) | Single `ffmpeg.exe` with H.264 encoder | High (Native C++ addons, Node ABI bindings, `node-gyp`) |
| **Native C++ Addons** | None (`koffi` already present for Win32 input) | None | Yes (`node-datachannel` or libdatachannel binaries) |
| **iPhone Safari Support** | Universal (`createImageBitmap` + `<canvas>`, iOS 15+) | UNVERIFIED (Feature detect provided in spike) | UNVERIFIED (Autoplay & local ICE constraints in standalone PWA) |
| **Same-LAN Compliance** | 100% compliant (Direct TLS WebSocket on LAN IP) | 100% compliant (Direct WebSocket on LAN IP) | UNVERIFIED (STUN/TURN forbidden; local ICE candidate gathering behavior untested) |
| **Packet Loss Recovery** | Immediate (Every frame is independent JPEG) | Requires IDR keyframe insertion every 1–2s | UNVERIFIED (Requires RTCP PLI/NACK feedback loop) |
| **Idle LAN Bandwidth** | **0.5 - 2 Mbps** (with deduplication keepalive) | Expected lower (~0.2 - 1 Mbps, UNVERIFIED) | UNVERIFIED |
| **Moving LAN Bandwidth**| **14 - 63 Mbps** (measured baseline) | Expected 1.5 - 4 Mbps (UNVERIFIED) | UNVERIFIED |
| **Server CPU Load** | ~8 - 15% on laptop CPU (Software MJPEG) | Lower with NVENC hardware acceleration | UNVERIFIED |

---

## 4. H.264 WebCodecs Spike (Isolated Experiment)

A separate spike is provided in `server/scripts/h264-spike.ts` and `pwa/public/h264-test.html`.

### Host Hardware Encoder Probing Results:
Measured on host machine running Gyan.dev FFmpeg 9.0.1:
- `h264_nvenc`: **MEASURED SUCCESS** (NVIDIA NVENC hardware encoder initialized and functioning).
- `h264_mf`: **MEASURED SUCCESS** (Windows MediaFoundation encoder initialized and functioning).
- `libx264`: **MEASURED SUCCESS** (CPU software encoder functioning as universal fallback).
- `h264_qsv`: **MEASURED FAILED** (Intel QSV failed: `Error creating a MFX session: -9`).
- `h264_amf`: **MEASURED FAILED** (AMD AMF failed: `DLL amfrt64.dll failed to open`).

### How to Run the Spike:
1. Start the spike server:
   ```powershell
   pnpm --filter aerokin-server run spike:h264
   ```
2. Test on Desktop Chrome:
   - Navigate to `http://localhost:8444/h264-test.html`
   - Click "Connect Stream"
   - Observe decoded FPS, keyframe interval, and bitrate.
3. Test on iPhone Safari:
   - Navigate to `http://<PC-LAN-IP>:8444/h264-test.html`
   - Note the WebCodecs support badge (Supported / Unsupported).
   - Click "Connect Stream" and report whether hardware-accelerated video renders.

---

## 5. Obtaining & Verifying FFmpeg on Windows

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
