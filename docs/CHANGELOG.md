# AeroKin Changelog

## [Stable-R6] - 2026-11-19 - iPhone 14 Optimization, 5-Byte Binary Datagrams, 3-Finger Windows Gestures & Hardware Volume Rocker

### Added
- **Fractional Remainder Sub-Pixel Pointer Math**: Eliminated slow micro-movement targeting dead-zones by preserving fractional remainders across animation frames (`pendingMoveRef.current = { dx: totalDx - sendX, dy: totalDy - sendY }`), ensuring subtle finger shifts (< 0.5px) are never dropped.
- **120Hz Coalesced Touch Sampling**: Wired `event.getCoalescedEvents?.()` on iPhone 14 touch interactions, capturing high-frequency touch positions between 60Hz display frames for ultra-smooth pointer gliding.
- **3-Finger Windows Gestures**: Implemented 3-finger trackpad swipe gesture detection in `trackpadGestures.ts` and `TrackpadTab.tsx`:
  - 3-finger swipe UP: Task View (`Win+Tab`)
  - 3-finger swipe DOWN: Show Desktop (`Win+D`)
  - 3-finger swipe RIGHT: Next App (`Alt+Tab`)
  - 3-finger swipe LEFT: Previous App (`Alt+Shift+Tab`)
  - Accompanied by haptic ticks and directional visual hint updates.
- **5-Byte Binary WebSocket Protocol**: High-frequency trackpad datagrams serialized directly into compact binary buffers over WebSocket (`ArrayBuffer` / `Uint8Array`), bypassing JSON stringification/parsing:
  - `0x01` (MOVE, 5 bytes): `[0x01, dx: int16, dy: int16]`
  - `0x02` (SCROLL, 5 bytes): `[0x02, dy: int16, dx: int16]`
  - `0x03` (CLICK, 2 bytes): `[0x03, button: uint8]`
  - `0x04` (BUTTON, 3 bytes): `[0x04, button: uint8, state: uint8]`
- **Physical iPhone Volume Rocker Control**: Added silent inaudible background audio loop listener (`setupHardwareVolumeListener`) tracking iOS physical volume button clicks and transmitting `volup` / `voldown` commands to Windows master volume with haptic detents.
- **iPhone 14 Notch & OLED Black Polish**: Tuned top padding (`pt-safe` 47px) and bottom padding (`pb-safe` 34px) for the iPhone 14 TrueDepth notch and Home indicator with true `#000000` background.
- **Quick "Paste to PC" Clipboard Chip**: Added one-tap clipboard paste button in the header bar reading phone clipboard text and injecting it directly into Windows.
- **Direct Native iOS Keyboard on Trackpad**: Added a dedicated keyboard trigger between the Left and Right click buttons on `TrackpadTab`. Tapping immediately pops up the native iOS software keyboard with zero extraneous overlay clutter. Typed text, symbols, and essential keys (`Backspace`, `Enter`, `Tab`, `Esc`) stream directly to the active Windows PC window with automatic keyboard dismissal handling.

## [Stable-R5] - 2026-11-19 - Instant Multi-Network Connectivity, Trusted-Network Mode, Hot-Swapped SAN TLS, Instant Open PWA & Hardened Local Control

### Added
- **Multi-Network Leaf TLS Hot-Swapping**: Leaf TLS certificates are generated with Subject Alternative Names (SANs) containing `os.hostname()`, `<hostname>.local`, `aerokin.local`, `localhost`, `127.0.0.1`, and all active non-internal private IPv4s across all network interfaces (Ethernet, Wi-Fi, and iPhone Personal Hotspot `172.20.10.x`). Hot-swaps the leaf certificate into running HTTPS/WSS server via `server.setSecureContext()` on interface change without restarting the server or invalidating the root CA trust.
- **Trusted-Network Mode**: Automatic, frictionless device onboarding for all connections originating from private subnets (RFC 1918, `172.20.10.0/28` iPhone hotspot, loopback, link-local, ULA). Clients auto-register with a random cryptographic credential on first connect with zero pairing codes and zero PC confirmation prompts. Replaces same-name device records cleanly without duplicates. Persisted toggle in `settings.json` (default: ON).
- **Hardened Local Control Endpoints**: Hardened state-changing PC control endpoints (`/api/dashboard/*`, `/pause`, `/quit`, `/restart`, `/api/devices/*`, `/api/pair/*`) to strictly require loopback sockets (`127.0.0.1`/`::1`), loopback `Host` headers, rejection of foreign cross-site `Origin` headers, and validation of custom `X-AeroKin-Local: 1` header to prevent DNS rebinding and CSRF attacks.
- **Parallel Host Probing in PWA**: Probes candidate endpoints (`<hostname>.local`, last-seen LAN IPs, hotspot IPs up to 6 known hosts) concurrently with a `<= 1.5s` timeout; the fastest responding endpoint wins and refreshes the known host list from the server hello payload.
- **Resilient Dual Storage for iOS**: Stores client device identity and cryptographic credentials across both `localStorage` and `IndexedDB` with `navigator.storage.persist()`. Auto-repairs whichever store is cleared to survive iOS Safari 7-day cache evictions.
- **Instant PWA Startup**: Renders the complete application shell immediately upon launch without blocking splash screens or pairing screens when trusted mode is active and the host is reachable; displays subtle background connection indicator and seamless fallback.
- **Input Coalescing & Latency Measurement**: Pointer touch events coalesced to 1 per animation frame (`requestAnimationFrame`) to prevent WebSocket buffer bloat. Built-in round-trip ping/pong meter tracking real-time p50 and p95 latency in Settings > Diagnostics and Desktop HUD.
- **Tray Sidecar & Launcher Enhancements**: Added `X-AeroKin-Local: 1` security header, Trusted-Network Mode toggle, and New Pairing Code menu items to Windows tray sidecar. Added port conflict detection displaying owning process name and stale build detection to `scripts/aerokin-launcher.ps1`.
- **Latency Protocol Documentation**: Added `docs/LATENCY.md` detailing architecture, frame coalescing, H.264 auto path, and step-by-step instructions for physical testing on iPhone.

## [Stable-R3] - 2026-11-18 - One-Click Launcher, Hidden Autostart, Windows Tray Sidecar & Supervision

### Added
- **Single Invisible Background Launcher**: Created `start-aerokin-hidden.vbs` (WScript WindowStyle 0) and `scripts/aerokin-launcher.ps1` starting AeroKin completely hidden with zero black console windows or command prompts.
- **Dynamic Repository Localization**: Resolves paths relative to the script location—zero hardcoded machine drives.
- **Single-Instance Named Mutex**: `Global\AeroKin_Server_Launcher_Mutex` prevents duplicate instances; launching AeroKin when already running brings up the PC Dashboard automatically.
- **Crash Supervision & Exponential Backoff**: Launcher supervises background server process, automatically restarting upon unexpected crashes with exponential backoff (1s, 2s, 4s, 8s...) and safe termination if exceeding 5 crashes/minute.
- **Graceful Quit & Restart Protocol**: Distinguishes user-initiated Quit and Restart actions (via loopback `/api/dashboard/quit` and `/api/dashboard/restart` endpoints and signals) from crashes.
- **Windows System Tray Sidecar Upgrade**: Tray icon with Open Dashboard, Show Pairing Code balloon notification, Pause Remote Input killswitch, Open Logs Folder, Restart AeroKin, and Quit controls. Startup balloon displays `https://<PC-hostname>.local:8443` and LAN IP fallback. Server continues running if the tray sidecar exits.
- **One-Click User Installer (`install-aerokin.cmd` / `scripts/install-aerokin.ps1`)**: Standard user privilege setup creating Desktop and Start Menu shortcuts with AeroKin brand icon, plus Startup folder shortcut (`shell:startup`) for silent login auto-launch. Supports `-NoAutostart`, `-DryRun`, and `-TargetDir`.
- **Targeted Uninstaller (`uninstall-aerokin.cmd` / `scripts/uninstall-aerokin.ps1`)**: Cleanly removes created shortcuts without touching user data or system state.
- **AeroKin CLI (`aerokin.cmd` / `scripts/aerokin-cli.ps1`)**: Unified command line with `autostart on|off|status`, `start`, `stop`, `restart`, `status`, `logs`, and `update`.
- **Safe In-Place Update Helper (`update-aerokin.cmd` / `scripts/update-aerokin.ps1`)**: Safely stops server, runs `git pull` without discarding uncommitted changes, runs `pnpm install --frozen-lockfile`, recompiles all packages, and restarts hidden in background.
- **First-Run Onboarding Help**: Automatically opens the PC Dashboard once on the initial setup launch, storing a `.first-run-completed` flag in `%LOCALAPPDATA%\AeroKin` to keep future autostarts silent.
- **Size-Capped Log Rotation**: Logs written to `%LOCALAPPDATA%\AeroKin\logs\aerokin.log` with 5MB cap and 3-generation backup rotation.
- **Automated Lifecycle Test Suite**: 13 automated tests in `server/test/launcher-lifecycle.test.ts` verifying shortcut creation, uninstall, single-instance mutex, backoff progression, log rotation, autostart CLI, and missing-Node error handling under Rule S7 temp directory isolation.

## [Unreleased] - Desktop Remote (Live Screen Streaming & Touch Control)

### Added
- **Windows Desktop Screen Streaming**: Added agent-side desktop screen capture (`CaptureAdapter`, `StreamService`, `MonitorService`) with `ddagrab` and `gdigrab` fallback, emitting SOI/EOI JPEG frames over dedicated authenticated binary WebSocket path `/desktop/stream`.
- **Per-Monitor V2 DPI Awareness & Multi-Monitor Support**: Native Win32 display monitor enumeration (`EnumDisplayMonitors`, `GetMonitorInfoW`, `GetDpiForMonitor`) and coordinate normalization across arbitrary virtual desktop arrangements and DPI scaling configurations.
- **Adaptive Backpressure & Stream Safety**: Frame dropping when WebSocket output buffer exceeds 256KB to eliminate buffer bloat and latency spikes. Structured detection of locked screens and secure UAC desktops (`secure_screen` state), console banner indication (`AeroKin: REMOTE VIEWING ACTIVE`), and emergency CLI commands (`desktop`, `stop-desktop`).
- **Absolute & Keyboard Input Injection**: SendInput absolute mouse positioning (`MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK`), click/button dragging, rate-limited key input with sticky modifier latches (`Ctrl`, `Alt`, `Shift`, `Win`), shortcut chips (`Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Alt+Tab`, `Win+D`, `Alt+F4`), and Unicode text injection.
- **PWA Desktop Remote Viewer**: Full-viewport 100dvh OLED black canvas renderer (`useDesktopStream`, `<DesktopViewer>`) supporting both Direct-Touch (tap, double-tap, long-press right click, drag, two-finger scroll) and Relative Trackpad modes.
- **Floating Controls & Quick-Key Bar**: Auto-hiding floating toolbar with Disconnect, Mode Switch, Quick-Key bar toggle, Monitor selector, Quality presets (`ultra`, `high`, `balanced`, `fast`, `low`), Fullscreen, and live performance metrics HUD (fps, latency, bitrate).
- **Settings Drawer Desktop Controls**: Configurable default input mode, default stream preset, FPS cap slider, and toggle switches for performance overlay and auto-hiding toolbar.

## [Unreleased] - Part 0: Complete Air Mouse / Gyro Removal

### Removed
- **Air Mouse & Gyroscope Telemetry**: Completely eliminated the 6DOF gyroscopic air mouse feature (`AirMouseTab`, `airPointer.ts`, `OneEuroFilter`, gyro bias tracking, gravity projection).
- **Sensors & Permissions**: Removed `DeviceMotionEvent` / `DeviceOrientationEvent` permission requests, motion permission screens (`MotionPermissionScreen`), and iOS motion prompt dialogs.
- **Calibration Wizard**: Removed `CalibrationModal` and related axis detection / gyro calibration algorithms.
- **Air Mouse Settings & Stale Storage**: Removed air-mouse sensitivity and mode controls from `SettingsDrawer`. Added automated one-time cleanup purging stale `aerokin_config` and `aerokin_calibration` keys from client `localStorage`.
- **Permissions-Policy**: Removed `accelerometer=*`, `gyroscope=*`, and `magnetometer=*` permissions policy headers from `vercel.json`.

### Preserved
- **Multi-Touch Trackpad**: Retained full Trackpad functionality, including gesture recognition, "Pointer speed" slider, natural scrolling, and momentum. Default navigation tab is now **Trackpad**.
- **Media Controls & Device Pairing**: Retained SMTC / Windows media playback engine, volume control, session routing, and cryptographic device pairing system without regression.
