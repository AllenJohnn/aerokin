# AeroKin Changelog

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
