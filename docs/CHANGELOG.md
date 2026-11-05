# AeroKin Changelog

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
