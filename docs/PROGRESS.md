# AEROKIN Project Progress & Session Resume Checklist

> **S9 Protocol**: This file is continuously updated after each commit and each completed milestone.
> If this machine or session restarts for any reason, read this file first, run `git status` and `git log -15 --oneline`, and continue from the EXACT next step listed below.

---

## Current Status & Next Action
- **Current Milestone**: Part 2 Complete (Transport Abstraction, WebCodecs H.264 Desktop 2.0 Pipeline, NVENC Hardware Acceleration, AER2 Packet Format, and Benchmark Suite); proceeding to commit Part 2 and tag `stable-p2`.
- **Exact Next Step**: Commit `feat(desktop): implement transport abstraction and low-latency H.264 desktop 2.0 pipeline`, push, tag `stable-p2`, then proceed to Part 3 (Signaling Service + Infrastructure as Code for Allen's VPS).
- **Blocked Items**: None.
- **Safety Status**: S1-S6 active. Static guard `pnpm run safety:check` passing. Real power executor and real input backend strictly forbidden under test/CI and dry-run by default.

---

## Part 2: Transport Abstraction & Desktop 2.0 Pipeline (Completed)
- **2.1 Transport Abstraction**:
  - Implemented common `Connection` interface (`server/src/transport/Connection.ts` and `pwa/src/transport/Connection.ts`) with `send`, `onMessage`, `onStateChange`, `state`, `latencyMs`, `mode` (`lan_direct` | `webrtc_direct` | `webrtc_turn`), and `close()`.
  - Implemented `WsTransport` wrapping existing WebSocket with zero regressions.
  - Added `ConnectionModeBadge` in PWA header displaying LAN (green, "LAN DIRECT"), P2P (blue, "DIRECT P2P"), and RELAY (amber, "TURN RELAY") with live latency and diagnostic popover on tap.
  - Added `FrameSink` (`CanvasFrameSink` in `pwa/src/transport/FrameSink.ts`) supporting WebCodecs `VideoDecoder` (H.264 `avc1.42001f` baseline) with smooth `createImageBitmap` canvas fallback.
- **2.2 Desktop 2.0 Pipeline**:
  - **Capture Chain**: DXGI Desktop Duplication (`ddagrab` via FFmpeg) -> GDI (`gdigrab`) -> synthetic (`testsrc` for headless/benchmarks).
  - **Encoder Chain**: `h264_nvenc` with ultra-low latency flags (`-tune ull -zerolatency 1 -preset p1 -rc cbr -g 60 -bf 0 -profile:v baseline -level 4.1 -pix_fmt yuv420p`), falling back to `h264_mf`, then `libx264` (`-preset ultrafast -tune zerolatency -pix_fmt yuv420p -profile:v baseline -level 4.1`), then MJPEG fallback.
  - **Bitstream Slicing & Format**: Used `-bsf:v h264_metadata=aud=insert` to mark frame boundaries with Access Unit Delimiters. Standardized 20-byte `AER2` binary header (`AER2` magic, sequence, timestamp, width, height, codec flag, keyframe flag), maintaining backward compatibility with legacy 16-byte `AERO` MJPEG packets.
  - **PWA Rendering**: WebCodecs `VideoFrame` drawn directly via `ctx.drawImage` with native hardware acceleration, keeping aspect-ratio letterboxing, zoom, pan, and coordinate tracking completely intact.
- **2.3 Benchmark Results (`bench:desktop`)**:
  - **1080p H.264 (`h264_nvenc`)**: 28.7 fps, 3.2 Mbps, p50 31ms, p95 47ms, avg frame 14.3 KB, CPU 3.1%.
  - **720p H.264 (`h264_nvenc`)**: 29.4 fps, 1.87 Mbps, p50 31ms, p95 46ms, avg frame 8.2 KB, CPU 0.4%.
  - **720p MJPEG**: 35.6 fps, 13.56 Mbps (7.2x bandwidth of H.264!), avg frame 48.7 KB.
  - Achieved >85% bandwidth reduction with sub-frame encoding latency on Allen's RTX 4060 GPU.

---

## Part 1: Reported Bugs & Cleanup (Completed)
- **1A. Input Text Visibility**:
  - Root Cause: Safari PWA form fields default to transparent/white backgrounds without explicit dark color-scheme, and standard mobile inputs <16px font-size trigger destructive iOS viewport auto-zoom.
  - Fix: Added `<meta name="color-scheme" content="dark">` to HTML heads, `:root { color-scheme: dark; }` and global `-webkit-text-fill-color: var(--text)` to CSS. Created `<TextField>` and `<TextArea>` components in `@aerokin/design-system` enforcing `#0A0A0A` background, `#F5F5F5` text, `#FF5A1F` caret, and `16px` font-size.
  - Migrated inputs in `ManualTokenModal.tsx`, `QuickActionsTab.tsx`, `ClipboardTab.tsx`, and `SettingsDrawer.tsx`.
  - Playwright test (`pwa/scripts/test-input-visibility.mjs`) verified: 18.16:1 contrast ratio (exceeding WCAG 4.5:1 requirement) across Chromium & WebKit in both light and dark modes on iPhone 14 emulation.
- **1B. GPU Utilization ("OEM driver required" fix)**:
  - Root Cause: System stats previously hardcoded `available: false` with placeholder `"OEM driver required"`.
  - Fix: Implemented `GpuStatsProvider` with a real multi-tier source chain:
    1. `nvidia-smi` query for name, utilization, VRAM, temperature, power draw, and clock.
    2. DirectX Windows Performance Counters (`\GPU Engine(*)\Utilization Percentage` aggregated by LUID/engine) for non-NVIDIA GPUs or idle states.
    3. Explicit fallback with granular reason string.
  - Distinguishes 0% (idle) from `null` (unavailable) in stats and UI.
  - Tested on host: Successfully captures `NVIDIA GeForce RTX 4060 Laptop GPU` at 9% utilization, 44.9°C thermal diode reading.
  - Added unit test suite `server/test/gpu-stats.test.ts` (10 tests passing).
- **1C. VLC Media Detection & Seeking**:
  - Implemented multi-signal detection: SMTC session bridge, `EnumWindows` top-level window titles for active media players, and Windows CoreAudio active audio session detection.
  - Verified VLC seek shortcuts use `Alt+Arrow` (10s), `Shift+Arrow` (3s), and `Ctrl+Arrow` (60s).
  - Added Media Detection Diagnostics cards to Settings Drawer and PC Dashboard.
- **1D. Cleanup**:
  - Removed dynamic `new Function()` import hack in `ScreenshotService.ts`; made `sharp` a direct dependency in `server/package.json`.
  - Removed debug loopback endpoint `/debug/keys`.
  - Created `docs/QUICKSTART.md` documenting architecture, ports (`8443`, `8080`, `5174`), prerequisites, and setup instructions.

---

## Part 0.0: Safety Audit & Root Cause Analysis

### Investigation of Unexpected PC Shutdown / Restart Incident
In a previous run, Windows Event Log recorded:
- `"AEROKIN Remote Shutdown initiated from mobile client"`
- `"AEROKIN Remote Restart initiated from mobile client"`

**Root Cause Found**:
In `server/test/quick-actions.test.ts`, the Vitest suite tested the shutdown countdown state machine:
- Lines 120 and 148 called `actionService.executeAction('shutdown')` and `actionService.executeAction('restart')`.
- In `QuickActionService.ts`, these methods directly invoked `exec('shutdown.exe /s /t 10 ...')` and `exec('shutdown.exe /r /t 10 ...')`.
- At line 152, the test advanced fake timers by 11,000 ms (`vi.advanceTimersByTime(11000)`), triggering the countdown expiration callback, which called `executeFinalDangerousAction('restart')` -> `exec('shutdown.exe /r /t 0')`.
- Because the service was constructed without mocks in test, real Windows shutdown commands were sent to the operating system.

### Comprehensive Grep Audit of Power & Input Calls
The entire codebase was scanned for power transitions and input injection APIs:
1. **Power & Session Calls**:
   - `server/src/actions/QuickActionService.ts`:
     - `shutdown.exe /s /t 10` (line 180) -> Replaced by `PowerActionExecutor.execute('shutdown', { delaySeconds: 10 })`
     - `shutdown.exe /r /t 10` (line 182) -> Replaced by `PowerActionExecutor.execute('restart', { delaySeconds: 10 })`
     - `shutdown.exe /a` (line 242) -> Replaced by `PowerActionExecutor.cancelShutdown()`
     - `shutdown.exe /s /t 0` (line 259) -> Replaced by `PowerActionExecutor.execute('shutdown', { delaySeconds: 0 })`
     - `shutdown.exe /r /t 0` (line 261) -> Replaced by `PowerActionExecutor.execute('restart', { delaySeconds: 0 })`
     - `shutdown.exe /l` (line 263) -> Replaced by `PowerActionExecutor.execute('sign_out', { delaySeconds: 0 })`
     - `LockWorkStation` (line 57, 289) -> Replaced by `PowerActionExecutor.execute('lock')`
     - `rundll32.exe powrprof.dll,SetSuspendState` (line 299) -> Replaced by `PowerActionExecutor.execute('sleep')`
   - **Resolution**: All power and session calls now reside strictly in `server/src/actions/PowerActionExecutor.ts`. No other file in the repository contains any of these commands or APIs.
2. **Input Injection Calls**:
   - `server/src/native/win32.ts` (`SetCursorPos`, `mouse_event`, `SendInput`)
   - `server/src/input.ts`
   - `server/src/media/MediaCommandRouter.ts`
   - `server/src/actions/QuickActionService.ts`
   - **Resolution**: Routed through `InputBackend` (`RealInputBackend`, `NoOpInputBackend`, `RecordingInputBackend`). Under Vitest/CI or in tests, `RecordingInputBackend` or `NoOpInputBackend` is strictly used. Attempting to construct `RealInputBackend` under Vitest/CI throws immediately.

### Safety Safeguards Implemented
- `server/src/actions/PowerActionExecutor.ts`:
  - `RealPowerActionExecutor` throws if constructed under `NODE_ENV=test`, `VITEST`, `CI`, or without `process.env.AEROKIN_ALLOW_POWER_ACTIONS === '1'`.
  - `NoOpPowerActionExecutor` logs dry-run warnings and returns success.
  - `RecordingPowerActionExecutor` records all invocations for assertions.
- `server/src/input/InputBackend.ts`:
  - `RealInputBackend` throws if constructed under test/CI.
  - `RecordingInputBackend` records mouse moves, clicks, scrolls, keys, and text.
- `scripts/safety-check.mjs`:
  - Scans repository for any forbidden power calls outside `PowerActionExecutor.ts`.
  - Scans all test files for any direct imports of `RealPowerActionExecutor` or `RealInputBackend`.
  - Wired to `pnpm run safety:check`.
- `server/test/safety-guard.test.ts`:
  - Automated Vitest suite verifying the static invariants and runtime throw behavior.

---

## Parts Checklist

| Part | Title | Status | Notes / Blockers |
|------|-------|--------|------------------|
| **Part 0** | Emergency Safety Fix & Main Branch Sync | COMPLETED | Tagged `stable-p0-safety` & `stable-p0`. Guard suite active. |
| **Part 1** | Reported Bugs First + Cleanup (Inputs, GPU, VLC, Cleanup) | COMPLETED | Tagged `stable-p1`. Inputs, GPU 4060, VLC, Sharp, Quickstart done. |
| **Part 2** | Transport Abstraction + Desktop 2.0 Pipeline (LAN First) | COMPLETED | Tagged `stable-p2`. H.264 NVENC/MF/x264, WebCodecs, AER2 packet format, bench. |
| **Part 3** | Signaling Service + Infrastructure as Code | PENDING | |
| **Part 4** | WebRTC Transport + Connection Manager | PENDING | |
| **Part 5** | Remote Pairing + Security | PENDING | |
| **Part 6** | All Existing Features over New Transport | PENDING | |
| **Part 7** | User Experience Refinement | PENDING | |
| **Part 8** | Design System + "Picture Perfect" UI Pass | PENDING | |
| **Part 9** | Windows CI, Installer, FFmpeg Provisioning | PENDING | |
| **Part 10** | Tray Icon + Pause Switch | PENDING | |
| **Part 11** | Saved PCs (Multi-PC Support) | PENDING | |
| **Part 12** | Feature Additions (Keyboard, Gestures, Tools, File Transfer) | PENDING | |
| **Part 13** | Engineering Quality + Performance | PENDING | |
| **Part 14** | Dashboard Polish & Remote Cards | PENDING | |
| **Part 15** | Rigorous Testing (Fuzz, Soak, E2E, Chaos) | PENDING | |
| **Part 16** | Documentation & Root README Rewrite | PENDING | |
| **Part 17** | Final UI Sweep & Verification | PENDING | |

---

## Decisions Taken Without Asking
1. **Safety Executor Architecture**: Grouped `shutdown`, `restart`, `sign_out`, `sleep`, `lock`, and `cancel_shutdown` into `PowerActionExecutor`.
2. **Safe Input Architecture**: Created `InputBackend` supporting cursor positioning, relative movement, clicks, dragging, scrolling, key presses, modifier combinations, and Unicode typing.
3. **Workspace Root Scripts**: Created a lightweight root `package.json` to allow `pnpm run safety:check` from root without impacting workspace structure.

---

## NEEDS ALLEN
*(Items that require Allen's external infrastructure, credentials, VPS, or physical device)*
1. **VPS for Remote Signaling & TURN**: Fresh Ubuntu VPS with public IP for hosting `signaling/` and `coturn`.
2. **Domain & DNS**: A-records pointing to VPS for automatic TLS termination via Caddy.
3. **Physical iPhone Cross-Network Test**: Testing WebRTC DataChannel connection over cellular LTE/5G away from home Wi-Fi.
4. **VLC / Audio Session Real Device Confirmation**: Verifying process media detection and volume mixer against real desktop media players.
5. **Real Power Actions Enablement**: For normal daily use, Allen must set `AEROKIN_ALLOW_POWER_ACTIONS=1` in his environment or launcher script if he wants real shutdown/reboot capabilities from his phone.
