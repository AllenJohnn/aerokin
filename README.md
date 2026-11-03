# AEROKIN

> **"Move the air. Move your PC."**  
> Turn your iPhone into an ultra-low latency air mouse, presentation pointer, and media remote for Windows PC.

---

## ✦ Monorepo Structure

- [`design-system/`](./design-system): Core AEROKIN design system built with React, TypeScript, Vite, and Tailwind CSS. Contains all design tokens, spatial components, `<AerokinCursor />`, brand assets, and the interactive `/design` route.
- *(Upcoming)* `pwa/`: iPhone PWA client utilizing device motion/orientation (gyroscope & accelerometer) over Bluetooth LE / WebSockets.
- *(Upcoming)* `windows-receiver/`: Low-latency native Windows background daemon translating gyro telemetry into cursor input.

---

## ✦ Getting Started with Design System

```bash
cd design-system
pnpm install
pnpm run dev
```

Visit `http://localhost:5173/design` to view the component suite and live iPhone remote simulator.

---

## ✦ License

Private / All Rights Reserved.
