# AEROKIN PWA (`aerokin-pwa`)

> Precision multi-touch trackpad, live desktop screen remote viewer, and Windows PC media controller for iPhone Safari.

---

## ✦ System Architecture & Overview

The AEROKIN PWA is a responsive, hardware-grade web application built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Motion (`motion/react`)**. It features a true-black OLED visual aesthetic with an `#FF5A1F` optic-orange accent, designed specifically for installed iPhone Safari PWA execution over a local Wi-Fi LAN without internet servers or cloud relays.

---

## ✦ Core Features

### 1. Live Desktop Remote Viewer
- **Letterboxed 100dvh OLED Canvas Renderer**: Connects to the dedicated binary WebSocket (`/desktop/stream`) and decodes streaming JPEG frames via `createImageBitmap` directly to canvas.
- **Dual Touch Input Modes**:
  - **Direct-Touch Mode**: Direct remote screen interaction:
    - Tap: Left Click at remote coordinates.
    - Double Tap: Double Click.
    - Long Press (>500ms): Right Click.
    - Press-and-Drag: Left Mouse Drag.
    - Two-Finger Drag: Vertical / Horizontal Scroll.
  - **Trackpad Mode**: Relative mouse navigation over the live screen using the Trackpad gesture engine.
- **Local Zoom & Pan**: Pinch-to-zoom (1x to 4x) and two-finger pan without altering host PC resolution. Includes inverse coordinate transformation ensuring clicks map accurately regardless of zoom or pan.
- **Floating Auto-Hiding Toolbar**: Disconnect, Input Mode switch, Quick-Key Bar toggle, Monitor picker (when >1 display), Quality preset selector (`ultra`, `high`, `balanced`, `fast`, `low`), Fullscreen toggle, and live stats overlay.
- **Quick-Key Bar**:
  - Sticky Latched Modifiers: `CTRL`, `ALT`, `SHIFT`, `WIN` (toggle on/off).
  - Action Keys: `Esc`, `Tab`, `Enter`, `Backspace`, `Del`, `Space`, and Arrow keys.
  - Shortcut Chips: `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Alt+Tab`, `Win+D`, and `Alt+F4` (with accidental closure confirmation).
  - Virtual Keyboard Text Input: Focuses an off-screen input to send full Unicode strings.
- **Orientation Awareness**: Recommends landscape orientation for widescreen monitors while gracefully letterboxing in portrait.

### 2. Precision Multi-Touch Trackpad
- **Gestures**:
  - 1-Finger Slide: Relative cursor movement with velocity curve.
  - 1-Finger Tap: Primary Left Click.
  - 2-Finger Tap: Secondary Right Click.
  - 2-Finger Slide: Smooth vertical/horizontal scrolling with optional natural scroll direction.
  - Momentum Scrolling: Configurable physics momentum decay slider.
- **Pointer Speed**: Slider adjusting trackpad cursor sensitivity.

### 3. Media Remote (Windows PC Native Controls)
- **Playback Controls**: Play/pause, track skip, volume slider with master mute toggle.
- **Scrubbing**: Relative seek (-10s / +10s) and timeline scrubbing.
- **SMTC Session Switcher**: Displays active Windows media sessions (Spotify, YouTube, VLC, Netflix) and allows instant target switching.

### 4. Ephemeral 8-Digit Pairing & Security
- **Out-of-Band Pairing**: Connects to the PC using an ephemeral 8-digit code (valid for 2 minutes).
- **Terminal Approval**: Requires host operator approval in the PC terminal before granting credentials.
- **Permanent Cryptographic Credential**: Received credentials are stored securely in `localStorage` (`aerokin_device_id` and `aerokin_device_credential`).
- **Device Management Drawer**: View paired devices, rename this device, or unpair/revoke access at any time.

---

## ✦ Development & Verification

```bash
# In pwa directory:
cd pwa

# Generate icons and build into server/public
pnpm run build

# Build standalone hosted bundle into pwa/dist
pnpm run build:hosted

# Run Vitest unit tests
pnpm test

# Run automated Playwright screenshot and overflow verification
node scripts/take-screenshots.mjs
```

Screenshots and layout checks are saved under `pwa/screenshots/` across mobile portrait (390x844 @ 3x), compact mobile (360x740 @ 1x), landscape (844x390 @ 3x), and desktop viewports.
