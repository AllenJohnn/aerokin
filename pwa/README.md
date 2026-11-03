# AEROKIN PWA (`aerokin-pwa`)

> **"Move the air. Move your PC."**  
> iPhone 6DOF spatial air mouse, precision haptic trackpad, and Windows PC media remote.

---

## ✦ System Architecture & Overview

The AEROKIN PWA is a responsive, hardware-grade web application built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, **Motion (`motion/react`)**, and **anime.js v4**. It features an adaptive layout that renders a **Desktop Localhost Pairing Station** on laptop viewports and a **Native-feel Mobile Remote** on iPhone viewports.

---

## ✦ Brand Identity & Assets

- **Refined Master Mark**: Geometric delta "A" fused with a supersonic kinetic crossbar, cursor arrowhead, and cyan focal beacon (`public/logo-mark.svg`, `public/logo-mono.svg`).
- **Responsive Favicon Suite**: `favicon.svg` with internal `@media (prefers-color-scheme)` support, plus multi-resolution `favicon.ico` (16/32/48px).
- **Home Screen & Social Icons**:
  - `apple-touch-icon.png` (180x180, opaque `#07070B`, 24px padding).
  - `icon-192.png` and `icon-512.png`.
  - `icon-512-maskable.png` (80% safe zone on full-bleed `#07070B`).
  - `og-image.png` (1200x630 high-production social share banner).
- **Animated Intro**: Powered by `anime.js` v4 line-draw and spring morph on the cinematic start screen.

---

## ✦ Core Features

### 1. Spatial Air Mouse (6DOF Gyroscope)
- **Pointer Events Pipeline**: Powered by `Pointer Events` (`pointerdown`, `pointerup`, `pointercancel`, `pointerleave`) and `setPointerCapture` for rock-solid gesture tracking.
- **Fail-Safe Disengage**: Automatically releases control on touch cancel, touch leave, window blur, or `visibilitychange` (app switching).
- **Accidental Click Filter**: Dispatches Left Click only if contact duration `< 200ms` AND displacement `< 8px`.
- **Grip Modes**:
  - **Flat (Remote)**: Classical TV-remote mapping (Yaw $\to dx$, Pitch $\to dy$).
  - **Auto (Gravity 3D)**: Projects angular velocity vector against normalized gravity $\vec{\omega} \cdot \hat{g} = (\beta g_x + \gamma g_y + \alpha g_z) / \|\vec{g}\|$, enabling air navigation at any holding angle.
- **Signal Processing**: Exponential Moving Average (EMA) smoothing filter, tremor deadzone threshold, and sensitivity scalar.
- **Radar Reticle**: Orbiting velocity ring and gyro tilt tracking with speed glow aura.
- **Drag-to-Dismiss Settings Sheet**: Calibrate sensitivity, deadzone, smoothing, axes swap, and axis inversion with gesture dismiss via `motion/react`.

### 2. Precision Trackpad
- **Gestures**:
  - 1-Finger Slide: Mouse movement with dynamic velocity acceleration curve.
  - 1-Finger Tap: Primary Left Click.
  - 2-Finger Tap: Secondary Right Click.
  - 2-Finger Slide: Smooth natural vertical scrolling.
- **Touch Trails & Momentum**: Visual finger contact ripples and physics decay on flick release.

### 3. Media Remote (Windows PC Native Controls)
- **Rotary Volume Knob**: Tactile circular dial with detent haptic pulses on every step.
- **Play/Pause Morph**: Smooth transition between `Play` and `Pause` states.
- **Scrubbing & Presentation**: -10s / +10s seek buttons, track skip, master mute toggle, and full-screen toggle (Windows `F` key).
- **Vector Icons**: Exclusively powered by `lucide-react` (zero emoji).

### 4. Dynamic Island Connection Pill
- Morphs between `CONNECTED · 12ms`, `RECONNECTING`, and `AUTH REQUIRED`.
- Real-time SVG **Latency Sparkline** tracking recent ping round-trip times.
- Interactive diagnostics dropdown on tap.

### 5. Procedural Aurora Mesh Background
- Canvas-based procedural gradient mesh with violet (`#7C5CFF`) and electric cyan (`#22D3EE`) ambient orbs.
- Subtly parallaxes with iPhone orientation.
- Automatically caps animation to 30fps when the pad is engaged to reserve 100% processing power for the 60Hz input loop.
- Respects `prefers-reduced-motion`.

### 6. Desktop Localhost Pairing Dashboard
- Automatically opens on desktop/laptop browsers (`min-width: 768px and pointer: fine`).
- High-contrast QR code generated in real-time from `/api/pair`.
- Displays 6-character auth token and LAN pairing URL with one-click copy.
- Live event monitor streaming incoming 60Hz inputs (`move`, `click`, `scroll`, `media`).
- Loopback protected: `/api/pair` and `/api/status` enforce `127.0.0.1` / `::1` only (403 on LAN).
- Seamless toggle to open iPhone Simulator directly in desktop browser.

---

## ✦ Development & Verification

```bash
# In pwa directory:
cd pwa

# Generate icons and build into server/public
pnpm run build

# Run automated Playwright screenshot verification
pnpm exec node scripts/take-screenshots.mjs
```

Verification artifacts are generated under `pwa/screenshots/`:
- `01-desktop-pairing-dashboard.png` (Desktop 1440x900)
- `02-iphone-start-screen.png` (iPhone 14 @ 3x DPR)
- `03-iphone-air-mouse.png` (iPhone 14 @ 3x DPR)
- `04-iphone-air-mouse-settings.png` (iPhone 14 @ 3x DPR)
- `05-iphone-trackpad.png` (iPhone 14 @ 3x DPR)
- `06-iphone-media-remote.png` (iPhone 14 @ 3x DPR)
