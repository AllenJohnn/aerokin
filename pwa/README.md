# AEROKIN PWA (`aerokin-pwa`)

> **"Move the air. Move your PC."**  
> iPhone spatial air mouse, precision trackpad, and media remote for Windows PC.

---

## ✦ Overview

A dedicated Progressive Web App designed specifically for mobile viewports (`100dvh`, iOS safe area insets, touch-action lock, zero rubber-banding). Directly reuses components and design tokens from `@ui` (`../design-system/src`) via Vite alias and Tailwind preset.

### Key Capabilities
- **Start Screen & Motion Permission**: Guides the user through granting iOS motion permissions (`DeviceMotionEvent.requestPermission()`).
- **Air Mouse**: Reads 6-axis `devicemotion.rotationRate` and dispatches accumulated movements at 60Hz. Hold-to-engage surface prevents unintended drift when gesturing. Tap = left click, secondary button = right click. Includes EMA smoothing, deadzone filtering, sensitivity adjustment, and customizable axis mapping (Yaw/Pitch, Invert X/Y, Swap Axes).
- **Precision Trackpad**: 1-finger drag with acceleration curve, 1-finger tap for left click, 2-finger tap for right click, 2-finger vertical slide for smooth scrolling.
- **Media Remote**: Big ergonomic tactile buttons for Play/Pause, Seek ±10s, Track Skip, Volume, Mute, and Fullscreen.
- **WebSocket Protocol**: Connects via `wss://${location.host}/?token=<token>`. Automatically reconnects with exponential backoff. Pings every 2s to display live latency in Geist Mono.
- **Screen Wake Lock**: Automatically prevents the phone display from dimming while connected using the Screen Wake Lock API.
- **Haptics**: Best-effort tactile pulses using the iOS 17.4+ `<input type="checkbox" switch>` trick and `navigator.vibrate`.

---

## ✦ Development & Build

```bash
# In pwa directory:
cd pwa

# Start dev server on port 5174
pnpm run dev

# Generate icons and build into server/public:
pnpm run build
```
