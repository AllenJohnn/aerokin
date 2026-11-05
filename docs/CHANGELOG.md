# AeroKin Changelog

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
