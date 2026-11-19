# AeroKin Physical Device Test Checklist (iPhone & Desktop)

This checklist provides a structured protocol for manual verification on physical hardware (iPhone running iOS Safari / PWA and Windows PC).

---

## 0. One-Click Setup & Background Auto-Launch (Allen Physical Test)

| # | Step / Action | Expected Result | Pass / Fail |
|---|---|---|---|
| 0.1 | Run `install-aerokin.cmd` on Windows PC. | Creates Desktop "AeroKin", Start Menu "AeroKin", and Startup folder shortcuts with custom icon. No admin prompt. | [ ] |
| 0.2 | Restart PC or sign out and sign in. | AeroKin starts automatically in background without terminal or console popups. | [ ] |
| 0.3 | Observe Windows System Notification Area (Tray). | AeroKin tray icon appears with startup balloon displaying: `Phone: https://<PC-hostname>.local:8443` and LAN IP fallback. | [ ] |
| 0.4 | Open Safari on iPhone and visit phone URL. | PWA loads cleanly and connects without opening any terminal or folder on PC. | [ ] |
| 0.5 | Right-click tray icon -> Click **Show Pairing Code**. | Windows notification displays active 8-digit OTP. | [ ] |
| 0.6 | Right-click tray icon -> Click **Open Logs Folder**. | Windows Explorer opens `%LOCALAPPDATA%\AeroKin\logs` showing `aerokin.log`. | [ ] |
| 0.7 | Right-click tray icon -> Click **Restart AeroKin**. | Server restarts seamlessly; tray icon reloads. | [ ] |
| 0.8 | Right-click tray icon -> Click **Quit**. | Server and tray terminate cleanly; port 8443 closes. | [ ] |
| 0.9 | Double-click Desktop shortcut "AeroKin". | Starts server hidden again; tray icon appears. Clicking shortcut when running opens Dashboard. | [ ] |

---

## 1. Initial Setup & Pairing

| # | Step / Action | Expected Result | Pass / Fail |
|---|---|---|---|
| 1.1 | Start AeroKin on Windows PC (Desktop shortcut or `pnpm --filter aerokin-server run start`). | Server boots on port `8443` (TLS) with local CA. | [ ] |
| 1.2 | Open PC Dashboard (`https://localhost:8443/dashboard`). | Management dashboard loads cleanly; shows system metrics, QR code, and 8-digit OTP. | [ ] |
| 1.3 | On iPhone, scan QR code with Camera app (or open URL in Safari). | Safari prompts to trust local certificate or opens PWA. | [ ] |
| 1.4 | Tap "Add to Home Screen" in Safari share sheet. | AeroKin icon appears on iOS home screen with black background and kinetic glyph. | [ ] |
| 1.5 | Launch PWA from Home Screen. | Opens in standalone mode (no Safari URL bar, full OLED black `#000000`). | [ ] |
| 1.6 | Submit 8-digit code shown on PC. | PC prompts for approval (`y/N`). Approving grants device token. PWA enters main control view. | [ ] |

---

## 2. Trackpad, Touch & Mouse Input

| # | Interaction | Expected Result | Pass / Fail |
|---|---|---|---|
| 2.1 | Move 1 finger smoothly across trackpad. | PC mouse cursor moves with acceleration and zero noticeable jitter. | [ ] |
| 2.2 | Tap 1 finger lightly. | Registers Left Click at cursor position. | [ ] |
| 2.3 | Tap with 2 fingers simultaneously. | Registers Right Click (opens context menu on PC). | [ ] |
| 2.4 | Drag with 2 fingers vertically. | Smooth vertical scroll (in browser or document). | [ ] |
| 2.5 | Drag with 2 fingers horizontally. | Horizontal scroll (where supported). | [ ] |
| 2.6 | Press and hold 1 finger, then drag. | Window or item drag-and-drop initiates smoothly. | [ ] |

---

## 3. Keyboard & Modifier Controls

| # | Interaction | Expected Result | Pass / Fail |
|---|---|---|---|
| 3.1 | Tap keyboard toggle icon. | iOS virtual keyboard opens smoothly without zooming viewport. | [ ] |
| 3.2 | Type "AeroKin test string 123!". | Text appears in active text field on Windows PC with zero dropped characters. | [ ] |
| 3.3 | Tap `Ctrl` modifier key, then tap `A` key. | PC selects all text in current document (Ctrl+A). | [ ] |
| 3.4 | Tap `Win` modifier, then tap `D`. | Minimizes all windows and reveals Windows Desktop (Win+D). | [ ] |
| 3.5 | Tap `Alt` modifier, then tap `Tab`. | Opens Windows Task Switcher (Alt+Tab). | [ ] |
| 3.6 | Tap `Esc` key. | Dismisses open context menus or modal dialogs. | [ ] |

---

## 4. Media & System Control

| # | Interaction | Expected Result | Pass / Fail |
|---|---|---|---|
| 4.1 | Start media playback on PC (Spotify, YouTube, VLC). | AeroKin Media tab displays current track title, artist, and album art. | [ ] |
| 4.2 | Tap Play/Pause button on iPhone. | Media playback pauses / resumes immediately. | [ ] |
| 4.3 | Tap Next / Previous track buttons. | Skips to next / previous track. | [ ] |
| 4.4 | Adjust Volume slider in PWA. | Windows Master Volume adjusts in real time with haptic response. | [ ] |
| 4.5 | Tap Mute button. | Windows audio mutes and slider reflects muted state. | [ ] |

---

## 5. Live Desktop Streaming & Display

| # | Interaction | Expected Result | Pass / Fail |
|---|---|---|---|
| 5.1 | Switch to **Desktop Viewer** tab. | Live desktop stream appears in low-latency H.264/NVENC video feed. | [ ] |
| 5.2 | Move cursor or drag a window on PC. | Movement renders fluidly on iPhone display with < 65ms latency. | [ ] |
| 5.3 | Rotate iPhone to Landscape orientation. | Desktop stream rotates and scales to fit width, maintaining aspect ratio. | [ ] |
| 5.4 | Tap directly on a button on screen in Desktop Viewer. | Absolute coordinate projection accurately registers click on target element. | [ ] |
| 5.5 | Switch active monitors (if multi-monitor PC). | Video stream switches seamlessly to selected monitor. | [ ] |

---

## 6. Remote Access & Network Transition

| # | Interaction | Expected Result | Pass / Fail |
|---|---|---|---|
| 6.1 | On home Wi-Fi: Check connection badge. | Badge displays **LAN DIRECT (Green)** with sub-10ms latency. | [ ] |
| 6.2 | Swipe down iOS Control Center and turn **Wi-Fi OFF** (Cellular 4G/5G only). | Connection transitions to **DIRECT P2P** or **TURN RELAY** without app reload. | [ ] |
| 6.3 | Move trackpad and type over cellular. | Remote control functions with low latency (< 100ms) over mobile carrier network. | [ ] |
| 6.4 | Turn **Wi-Fi ON** again. | Stream transparently recovers back to LAN mode. | [ ] |

---

## 7. Safety & Power Guard Verification

| # | Interaction | Expected Result | Pass / Fail |
|---|---|---|---|
| 7.1 | In Quick Actions tab, tap **Lock PC**. | Windows locks immediately (Win+L / session lock). | [ ] |
| 7.2 | Tap **Shutdown** or **Restart**. | PC dashboard displays: "10-second countdown initiated". Cancel button is active. | [ ] |
| 7.3 | Tap **Cancel** on phone or PC within 10s. | Shutdown countdown cancels cleanly; PC remains powered on. | [ ] |
| 7.4 | In remote cellular mode: verify dangerous power actions. | Remote power actions disabled by default per remote safety policy. | [ ] |

---

## 8. Multi-Network Instant Auto-Connect & Storage Resilience (Stable-R5)

> **Status**: UNVERIFIED until Allen conducts physical field testing on iPhone and Windows laptop.

| # | Step / Action | Expected Result | Pass / Fail |
|---|---|---|---|
| 8.1 | **Instant Open on Home Wi-Fi**: Open the Home Screen icon on home Wi-Fi. | UI shell renders instantly; subtle "Connecting..." badge resolves to connected in < 1s. No pairing code, no QR, and no approval prompt. | [ ] |
| 8.2 | **Personal Hotspot Switch**: Enable Personal Hotspot on iPhone; connect Windows laptop to phone's Wi-Fi. Open Home Screen icon on phone. | Parallel probe tries `<hostname>.local` and hotspot IP `172.20.10.x`. Reconnects automatically with zero pairing screens. | [ ] |
| 8.3 | **Device Restart / Storage Resilience**: Restart iPhone completely. Relaunch Home Screen app. | Dual-layer persistence (`localStorage` + `IndexedDB`) retains identity. Client auto-reconnects seamlessly. | [ ] |
| 8.4 | **Device Renaming**: Open Settings drawer on phone, edit Device Name (e.g., "Allen iPhone Pro"), and trigger reconnect. | PC Dashboard updates device label in-place without generating a duplicate entry. | [ ] |
| 8.5 | **Trusted Mode Toggle Off**: In PC Dashboard, toggle **Trusted-Network Mode** OFF. Connect a new or cleared browser. | Server enforces traditional 8-digit OTP code prompt and PC operator approval dialog. | [ ] |
| 8.6 | **Trusted Mode Toggle On**: Toggle **Trusted-Network Mode** back ON. | Any connecting private device auto-registers silently again. | [ ] |
