# AeroKin Technical Roadmap & Feature Status

This document provides a transparent, verifiable status of AeroKin's features, infrastructure, and future milestones.

---

## 1. Feature Status Breakdown

### A. Completed (Done & Automated Tests Passing)

| Feature / Subsystem | Status | Verification & Test Evidence |
|---|---|---|
| **Hard Safety Shield (S1–S5)** | **Done** | `server/src/actions/PowerActionExecutor.ts`<br>`scripts/safety-check.mjs` (0 violations in CI)<br>Real executor impossible under vitest. |
| **Trackpad & Gesture Engine** | **Done** | `pwa/src/components/Trackpad.tsx`<br>27 unit tests in `pwa/test/trackpadGestures.test.ts`.<br>Single/two-finger tap, drag, scroll, velocity acceleration. |
| **Keyboard & Text Input** | **Done** | Special key mappings, modifier latching (Ctrl, Alt, Shift, Win), text buffer sanitization. |
| **Media Controller & Volume** | **Done** | Windows CoreAudio sidecar, Windows Media Session (SMTC), volume slider, track metadata. |
| **Desktop Video Streaming** | **Done** | Hardware-accelerated `ddagrab` + `h264_nvenc` pipeline with automatic software fallback. |
| **LAN Security & Local CA** | **Done** | Automated 10-year Local CA generation, leaf certificate caching, QR pairing with 8-digit OTP. |
| **Remote Auth Redesign (A1)** | **Done** | Random 256-bit `agentSecret`, derived `signalingToken`, dynamic token registration. Removed `sha256(pcId)`. |
| **Signaling Hardening (A2)** | **Done** | Origin validation, authenticated `/turn-credentials`, rate limiting, 5-fail ban, Coturn RFC1918 denial. |
| **Real WebRTC Host Manager (A3)** | **Done** | `RtcHostManager.ts` bridging `SignalingClient` and `node-datachannel.PeerConnection`. Loopback test suite. |
| **URL Fragment Remote Pairing (A4)**| **Done** | Client-side fragment `#agent=...&code=...`, instant stripping via `replaceState`, remote power disabled by default. |
| **Honest Telemetry & ICE Restart (A5)**| **Done** | Mode derived strictly from `getStats()` candidate pair; RTT, jitter, bitrate telemetry; auto ICE restart. |
| **File Transfer & Access Control (C2)**| **Done** | Upload disabled by default, toggleable via PC Dashboard, verified via `file-transfer.test.ts`. |
| **OLED Mobile UI & Safe-Area** | **Done** | `#000000` true-black canvas, iOS safe-area insets (`env(safe-area-inset-*)`), 16px minimum font size. |

---

### B. Partial (Implemented, Awaiting Real-World Verification)

| Feature / Subsystem | Current State | Remaining Work to Complete |
|---|---|---|
| **Cross-Network Cellular Access** | **UNVERIFIED (Partial)** | Automated real-socket loopback integration suite passes 100%. Pending physical field test by Allen on iPhone over 4G/5G mobile data per `docs/REMOTE-TEST.md`. |
| **Multi-Monitor Simultaneous Stream**| **Partial** | Dynamic switching between primary and secondary monitors works. Streaming multiple monitors simultaneously in a side-by-side grid is not yet implemented. |
| **Audio Redirection to Mobile** | **Partial** | Feasibility analysis documented in `docs/media-audio-feasibility.md`. Low-latency audio capture sidecar designed; WebRTC audio track sync pending. |

---

### C. Future Milestones (Not Started)

| Milestone | Target | Description |
|---|---|---|
| **Native iOS Push Notifications** | Post-R1 | WebPush / APNs integration to alert operator of pairing requests when PWA is in background. |
| **Multi-PC Fleet Management** | Post-R1 | Manage and toggle between multiple home/office Windows workstations from a single unified mobile PWA. |
| **Native Swift Companion Wrapper** | Post-R2 | Optional native iOS container app providing background network audio streaming and haptic feedback. |
| **Hardware Dongle Wake-on-LAN (WoL)**| Post-R2 | Integration with a low-power ESP32 or Raspberry Pi router forwarder to wake sleeping host PC remotely. |
