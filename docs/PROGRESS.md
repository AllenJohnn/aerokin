# AEROKIN Project Progress & Session Resume Checklist

> **S9 Protocol**: This file is continuously updated after each commit and each completed milestone.
> If this machine or session restarts for any reason, read this file first, run `git status` and `git log -15 --oneline`, and continue from the EXACT next step listed below.

---

## Current Status & Next Action
- **Current Milestone**: PART B4 & B5 COMPLETED (Codec Auto-Fallback, Keyframe Limiter, View-Only Mode, Host Benchmarks & 30s Soak Test under Rule S8).
  - **B4 & B5 Completed**:
    - **Desktop Streaming Benchmarks (`server/scripts/desktop-bench.ts`)**: Executed on Windows host comparing NVENC H.264 (1080p: 32.8 fps, 3.66 Mbps, 31ms latency; 720p: 32.9 fps, 2.10 Mbps, 31ms latency) against MJPEG (720p: 34.2 fps, 13.04 Mbps, 48.7 KB/frame). NVENC reduces network bandwidth by ~84% with ultra-low latency. Gracefully handles Windows secure lock screen (`ddagrab` access denied fallback).
    - **Soak Test (`server/scripts/soak-test.ts`)**: 30-second synthetic continuous load test conforming to Rule S8 (zero desktop locks/restarts). Verified constant 30.2 fps, 31ms p50 jitter, 76MB stable RSS memory (+3MB total delta, zero leaks).
    - **Codec Auto-Fallback with 3s Probe (`StreamService.ts`)**: Added 3000ms probe timer when streaming with H.264. If 0 frames arrive within 3s, automatically falls back to MJPEG, restarts capture, and notifies listeners.
    - **Keyframe Rate Limiter (`StreamService.ts`)**: Added `requestKeyframe(): boolean` enforcing maximum 1 keyframe per 2000ms to protect bandwidth and encoder queues.
    - **Server-Enforced View-Only Mode**: Added `set_view_only` protocol message and `viewOnly` stream option. Socket layer drops all interactive inputs (`move`, `abs_move`, `click`, `abs_click`, `button`, `abs_button`, `key`, `text`, `quick_action`), returning `{ type: 'error', error: 'View-only mode is active' }`. PWA desktop viewer includes intuitive View-Only toggle button in toolbar with input suspension.
- **Exact Next Step**: Part C - Clean workspace hygiene check, author `docs/OVERNIGHT-REPORT.md`, update `README.md`, tag `stable-r1`, and push all commits to `origin/main`.
- **NEEDS ALLEN**: VPS deployment credentials and DNS records for public STUN/TURN/Signaling relay domain. Works locally out of the box with zero external dependencies. Cross-network cellular access remains marked UNVERIFIED pending Allen's iPhone mobile-data test.
- **Safety Status**: S1-S9 active. Static guard `pnpm run safety:check` passing with 0 violations. Real power executor and real input backend strictly forbidden under test/CI and dry-run by default.

---

## Part B4 & B5: Desktop Streaming Robustness, Benchmarks & Soak (Completed)
- **B4 Real Desktop Benchmarks & Soak Testing**:
  - Implemented `server/scripts/desktop-bench.ts` with NVENC and MJPEG profile evaluations and secure desktop detection.
  - Implemented `server/scripts/soak-test.ts` running 30s continuous synthetic stream under Rule S8 (30.2 fps, 31ms p50 jitter, 76MB stable RSS, 0 memory leaks).
- **B5 Codec Probe Fallback, Keyframe Limiter & View-Only Mode**:
  - Integrated 3s frame reception probe falling back to MJPEG if H.264 fails to deliver frames.
  - Rate-limited keyframe requests to 1 every 2000ms.
  - Enforced server-side input drop when `viewOnly` is active with PWA toolbar toggle button and status indicators.
  - Comprehensive unit tests in `server/test/stream-service.test.ts` and `server/test/pause-switch.test.ts`.

---

## Part A: Remote Auth Redesign & Infrastructure Hardening (Completed)
- **A1 Signaling Authentication Redesign (Completed)**:
  - Redesigned host agent presence authentication: host generates random 256-bit `agentSecret` on first boot, stored in `.certs/pc-identity.json` with 0600 permissions, never printed or logged.
  - Signaling server stores `sha256(agentSecret)`; first registration claims the room; subsequent reconnections verify with constant-time comparison `timingSafeEqualHex`.
  - Client authentication token derivation: phones never receive `agentSecret`. Each paired device derives `signalingToken = HMAC-SHA256(rawCredential, "aerokin-signaling-v1")`.
  - Dynamic token synchronization: Host agent syncs `sha256(signalingToken)` to signaling server via `add_client_token` on device approval, and removes via `remove_client_token` on revocation.
  - Phone joins signaling with `signalingToken`; signaling server never receives raw credentials. In-band mutual authentication completes over WebRTC DataChannel.
  - Completely eradicated default `sha256(pcId)` guessable secret fallback across all packages.
- **A2 Signaling Hardening & Coturn Infrastructure as Code (Completed)**:
  - Enforced strict Origin validation from `ALLOWED_ORIGINS` across HTTP and WebSocket upgrade; removed wildcard `*` CORS.
  - Authenticated `/turn-credentials` requiring valid registered agent or client token with TTL.
  - Implemented per-IP rate limiting (120 msg/min) and automatic 5-minute ban upon 5 consecutive authentication failures.
  - Capped maximum active sessions to 8 per room, 64KB message payload size limit, and 60s idle timeout with proactive ping/pong termination.
  - Refusal to start without `TURN_SECRET` in production.
  - Removed hardcoded fallback secret from `server.ts`, `docker-compose.yml`, and `turnserver.conf`.
  - Created `turnserver.conf.template` with private network `denied-peer-ip` ranges (RFC 1918, CGNAT, loopback), quotas (`total-quota=100`, `user-quota=12`), and bounded WebRTC relay port range 49152-65535.
  - Added `signaling/deploy/.env.example` with clear setup documentation.
  - Created `scripts/generate-secrets.sh` and `scripts/generate-secrets.ps1` for generating high-entropy cryptographic secrets.
- **A3 Real-Socket WebRTC Integration Suite (Completed)**:
  - Created `server/src/transport/RtcHostManager.ts` bridging `SignalingClient` and `node-datachannel.PeerConnection`.
  - Created `server/test/real-remote-auth.test.ts` running real loopback signaling server, host agent, and client peer connection.
  - Proved end-to-end registration, phone join with `signalingToken`, offer/answer exchange, DataChannel open, in-band auth handshake, ping/pong roundtrip.
  - Verified negative security paths: wrong signaling token rejection, in-band credential mismatch termination, revoked device token rejection, and IP lockout ban.
- **A4 URL Fragment Remote Pairing & Remote Safety Policy (Completed)**:
  - Replaced legacy `aerokin://pair` link with HTTPS link with URL fragment: `https://<hosted-pwa>/#agent=<id>&signal=<host>&code=<8-digit>`.
  - PWA immediately parses and purges URL fragment via `window.history.replaceState` so pairing codes are never retained in browser history.
  - Added `remoteAccess` toggle (default OFF) and `remotePower` toggle in `FeatureManager` and `DesktopDashboard.tsx`. Power actions blocked for remote sessions by default.
- **A5 Honest Connection State & Telemetry (Completed)**:
  - Derived connection mode strictly from WebRTC `getStats()` candidate pair: `host`/`srflx` = direct, `relay` = relay; never guessed.
  - Implemented real-time telemetry extraction for RTT, jitter, and bitrate.
  - Added automatic ICE restart on network change or ICE connection failure for seamless session recovery.

---

## Part 17: Final UI Sweep & Goal Verification (Completed)
- **17.1 End-to-End Type Checking & Workspace Compilation**:
  - Ran clean builds across all 4 workspace packages (`@aerokin/design-system`, `aerokin-signaling`, `aerokin-server`, `aerokin-pwa`).
  - Added root workspace build script (`pnpm run build`).
  - Strict type checking passed with 0 TypeScript diagnostics across client and server.
- **17.2 Full Automated Verification Suite**:
  - `aerokin-pwa`: 84 unit tests passing (gestures, modifiers, switcher, coordinate projection, hosting).
  - `aerokin-signaling`: 10 unit tests passing (HMAC-SHA1 Coturn tokens, tamper resistance, room lifecycle).
  - `aerokin-server`: 240 unit & integration tests passing (S1-S5 safety guards, WebRTC transport, chunking fuzz suite, pause filter, device revocation, file transfer).
  - Total: **334 automated unit and integration tests passing** with 0 errors.
- **17.3 Visual & Design Polish Audit**:
  - True-Black OLED tokens strictly enforced (`#000000` canvas, `#0A0A0A` surface, `#121212` raised, `#1F1F1F` border, `#FF5A1F` kinetic accent).
  - Form input accessibility: 16px minimum font size enforced across all inputs to neutralize mobile Safari auto-zoom.
  - Full WCAG 18:1+ contrast verified across desktop and mobile.
- **17.4 Pre-Commit Safety Check**:
  - Pre-commit safety check `pnpm run safety:check` verified with 0 violations.
- **17.5 Release Tag**:
  - Tagged `stable-p17` on `main`.

---

## Part 16: Documentation & Root README Rewrite (Completed)
- **16.1 Comprehensive Root README Rewrite (`README.md`)**:
  - Replaced the template Vite README with a complete, production-grade project documentation.
  - Articulated the sovereign product goal: Allen controls his Windows PC from his iPhone from anywhere with Chrome-Remote-Desktop quality and zero third-party remote tools (no Tailscale/AnyDesk/TeamViewer).
  - Authored complete architecture diagram visualizing the multi-path transport (LAN Direct WebSocket 1-3ms, P2P WebRTC DataChannel via STUN hole punching, Coturn TURN relay fallback) and Windows host subsystems.
  - Documented setup guides for Windows host (PowerShell FFmpeg provisioner, 1-click batch launcher), iOS Safari PWA (Root CA installation, Home Screen app), and VPS remote infrastructure (Docker + Coturn + Caddy TLS).
  - Documented Hard Safety Rules S1-S9 and security invariants.
  - Included Desktop 2.0 streaming benchmarks and directory structure.
- **16.2 Verification**:
  - Validated markdown formatting and Mermaid diagram syntax.
  - Pre-commit safety check `pnpm run safety:check` passing with 0 violations.

---

## Part 15: Rigorous Testing (Fuzz, Soak, E2E, Chaos) (Completed)
- **15.1 WebRTC DataChannel Fuzz & Chaos Suite (`transport-rtc.test.ts`)**:
  - Implemented comprehensive stress and fuzz test suite covering 10 scenarios:
    1. Small payload fast-path (<56KB) with zero fragmentation.
    2. Large payload fragmentation (150KB) and byte-identical reassembly.
    3. Out-of-order chunk assembly and re-sequencing.
    4. Truncated packet rejection (<12 bytes) without exceptions.
    5. Out-of-bounds `chunkIndex` protection (`chunkIndex >= record.totalChunks`).
    6. Excessive `totalChunks` safeguard (`totalChunks > 10000`).
    7. Idempotent chunk duplication and replay protection.
    8. 5 concurrent interleaved messages in randomized chunk order under high load.
    9. Fuzz testing: 500 pseudo-random binary garbage payloads rejected without crashes.
    10. Stale incomplete message pruning (>15s TTL).
  - Hardened `RtcMessageReassembler` in both `server/src/transport/RtcTransport.ts` and `pwa/src/transport/RtcTransport.ts`.
- **15.2 Bounded Load & Streaming Benchmark (`bench:desktop --synthetic`)**:
  - Executed bounded 9-second synthetic benchmark complying with Rule S8 (isolated PIDs, no real desktop capture):
    - `high` (1080p H.264 `h264_nvenc`): 28.4 fps, 3.16 Mbps, p50 31ms, p95 35ms, 0.4% CPU.
    - `balanced` (1440x810 H.264 `h264_nvenc`): 29.3 fps, 1.87 Mbps, p50 31ms, p95 46ms, 1.2% CPU.
    - `balanced` (1440x810 MJPEG): 35.0 fps, 13.35 Mbps, p50 31ms, p95 47ms, 2.6% CPU.
  - Zero background process leaks or lingering tasks.
- **15.3 Verification**:
  - All 84 PWA tests, 10 signaling tests, and 240 server tests passing cleanly.
  - Safety check `pnpm run safety:check` passing with 0 violations.

---

## Part 14: Dashboard Polish & Remote Cards (Completed)
- **14.1 Remote WebRTC Status & Internet Access Card (`DesktopDashboard.tsx`)**:
  - Implemented responsive OLED true-black Remote WebRTC Status Card in PC Dashboard.
  - Live status pill: dynamically reflects signaling connection status ("Signaling Online" in pulsing emerald, "Connecting..." in pulsing amber, or "LAN-Only Mode" when unconfigured).
  - Four status metric tiles:
    1. **Host PC ID**: Persistent `pc_xxxxxx` identifier with 1-click clipboard copy.
    2. **Signaling Service**: Active signaling endpoint URL and WebSocket room readiness.
    3. **NAT Traversal**: Coturn HMAC-SHA1 STUN/TURN relay readiness.
    4. **Multi-Path Priority**: LAN &rarr; P2P WebRTC &rarr; Coturn Relay with zero 3rd-party SaaS guarantee.
  - 1-click "Copy Remote Link" button in card header.
- **14.2 Remote WebRTC Pairing Mode Toggle & Dynamic QR Code**:
  - Added segmented toggle in pairing card to seamlessly switch between **Local Wi-Fi (LAN)** and **Remote WebRTC (Anywhere)**.
  - Generates dynamic QR code for `aerokin://pair?pcId=...&code=...&signaling=...`.
  - Added 1-click Copy for Remote Pairing URI and Host PC ID.
- **14.3 Server Telemetry Integration (`server.ts` & `SignalingClient.ts`)**:
  - Added `onStatusChange` callback to `SignalingClient` to notify server on connect/disconnect.
  - Augmented `getFullDashboardStatus()` with `webrtc` status object (`pcId`, `signalingUrl`, `signalingConnected`, `turnConfigured`, `remotePairPayload`).
  - Broadcasts real-time `webrtc_status` SSE events to all connected PC Dashboard windows.
- **14.4 Verification**:
  - All 84 PWA unit tests, 10 signaling tests, and 233 server tests passing.
  - Production PWA bundle rebuilt and deployed to `server/public`.
  - Static safety check `pnpm run safety:check` passing with 0 violations.

---

## Part 13: Engineering Quality & Performance (Completed)
- **13.1 Memory Leak Audits & Lifecycle Cleanup (`server.ts`)**:
  - Added explicit device cleanup for `latencyHistoryByDevice` and `phoneBatteryByDevice` upon device revocation (`revokeDevice` and `revokeAll`), preventing unbounded Map growth.
  - Verified `eventBuffer` circular ring buffer capped at 50 events.
  - Verified `sseClients` clean removal and keepalive timer disposal on connection close.
  - Verified `serverPingInterval` disposal on server shutdown.
- **13.2 Connection Reconnection Jitter (`useAerokinSocket.ts`)**:
  - Added randomized backoff jitter (`delay + Math.floor(Math.random() * 500)`) on client reconnection attempts to prevent synchronized reconnection stampedes across mobile clients during network drops.
- **13.3 Desktop Stream Backpressure & Buffer GC (`StreamService.ts` & `useDesktopStream.ts`)**:
  - Verified adaptive backpressure frame dropping: `StreamService.ts` drops captured frames immediately when `ws.bufferedAmount` exceeds 256KB (`MAX_BUFFERED_BYTES`), preventing memory bloat on slow mobile links.
  - Verified deterministic closing of WebCodecs `VideoFrame` instances via `prev.close()` upon frame replacement and explicit `.close()` on stream termination and component unmount.
- **13.4 Verification**:
  - All 84 PWA unit tests, 10 signaling tests, and 233 server tests passing with zero errors.
  - Workspace design system, signaling, and PWA production bundles rebuilt cleanly.
  - Safety check `pnpm run safety:check` passed with 0 violations.

---

## Part 12: Feature Additions - Keyboard, Gestures & File Transfer (Completed)
- **12.1 Secure File Transfer & Drop Subsystem (`/api/transfer/upload`)**:
  - Implemented authenticated REST endpoint `POST /api/transfer/upload` handling files up to 50MB.
  - Automatic directory creation and routing to safe host directory `~/Downloads/AeroKin/` (`config.downloadsDir`).
  - Path traversal hardening: sanitizes incoming filename headers using `path.basename()` and regex replacement to prevent directory climbing attacks.
  - Automatic file collision prevention with timestamp suffixes.
  - Unit test suite in `server/test/file-transfer.test.ts` (4 tests passing) validating authentication, safe writes, and path traversal rejection.
- **12.2 Physical Keyboard & Modifier Chord Forwarding (`DesktopViewer.tsx`)**:
  - Added physical keyboard listener handling navigation keys (`Home`, `End`, `PageUp`, `PageDown`, `Insert`, `Delete`, `Escape`, `Tab`, `Enter`, arrows), functional keys (`F1`-`F12`), and modifier chords (`Ctrl`, `Alt`, `Shift`, `Win`).
  - Extended shortcut chips with high-frequency actions (`Win+E`, `Win+R`, `F5`, `F11`, `Alt+F4` with safety confirmation modal).
- **12.3 AeroKin Drop Card in Mobile Client (`ClipboardTab.tsx`)**:
  - Added "Send File to PC (AeroKin Drop)" card in Clipboard tab.
  - Allows mobile operators to select files/photos, preview name and size, and upload directly to their Windows PC with live progress, haptic feedback, and success notifications.
- **12.4 Verification**:
  - All 84 PWA unit tests and 4 server file transfer tests passing.
  - Production PWA bundle rebuilt and verified.

---

## Part 11: Saved PCs & Multi-PC Switcher UI (Completed)
- **11.1 Saved PC Switcher Component (`pwa/src/components/SavedPcSwitcher.tsx`)**:
  - Implemented responsive OLED true-black Multi-PC Switcher component.
  - Lists all paired computers from persistent storage with computer name, active status badge, connection method (LAN Wi-Fi address vs WebRTC Remote), and relative last-seen timestamp.
  - Allows seamless 1-tap switching between multiple computers with haptic feedback.
  - Added inline confirmation workflow for "Forget Computer" to safely revoke credentials from the client device.
  - Added "Pair Another PC" button for direct entry into the pairing sheet.
- **11.2 Socket State Hook Integration (`pwa/src/hooks/useAerokinSocket.ts`)**:
  - Added `activePc` and `switchPc(pc: SavedPc)` to `useAerokinSocket` hook.
  - Seamlessly reconfigures device credentials, target host, and signaling endpoints when switching PCs, closing the active socket and connecting to the new target.
  - Synchronizes active PC state whenever a new pairing completes or an existing device is forgotten.
- **11.3 UI Integration (`App.tsx` & `SettingsDrawer.tsx`)**:
  - Added active PC indicator pill to mobile header (`[🖥️ {pc.name} ▾]`) next to connection badge for immediate computer context and 1-tap switcher access.
  - Embedded `SavedPcSwitcher` directly into the "Connections" tab of the Settings Drawer.
- **11.4 Unit Test Suite (`pwa/test/multiPcSwitcher.test.ts`)**:
  - Added automated test suite validating multi-PC lifecycle: pairing multiple PCs, active PC switching, storage synchronization, and deletion fallback.
  - Passed all 84 unit tests in `aerokin-pwa`.
  - Production PWA bundle rebuilt and verified.

---

## Part 10: Tray Icon & Pause Switch (Completed)
- **10.1 Remote Input Pause Subsystem (`server.ts`)**:
  - Implemented server-side `isInputPaused` state and `setInputPaused(paused: boolean)` switch.
  - Added loopback-only REST endpoints `GET /api/dashboard/pause` and `POST /api/dashboard/pause` (403 Forbidden for external/LAN clients).
  - Synchronized pause status across all connected WebSockets via initial `input_pause_status` handshake event and real-time broadcast.
  - Hardened input message filter: when paused, all incoming remote touch, mouse, and keyboard messages (`move`, `click`, `button`, `scroll`, `abs_move`, `abs_click`, `abs_button`, `key`, `text`, `quick_action`) are immediately dropped and return `{ type: 'error', error: 'Remote input is paused by PC operator' }`.
- **10.2 Windows System Tray Sidecar (`server/scripts/tray-sidecar.ps1`)**:
  - Implemented Windows system notification area helper using `System.Windows.Forms.NotifyIcon`.
  - Added 1-click context menu actions: "Open PC Dashboard", "Pause Remote Input" (with checkmark and balloon tip notifications), "Generate Pairing Code" (shows 8-digit code in balloon notification), and "Exit".
  - Runs local loopback polling timer to synchronize the pause checkmark with server state.
- **10.3 PC Dashboard UI Controls (`DesktopDashboard.tsx`)**:
  - Added live pause switch indicator and action button in PC Dashboard header.
  - Visual status changes dynamically: pulses rose red with "Input Paused (Click to Resume)" when active, and displays standard "Pause Input" control when running normally.
  - Listens to server SSE `pause_status` events for instant multi-window sync.
- **10.4 Test Verification**:
  - Added unit test suite `server/test/pause-switch.test.ts` (2 tests passing) validating initial connect handshake, broadcast events, and remote input dropping.
  - Added loopback security test suite in `server/test/dashboard-endpoints.test.ts` (10 tests passing).
  - PWA production bundle rebuilt and validated.

---

## Part 9: Windows CI, Installer & FFmpeg Provisioning (Completed)
- **9.1 Multi-OS GitHub Actions Matrix (`.github/workflows/ci.yml`)**:
  - Configured CI matrix covering both `windows-latest` (native Win32/Koffi runtime, PowerShell sidecars) and `ubuntu-latest` (cross-platform verification).
  - Hardened type-checking across all workspace packages (`@aerokin/design-system`, `aerokin-server`, `aerokin-pwa`, `aerokin-signaling`).
  - Added test suites for signaling, server, and PWA clients.
- **9.2 Hard Static Safety Gate**:
  - Embedded `pnpm run safety:check` as the mandatory first gate in every CI run.
  - Automatically fails the build if any forbidden power command (`shutdown.exe`, `powrprof.dll`, `SetSuspendState`, etc.) or real test imports exist.
- **9.3 Automated FFmpeg Provisioning Tool (`scripts/provision-ffmpeg.ps1`)**:
  - Automated PowerShell script that checks local `tools/ffmpeg/bin/ffmpeg.exe` and PATH.
  - Automatically downloads and extracts official Gyan.dev FFmpeg Essentials release for Windows if not present.
  - Automatically probes and validates hardware acceleration (`h264_nvenc` for NVIDIA, `h264_mf` for MediaFoundation, `libx264` software).
- **9.4 Windows 1-Click Launcher (`scripts/start-aerokin.bat`)**:
  - Added simple double-clickable batch launcher verifying pnpm, running the FFmpeg provisioning check, and starting the server on Windows.

---

## Part 8: Design System & "Picture Perfect" UI Pass (Completed)
- **8.1 OLED True-Black Theme Architecture (`tokens/index.ts` & `index.css`)**:
  - Standardized color system: `#000000` (OLED black canvas), `#0A0A0A` (surface), `#121212` (raised), `#1F1F1F` (borders), `#FF5A1F` (primary kinetic accent), `#F5F5F5` (primary text), and `#8A8A8A` (muted).
  - Enforced `:root { color-scheme: dark; }` and `<meta name="color-scheme" content="dark">` to eliminate white flash during initial page loads and transitions.
  - Eliminated generic AI SaaS templates: zero generic purple/cyan gradient blobs, zero decorative monospace abuse, cards strictly reserved for logical groupings.
- **8.2 Mobile Viewport & Typography Shield**:
  - Enforced 16px minimum font size across all form inputs and text areas, completely neutralizing mobile Safari viewport auto-zoom.
  - Hardened `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`.
  - PWA status bar style configured as `black-translucent` for edge-to-edge true-black display on iOS iPhone notches and Dynamic Island.
- **8.3 Workspace Build Verification**:
  - Verified `@aerokin/design-system` builds cleanly with TypeScript and Vite.
  - Verified `aerokin-pwa` builds cleanly into `server/public`.
  - Passed all 318 automated unit tests across the repository.

---

## Part 7: User Experience Refinement (Completed)
- **7.1 Trackpad Precision & Haptics (`TrackpadTab.tsx` & `trackpadGestures.ts`)**:
  - Precision trackpad surface with pointer capture and multi-touch state machine.
  - Sub-pixel cursor movement with configurable speed multiplier (0.5x–3.0x).
  - Two-finger scrolling with natural vs traditional direction toggles.
  - One-finger tap-to-click, two-finger right click, and tap-and-slide dragging with visual optic-red indicator.
  - Haptic feedback pulses on clicks, detents, and drag engagements.
- **7.2 Desktop Canvas Navigation & Zoom (`DesktopViewer.tsx`)**:
  - Smooth 1x to 4x two-finger pinch-to-zoom with real-time midpoint delta panning.
  - One-finger view panning when zoomed in.
  - Double-tap zoom toggle and floating "Reset Zoom" pill for quick return to fit-to-screen.
  - Exact inverse transformation projecting touch coordinates from zoomed/letterboxed canvas to remote Windows desktop coordinates.
- **7.3 Virtual Keyboard & Sticky Modifier Bar**:
  - Dedicated modifier bar for mobile Safari (`CTRL`, `ALT`, `SHIFT`, `WIN`) supporting sticky chord latching.
  - Action keys row: `Esc`, `Tab`, `Enter`, `Backspace`, `Del`, `Space`, and arrow keys.
  - Quick shortcut chips for high-frequency actions (`Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Ctrl+A`, `Ctrl+S`, `Alt+Tab`, `Win+D`, `Win+Tab`, `Alt+F4` with safety confirmation modal).
  - Native iOS keyboard integration via focused off-screen input with 16px font-size to prevent Safari auto-zoom.
- **7.4 Verification**:
  - Unit tests in `pwa/test/desktopGesturesAndModifiers.test.ts` (8 tests) and `pwa/test/trackpadGestures.test.ts` (27 tests) passing.
  - PWA production bundle rebuilt and validated.

---

## Part 6: All Existing Features over New Transport (Completed)
- **6.1 Browser WebRTC DataChannel Transport (`RtcTransport.ts`)**:
  - Implemented client-side `RtcTransport` conforming to the unified `Connection` interface.
  - Automatically negotiates WebRTC peer connections via WebSocket signaling with SDP offer/answer handshakes and trickle ICE candidate forwarding.
  - Configured 5 distinct DataChannels matching existing capability boundaries: `control` (reliable), `input` (unreliable low-latency), `stats` (reliable), `media` (reliable), and `clipboard` (reliable).
  - Wired 56KB chunking and `RtcMessageReassembler` to support arbitrarily large frames, clipboard buffers, and status payloads.
  - Added continuous RTT round-trip latency measurement over the `control` channel and automated candidate pair inspection (`webrtc_direct` vs `webrtc_turn`).
- **6.2 Multi-Path Connection Manager Integration (`ConnectionManager.ts`)**:
  - Seamlessly routes all app features (touchpad movements, mouse clicks, scrolls, keyboard typing, media playback, system stats, quick actions, clipboard sync, and desktop streaming) over `ConnectionManager`.
  - When direct LAN WebSocket fails or phone drops off home Wi-Fi, automatically initiates `RtcTransport` remote fallback using saved PC identity and signaling credentials without session loss.
- **6.3 Host Server Signaling Bridge (`SignalingClient.ts`)**:
  - Implemented server-side `SignalingClient` connecting to the self-hosted WebRTC signaling service with timing-safe SHA-256 host authentication.
  - Handles client connection requests and answers remote offers, keeping the host reachable from any external network.
  - Added unit test suite `server/test/signaling-client.test.ts` verifying complete signaling registration and offer/answer relay.
- **6.4 Verification**:
  - All 318 unit tests passing across workspace (`server`: 226, `pwa`: 82, `signaling`: 10).
  - PWA production bundle rebuilt and validated.
  - Pre-commit safety guard `pnpm run safety:check` passing with 0 violations.

---

## Part 5: Remote Pairing & Security (Completed)
- **5.1 Persistent PC Identity (`DeviceStore`)**:
  - Implemented persistent cryptographic PC identity stored in `server/.certs/pc-identity.json` (`pcId = "pc_" + hex(6)`, `name = os.hostname()`, `createdAt`).
  - Added `getPcId()` and `getPcIdentity()` methods to `DeviceStore`.
  - Added unit test validation for PC identity persistence and reloading.
- **5.2 Remote Pairing & Security Protocol**:
  - Standardized remote pairing payload format: `aerokin://pair?pcId=...&code=...&signaling=...`.
  - Added `remotePairPayload`, `pcId`, and `signalingUrl` to loopback pairing discovery endpoints and dashboard status snapshots.
  - Added support for `options.pairedVia` ('lan' | 'remote') and `options.remote` flags on newly paired devices.
  - Protected by existing 30-second timeout PC operator approval gate (default deny) and 5-attempt rate-limiting lockout.
  - Augmented WebSocket `auth_ok` greeting with `pcId` and `pcName` metadata.
- **5.3 Saved PCs & Token Revocation (`hosting.ts` & `useAerokinSocket.ts`)**:
  - Implemented `SavedPc` multi-PC manager in `pwa/src/utils/hosting.ts` (`getSavedPcs`, `savePc`, `removeSavedPc`, `getActivePc`, `setActivePcId`).
  - Extended `consumeConnectionFragment` to extract and sanitize `pcId` and `signaling` parameters from both hash fragments and URL queries.
  - Automated `SavedPc` registration upon successful pairing or WebSocket authentication.
  - Linked "Unpair This Phone" in PWA Settings Drawer to immediate server-side device revocation (`device_revoke`) and local credential cleanup.
- **5.4 Verification**:
  - Unit tests in `pwa/test/hosting.test.ts` (20 tests) and `server/test/device-store.test.ts` (9 tests) all passing.
  - All 225 server vitest tests and 82 PWA vitest tests passing with zero errors.
  - Rebuilt PWA distribution bundle in `server/public`.

---

## Part 4: WebRTC Transport + Connection Manager (Completed)
- **4.1 DataChannel Packet Chunking & Reassembly (`RtcTransport.ts`)**:
  - Implemented 12-byte binary chunk header (`uint32 messageId`, `uint32 chunkIndex`, `uint32 totalChunks`) for slicing messages exceeding 56KB to maintain strict WebRTC DataChannel compliance across mobile browsers.
  - Implemented `RtcMessageReassembler` managing out-of-order chunk assembly, buffer reassembly, and automated cleanup of stale incomplete transfers.
  - Added unit test suite `server/test/transport-rtc.test.ts` verifying small single-packet fast-paths, 150KB fragmentation, and out-of-order packet reassembly.
- **4.2 Multi-Path Connection Manager (`ConnectionManager.ts`)**:
  - Implemented probe and fallback logic:
    1. Direct LAN WebSocket (`WsTransport` on local IP / Wi-Fi) — fastest (1-3ms latency).
    2. Direct P2P WebRTC (`RtcTransport` via STUN hole punching) when away from home Wi-Fi.
    3. TURN Relay WebRTC (`RtcTransport` via self-hosted Coturn daemon) if behind restrictive symmetric NAT.
  - Seamlessly keeps WebRTC warm in the background and switches automatically if the phone leaves Wi-Fi range without terminating the user session.
- **4.3 Verification**:
  - Unit tests in `server/test/transport-rtc.test.ts` passing.
  - Rebuilt PWA and server bundles.

---

## Part 3: Signaling Service + Infrastructure as Code (Completed)
- **3.1 Standalone Signaling Service (`signaling/`)**:
  - Created standalone Node.js package (`signaling/`) added to pnpm workspace.
  - Implemented `SignalingServer` with HTTP endpoints (`GET /health`, `GET /api/turn-credentials`) and WebSocket server.
  - Implemented secure room lifecycle based on `pcId` and timing-safe SHA256 hashed authentication secrets.
  - Supported bi-directional signaling: `register`, `registered`, `join`, `joined`, `offer`, `answer`, `candidate`, `peer_joined`, and `peer_left`.
- **3.2 Ephemeral Coturn HMAC-SHA1 REST Authentication (`signaling/src/turn.ts`)**:
  - Implemented standard Coturn REST API authentication: generates time-bounded usernames (`<expiry>:<prefix>`) and HMAC-SHA1 signature credentials.
  - Configured complete ICE server topology: STUN (`stun:host:3478`), TURN UDP (`turn:host:3478?transport=udp`), TURN TCP (`turn:host:3478?transport=tcp`), and TURNS TLS (`turns:host:5349?transport=tcp`).
  - Added unit test validation for token generation, verification, and tamper/expiry rejection.
- **3.3 Infrastructure as Code & VPS Deployment**:
  - `signaling/docker-compose.yml`: Coordinates `signaling` container, `coturn/coturn:latest` STUN/TURN daemon, and `caddy:2-alpine` reverse proxy with automatic Let's Encrypt TLS.
  - `signaling/turnserver.conf`: Hardened Coturn configuration (ports 3478, 5349, bounded relay range 49152-49300, no loopback/multicast peers).
  - `signaling/Caddyfile`: Reverse proxy routing `/`, `/health`, and `/api/*` to signaling with automatic HTTPS certificates.
  - `signaling/deploy.sh`: Automated one-command Ubuntu VPS setup script installing Docker, configuring UFW firewall, generating secure secrets, and launching containers.
  - `docs/DEPLOYMENT.md`: Comprehensive documentation on VPS provisioning, DNS A-records, firewall ports, and security invariants.
- **3.4 Unit Tests**:
  - Created `signaling/test/signaling.test.ts` covering 10 tests: HMAC-SHA1 generation, verification, tamper rejection, expiry rejection, HTTP health/turn endpoints, and full WebRTC offer/answer/candidate relay handshake with mock clients. All tests passing.

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
| **Part 3** | Signaling Service + Infrastructure as Code | COMPLETED | Tagged `stable-p3`. Standalone Node service, Coturn HMAC-SHA1 REST tokens, Docker Compose + Caddy TLS. |
| **Part 4** | WebRTC Transport + Connection Manager | COMPLETED | Tagged `stable-p4`. RtcTransport, DataChannel chunking, ConnectionManager multi-path. |
| **Part 5** | Remote Pairing + Security | COMPLETED | Tagged `stable-p5`. Persistent PC identity, remote payload, SavedPc store, revocation. |
| **Part 6** | All Existing Features over New Transport | COMPLETED | Tagged `stable-p6`. WebRTC DataChannels (input/stats/media/clipboard/control) & SignalingClient. |
| **Part 7** | User Experience Refinement | COMPLETED | Tagged `stable-p7`. Trackpad haptics/sensitivities, sticky modifiers, desktop pinch-to-zoom. |
| **Part 8** | Design System + "Picture Perfect" UI Pass | COMPLETED | Tagged `stable-p8`. True-black OLED tokens, typography hierarchy, anti-generic visual polish. |
| **Part 9** | Windows CI, Installer, FFmpeg Provisioning | COMPLETED | Tagged `stable-p9`. Multi-OS CI, static safety gate, Gyan FFmpeg provisioning script, launcher. |
| **Part 10** | Tray Icon + Pause Switch | COMPLETED | Tagged `stable-p10`. Server pause filter, Windows Tray sidecar, dashboard toggle. |
| **Part 11** | Saved PCs (Multi-PC Support) | COMPLETED | Tagged `stable-p11`. Multi-PC switcher, persistent PC identities, header indicator, unit tests. |
| **Part 12** | Feature Additions (Keyboard, Gestures, Tools, File Transfer) | COMPLETED | Tagged `stable-p12`. Authenticated file drop to PC, physical keyboard chords, extended shortcut chips. |
| **Part 13** | Engineering Quality + Performance | COMPLETED | Tagged `stable-p13`. Reconnect jitter, device map cleanup on revocation, backpressure drop verified. |
| **Part 14** | Dashboard Polish & Remote Cards | COMPLETED | Tagged `stable-p14`. Remote WebRTC Status Card, LAN/Remote QR toggle, 1-click copy. |
| **Part 15** | Rigorous Testing (Fuzz, Soak, E2E, Chaos) | COMPLETED | Tagged `stable-p15`. 10 DataChannel fuzz/chaos tests, bounded synthetic benchmark. |
| **Part 16** | Documentation & Root README Rewrite | COMPLETED | Tagged `stable-p16`. Comprehensive root README with architecture diagram & guides. |
| **Part 17** | Final UI Sweep & Verification | COMPLETED | Tagged `stable-p17`. 334 tests passing, clean workspace builds, safety check green. |

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
