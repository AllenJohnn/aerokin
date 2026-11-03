# AEROKIN Design System

> **"Move the air. Move your PC."**  
> Spatial hardware-grade design system for turning an iPhone into an ultra-low latency air mouse, presentation pointer, and media remote for Windows PC.

---

## ✦ Overview

A modern, high-precision dark theme design system built with **React**, **TypeScript**, **Tailwind CSS**, and **@fontsource**. Engineered for fluid physics, tactile feedback, low-latency telemetry, and cyber-minimalist hardware aesthetics.

### Key Highlights
- **Dark Theme Only**: Deep void `#07070B` background with frosted glass surfaces and subtle specular edge highlights.
- **Supersonic Gradient & Glow**: `#7C5CFF` (Electric Violet) to `#22D3EE` (Laser Cyan) with diffused multi-layer glow box shadows.
- **Spatial Physics Curves**: `cubic-bezier(0.22, 1, 0.36, 1)` easing across all interactive transitions (200ms–600ms).
- **60FPS Comet Cursor**: Hardware-accelerated canvas cursor `<AerokinCursor />` with lerp smoothing and automatic touch-screen deactivation.
- **Zero Extra Dependencies**: Strictly pure React 18, Tailwind CSS, and Fontsource.

---

## ✦ Directory Structure

```
design-system/
├── index.html                     # HTML shell with favicon and dark theme meta
├── package.json                   # Zero extra runtime dependencies
├── postcss.config.js              # PostCSS plugins (Tailwind, Autoprefixer)
├── tailwind.config.js             # Token definitions: colors, shadows, easing, fonts
├── tsconfig.json                  # Strict TypeScript configuration
├── tsconfig.node.json             # Vite config TypeScript types
├── vite.config.mjs                # Fast Vite development & production bundler
├── public/
│   ├── favicon.svg                # 32x32 squircle favicon with glowing logo
│   ├── logo-sm.svg                # 24x24 vector logo
│   ├── logo-md.svg                # 48x48 vector logo
│   └── logo-lg.svg                # 96x96 vector logo with ambient emission
└── src/
    ├── index.ts                   # Master export entry for all components, tokens, types
    ├── main.tsx                   # React root mount
    ├── App.tsx                    # Route handler for /design and live showcase
    ├── index.css                  # Tailwind directives, Geist imports, custom utilities
    ├── tokens/
    │   └── index.ts               # Programmatic TS export of tokens (colors, shadows, motion)
    ├── components/
    │   ├── AerokinLogo.tsx        # Angular "A" with light trail crossbar & glowing tip
    │   ├── GlassCard.tsx          # Frosted glass card with specular edge highlights
    │   ├── GlowButton.tsx         # Tactile button with gradient border and press bounce
    │   ├── Pill.tsx               # Geist Mono status indicator with pulsing radar beacon
    │   ├── Toggle.tsx             # Smooth switch with custom knob & glowing active track
    │   ├── Slider.tsx             # Precision slider with gradient track & glowing thumb
    │   ├── TabBar.tsx             # Segmented control with gliding active indicator pill
    │   └── AerokinCursor.tsx      # 60fps canvas comet trail pointer (touch-disabled)
    └── pages/
        └── DesignShowcase.tsx     # Full /design route showcase & interactive iPhone remote
```

---

## ✦ Design Tokens

### 1. Colors
| Token | Value | Description |
| :--- | :--- | :--- |
| `bg` | `#07070B` | Deep void backdrop |
| `surface` | `rgba(255, 255, 255, 0.05)` | Frosted glass panels & containers |
| `surfaceHover` | `rgba(255, 255, 255, 0.08)` | Interactive container hover state |
| `border` | `rgba(255, 255, 255, 0.08)` | Specular boundary line |
| `borderBright`| `rgba(255, 255, 255, 0.16)` | Focused / elevated boundaries |
| `text` | `#F5F5F7` | Apple/Windows high-contrast primary text |
| `muted` | `#8A8A96` | Secondary labels & telemetry readouts |
| `violet` | `#7C5CFF` | Electric violet origin |
| `cyan` | `#22D3EE` | Laser cyan beacon |
| `accentGradient` | `#7C5CFF → #22D3EE` | Linear 135deg comet energy trail |

### 2. Motion & Transitions
- **Easing**: `cubic-bezier(0.22, 1, 0.36, 1)`
- **Durations**:
  - `200ms`: Tactile press, click compression, micro-interactions
  - `300ms`: Toggles, sliders, tab gliding, hover states
  - `400ms`: Status pill transitions, modal reveals
  - `600ms`: Mode transitions, orientation shifts

### 3. Glow Box-Shadows
- `shadow-glow-sm`: `0 0 16px -2px rgba(124, 92, 255, 0.35), 0 0 8px -2px rgba(34, 211, 238, 0.25)`
- `shadow-glow-md`: `0 0 28px -4px rgba(124, 92, 255, 0.45), 0 0 14px -2px rgba(34, 211, 238, 0.35)`
- `shadow-glow-lg`: `0 0 48px -6px rgba(124, 92, 255, 0.55), 0 0 24px -4px rgba(34, 211, 238, 0.45)`
- `shadow-glass`: `0 12px 36px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)`

### 4. Typography
- **Headlines & UI**: Geist Sans with tight tracking (`-0.015em` to `-0.04em`)
- **Telemetry & Labels**: Geist Mono with tabular tracking (`0.08em`)

---

## ✦ Getting Started

### Development
```bash
# Install dependencies
pnpm install

# Start Vite dev server
pnpm run dev
```

Visit `http://localhost:5173/design` (or `http://localhost:5173/`) to view the interactive showcase.

### Production Build
```bash
pnpm run build
```

---

## ✦ Component Usage Examples

### 1. `AerokinLogo`
```tsx
import { AerokinLogo } from './components/AerokinLogo';

// Sizes: 'sm' (24px), 'md' (48px), 'lg' (96px), or custom number
<AerokinLogo size="md" withWordmark withTagline animated />
```

### 2. `GlassCard`
```tsx
import { GlassCard } from './components/GlassCard';

<GlassCard variant="glow" glowColor="cyan" padding="lg">
  <h3>Air Gyroscope</h3>
  <p>Flick your iPhone to move the cursor.</p>
</GlassCard>
```

### 3. `GlowButton`
```tsx
import { GlowButton } from './components/GlowButton';

// Primary filled gradient with glow
<GlowButton variant="primary" size="md">
  Connect Air Mouse
</GlowButton>

// Secondary frosted glass with gradient border
<GlowButton variant="secondary" size="md">
  Calibrate Gyro
</GlowButton>
```

### 4. `Pill`
```tsx
import { Pill } from './components/Pill';

<Pill status="online" size="md">CONNECTED · 12ms</Pill>
<Pill status="active" size="md">AIR POINTER · 120Hz</Pill>
<Pill status="warning" size="sm">LOW BATTERY</Pill>
```

### 5. `Toggle`
```tsx
import { Toggle } from './components/Toggle';

<Toggle
  label="Taptic Haptics"
  description="Tactile pulse on every air click"
  checked={haptics}
  onChange={setHaptics}
/>
```

### 6. `Slider`
```tsx
import { Slider } from './components/Slider';

<Slider
  label="Air Sensitivity (DPI)"
  value={dpi}
  onChange={setDpi}
  min={400}
  max={3200}
  step={50}
  unit="DPI"
/>
```

### 7. `TabBar`
```tsx
import { TabBar } from './components/TabBar';

<TabBar
  tabs={[
    { id: 'air-mouse', label: 'Air Mouse' },
    { id: 'media-remote', label: 'Media Remote' },
    { id: 'touchpad', label: 'Touchpad' },
  ]}
  activeId={activeTab}
  onChange={setActiveTab}
  fullWidth
/>
```

### 8. `AerokinCursor`
```tsx
import { AerokinCursor } from './components/AerokinCursor';

// Add to your root layout:
<AerokinCursor enabled={true} trailLength={26} dotRadius={3.5} />
```
*(Automatically self-disables on touch screens without consuming CPU or memory cycles).*
