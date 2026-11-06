# AeroKin Physical Device Test Checklist (iPhone & Desktop)

This checklist provides a structured protocol for manual verification on physical hardware (iPhone running iOS Safari / PWA and Windows PC).

---

## 1. Initial Setup & Pairing

| # | Step / Action | Expected Result | Pass / Fail |
|---|---|---|---|
| 1.1 | Start AeroKin on Windows PC (`pnpm --filter aerokin-server run start`). | Server boots on port `4443` (TLS) with local CA. Terminal displays status. | [ ] |
| 1.2 | Open PC Dashboard (`https://localhost:4443`). | Management dashboard loads cleanly; shows system metrics, QR code, and 8-digit OTP. | [ ] |
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
